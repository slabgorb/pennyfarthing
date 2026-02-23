import { existsSync, readFileSync, readdirSync, writeFileSync, chmodSync, statSync, readlinkSync, symlinkSync, unlinkSync, mkdirSync, renameSync, copyFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import YAML from 'yaml';
import { spawnSync } from 'child_process';
import fsExtra from 'fs-extra';

const { removeSync, ensureDirSync, copySync } = fsExtra;
import { logger } from '../utils/logger.js';
import {
  readManifest
} from '../utils/manifest.js';
import {
  pathExists,
  isDirectory,
  isSymlink,
  fileMatchesHash,
  filesMatch
} from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';
import { findNodeModulesPath, findLocalSymlinkTargets } from '../utils/node-modules.js';
import { ALL_SYMLINKS, CORE_AGENTS } from '../utils/constants.js';
import { getPfVersion, installPfCli } from '../utils/python.js';
import { LEGACY_HOOK_MIGRATIONS, migrateHookPaths } from '../utils/settings.js';
import { getCurrentTheme } from '../utils/themes.js';

interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
  quiet?: boolean;
  dogfood?: boolean;
  category?: string;
  listCategories?: boolean;
}

/**
 * Category-to-check-function mapping for --category filtering.
 * Each category maps to the check functions that produce results in that group.
 */
export const CATEGORY_CHECKS: Record<string, string[]> = {
  'installation': ['checkInstallation', 'checkCoreFiles'],
  'commands':     ['checkCommandsAndSkills', 'checkUserFilesBasic'],
  'hooks':        ['checkSettingsHooks'],
  'scripts':      ['checkHooks', 'checkGitHooks'],
  'layout':       ['checkDirectories', 'checkFileLayout'],
  'legacy':       ['checkLegacyFiles', 'checkLegacyStatuslinePath', 'checkLegacyHookCommands'],
  'tools':        ['checkCyclist', 'checkPfCli'],
};

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
  fix?: () => void;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Handle --list-categories
  if (options.listCategories) {
    console.log('Available check categories:');
    for (const [name, checks] of Object.entries(CATEGORY_CHECKS)) {
      console.log(`  ${name.padEnd(14)} ${checks.join(', ')}`);
    }
    return;
  }

  // Validate --category if provided
  if (options.category && !CATEGORY_CHECKS[options.category]) {
    logger.error(`Unknown category: ${options.category}`);
    logger.info(`Available categories: ${Object.keys(CATEGORY_CHECKS).join(', ')}`);
    process.exit(1);
  }

  // Handle dogfood mode - run checks for framework/orchestrator development
  if (options.dogfood) {
    const dogfoodScript = join(projectRoot, 'pennyfarthing-dist/scripts/misc/doctor-dogfood.sh');

    if (!existsSync(dogfoodScript)) {
      logger.error('Dogfood mode requires pennyfarthing-dist/ (framework repo or orchestrator with inlined pennyfarthing/)');
      logger.info('This flag is for framework development and orchestrator repos.');
      process.exit(1);
    }

    const args = options.fix ? ['--fix'] : [];
    const result = spawnSync(dogfoodScript, args, {
      stdio: 'inherit',
      cwd: projectRoot,
    });

    process.exit(result.status ?? 0);
  }

  const results: CheckResult[] = [];

  if (options.quiet) {
    logger.configure({ quiet: true });
  }

  logger.header('Pennyfarthing Health Check');
  logger.info(`Project: ${projectRoot}`);

  // Get versions
  const packageVersion = getPackageVersion();
  const manifest = readManifest(projectRoot);
  const installedVersion = manifest?.version || 'not installed';
  const installationType = manifest?.installationType || 'copy';

  logger.info(`Version: ${installedVersion} (installed) / ${packageVersion} (package)`);
  logger.info(`Mode: ${installationType}${installationType === 'symlink' ? ' (node_modules)' : ' (file copies)'}`);
  logger.newline();

  // Resolve node_modules path for checks that need it
  const nodeModulesPath = findNodeModulesPath(projectRoot);

  // Determine which checks to run
  const activeChecks = options.category
    ? new Set(CATEGORY_CHECKS[options.category])
    : null; // null = run all

  // Run checks — when category is specified, only run matching subset
  if (activeChecks) {
    // Category-filtered run
    if (activeChecks.has('checkInstallation'))       results.push(...checkInstallation(projectRoot, manifest));
    if (activeChecks.has('checkCoreFiles'))           results.push(...checkCoreFiles(projectRoot, manifest));
    if (activeChecks.has('checkCommandsAndSkills'))   results.push(...checkCommandsAndSkills(projectRoot, nodeModulesPath));
    if (activeChecks.has('checkUserFilesBasic'))      results.push(...checkUserFilesBasic(projectRoot));
    if (activeChecks.has('checkSettingsHooks'))       results.push(...checkSettingsHooks(projectRoot));
    if (activeChecks.has('checkDirectories'))         results.push(...checkDirectories(projectRoot));
    if (activeChecks.has('checkHooks'))               results.push(...checkHooks(projectRoot));
    if (activeChecks.has('checkGitHooks'))            results.push(...checkGitHooks(projectRoot, nodeModulesPath));
    if (activeChecks.has('checkFileLayout'))          results.push(...checkFileLayout(projectRoot));
    if (activeChecks.has('checkLegacyFiles'))         results.push(...checkLegacyFiles(projectRoot));
    if (activeChecks.has('checkLegacyStatuslinePath')) results.push(checkLegacyStatuslinePath(projectRoot));
    if (activeChecks.has('checkLegacyHookCommands'))  results.push(checkLegacyHookCommands(projectRoot));
    if (activeChecks.has('checkCyclist'))             results.push(...checkCyclist(projectRoot));
    if (activeChecks.has('checkPfCli'))               results.push(checkPfCli(nodeModulesPath));
  } else {
    // Full run — original behavior
    results.push(...checkInstallation(projectRoot, manifest));
    results.push(...checkCoreFiles(projectRoot, manifest));
    results.push(...checkCommandsAndSkills(projectRoot, nodeModulesPath));
    results.push(...checkUserFiles(projectRoot));
    results.push(...checkDirectories(projectRoot));
    results.push(...checkHooks(projectRoot));
    results.push(...checkGitHooks(projectRoot, nodeModulesPath));
    results.push(...checkFileLayout(projectRoot));
    results.push(...checkLegacyFiles(projectRoot));
    results.push(checkLegacyStatuslinePath(projectRoot));
    results.push(checkLegacyHookCommands(projectRoot));
    results.push(...checkCyclist(projectRoot));
    results.push(checkPfCli(nodeModulesPath));
  }

  // Output results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Display results by category
  const categories = [
    { name: 'Installation', filter: (r: CheckResult) => r.name.startsWith('manifest') },
    { name: 'Core Files', filter: (r: CheckResult) => r.name.startsWith('core/') && r.name !== 'core/commands' && r.name !== 'core/skills' },
    { name: 'Commands & Skills', filter: (r: CheckResult) => r.name === 'core/commands' || r.name === 'core/skills' },
    { name: 'User Files', filter: (r: CheckResult) => r.name.startsWith('project/') || r.name.startsWith('persona') || r.name.startsWith('settings') },
    { name: 'Directories', filter: (r: CheckResult) => r.name.startsWith('dir/') },
    { name: 'Hooks', filter: (r: CheckResult) => r.name.startsWith('hook/') },
    { name: 'Git Hooks', filter: (r: CheckResult) => r.name.startsWith('git-hook/') },
    { name: 'File Layout', filter: (r: CheckResult) => r.name.startsWith('layout/') },
    { name: 'Legacy Files', filter: (r: CheckResult) => r.name.startsWith('legacy/') },
    { name: 'Cyclist', filter: (r: CheckResult) => r.name.startsWith('cyclist/') },
    { name: 'Tools', filter: (r: CheckResult) => r.name.startsWith('tools/') }
  ];

  for (const category of categories) {
    const categoryResults = results.filter(category.filter);
    if (categoryResults.length === 0) continue;

    logger.header(category.name);
    for (const result of categoryResults) {
      logger.check(result.name.split('/').pop() || result.name, result.status, result.detail);
    }
  }

  // Summary
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warn').length;

  logger.newline();
  if (failCount === 0 && warnCount === 0) {
    logger.success('All checks passed!');
  } else {
    const status = failCount > 0 ? 'NEEDS_FIX' : 'NEEDS_ATTENTION';
    logger.warning(`${status}: ${failCount} errors, ${warnCount} warnings`);
  }

  // Apply fixes if requested
  if (options.fix) {
    const fixable = results.filter(r => r.fix && r.status !== 'pass');
    if (fixable.length > 0) {
      logger.newline();
      logger.header('Applying fixes...');
      for (const result of fixable) {
        try {
          result.fix!();
          logger.success(`Fixed: ${result.name}`);
        } catch (error) {
          logger.error(`Failed to fix ${result.name}: ${error}`);
        }
      }
    }
  } else if (results.some(r => r.fix && r.status !== 'pass')) {
    logger.newline();
    logger.info('Run with --fix to auto-repair issues');
  }

  // Exit with error if failures
  if (failCount > 0) {
    process.exit(1);
  }
}

export function checkInstallation(projectRoot: string, manifest: ReturnType<typeof readManifest>): CheckResult[] {
  const results: CheckResult[] = [];

  // Check manifest exists
  results.push({
    name: 'manifest/exists',
    status: manifest ? 'pass' : 'fail',
    detail: manifest ? `v${manifest.version}` : 'Run `pennyfarthing init`'
  });

  return results;
}

