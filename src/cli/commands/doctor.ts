import { existsSync, readFileSync, writeFileSync, chmodSync, statSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import { join, relative, dirname } from 'path';
import fsExtra from 'fs-extra';

const { removeSync, ensureDirSync } = fsExtra;
import { logger } from '../utils/logger.js';
import {
  manifestExists,
  readManifest
} from '../utils/manifest.js';
import {
  pathExists,
  isDirectory,
  isSymlink,
  hashFile,
  fileMatchesHash
} from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';
import { findNodeModulesPath } from '../utils/node-modules.js';
import { ALL_SYMLINKS, CORE_AGENTS } from '../utils/constants.js';

interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
  quiet?: boolean;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
  fix?: () => void;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const projectRoot = process.cwd();
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

  // Run checks
  results.push(...checkInstallation(projectRoot, manifest));
  results.push(...checkCoreFiles(projectRoot, manifest));
  results.push(...checkUserFiles(projectRoot));
  results.push(...checkDirectories(projectRoot));
  results.push(...checkHooks(projectRoot));

  // Output results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Display results by category
  const categories = [
    { name: 'Installation', filter: (r: CheckResult) => r.name.startsWith('manifest') },
    { name: 'Core Files', filter: (r: CheckResult) => r.name.startsWith('core/') },
    { name: 'User Files', filter: (r: CheckResult) => r.name.startsWith('project/') || r.name.startsWith('persona') || r.name.startsWith('settings') },
    { name: 'Directories', filter: (r: CheckResult) => r.name.startsWith('dir/') },
    { name: 'Hooks', filter: (r: CheckResult) => r.name.startsWith('hook/') }
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

function checkInstallation(projectRoot: string, manifest: ReturnType<typeof readManifest>): CheckResult[] {
  const results: CheckResult[] = [];

  // Check manifest exists
  results.push({
    name: 'manifest/exists',
    status: manifest ? 'pass' : 'fail',
    detail: manifest ? `v${manifest.version}` : 'Run `pennyfarthing init`'
  });

  return results;
}

function checkCoreFiles(projectRoot: string, manifest: ReturnType<typeof readManifest>): CheckResult[] {
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
 * Check symlinks for symlink installation mode
 */
function checkSymlinks(projectRoot: string, nodeModulesPath: string | null): CheckResult[] {
  const results: CheckResult[] = [];

  // Check if node_modules is available
  if (!nodeModulesPath) {
    results.push({
      name: 'core/node_modules',
      status: 'fail',
      detail: 'pennyfarthing not found in node_modules - run npm install'
    });
    return results;
  }

  results.push({
    name: 'core/node_modules',
    status: 'pass',
    detail: relative(projectRoot, nodeModulesPath)
  });

  for (const { name, link } of ALL_SYMLINKS) {
    const linkPath = join(projectRoot, link);
    const targetPath = join(nodeModulesPath, name);
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
          detail: 'Broken symlink - run npm install',
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

  // Check agent sidecars
  const sidecarsDir = join(projectRoot, '.claude/project/agents');
  if (pathExists(sidecarsDir)) {
    const existingSidecars = CORE_AGENTS.filter(a => pathExists(join(sidecarsDir, `${a}-sidecar`)));

    results.push({
      name: 'project/sidecars',
      status: existingSidecars.length > 0 ? 'pass' : 'warn',
      detail: `${existingSidecars.length} agent sidecars configured`
    });
  }

  // Check persona config
  const personaConfig = join(projectRoot, '.claude/persona-config.yaml');
  results.push({
    name: 'persona-config',
    status: pathExists(personaConfig) ? 'pass' : 'warn',
    detail: pathExists(personaConfig) ? undefined : 'No theme configured'
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

    // Check benchmark permissions (needed for /benchmark, /solo subagents)
    const benchmarkCheck = checkBenchmarkPermissions(projectRoot);
    results.push(benchmarkCheck);
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

    // Check for required benchmark permissions
    const hasClaudeBash = permissions.some((p: string) =>
      p === 'Bash(claude:*)' || p === 'Bash' && permissions.includes('Bash(claude:*)')
    );

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
      // Start fresh if parse fails
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

    // Check if session-start.sh is configured
    const hasSessionStartHook = settings.hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('session-start.sh')
        );
      }
      return false;
    });

    if (!hasSessionStartHook) {
      return {
        name: 'settings/session-start-hook',
        status: 'fail',
        detail: 'session-start.sh not configured - PROJECT_ROOT will be undefined',
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
  } catch (error) {
    return {
      name: 'settings/session-start-hook',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
}

/**
 * Get the script base path based on installation type
 * - symlink mode: .claude/scripts/
 * - copy mode: .claude/pennyfarthing/scripts/
 */
function getScriptBasePath(installationType: string): string {
  return installationType === 'symlink'
    ? '.claude/scripts'
    : '.claude/pennyfarthing/scripts';
}

/**
 * Fix function: Add SessionStart hooks to settings.local.json
 */
function addSessionStartHooks(projectRoot: string, installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  const scriptBase = getScriptBasePath(installationType);

  const requiredHooks = [
    {
      hooks: [
        {
          type: 'command',
          command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/session-start.sh`
        }
      ]
    },
    {
      hooks: [
        {
          type: 'command',
          command: '"$CLAUDE_PROJECT_DIR"/.claude/project/hooks/setup-env.sh'
        }
      ]
    }
  ];

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
function createSettingsLocalJson(projectRoot: string, installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  const scriptBase = getScriptBasePath(installationType);

  // Create full settings structure matching the template
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
        'Edit(sprint/**)',
        'Edit(.session/**)',
        'Edit(results/**)',
        'Write(.claude/**)',
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
              command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/session-start.sh`
            }
          ]
        },
        {
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.claude/project/hooks/setup-env.sh'
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
              command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/pre-edit-check.sh`
            }
          ]
        },
        {
          matcher: 'Edit|Write|Bash|Task',
          hooks: [
            {
              type: 'command',
              command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/context-warning.sh`
            }
          ]
        }
      ]
    },
    statusLine: {
      type: 'command',
      command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/statusline.sh`
    }
  };

  ensureDirSync(join(projectRoot, '.claude'));
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function checkDirectories(projectRoot: string): CheckResult[] {
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

function checkHooks(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Detect installation type from manifest
  const manifest = readManifest(projectRoot);
  const installationType = manifest?.installationType || 'copy';
  const scriptBase = getScriptBasePath(installationType);

  // Check hook scripts exist based on installation type
  const hooks = [
    { path: `${scriptBase}/hooks/session-start.sh`, name: 'hook/session-start' },
    { path: `${scriptBase}/hooks/pre-edit-check.sh`, name: 'hook/pre-edit-check' },
    { path: `${scriptBase}/hooks/context-warning.sh`, name: 'hook/context-warning' }
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
