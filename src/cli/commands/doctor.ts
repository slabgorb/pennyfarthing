import { existsSync, readFileSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { removeSync } = fsExtra;
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
import { getPackageVersion } from '../utils/version.js';
import { hasSubmodule } from './migrate.js';

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

  logger.info(`Version: ${installedVersion} (installed) / ${packageVersion} (package)`);
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
    { name: 'Installation', filter: (r: CheckResult) => r.name.startsWith('manifest') || r.name.startsWith('submodule') },
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

  // Check for old submodule
  const hasSub = hasSubmodule(projectRoot);
  results.push({
    name: 'submodule/removed',
    status: hasSub ? 'warn' : 'pass',
    detail: hasSub ? 'Old submodule still present' : undefined,
    fix: hasSub ? () => {
      // Just warn, don't auto-remove submodule for safety
      logger.warning('Please manually remove: rm -rf .claude/pennyfarthing && git rm .claude/pennyfarthing');
    } : undefined
  });

  return results;
}

function checkCoreFiles(projectRoot: string, manifest: ReturnType<typeof readManifest>): CheckResult[] {
  const results: CheckResult[] = [];

  const coreDirs = [
    { path: '.claude/core/agents', name: 'core/agents' },
    { path: '.claude/core/subagents', name: 'core/subagents' },
    { path: '.claude/core/commands', name: 'core/commands' },
    { path: '.claude/core/guides', name: 'core/guides' },
    { path: '.claude/skills', name: 'core/skills' },
    { path: '.claude/personas', name: 'core/personas' }
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

  // Check file integrity if manifest exists
  if (manifest?.fileHashes) {
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

  return results;
}

function checkUserFiles(projectRoot: string): CheckResult[] {
  const results: CheckResult[] = [];

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
    const agents = ['dev', 'tea', 'sm', 'reviewer', 'architect', 'pm', 'devops', 'orchestrator', 'tech-writer', 'ux-designer'];
    const existingSidecars = agents.filter(a => pathExists(join(sidecarsDir, `${a}-sidecar`)));

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

  // Check settings.local.json
  const settingsLocal = join(projectRoot, '.claude/settings.local.json');
  results.push({
    name: 'settings.local.json',
    status: pathExists(settingsLocal) ? 'pass' : 'warn',
    detail: pathExists(settingsLocal) ? undefined : 'No local settings'
  });

  return results;
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

  const hooks = [
    { path: 'scripts/hooks/session-start.sh', name: 'hook/session-start' },
    { path: 'scripts/hooks/pre-edit-check.sh', name: 'hook/pre-edit-check' }
  ];

  for (const { path, name } of hooks) {
    const fullPath = join(projectRoot, path);
    const exists = pathExists(fullPath);

    if (!exists) {
      results.push({
        name,
        status: 'warn',
        detail: 'Hook script missing'
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