export function checkCoreFiles(projectRoot: string, manifest: ReturnType<typeof readManifest>): CheckResult[] {
  const results: CheckResult[] = [];

  const installationType = manifest?.installationType || 'copy';
  const nodeModulesPath = findNodeModulesPath(projectRoot);

  if (installationType === 'symlink') {
    // Symlink mode: check that symlinks exist and point to valid targets
    results.push(...checkSymlinks(projectRoot, nodeModulesPath));
  } else {
    // Copy mode: check that directories exist
    const coreDirs = [
      { path: '.claude/pennyfarthing/agents', name: 'core/agents' },
      { path: '.claude/pennyfarthing/commands', name: 'core/commands' },
      { path: '.claude/pennyfarthing/guides', name: 'core/guides' },
      { path: '.claude/pennyfarthing/skills', name: 'core/skills' },
      { path: '.claude/pennyfarthing/personas', name: 'core/personas' },
      { path: '.claude/pennyfarthing/scripts', name: 'core/scripts' }
    ];

    for (const { path, name } of coreDirs) {
      const fullPath = join(projectRoot, path);
      const exists = pathExists(fullPath) && isDirectory(fullPath);

      results.push({
        name: name,
        status: exists ? 'pass' : 'fail',
        detail: exists ? undefined : 'Missing directory'
      });
    }

    // Check file integrity if manifest has hashes
    if (manifest?.fileHashes && Object.keys(manifest.fileHashes).length > 0) {
      let modifiedCount = 0;
      let missingCount = 0;

      for (const [filePath, expectedHash] of Object.entries(manifest.fileHashes)) {
        const fullPath = join(projectRoot, filePath);

        if (!pathExists(fullPath)) {
          missingCount++;
        } else if (!fileMatchesHash(fullPath, expectedHash)) {
          modifiedCount++;
        }
      }

      if (modifiedCount > 0) {
        results.push({
          name: 'core/integrity',
          status: 'warn',
          detail: `${modifiedCount} file(s) modified locally`
        });
      }

      if (missingCount > 0) {
        results.push({
          name: 'core/completeness',
          status: 'fail',
          detail: `${missingCount} file(s) missing`
        });
      }
    }
  }

  return results;
}

/**
 * Check commands and skills are properly copied (not symlinked) and up to date.
 * Commands and skills are file copies since v11.3.0 to avoid node_modules drift.
 */
export function checkCommandsAndSkills(projectRoot: string, _nodeModulesPath: string | null): CheckResult[] {
  const results: CheckResult[] = [];

  // Use assetsPath for source resolution (correct pf-* prefix in dogfood)
  let assetsPath: string | null = null;
  try { assetsPath = getAssetsPath(); } catch { /* no assets available */ }

  if (!assetsPath) {
    // Can't check freshness without assets, but check dirs exist
    const commandsDir = join(projectRoot, '.claude/commands');
    const skillsDir = join(projectRoot, '.claude/skills');

    results.push({
      name: 'core/commands',
      status: pathExists(commandsDir) ? 'pass' : 'fail',
      detail: pathExists(commandsDir) ? undefined : 'Missing .claude/commands/'
    });
    results.push({
      name: 'core/skills',
      status: pathExists(skillsDir) ? 'pass' : 'fail',
      detail: pathExists(skillsDir) ? undefined : 'Missing .claude/skills/'
    });

    return results;
  }

  // Check commands
  const commandsDir = join(projectRoot, '.claude/commands');
  const builtInCommandsPath = join(assetsPath, 'commands');

  if (!pathExists(commandsDir)) {
    results.push({
      name: 'core/commands',
      status: 'fail',
      detail: 'Missing .claude/commands/ — run pennyfarthing update'
    });
  } else if (pathExists(builtInCommandsPath)) {
    const sourceCommands = readdirSync(builtInCommandsPath).filter(f => f.endsWith('.md') && f.startsWith('pf-'));
    const installedEntries = readdirSync(commandsDir).filter(f => f.startsWith('pf-'));
    let staleCount = 0;
    let symlinkCount = 0;

    // Check for stale symlinks (legacy) or stale copies
    for (const cmd of sourceCommands) {
      const installedPath = join(commandsDir, cmd);
      const sourcePath = join(builtInCommandsPath, cmd);

      if (!pathExists(installedPath)) {
        staleCount++;
      } else if (isSymlink(installedPath)) {
        symlinkCount++;
      } else if (!filesMatch(installedPath, sourcePath)) {
        staleCount++;
      }
    }

    if (symlinkCount > 0) {
      results.push({
        name: 'core/commands',
        status: 'warn',
        detail: `${symlinkCount} command(s) are symlinks — should be copies. Run pennyfarthing update`,
        fix: () => {
          refreshCommandsCopy(projectRoot, builtInCommandsPath);
        }
      });
    } else if (staleCount > 0) {
      results.push({
        name: 'core/commands',
        status: 'warn',
        detail: `${staleCount} command(s) out of date — run pennyfarthing update`,
        fix: () => {
          refreshCommandsCopy(projectRoot, builtInCommandsPath);
        }
      });
    } else {
      results.push({
        name: 'core/commands',
        status: 'pass',
        detail: `${installedEntries.length} commands`
      });
    }
  }

  // Check skills
  const skillsDir = join(projectRoot, '.claude/skills');
  const builtInSkillsPath = join(assetsPath, 'skills');

  if (!pathExists(skillsDir)) {
    results.push({
      name: 'core/skills',
      status: 'fail',
      detail: 'Missing .claude/skills/ — run pennyfarthing update'
    });
  } else if (pathExists(builtInSkillsPath)) {
    const sourceSkills = readdirSync(builtInSkillsPath).filter(f => {
      const fullPath = join(builtInSkillsPath, f);
      return isDirectory(fullPath) && f.startsWith('pf-');
    });
    const installedEntries = readdirSync(skillsDir).filter(f => f.startsWith('pf-'));
    let missingCount = 0;
    let symlinkCount = 0;

    for (const skill of sourceSkills) {
      const installedPath = join(skillsDir, skill);

      if (!pathExists(installedPath)) {
        missingCount++;
      } else if (isSymlink(installedPath)) {
        symlinkCount++;
      }
    }

    if (symlinkCount > 0) {
      results.push({
        name: 'core/skills',
        status: 'warn',
        detail: `${symlinkCount} skill(s) are symlinks — should be copies. Run pennyfarthing update`,
        fix: () => {
          refreshSkillsCopy(projectRoot, builtInSkillsPath);
        }
      });
    } else if (missingCount > 0) {
      results.push({
        name: 'core/skills',
        status: 'warn',
        detail: `${missingCount} skill(s) missing — run pennyfarthing update`,
        fix: () => {
          refreshSkillsCopy(projectRoot, builtInSkillsPath);
        }
      });
    } else {
      results.push({
        name: 'core/skills',
        status: 'pass',
        detail: `${installedEntries.length} skills`
      });
    }
  }

  return results;
}

/**
 * Fix function: refresh commands by cleaning managed entries and copying fresh
 */
function refreshCommandsCopy(projectRoot: string, builtInCommandsPath: string): void {
  const commandsDir = join(projectRoot, '.claude/commands');
  ensureDirSync(commandsDir);

  // Clean all pf-* entries (symlinks or files)
  const entries = readdirSync(commandsDir).filter(f => f.startsWith('pf-'));
  for (const entry of entries) {
    const entryPath = join(commandsDir, entry);
    try {
      unlinkSync(entryPath);
    } catch {
      // Already gone
    }
  }

  // Copy fresh from source
  const sourceCommands = readdirSync(builtInCommandsPath).filter(f => f.endsWith('.md') && f.startsWith('pf-'));
  for (const cmd of sourceCommands) {
    const sourcePath = join(builtInCommandsPath, cmd);
    const destPath = join(commandsDir, cmd);
    try {
      copyFileSync(sourcePath, destPath);
    } catch (e) {
      logger.warning(`Could not copy command ${cmd}: ${e}`);
    }
  }
}

/**
 * Fix function: refresh skills by cleaning managed entries and copying fresh
 */
function refreshSkillsCopy(projectRoot: string, builtInSkillsPath: string): void {
  const skillsDir = join(projectRoot, '.claude/skills');
  ensureDirSync(skillsDir);

  // Clean all pf-* entries (symlinks or directories)
  const entries = readdirSync(skillsDir).filter(f => f.startsWith('pf-'));
  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    try {
      removeSync(entryPath);
    } catch {
      // Already gone
    }
  }

  // Copy fresh from source
  const sourceSkills = readdirSync(builtInSkillsPath).filter(f => {
    const fullPath = join(builtInSkillsPath, f);
    return isDirectory(fullPath) && f.startsWith('pf-');
  });
  for (const skill of sourceSkills) {
    const sourcePath = join(builtInSkillsPath, skill);
    const destPath = join(skillsDir, skill);
    try {
      copySync(sourcePath, destPath, { overwrite: true });
    } catch (e) {
      logger.warning(`Could not copy skill ${skill}: ${e}`);
    }
  }
}

/**
 * Check symlinks for symlink installation mode
 */
function checkSymlinks(projectRoot: string, nodeModulesPath: string | null): CheckResult[] {
  const results: CheckResult[] = [];
  const localTargets = findLocalSymlinkTargets(projectRoot);

  // Check if we have any source available
  if (!nodeModulesPath && !localTargets) {
    results.push({
      name: 'core/node_modules',
      status: 'fail',
      detail: 'pennyfarthing not found in node_modules and no local symlink targets in repos.yaml'
    });
    return results;
  }

  if (localTargets) {
    results.push({
      name: 'core/source',
      status: 'pass',
      detail: 'repos.yaml local symlink targets'
    });
  }

  if (nodeModulesPath) {
    results.push({
      name: 'core/node_modules',
      status: 'pass',
      detail: relative(projectRoot, nodeModulesPath)
    });
  }

  for (const { name, link } of ALL_SYMLINKS) {
    const linkPath = join(projectRoot, link);

    // Determine the correct target: local source preferred, node_modules fallback
    const localTarget = localTargets?.get(link);
    const targetPath = localTarget
      ? localTarget
      : nodeModulesPath ? join(nodeModulesPath, name) : null;

    if (!targetPath) {
      results.push({
        name: `symlink/${name}`,
        status: 'warn',
        detail: 'No source path available'
      });
      continue;
    }

    const expectedRelative = relative(dirname(linkPath), targetPath);

    if (!isSymlink(linkPath)) {
      // Not a symlink
      if (pathExists(linkPath)) {
        // It's a directory (copy mode remnant)
        results.push({
          name: `symlink/${name}`,
          status: 'warn',
          detail: 'Directory instead of symlink - run update to migrate',
          fix: () => {
            removeSync(linkPath);
            symlinkSync(expectedRelative, linkPath);
          }
        });
      } else {
        // Missing entirely
        results.push({
          name: `symlink/${name}`,
          status: 'fail',
          detail: 'Missing symlink',
          fix: () => {
            symlinkSync(expectedRelative, linkPath);
          }
        });
      }
      continue;
    }

    // It's a symlink - check if it resolves
    try {
      const resolved = readlinkSync(linkPath);
      // Verify the target exists
      if (pathExists(linkPath)) {
        results.push({
          name: `symlink/${name}`,
          status: 'pass',
          detail: resolved
        });
      } else {
        results.push({
          name: `symlink/${name}`,
          status: 'fail',
          detail: `Broken symlink (${resolved}) - run update to fix`,
          fix: () => {
            unlinkSync(linkPath);
            symlinkSync(expectedRelative, linkPath);
          }
        });
      }
    } catch {
      results.push({
        name: `symlink/${name}`,
        status: 'fail',
        detail: 'Cannot read symlink'
      });
    }
  }

  return results;
}

/**
 * Check basic user files only (project dir, sidecars, persona config, settings.local.json existence).
 * Does NOT include the settings hook checks — use checkSettingsHooks() for those.
 * Used by --category commands to separate user file checks from hook configuration checks.
 */
export function checkUserFilesBasic(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  const manifest = readManifest(projectRoot);
  const installationType = manifest?.installationType || 'copy';

  // Check project directory
  const projectDir = join(projectRoot, '.claude/project');
  results.push({
    name: 'project/directory',
    status: pathExists(projectDir) ? 'pass' : 'warn',
    detail: pathExists(projectDir) ? undefined : 'Run init to create'
  });

  // Check agent sidecars (now in .pennyfarthing/sidecars/)
  const sidecarsDir = join(projectRoot, '.pennyfarthing/sidecars');
  if (pathExists(sidecarsDir)) {
    const existingSidecars = CORE_AGENTS.filter(a => pathExists(join(sidecarsDir, a)));

    results.push({
      name: 'project/sidecars',
      status: existingSidecars.length > 0 ? 'pass' : 'warn',
      detail: `${existingSidecars.length} agent sidecars configured`
    });
  }

  // Check persona config — use getCurrentTheme() which checks both
  // config.local.yaml (priority 1) and persona-config.yaml (priority 2)
  const detectedTheme = getCurrentTheme(projectRoot);
  results.push({
    name: 'persona-config',
    status: detectedTheme ? 'pass' : 'warn',
    detail: detectedTheme ? undefined : 'No theme configured'
  });

  // Check settings.local.json exists (CRITICAL - registers hooks with Claude Code)
  const settingsLocal = join(projectRoot, '.claude/settings.local.json');
  if (!pathExists(settingsLocal)) {
    results.push({
      name: 'settings.local.json',
      status: 'fail',
      detail: 'Missing - hooks not registered with Claude Code!',
      fix: () => {
        createSettingsLocalJson(projectRoot, installationType);
      }
    });
  } else {
    results.push({
      name: 'settings.local.json',
      status: 'pass',
      detail: undefined
    });
  }

  return results;
}

/**
 * Check all settings hook configurations in settings.local.json.
 * Returns results for all 9 hook checks (session-start, otel, auto-load-sm,
 * stop, post-tool-use, benchmark-permissions, context-circuit-breaker,
 * schema-validation, sprint-yaml-validation).
 * Used by --category hooks for targeted hook configuration checking.
 */
export function checkSettingsHooks(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  const manifest = readManifest(projectRoot);
  const installationType = manifest?.installationType || 'copy';

  const settingsLocal = join(projectRoot, '.claude/settings.local.json');
  if (!pathExists(settingsLocal)) {
    results.push({
      name: 'settings.local.json',
      status: 'fail',
      detail: 'Missing - cannot check hook configuration'
    });
    return results;
  }

  results.push(checkSessionStartHooks(projectRoot, installationType));
  results.push(checkOtelAutoStart(projectRoot, installationType));
  results.push(checkAutoLoadSmHook(projectRoot));
  results.push(checkCompactPrimeHook(projectRoot));
  results.push(checkStopHook(projectRoot, installationType));
  results.push(checkPostToolUseHook(projectRoot, installationType));
  results.push(checkBenchmarkPermissions(projectRoot));
  results.push(checkContextCircuitBreaker(projectRoot, installationType));
  results.push(checkSchemaValidationHook(projectRoot, installationType));
  results.push(checkSprintYamlValidationHook(projectRoot, installationType));

  return results;
}

function checkUserFiles(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Detect installation type from manifest
  const manifest = readManifest(projectRoot);
  const installationType = manifest?.installationType || 'copy';

  // Check project directory
  const projectDir = join(projectRoot, '.claude/project');
  results.push({
    name: 'project/directory',
    status: pathExists(projectDir) ? 'pass' : 'warn',
    detail: pathExists(projectDir) ? undefined : 'Run init to create'
  });

  // Check agent sidecars (now in .pennyfarthing/sidecars/)
  const sidecarsDir = join(projectRoot, '.pennyfarthing/sidecars');
  if (pathExists(sidecarsDir)) {
    const existingSidecars = CORE_AGENTS.filter(a => pathExists(join(sidecarsDir, a)));

    results.push({
      name: 'project/sidecars',
      status: existingSidecars.length > 0 ? 'pass' : 'warn',
      detail: `${existingSidecars.length} agent sidecars configured`
    });
  }

  // Check persona config — use getCurrentTheme() which checks both
  // config.local.yaml (priority 1) and persona-config.yaml (priority 2)
  const detectedTheme = getCurrentTheme(projectRoot);
  results.push({
    name: 'persona-config',
    status: detectedTheme ? 'pass' : 'warn',
    detail: detectedTheme ? undefined : 'No theme configured'
  });

  // Check settings.local.json exists (CRITICAL - registers hooks with Claude Code)
  const settingsLocal = join(projectRoot, '.claude/settings.local.json');
  if (!pathExists(settingsLocal)) {
    results.push({
      name: 'settings.local.json',
      status: 'fail',
      detail: 'Missing - hooks not registered with Claude Code!',
      fix: () => {
        createSettingsLocalJson(projectRoot, installationType);
      }
    });
  } else {
    results.push({
      name: 'settings.local.json',
      status: 'pass',
      detail: undefined
    });

    // Check SessionStart hooks are configured (critical for PROJECT_ROOT)
    const hookCheck = checkSessionStartHooks(projectRoot, installationType);
    results.push(hookCheck);

    // Check OTEL auto-configuration (WheelHub auto-start + telemetry env vars)
    const otelCheck = checkOtelAutoStart(projectRoot, installationType);
    results.push(otelCheck);

    // Check auto-load-sm hook is configured (auto-invokes /sm on new sessions)
    const autoLoadSmCheck = checkAutoLoadSmHook(projectRoot);
    results.push(autoLoadSmCheck);

    // Check compact/prime hook is configured (re-primes context after compression)
    const compactPrimeCheck = checkCompactPrimeHook(projectRoot);
    results.push(compactPrimeCheck);

    // Check Stop hook is configured (question reflector enforcement)
    const stopHookCheck = checkStopHook(projectRoot, installationType);
    results.push(stopHookCheck);

    // Check PostToolUse hook is configured (bell mode - MSSCI-12275)
    const postToolUseHookCheck = checkPostToolUseHook(projectRoot, installationType);
    results.push(postToolUseHookCheck);

    // Check benchmark permissions (needed for /benchmark, /solo subagents)
    const benchmarkCheck = checkBenchmarkPermissions(projectRoot);
    results.push(benchmarkCheck);

    // Check PreToolUse hooks for context-circuit-breaker
    const circuitBreakerCheck = checkContextCircuitBreaker(projectRoot, installationType);
    results.push(circuitBreakerCheck);

    // Check PreToolUse hooks for schema-validation
    const schemaValidationCheck = checkSchemaValidationHook(projectRoot, installationType);
    results.push(schemaValidationCheck);

    // Check PostToolUse hooks for sprint-yaml-validation
    const sprintYamlValidationCheck = checkSprintYamlValidationHook(projectRoot, installationType);
    results.push(sprintYamlValidationCheck);
  }

  return results;
}

/**
 * Check that benchmark-required permissions are configured in settings.local.json
 * Subagents need explicit Bash(claude:*) permission since they run non-interactively
 */
function checkBenchmarkPermissions(projectRoot: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const permissions = settings.permissions?.allow || [];

    // Check if Bash(claude:*) specifically exists (needed for subagents)
    const hasExplicitClaudeBash = permissions.includes('Bash(claude:*)');

    if (!hasExplicitClaudeBash) {
      return {
        name: 'settings/benchmark-permissions',
        status: 'warn',
        detail: 'Missing Bash(claude:*) for parallel benchmarks (sequential runs unaffected)',
        fix: () => {
          addBenchmarkPermissions(projectRoot);
        }
      };
    }

    return {
      name: 'settings/benchmark-permissions',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/benchmark-permissions',
      status: 'warn',
      detail: 'Could not check benchmark permissions'
    };
  }
}

/**
 * Fix function: Add benchmark permissions to settings.local.json
 */
function addBenchmarkPermissions(projectRoot: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredPermissions = [
    'Bash(claude:*)',
    'Bash(date:*)',
    'Bash(mkdir:*)',
    'Edit(results/**)',
    'Write(results/**)',
    'Skill(solo)',
    'Skill(benchmark)',
    'Skill(benchmark-control)',
    'Skill(judge)',
    'Skill(finalize-run)'
  ];

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.permissions) {
    settings.permissions = { allow: [] };
  }

  const permissions = settings.permissions as { allow: string[] };
  if (!Array.isArray(permissions.allow)) {
    permissions.allow = [];
  }

  // Add missing permissions
  for (const perm of requiredPermissions) {
    if (!permissions.allow.includes(perm)) {
      permissions.allow.push(perm);
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Check that SessionStart hooks are properly configured in settings.local.json
 * This is critical because session-start.sh exports PROJECT_ROOT
 */
function checkSessionStartHooks(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Check if hooks.SessionStart exists and contains session-start.sh
    if (!settings.hooks?.SessionStart) {
      return {
        name: 'settings/session-start-hook',
        status: 'fail',
        detail: 'Missing SessionStart hooks - agents cannot find PROJECT_ROOT',
        fix: () => {
          addSessionStartHooks(projectRoot, installationType);
        }
      };
    }

    // Check if session-start hook is configured (pf hooks or legacy .sh)
    const hasSessionStartHook = settings.hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh hooks session-start') || h.command?.includes('pf hooks session-start') || h.command?.includes('session-start.sh')
        );
      }
      return false;
    });

    if (!hasSessionStartHook) {
      return {
        name: 'settings/session-start-hook',
        status: 'fail',
        detail: 'session-start hook not configured - PROJECT_ROOT will be undefined',
        fix: () => {
          addSessionStartHooks(projectRoot, installationType);
        }
      };
    }

    return {
      name: 'settings/session-start-hook',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/session-start-hook',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Check that session-start hook uses `pf hooks session-start` (Python version)
 * which handles WheelHub auto-start + OTEL env var configuration.
 * Legacy .sh hooks only set 2 of 5 required OTEL vars, breaking telemetry.
 */
function checkOtelAutoStart(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    if (!settings.hooks?.SessionStart) {
      return {
        name: 'settings/otel-auto-start',
        status: 'warn',
        detail: 'No SessionStart hooks — WheelHub auto-start and OTEL not configured',
      };
    }

    // Check if `pf hooks session-start` is used (Python version with full OTEL support)
    const hasPfHooksSessionStart = settings.hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh hooks session-start') || h.command?.includes('pf hooks session-start')
        );
      }
      return false;
    });

    if (hasPfHooksSessionStart) {
      return {
        name: 'settings/otel-auto-start',
        status: 'pass',
        detail: undefined,
      };
    }

    // Check if using legacy .sh (only sets 2 of 5 OTEL vars)
    const hasLegacySh = settings.hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('session-start.sh')
        );
      }
      return false;
    });

    if (hasLegacySh) {
      return {
        name: 'settings/otel-auto-start',
        status: 'warn',
        detail: 'Using legacy session-start.sh — missing WheelHub auto-start and 3 OTEL env vars. Migrate to `pf hooks session-start`',
        fix: () => {
          migrateSessionStartToPfHooks(projectRoot);
        },
      };
    }

    return {
      name: 'settings/otel-auto-start',
      status: 'warn',
      detail: 'session-start hook not found — WheelHub auto-start and OTEL not configured',
      fix: () => {
        addSessionStartHooks(projectRoot, installationType);
      },
    };
  } catch {
    return {
      name: 'settings/otel-auto-start',
      status: 'warn',
      detail: 'Could not parse settings.local.json',
    };
  }
}

/**
 * Migrate legacy session-start.sh hooks to `pf hooks session-start`
 */
function migrateSessionStartToPfHooks(projectRoot: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    if (Array.isArray(settings.hooks?.SessionStart)) {
      for (const entry of settings.hooks.SessionStart) {
        if (typeof entry === 'object' && entry !== null && Array.isArray(entry.hooks)) {
          for (const h of entry.hooks) {
            if (h.command?.includes('session-start.sh')) {
              h.command = '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks session-start';
            }
          }
        }
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    // Silent fail — doctor will re-report on next run
  }
}

/**
 * Check that auto-load-sm hook is configured in SessionStart
 * This auto-invokes /sm agent on new session start
 */
function checkAutoLoadSmHook(projectRoot: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    if (!settings.hooks?.SessionStart) {
      return {
        name: 'settings/auto-load-sm',
        status: 'warn',
        detail: 'Missing SessionStart hooks - auto-load-sm not configured',
        fix: () => {
          addAutoLoadSmHook(projectRoot);
        }
      };
    }

    const hasAutoLoadSm = settings.hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('auto-load-sm')
        );
      }
      return false;
    });

    if (!hasAutoLoadSm) {
      return {
        name: 'settings/auto-load-sm',
        status: 'warn',
        detail: 'auto-load-sm not configured - /sm will not auto-invoke on startup',
        fix: () => {
          addAutoLoadSmHook(projectRoot);
        }
      };
    }

    // Also check that the hook script file exists
    const hookScript = join(projectRoot, '.pennyfarthing/project/hooks/auto-load-sm.sh');
    if (!pathExists(hookScript)) {
      return {
        name: 'settings/auto-load-sm',
        status: 'warn',
        detail: 'Hook registered but script missing at .pennyfarthing/project/hooks/auto-load-sm.sh',
        fix: () => {
          ensureDirSync(dirname(hookScript));
          writeFileSync(hookScript, `#!/usr/bin/env bash
# Auto-load /sm agent on new session start
set -euo pipefail

cat <<'HOOKEOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "IMPORTANT: Auto-invoke the /sm agent immediately. Run the Skill tool with skill: \\"sm\\" as your first action. Do not greet the user or do anything else first."
  }
}
HOOKEOF
`, { mode: 0o755 });
        }
      };
    }

    return {
      name: 'settings/auto-load-sm',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/auto-load-sm',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Fix function: Add auto-load-sm hook to SessionStart in settings.local.json
 */
function addAutoLoadSmHook(projectRoot: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHook = {
    matcher: 'startup',
    hooks: [
      {
        type: 'command',
        command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/auto-load-sm.sh'
      }
    ]
  };

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      // Start fresh if parse fails
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.SessionStart) {
    hooks.SessionStart = [requiredHook];
  } else if (Array.isArray(hooks.SessionStart)) {
    hooks.SessionStart = [...hooks.SessionStart, requiredHook];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  // Also ensure the hook script exists
  const hookScript = join(projectRoot, '.pennyfarthing/project/hooks/auto-load-sm.sh');
  if (!pathExists(hookScript)) {
    ensureDirSync(dirname(hookScript));
    writeFileSync(hookScript, `#!/usr/bin/env bash
# Auto-load /sm agent on new session start
set -euo pipefail

cat <<'HOOKEOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "IMPORTANT: Auto-invoke the /sm agent immediately. Run the Skill tool with skill: \\"sm\\" as your first action. Do not greet the user or do anything else first."
  }
}
HOOKEOF
`, { mode: 0o755 });
  }
}

/**
 * Check that compact/prime hook is configured in SessionStart hooks.
 * This re-primes agent context after context window compression.
 */
function checkCompactPrimeHook(projectRoot: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    if (!settings.hooks?.SessionStart) {
      return {
        name: 'settings/compact-prime',
        status: 'warn',
        detail: 'Missing SessionStart hooks - compact/prime not configured',
        fix: () => {
          addCompactPrimeHook(projectRoot);
        }
      };
    }

    const hasCompactPrime = settings.hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { matcher?: string; hooks?: Array<{ command?: string }> };
        return hookEntry.matcher === 'compact' && hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh prime')
        );
      }
      return false;
    });

    if (!hasCompactPrime) {
      return {
        name: 'settings/compact-prime',
        status: 'warn',
        detail: 'compact/prime not configured - context will not re-prime after compression',
        fix: () => {
          addCompactPrimeHook(projectRoot);
        }
      };
    }

    return {
      name: 'settings/compact-prime',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/compact-prime',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Fix function: Add compact/prime hook to SessionStart in settings.local.json
 */
function addCompactPrimeHook(projectRoot: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHook = {
    matcher: 'compact',
    hooks: [
      {
        type: 'command',
        command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh prime'
      }
    ]
  };

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      // Start fresh if parse fails
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.SessionStart) {
    hooks.SessionStart = [requiredHook];
  } else if (Array.isArray(hooks.SessionStart)) {
    hooks.SessionStart = [...hooks.SessionStart, requiredHook];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Check that Stop hook is properly configured in settings.local.json
 * This is needed for question reflector enforcement in Cyclist
 */
function checkStopHook(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Check if hooks.Stop exists and contains question-reflector-check
    if (!settings.hooks?.Stop) {
      return {
        name: 'settings/stop-hook',
        status: 'warn',
        detail: 'Missing Stop hook - question reflector not enforced',
        fix: () => {
          addStopHook(projectRoot, installationType);
        }
      };
    }

    // Check if reflector-check hook is configured (pf hooks or legacy .sh)
    const hasReflectorHook = settings.hooks.Stop.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh hooks reflector-check') || h.command?.includes('pf hooks reflector-check') || h.command?.includes('question-reflector-check')
        );
      }
      return false;
    });

    if (!hasReflectorHook) {
      return {
        name: 'settings/stop-hook',
        status: 'warn',
        detail: 'reflector-check hook not configured',
        fix: () => {
          addStopHook(projectRoot, installationType);
        }
      };
    }

    return {
      name: 'settings/stop-hook',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/stop-hook',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Check that context-circuit-breaker hook is configured in PreToolUse
 * This is needed to prevent context exhaustion (auto-saves session)
 */
function checkContextCircuitBreaker(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Check if hooks.PreToolUse exists and contains context-circuit-breaker
    if (!settings.hooks?.PreToolUse) {
      return {
        name: 'settings/context-circuit-breaker',
        status: 'warn',
        detail: 'Missing PreToolUse hooks - context circuit breaker not configured',
        fix: () => {
          addContextCircuitBreaker(projectRoot, installationType);
        }
      };
    }

    // Check if context-breaker hook is configured (pf hooks or legacy .sh)
    const hasCircuitBreaker = settings.hooks.PreToolUse.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh hooks context-breaker') || h.command?.includes('pf hooks context-breaker') || h.command?.includes('context-circuit-breaker')
        );
      }
      return false;
    });

    if (!hasCircuitBreaker) {
      return {
        name: 'settings/context-circuit-breaker',
        status: 'warn',
        detail: 'context-breaker hook not configured - context exhaustion protection disabled',
        fix: () => {
          addContextCircuitBreaker(projectRoot, installationType);
        }
      };
    }

    return {
      name: 'settings/context-circuit-breaker',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/context-circuit-breaker',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Fix function: Add context-circuit-breaker hook to PreToolUse in settings.local.json
 */
function addContextCircuitBreaker(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHook = {
    matcher: 'Edit|Write|Bash|Task',
    hooks: [
      {
        type: 'command',
        command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks context-breaker'
      }
    ]
  };

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.PreToolUse) {
    hooks.PreToolUse = [requiredHook];
  } else if (Array.isArray(hooks.PreToolUse)) {
    // Append the required hook (circuit breaker should run last)
    hooks.PreToolUse = [...hooks.PreToolUse, requiredHook];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Check that schema-validation hook is configured in PreToolUse
 * This validates XML schema for session/skill/step files on Write
 */
function checkSchemaValidationHook(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Check if hooks.PreToolUse exists
    if (!settings.hooks?.PreToolUse) {
      return {
        name: 'settings/schema-validation',
        status: 'warn',
        detail: 'Missing PreToolUse hooks - schema validation not configured',
        fix: () => {
          addSchemaValidationHook(projectRoot, installationType);
        }
      };
    }

    // Check if schema-validation is configured
    const hasSchemaValidation = settings.hooks.PreToolUse.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('schema-validation')
        );
      }
      return false;
    });

    if (!hasSchemaValidation) {
      return {
        name: 'settings/schema-validation',
        status: 'warn',
        detail: 'schema-validation not configured - XML schema enforcement disabled',
        fix: () => {
          addSchemaValidationHook(projectRoot, installationType);
        }
      };
    }

    return {
      name: 'settings/schema-validation',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/schema-validation',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Fix function: Add schema-validation hook to PreToolUse in settings.local.json
 */
function addSchemaValidationHook(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHook = {
    matcher: 'Write',
    hooks: [
      {
        type: 'command',
        command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks schema-validation'
      }
    ]
  };

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.PreToolUse) {
    hooks.PreToolUse = [requiredHook];
  } else if (Array.isArray(hooks.PreToolUse)) {
    // Insert schema validation early (after pre-edit-check but before circuit breaker)
    hooks.PreToolUse = [requiredHook, ...hooks.PreToolUse];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Check that PostToolUse hook is properly configured in settings.local.json
 * This is needed for bell mode to inject queued messages (MSSCI-12275)
 */
function checkPostToolUseHook(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Check if hooks.PostToolUse exists and contains bell-mode-hook
    if (!settings.hooks?.PostToolUse) {
      return {
        name: 'settings/post-tool-use-hook',
        status: 'warn',
        detail: 'Missing PostToolUse hook - bell mode will not work',
        fix: () => {
          addPostToolUseHook(projectRoot, installationType);
        }
      };
    }

    // Check if bell-mode hook is configured (pf hooks or legacy .sh)
    const hasBellModeHook = settings.hooks.PostToolUse.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh hooks bell-mode') || h.command?.includes('pf hooks bell-mode') || h.command?.includes('bell-mode-hook')
        );
      }
      return false;
    });

    if (!hasBellModeHook) {
      return {
        name: 'settings/post-tool-use-hook',
        status: 'warn',
        detail: 'bell-mode hook not configured - bell mode will not work',
        fix: () => {
          addPostToolUseHook(projectRoot, installationType);
        }
      };
    }

    return {
      name: 'settings/post-tool-use-hook',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/post-tool-use-hook',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Fix function: Add PostToolUse hook to settings.local.json
 * Required for bell mode to inject queued messages via additionalContext
 */
function addPostToolUseHook(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHook = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks bell-mode'
      }
    ]
  };

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.PostToolUse) {
    hooks.PostToolUse = [requiredHook];
  } else if (Array.isArray(hooks.PostToolUse)) {
    // Prepend the required hook
    hooks.PostToolUse = [requiredHook, ...hooks.PostToolUse];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Check that sprint-yaml-validation hook is configured in PostToolUse
 * This validates sprint YAML files after Edit/Write to ensure Cyclist compatibility
 */
function checkSprintYamlValidationHook(projectRoot: string, installationType: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Check if hooks.PostToolUse exists
    if (!settings.hooks?.PostToolUse) {
      return {
        name: 'settings/sprint-yaml-validation',
        status: 'warn',
        detail: 'Missing PostToolUse hooks - sprint YAML validation not configured',
        fix: () => {
          addSprintYamlValidationHook(projectRoot, installationType);
        }
      };
    }

    // Check if sprint-yaml hook is configured (pf hooks or legacy .sh)
    const hasSprintYamlValidation = settings.hooks.PostToolUse.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('pf.sh hooks sprint-yaml') || h.command?.includes('pf hooks sprint-yaml') || h.command?.includes('sprint-yaml-validation')
        );
      }
      return false;
    });

    if (!hasSprintYamlValidation) {
      return {
        name: 'settings/sprint-yaml-validation',
        status: 'warn',
        detail: 'sprint-yaml hook not configured - sprint YAML errors may break SprintPanel',
        fix: () => {
          addSprintYamlValidationHook(projectRoot, installationType);
        }
      };
    }

    return {
      name: 'settings/sprint-yaml-validation',
      status: 'pass',
      detail: undefined
    };
  } catch {
    return {
      name: 'settings/sprint-yaml-validation',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Fix function: Add sprint-yaml-validation hook to PostToolUse in settings.local.json
 * Validates sprint YAML files after Edit/Write for Cyclist SprintPanel compatibility
 */
function addSprintYamlValidationHook(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHook = {
    matcher: 'Edit|Write',
    hooks: [
      {
        type: 'command',
        command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks sprint-yaml'
      }
    ]
  };

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.PostToolUse) {
    hooks.PostToolUse = [requiredHook];
  } else if (Array.isArray(hooks.PostToolUse)) {
    // Append the sprint YAML validation hook
    hooks.PostToolUse = [...hooks.PostToolUse, requiredHook];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Fix function: Add Stop hook to settings.local.json
 */
function addStopHook(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHooks = [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks reflector-check'
        }
      ]
    },
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks session-stop'
        }
      ]
    }
  ];

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.Stop) {
    hooks.Stop = requiredHooks;
  } else if (Array.isArray(hooks.Stop)) {
    // Prepend the required hooks
    hooks.Stop = [...requiredHooks, ...hooks.Stop];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Get the script base path based on installation type
 * - symlink mode: .pennyfarthing/scripts/
 * - copy mode: .claude/pennyfarthing/scripts/ (legacy)
 */
function getScriptBasePath(installationType: string): string {
  return installationType === 'symlink'
    ? '.pennyfarthing/scripts'
    : '.claude/pennyfarthing/scripts';
}

/**
 * Fix function: Add SessionStart hooks to settings.local.json
 */
function addSessionStartHooks(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  const requiredHooks = [
    {
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks session-start'
        }
      ]
    },
    {
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/setup-env.sh'
        }
      ]
    },
    {
      matcher: 'startup',
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/auto-load-sm.sh'
        }
      ]
    }
  ];

  let settings: Record<string, unknown> = {};

  if (pathExists(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      logger.warning(`Cannot parse ${settingsPath} — fix JSON syntax and re-run doctor --fix`);
      return;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown>;

  if (!hooks.SessionStart) {
    hooks.SessionStart = requiredHooks;
  } else if (Array.isArray(hooks.SessionStart)) {
    // Prepend the required hooks
    hooks.SessionStart = [...requiredHooks, ...hooks.SessionStart];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Create settings.local.json from template
 * This is the critical fix for installations that are missing this file
 */
function createSettingsLocalJson(projectRoot: string, _installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  // Create full settings structure matching the template — uses pf hooks commands
  const settings = {
    permissions: {
      allow: [
        'Read',
        'Grep',
        'Glob',
        'Bash',
        'Bash(claude:*)',
        'Bash(date:*)',
        'Bash(mkdir:*)',
        'Edit(.claude/**)',
        'Edit(.pennyfarthing/**)',
        'Edit(sprint/**)',
        'Edit(.session/**)',
        'Edit(results/**)',
        'Write(.claude/**)',
        'Write(.pennyfarthing/**)',
        'Write(sprint/**)',
        'Write(.session/**)',
        'Write(results/**)',
        'Skill(sm)',
        'Skill(tea)',
        'Skill(dev)',
        'Skill(reviewer)',
        'Skill(solo)',
        'Skill(benchmark)',
        'Skill(benchmark-control)',
        'Skill(judge)',
        'Skill(finalize-run)'
      ]
    },
    context_budget: {
      warning_threshold: 70,
      critical_threshold: 85,
      max_tokens: 200000
    },
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks session-start'
            }
          ]
        },
        {
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/setup-env.sh'
            }
          ]
        },
        {
          matcher: 'startup',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/auto-load-sm.sh'
            }
          ]
        }
      ],
      Stop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks reflector-check'
            }
          ]
        },
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks session-stop'
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks bell-mode'
            }
          ]
        },
        {
          matcher: 'Edit|Write',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks sprint-yaml'
            }
          ]
        }
      ],
      PreToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks pre-edit-check'
            }
          ]
        },
        {
          matcher: 'Write',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks schema-validation'
            }
          ]
        },
        {
          matcher: 'Edit|Write|Bash|Task',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks context-warning'
            }
          ]
        },
        {
          matcher: 'Edit|Write|Bash|Task',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks context-breaker'
            }
          ]
        },
        {
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks cyclist-pretooluse'
            }
          ]
        }
      ]
    },
    statusLine: {
      type: 'command',
      command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks statusline'
    }
  };

  ensureDirSync(join(projectRoot, '.claude'));
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

export function checkDirectories(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  const dirs = [
    { path: 'sprint', name: 'dir/sprint' },
    { path: '.session', name: 'dir/session' }
  ];

  for (const { path, name } of dirs) {
    const fullPath = join(projectRoot, path);
    results.push({
      name,
      status: pathExists(fullPath) ? 'pass' : 'warn',
      detail: pathExists(fullPath) ? undefined : 'Directory missing'
    });
  }

  return results;
}

export function checkHooks(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Detect installation type from manifest
  const manifest = readManifest(projectRoot);
  const installationType = manifest?.installationType || 'copy';
  const scriptBase = getScriptBasePath(installationType);

  // Check hook scripts exist based on installation type
  const hooks = [
    { path: `${scriptBase}/hooks/session-start.sh`, name: 'hook/session-start' },
    { path: `${scriptBase}/hooks/pre-edit-check.sh`, name: 'hook/pre-edit-check' },
    { path: `${scriptBase}/hooks/context-warning.sh`, name: 'hook/context-warning' },
    { path: `${scriptBase}/hooks/context-circuit-breaker.sh`, name: 'hook/context-circuit-breaker' },
    { path: `${scriptBase}/hooks/bell-mode-hook.sh`, name: 'hook/bell-mode' },
    { path: `${scriptBase}/hooks/question-reflector-check.sh`, name: 'hook/question-reflector' },
    { path: `${scriptBase}/hooks/sprint-yaml-validation.sh`, name: 'hook/sprint-yaml-validation' }
  ];

  for (const { path, name } of hooks) {
    const fullPath = join(projectRoot, path);
    const exists = pathExists(fullPath);

    if (!exists) {
      results.push({
        name,
        status: 'warn',
        detail: `Hook script missing at ${path} - run pennyfarthing update`
      });
      continue;
    }

    // Check if executable
    try {
      const stats = statSync(fullPath);
      const isExecutable = (stats.mode & 0o111) !== 0;

      results.push({
        name,
        status: isExecutable ? 'pass' : 'warn',
        detail: isExecutable ? undefined : 'Not executable',
        fix: isExecutable ? undefined : () => {
          chmodSync(fullPath, 0o755);
        }
      });
    } catch {
      results.push({
        name,
        status: 'fail',
        detail: 'Cannot read hook'
      });
    }
  }

  return results;
}

/**
 * Render the dispatcher template by substituting __HOOK_NAME__ with the actual hook name.
 */
function renderDispatcherTemplate(template: string, hookName: string): string {
  return template.replace(/__HOOK_NAME__/g, hookName);
}

/**
 * Check git hooks in .git/hooks/ are up-to-date with package source.
 *
 * Supports two installation patterns:
 *
 * 1. **Dispatcher pattern** (current): `.git/hooks/{name}` is a generic dispatcher that
 *    runs scripts from `.git/hooks/{name}.d/`. The dispatcher is generated from
 *    `dispatcher-template.sh` and the actual hook implementation lives in the `.d/` dir.
 *
 * 2. **Direct-copy pattern** (legacy): `.git/hooks/{name}` is a direct copy of `{name}.sh`.
 *
 * For framework/orchestrator repos (has pennyfarthing-dist/), checks that hooks are
 * symlinked rather than copied, since symlinks stay current automatically.
 * Provides --fix to refresh stale hooks or replace copies with symlinks.
 */
export function checkGitHooks(projectRoot: string, nodeModulesPath: string | null): CheckResult[] {
  const results: CheckResult[] = [];

  // Use git rev-parse to find the actual git dir (handles worktrees where .git is a file)
  const gitDirResult = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: projectRoot, encoding: 'utf8' });
  const gitDir = gitDirResult.status === 0
    ? (gitDirResult.stdout.trim().startsWith('/') ? gitDirResult.stdout.trim() : join(projectRoot, gitDirResult.stdout.trim()))
    : join(projectRoot, '.git');
  const gitHooksDir = join(gitDir, 'hooks');
  if (!pathExists(gitHooksDir)) {
    return results;
  }

  // Detect framework repo (has pennyfarthing-dist/ at root)
  const isFrameworkRepo = pathExists(join(projectRoot, 'pennyfarthing-dist'));
  // Detect orchestrator repo (has pennyfarthing/pennyfarthing-dist/ — inlined framework)
  const isOrchestratorRepo = !isFrameworkRepo
    && pathExists(join(projectRoot, 'pennyfarthing/pennyfarthing-dist'));
  // Either pattern means hooks should be symlinks, not copies
  const isDevRepo = isFrameworkRepo || isOrchestratorRepo;

  // Resolve hooks source directory
  let frameworkHooksDir: string | null = null;
  if (isFrameworkRepo) {
    frameworkHooksDir = join(projectRoot, 'pennyfarthing-dist/scripts/hooks');
  } else if (isOrchestratorRepo) {
    frameworkHooksDir = join(projectRoot, 'pennyfarthing/pennyfarthing-dist/scripts/hooks');
  }

  // Need either node_modules or framework source to compare against
  if (!nodeModulesPath && !frameworkHooksDir) {
    return results;
  }

  // Resolve the hooks source directory
  const hooksSourceDir = frameworkHooksDir ?? join(nodeModulesPath!, 'scripts/hooks');

  // Load dispatcher template for comparison (used by dispatcher pattern detection)
  const dispatcherTemplatePath = join(hooksSourceDir, 'dispatcher-template.sh');
  const hasDispatcherTemplate = pathExists(dispatcherTemplatePath);
  const dispatcherTemplate = hasDispatcherTemplate
    ? readFileSync(dispatcherTemplatePath, 'utf8')
    : null;

  const hooks = [
    { source: 'pre-commit.sh', dest: 'pre-commit', marker: 'pennyfarthing' },
    { source: 'pre-push.sh', dest: 'pre-push', marker: 'pennyfarthing' },
    { source: 'post-merge.sh', dest: 'post-merge', marker: 'pennyfarthing' },
  ];

  for (const hook of hooks) {
    const sourcePath = join(hooksSourceDir, hook.source);
    const destPath = join(gitHooksDir, hook.dest);
    const dDir = join(gitHooksDir, `${hook.dest}.d`);

    if (!pathExists(sourcePath)) {
      continue;
    }

    if (!pathExists(destPath)) {
      results.push({
        name: `git-hook/${hook.dest}`,
        status: 'warn',
        detail: 'Not installed',
        fix: () => {
          if (isDevRepo) {
            // Dev repos (framework or orchestrator): create symlink from hooks dir to source
            const absSource = join(frameworkHooksDir!, hook.source);
            const relTarget = relative(gitHooksDir, absSource);
            symlinkSync(relTarget, destPath);
          } else {
            // End-user repos: copy content
            const content = readFileSync(sourcePath, 'utf8');
            writeFileSync(destPath, content, { mode: 0o755 });
          }
        }
      });
      continue;
    }

    // Check if hook is a symlink (framework repos should use symlinks)
    const hookIsSymlink = isSymlink(destPath);

    if (isDevRepo && !hookIsSymlink) {
      // Dev repo has a copied hook instead of a symlink — it will go stale
      results.push({
        name: `git-hook/${hook.dest}`,
        status: 'warn',
        detail: 'Copy instead of symlink (will go stale)',
        fix: () => {
          // Backup existing, replace with symlink
          const absSource = join(frameworkHooksDir!, hook.source);
          const relTarget = relative(gitHooksDir, absSource);
          renameSync(destPath, `${destPath}.backup`);
          symlinkSync(relTarget, destPath);
        }
      });
      continue;
    }

    if (hookIsSymlink) {
      // Symlinked hook — verify target exists
      try {
        const target = readlinkSync(destPath);
        const resolvedTarget = join(gitHooksDir, target);
        if (pathExists(resolvedTarget)) {
          results.push({
            name: `git-hook/${hook.dest}`,
            status: 'pass',
            detail: 'Symlinked'
          });
        } else {
          results.push({
            name: `git-hook/${hook.dest}`,
            status: 'warn',
            detail: `Broken symlink → ${target}`,
            fix: () => {
              unlinkSync(destPath);
              const absSource = join(frameworkHooksDir ?? join(nodeModulesPath!, 'scripts/hooks'), hook.source);
              const relTarget = relative(gitHooksDir, absSource);
              symlinkSync(relTarget, destPath);
            }
          });
        }
      } catch {
        results.push({
          name: `git-hook/${hook.dest}`,
          status: 'warn',
          detail: 'Cannot read symlink'
        });
      }
      continue;
    }

    // Copied hook — check content freshness
    const existingContent = readFileSync(destPath, 'utf8');

    // Only check hooks that are ours (contain the marker)
    if (!existingContent.includes(hook.marker)) {
      results.push({
        name: `git-hook/${hook.dest}`,
        status: 'pass',
        detail: 'Custom (non-pennyfarthing)'
      });
      continue;
    }

    // Detect dispatcher pattern: the installed hook is a dispatcher (from dispatcher-template.sh)
    // and the actual implementation lives in .git/hooks/{name}.d/
    const isDispatcherPattern = dispatcherTemplate
      && existingContent.includes('pennyfarthing-dispatcher')
      && pathExists(dDir);

    if (isDispatcherPattern) {
      // --- Dispatcher pattern: check dispatcher + .d/ scripts separately ---

      // 1. Check the dispatcher itself against the rendered template
      const expectedDispatcher = renderDispatcherTemplate(dispatcherTemplate!, hook.dest);
      if (existingContent !== expectedDispatcher) {
        results.push({
          name: `git-hook/${hook.dest}`,
          status: 'warn',
          detail: 'Stale dispatcher — content differs from template',
          fix: () => {
            writeFileSync(destPath, expectedDispatcher, { mode: 0o755 });
          }
        });
      } else {
        results.push({
          name: `git-hook/${hook.dest}`,
          status: 'pass',
          detail: 'Dispatcher'
        });
      }

      // 2. Check the .d/ script against its source
      const dScripts = readdirSync(dDir).filter(f => f.includes('pennyfarthing'));
      if (dScripts.length === 0) {
        results.push({
          name: `git-hook/${hook.dest}.d`,
          status: 'warn',
          detail: 'No pennyfarthing script in .d/ directory',
          fix: () => {
            const sourceContent = readFileSync(sourcePath, 'utf8');
            const dScriptPath = join(dDir, `10-pennyfarthing-${hook.dest}.sh`);
            writeFileSync(dScriptPath, sourceContent, { mode: 0o755 });
          }
        });
      } else {
        // Compare the first matching .d/ script against the source
        const dScriptPath = join(dDir, dScripts[0]);
        const dScriptContent = readFileSync(dScriptPath, 'utf8');
        const sourceContent = readFileSync(sourcePath, 'utf8');
        if (dScriptContent === sourceContent) {
          results.push({
            name: `git-hook/${hook.dest}.d`,
            status: 'pass',
            detail: undefined
          });
        } else {
          results.push({
            name: `git-hook/${hook.dest}.d`,
            status: 'warn',
            detail: 'Stale — content differs from package',
            fix: () => {
              writeFileSync(dScriptPath, sourceContent, { mode: 0o755 });
            }
          });
        }
      }
    } else {
      // --- Legacy direct-copy pattern: compare hook directly against source ---
      const sourceContent = readFileSync(sourcePath, 'utf8');
      if (existingContent === sourceContent) {
        results.push({
          name: `git-hook/${hook.dest}`,
          status: 'pass',
          detail: undefined
        });
      } else {
        results.push({
          name: `git-hook/${hook.dest}`,
          status: 'warn',
          detail: 'Stale — content differs from package',
          fix: () => {
            writeFileSync(destPath, sourceContent, { mode: 0o755 });
          }
        });
      }
    }
  }

  return results;
}

/**
 * Check Cyclist installation health (if installed as a workspace package)
 * Detects node-pty spawn-helper permission issues that cause posix_spawnp failures
 */
export function checkCyclist(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Detect Cyclist package — check common locations
  const cyclistLocations = [
    join(projectRoot, 'packages/cyclist'),
    join(projectRoot, 'node_modules/@pennyfarthing/cyclist'),
  ];

  let cyclistDir: string | null = null;
  for (const loc of cyclistLocations) {
    if (pathExists(join(loc, 'package.json'))) {
      cyclistDir = loc;
      break;
    }
  }

  if (!cyclistDir) {
    // Cyclist not installed — skip silently
    return results;
  }

  results.push({
    name: 'cyclist/installed',
    status: 'pass',
    detail: relative(projectRoot, cyclistDir)
  });

  // Check node-pty spawn-helper permissions
  const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;

  if (!os || !arch) {
    return results;
  }

  // Look for node-pty prebuilds — check cyclist's own node_modules first, then monorepo root
  const searchPaths = [
    join(cyclistDir, 'node_modules/node-pty'),
    join(projectRoot, 'node_modules/node-pty'),
  ];

  let nodePtyDir: string | null = null;
  for (const p of searchPaths) {
    if (pathExists(join(p, 'prebuilds'))) {
      nodePtyDir = p;
      break;
    }
  }

  // Also check pnpm store path (node_modules/.pnpm/node-pty@*/node_modules/node-pty)
  if (!nodePtyDir) {
    const pnpmBase = join(projectRoot, 'node_modules/.pnpm');
    if (pathExists(pnpmBase)) {
      try {
        const entries = readdirSync(pnpmBase) as string[];
        const nodePtyEntry = entries.find((e: string) => e.startsWith('node-pty@'));
        if (nodePtyEntry) {
          const candidate = join(pnpmBase, nodePtyEntry, 'node_modules/node-pty');
          if (pathExists(join(candidate, 'prebuilds'))) {
            nodePtyDir = candidate;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (!nodePtyDir) {
    results.push({
      name: 'cyclist/node-pty',
      status: 'warn',
      detail: 'node-pty not found — terminal panel will not work'
    });
    return results;
  }

  const spawnHelper = join(nodePtyDir, 'prebuilds', `${os}-${arch}`, 'spawn-helper');

  if (!pathExists(spawnHelper)) {
    results.push({
      name: 'cyclist/spawn-helper',
      status: 'warn',
      detail: `spawn-helper not found for ${os}-${arch}`
    });
    return results;
  }

  try {
    const stats = statSync(spawnHelper);
    const isExecutable = (stats.mode & 0o111) !== 0;

    results.push({
      name: 'cyclist/spawn-helper',
      status: isExecutable ? 'pass' : 'fail',
      detail: isExecutable ? undefined : 'Missing execute permission (causes posix_spawnp failure)',
      fix: isExecutable ? undefined : () => {
        chmodSync(spawnHelper, 0o755);
      }
    });
  } catch {
    results.push({
      name: 'cyclist/spawn-helper',
      status: 'warn',
      detail: 'Cannot read spawn-helper'
    });
  }

  return results;
}

/**
 * Check if the pf CLI is installed and working.
 * The pf CLI is required for agent commands (e.g., `pf agent start "dev"`).
 */
export function checkPfCli(nodeModulesPath: string | null): CheckResult {
  const version = getPfVersion();
  if (version) {
    return {
      name: 'tools/pf-cli',
      status: 'pass',
      detail: version
    };
  }

  return {
    name: 'tools/pf-cli',
    status: 'warn',
    detail: 'pf CLI not found — agent commands will not work',
    fix: () => {
      if (!installPfCli(nodeModulesPath)) {
        throw new Error('Neither uv nor pipx available. Install manually: uv tool install pennyfarthing-scripts');
      }
    }
  };
}

/**
 * Known legacy statusline paths from various Pennyfarthing versions.
 * These should be detected and cleaned up when proper statusline exists.
 */
const LEGACY_STATUSLINE_PATHS = [
  '.claude/core/statusline.sh',
  '.claude/statusline.sh',
  '.claude/pennyfarthing/statusline.sh',     // v4.0.0-4.0.3
  '.claude/pennyfarthing/scripts/statusline.sh', // v4.0.5
  '.claude/scripts/statusline.sh',           // pre-v6.6
  '.pennyfarthing/scripts/statusline.sh'     // before v7.0.3
] as const;

/**
 * Canonical statusline path for current version (v7.x)
 */
const CANONICAL_STATUSLINE_PATH = '.pennyfarthing/scripts/misc/statusline.sh';

/**
 * Check for legacy files that may shadow or conflict with current Pennyfarthing files.
 * Returns results with fix functions for --fix mode.
 */
export function checkLegacyFiles(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Check for legacy .claude/scripts/statusline.sh
  const legacyStatusline = join(projectRoot, '.claude/scripts/statusline.sh');
  const properStatusline = join(projectRoot, CANONICAL_STATUSLINE_PATH);

  if (pathExists(legacyStatusline)) {
    if (pathExists(properStatusline)) {
      // Both exist - legacy shadows proper
      results.push({
        name: 'legacy/.claude/scripts/statusline.sh',
        status: 'warn',
        detail: 'Shadows proper pennyfarthing statusline',
        fix: () => {
          unlinkSync(legacyStatusline);
        }
      });
    }
    // If only legacy exists, don't warn - user may have custom setup
  }

  // Check for legacy .claude/persona-config.yaml
  const legacyPersonaConfig = join(projectRoot, '.claude/persona-config.yaml');
  const properThemeConfig = join(projectRoot, '.pennyfarthing/config.local.yaml');

  if (pathExists(legacyPersonaConfig)) {
    const detail = pathExists(properThemeConfig)
      ? 'May conflict with .pennyfarthing/config.local.yaml'
      : 'Should be migrated to .pennyfarthing/config.local.yaml';

    results.push({
      name: 'legacy/.claude/persona-config.yaml',
      status: 'warn',
      detail,
      fix: () => {
        // Read theme from legacy file
        try {
          const legacyContent = readFileSync(legacyPersonaConfig, 'utf8');
          const legacyConfig = YAML.parse(legacyContent);
          const legacyTheme = legacyConfig?.theme;

          if (legacyTheme) {
            // Read existing config.local.yaml or start fresh
            let config: Record<string, unknown> = {};
            if (pathExists(properThemeConfig)) {
              try {
                config = YAML.parse(readFileSync(properThemeConfig, 'utf8')) || {};
              } catch {
                config = {};
              }
            }

            // Only set theme if not already present in config.local.yaml
            if (!config.theme) {
              config.theme = legacyTheme;
              const configDir = dirname(properThemeConfig);
              if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
              }
              writeFileSync(properThemeConfig, YAML.stringify(config), 'utf8');
            }
          }
          unlinkSync(legacyPersonaConfig);
        } catch {
          logger.warning(`Cannot parse ${legacyPersonaConfig} — fix YAML syntax and re-run doctor --fix`);
        }
      }
    });
  }

  // Check for legacy sidecar directories at .claude/project/agents/{agent}-sidecar/
  const legacyAgentsDir = join(projectRoot, '.claude/project/agents');
  if (pathExists(legacyAgentsDir)) {
    const legacySidecars = CORE_AGENTS.filter(a =>
      pathExists(join(legacyAgentsDir, `${a}-sidecar`))
    );
    if (legacySidecars.length > 0) {
      results.push({
        name: 'legacy/.claude/project/agents/sidecars',
        status: 'warn',
        detail: `${legacySidecars.length} legacy sidecar dirs (should be at .pennyfarthing/sidecars/)`,
        fix: () => {
          for (const agent of legacySidecars) {
            const legacyDir = join(legacyAgentsDir, `${agent}-sidecar`);
            const newDir = join(projectRoot, `.pennyfarthing/sidecars/${agent}`);
            // Only remove if new location already has the sidecar
            if (pathExists(newDir)) {
              removeSync(legacyDir);
            }
          }
          // Remove agents/ dir if empty
          try {
            const remaining = readdirSync(legacyAgentsDir);
            if (remaining.length === 0) {
              removeSync(legacyAgentsDir);
            }
          } catch {
            // Ignore
          }
        }
      });
    }
  }

  // Check for legacy sidecar directories at sprint/sidecars/
  const legacySprintSidecars = join(projectRoot, 'sprint/sidecars');
  if (pathExists(legacySprintSidecars)) {
    results.push({
      name: 'legacy/sprint/sidecars',
      status: 'warn',
      detail: 'Legacy sidecar location (should be at .pennyfarthing/sidecars/)',
      fix: () => {
        // Only remove if all agents have been migrated
        try {
          const remaining = readdirSync(legacySprintSidecars);
          const allMigrated = remaining.every(item => {
            const itemPath = join(legacySprintSidecars, item);
            if (!isDirectory(itemPath)) return false;
            return pathExists(join(projectRoot, `.pennyfarthing/sidecars/${item}`));
          });
          if (allMigrated) {
            removeSync(legacySprintSidecars);
          }
        } catch {
          // Ignore
        }
      }
    });
  }

  // Check for legacy .claude/project/hooks/setup-env.sh
  const legacyProjectHook = join(projectRoot, '.claude/project/hooks/setup-env.sh');
  const properProjectHook = join(projectRoot, '.pennyfarthing/project/hooks/setup-env.sh');

  if (pathExists(legacyProjectHook)) {
    const detail = pathExists(properProjectHook)
      ? 'May conflict with .pennyfarthing/project/hooks/setup-env.sh'
      : 'Should be migrated to .pennyfarthing/project/hooks/setup-env.sh';

    results.push({
      name: 'legacy/.claude/project/hooks/setup-env.sh',
      status: 'warn',
      detail,
      fix: () => {
        if (!pathExists(properProjectHook)) {
          const destDir = dirname(properProjectHook);
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
          }
          renameSync(legacyProjectHook, properProjectHook);
        } else {
          unlinkSync(legacyProjectHook);
        }
      }
    });
  }

  return results;
}

/**
 * Check if settings.local.json has statusline configured.
 * The statusLine config is a TOP-LEVEL key (not inside hooks), with structure:
 * { "statusLine": { "type": "command", "command": "path/to/script" } }
 *
 * Returns result with fix function to update to canonical path if needed.
 */
export function checkLegacyStatuslinePath(projectRoot: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  // No settings file - nothing to check
  if (!pathExists(settingsPath)) {
    return {
      name: 'settings/statusline-path',
      status: 'pass',
      detail: 'No settings file'
    };
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {
      name: 'settings/statusline-path',
      status: 'warn',
      detail: 'Cannot parse settings.local.json'
    };
  }

  // statusLine is a TOP-LEVEL key, not inside hooks
  // Format: { type: "command", command: "..." }
  const statusLine = settings.statusLine as { type?: string; command?: string } | undefined;
  if (!statusLine || !statusLine.command) {
    // No statusline configured
    return {
      name: 'settings/statusline-path',
      status: 'pass',
      detail: 'No statusline configured'
    };
  }

  // Extract the path from the command (may have $CLAUDE_PROJECT_DIR prefix)
  const command = statusLine.command;
  // Match patterns like "$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/misc/statusline.sh
  // or plain paths like .pennyfarthing/scripts/misc/statusline.sh
  const pathMatch = command.match(/(?:\"\$CLAUDE_PROJECT_DIR\"\/)?([^\s"]+)/);
  const currentPath = pathMatch ? pathMatch[1] : command;

  // Check if it's the canonical pf hooks command or the legacy .sh path
  if (command.includes('pf.sh hooks statusline') || command === 'pf hooks statusline' || currentPath.includes('misc/statusline.sh') || command.includes('misc/statusline.sh')) {
    return {
      name: 'settings/statusline-path',
      status: 'pass',
      detail: 'Configured'
    };
  }

  // Check if it's a known legacy path
  const isLegacy = LEGACY_STATUSLINE_PATHS.some(legacyPath =>
    currentPath.includes(legacyPath) || command.includes(legacyPath)
  );

  if (isLegacy) {
    // Check if proper statusline exists before offering fix
    const properStatusline = join(projectRoot, CANONICAL_STATUSLINE_PATH);
    if (pathExists(properStatusline)) {
      return {
        name: 'settings/statusline-path',
        status: 'warn',
        detail: `Legacy path in command`,
        fix: () => {
          const updatedSettings = { ...settings };
          (updatedSettings.statusLine as { type: string; command: string }) = {
            type: 'command',
            command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh hooks statusline'
          };
          writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2));
        }
      };
    }
  }

  // Has statusline configured (custom or valid)
  return {
    name: 'settings/statusline-path',
    status: 'pass',
    detail: 'Configured'
  };
}

/**
 * Check if settings.local.json contains legacy .sh hook commands that should
 * be migrated to `pf hooks` commands. The .sh scripts still work (they're shims)
 * but `pf hooks` is the canonical path — faster, no shell indirection.
 */
export function checkLegacyHookCommands(projectRoot: string): CheckResult {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  if (!pathExists(settingsPath)) {
    return { name: 'legacy/hook-commands', status: 'pass', detail: 'No settings file' };
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    return { name: 'legacy/hook-commands', status: 'warn', detail: 'Cannot parse settings.local.json' };
  }

  if (!settings.hooks) {
    return { name: 'legacy/hook-commands', status: 'pass' };
  }

  // Count how many hook commands still reference .sh scripts
  const hooks = settings.hooks as Record<string, unknown>;
  let legacyCount = 0;

  for (const hookType of ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'Stop']) {
    if (!Array.isArray(hooks[hookType])) continue;
    for (const entry of hooks[hookType] as Array<{ hooks?: Array<{ command?: string }> }>) {
      if (!entry.hooks) continue;
      for (const h of entry.hooks) {
        if (!h.command) continue;
        for (const shName of Object.keys(LEGACY_HOOK_MIGRATIONS)) {
          if (h.command.includes(shName)) {
            legacyCount++;
          }
        }
      }
    }
  }

  // Also check statusLine
  const statusLine = settings.statusLine as { command?: string } | undefined;
  if (statusLine?.command && !statusLine.command.includes('pf.sh hooks statusline') && statusLine.command !== 'pf hooks statusline') {
    for (const shName of Object.keys(LEGACY_HOOK_MIGRATIONS)) {
      if (statusLine.command.includes(shName)) {
        legacyCount++;
      }
    }
  }

  if (legacyCount === 0) {
    return { name: 'legacy/hook-commands', status: 'pass' };
  }

  return {
    name: 'legacy/hook-commands',
    status: 'warn',
    detail: `${legacyCount} hook(s) still use .sh scripts — should use pf hooks commands`,
    fix: () => {
      // Migrate all hook arrays
      for (const hookType of ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'Stop']) {
        if (Array.isArray(hooks[hookType])) {
          migrateHookPaths(hooks[hookType] as unknown[]);
        }
      }

      // Migrate statusLine
      if (statusLine?.command && !statusLine.command.includes('pf.sh hooks statusline') && statusLine.command !== 'pf hooks statusline') {
        for (const [shName, pfCommand] of Object.entries(LEGACY_HOOK_MIGRATIONS)) {
          if (statusLine.command.includes(shName)) {
            statusLine.command = pfCommand;
            break;
          }
        }
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    }
  };
}

/**
 * Check file layout — validate files are at correct .pennyfarthing/ locations.
 * Flags old .claude/ locations with migration instructions.
 * Fix functions migrate files automatically without overwriting existing files.
 *
 * MSSCI-14372
 */
export function checkFileLayout(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Manifest at .pennyfarthing/manifest.json
  const manifestPath = join(projectRoot, '.pennyfarthing/manifest.json');
  results.push({
    name: 'layout/manifest',
    status: existsSync(manifestPath) ? 'pass' : 'fail',
    detail: existsSync(manifestPath) ? undefined : 'Missing .pennyfarthing/manifest.json'
  });

  // 2. Theme config — use getCurrentTheme() which checks both
  // config.local.yaml (priority 1) and persona-config.yaml (priority 2)
  const configPath = join(projectRoot, '.pennyfarthing/config.local.yaml');
  const layoutTheme = getCurrentTheme(projectRoot);
  results.push({
    name: 'layout/config',
    status: layoutTheme ? 'pass' : 'warn',
    detail: layoutTheme ? undefined : 'No theme configured at .pennyfarthing/config.local.yaml'
  });

  // 3. Old config at .claude/persona-config.yaml
  const oldConfigPath = join(projectRoot, '.claude/persona-config.yaml');
  if (existsSync(oldConfigPath)) {
    results.push({
      name: 'layout/config-old-location',
      status: 'warn',
      detail: 'Migrate to .pennyfarthing/config.local.yaml',
      fix: () => {
        if (!existsSync(configPath)) {
          const configDir = dirname(configPath);
          if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true });
          }
          renameSync(oldConfigPath, configPath);
        } else {
          unlinkSync(oldConfigPath);
        }
      }
    });
  }

  // 4. Settings at .claude/settings.local.json
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  results.push({
    name: 'layout/settings',
    status: existsSync(settingsPath) ? 'pass' : 'fail',
    detail: existsSync(settingsPath) ? undefined : 'Missing .claude/settings.local.json — hooks not registered'
  });

  // 5. Sidecars at .pennyfarthing/sidecars/
  const sidecarsPath = join(projectRoot, '.pennyfarthing/sidecars');
  if (existsSync(sidecarsPath) && isDirectory(sidecarsPath)) {
    results.push({
      name: 'layout/sidecars',
      status: 'pass',
      detail: undefined
    });
  }

  // 6. Old sidecars at .claude/project/agents/*-sidecar/
  const oldAgentsDir = join(projectRoot, '.claude/project/agents');
  if (existsSync(oldAgentsDir)) {
    try {
      const entries = readdirSync(oldAgentsDir);
      const sidecarDirs = entries.filter(e =>
        e.endsWith('-sidecar') && isDirectory(join(oldAgentsDir, e))
      );
      if (sidecarDirs.length > 0) {
        results.push({
          name: 'layout/sidecars-old-location',
          status: 'warn',
          detail: `${sidecarDirs.length} legacy sidecar dir(s) — migrate to .pennyfarthing/sidecars/`,
          fix: () => {
            for (const dir of sidecarDirs) {
              const agentName = dir.replace(/-sidecar$/, '');
              const srcDir = join(oldAgentsDir, dir);
              const destDir = join(projectRoot, `.pennyfarthing/sidecars/${agentName}`);
              if (!existsSync(destDir)) {
                ensureDirSync(destDir);
                const files = readdirSync(srcDir);
                for (const file of files) {
                  renameSync(join(srcDir, file), join(destDir, file));
                }
              }
              removeSync(srcDir);
            }
          }
        });
      }
    } catch {
      // Ignore read errors
    }
  }

  // 7. Project hooks at .pennyfarthing/project/hooks/
  const projectHooksPath = join(projectRoot, '.pennyfarthing/project/hooks');
  if (existsSync(projectHooksPath) && isDirectory(projectHooksPath)) {
    results.push({
      name: 'layout/project-hooks',
      status: 'pass',
      detail: undefined
    });

    // Check execute permission on each shell script in project hooks
    try {
      const hookFiles = readdirSync(projectHooksPath).filter(f => f.endsWith('.sh'));
      for (const file of hookFiles) {
        const hookPath = join(projectHooksPath, file);
        const stats = statSync(hookPath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        results.push({
          name: `layout/project-hooks/${file}`,
          status: isExecutable ? 'pass' : 'warn',
          detail: isExecutable ? undefined : 'Not executable — will cause Permission denied on session start',
          fix: isExecutable ? undefined : () => {
            chmodSync(hookPath, 0o755);
          }
        });
      }
    } catch {
      // Ignore read errors
    }
  }

  // 8. Old project hooks at .claude/project/hooks/
  const oldProjectHooksPath = join(projectRoot, '.claude/project/hooks');
  if (existsSync(oldProjectHooksPath) && isDirectory(oldProjectHooksPath)) {
    results.push({
      name: 'layout/project-hooks-old-location',
      status: 'warn',
      detail: 'Migrate to .pennyfarthing/project/hooks/',
      fix: () => {
        if (!existsSync(projectHooksPath)) {
          ensureDirSync(dirname(projectHooksPath));
          renameSync(oldProjectHooksPath, projectHooksPath);
        } else {
          // Copy individual files that don't exist at destination
          try {
            const files = readdirSync(oldProjectHooksPath);
            for (const file of files) {
              const dest = join(projectHooksPath, file);
              if (!existsSync(dest)) {
                renameSync(join(oldProjectHooksPath, file), dest);
              }
            }
          } catch {
            // Ignore
          }
          removeSync(oldProjectHooksPath);
        }
        // Ensure migrated shell scripts are executable
        try {
          for (const file of readdirSync(projectHooksPath)) {
            if (file.endsWith('.sh')) {
              chmodSync(join(projectHooksPath, file), 0o755);
            }
          }
        } catch {
          // Ignore
        }
      }
    });
  }

  return results;
}
