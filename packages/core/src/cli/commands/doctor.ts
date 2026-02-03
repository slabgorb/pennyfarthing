import { existsSync, readFileSync, writeFileSync, chmodSync, statSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import { join, relative, dirname } from 'path';
import { spawnSync } from 'child_process';
import fsExtra from 'fs-extra';

const { removeSync, ensureDirSync } = fsExtra;
import { logger } from '../utils/logger.js';
import {
  readManifest
} from '../utils/manifest.js';
import {
  pathExists,
  isDirectory,
  isSymlink,
  fileMatchesHash
} from '../utils/files.js';
import { getPackageVersion } from '../utils/version.js';
import { findNodeModulesPath } from '../utils/node-modules.js';
import { ALL_SYMLINKS, CORE_AGENTS } from '../utils/constants.js';

interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
  quiet?: boolean;
  dogfood?: boolean;
}

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
  fix?: () => void;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Handle dogfooding mode - run the dogfood script instead
  if (options.dogfood) {
    const dogfoodScript = join(projectRoot, 'pennyfarthing-dist/scripts/misc/doctor-dogfood.sh');

    if (!existsSync(dogfoodScript)) {
      logger.error('Dogfood mode requires the pennyfarthing repo (pennyfarthing-dist/ not found)');
      logger.info('This flag is for developers working on pennyfarthing itself.');
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

  // Run checks
  results.push(...checkInstallation(projectRoot, manifest));
  results.push(...checkCoreFiles(projectRoot, manifest));
  results.push(...checkUserFiles(projectRoot));
  results.push(...checkDirectories(projectRoot));
  results.push(...checkHooks(projectRoot));
  results.push(...checkLegacyFiles(projectRoot));
  results.push(checkLegacyStatuslinePath(projectRoot));

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
    { name: 'Hooks', filter: (r: CheckResult) => r.name.startsWith('hook/') },
    { name: 'Legacy Files', filter: (r: CheckResult) => r.name.startsWith('legacy/') }
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
  } catch {
    return {
      name: 'settings/session-start-hook',
      status: 'warn',
      detail: 'Could not parse settings.local.json'
    };
  }
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

    // Check if question-reflector-check is configured
    const hasReflectorHook = settings.hooks.Stop.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('question-reflector-check')
        );
      }
      return false;
    });

    if (!hasReflectorHook) {
      return {
        name: 'settings/stop-hook',
        status: 'warn',
        detail: 'question-reflector-check not configured',
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

    // Check if context-circuit-breaker is configured
    const hasCircuitBreaker = settings.hooks.PreToolUse.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('context-circuit-breaker')
        );
      }
      return false;
    });

    if (!hasCircuitBreaker) {
      return {
        name: 'settings/context-circuit-breaker',
        status: 'warn',
        detail: 'context-circuit-breaker not configured - context exhaustion protection disabled',
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
function addContextCircuitBreaker(projectRoot: string, installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  const scriptBase = getScriptBasePath(installationType);

  const requiredHook = {
    matcher: 'Edit|Write|Bash|Task',
    hooks: [
      {
        type: 'command',
        command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/context-circuit-breaker.sh`
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

  if (!hooks.PreToolUse) {
    hooks.PreToolUse = [requiredHook];
  } else if (Array.isArray(hooks.PreToolUse)) {
    // Append the required hook (circuit breaker should run last)
    hooks.PreToolUse = [...hooks.PreToolUse, requiredHook];
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

    // Check if bell-mode-hook is configured
    const hasBellModeHook = settings.hooks.PostToolUse.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('bell-mode-hook')
        );
      }
      return false;
    });

    if (!hasBellModeHook) {
      return {
        name: 'settings/post-tool-use-hook',
        status: 'warn',
        detail: 'bell-mode-hook not configured - bell mode will not work',
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
function addPostToolUseHook(projectRoot: string, installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  const scriptBase = getScriptBasePath(installationType);

  const requiredHook = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/bell-mode-hook.sh`
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

  if (!hooks.PostToolUse) {
    hooks.PostToolUse = [requiredHook];
  } else if (Array.isArray(hooks.PostToolUse)) {
    // Prepend the required hook
    hooks.PostToolUse = [requiredHook, ...hooks.PostToolUse];
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Fix function: Add Stop hook to settings.local.json
 */
function addStopHook(projectRoot: string, installationType: string): void {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  const scriptBase = getScriptBasePath(installationType);

  const requiredHook = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/question-reflector-check.sh`
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

  if (!hooks.Stop) {
    hooks.Stop = [requiredHook];
  } else if (Array.isArray(hooks.Stop)) {
    // Prepend the required hook
    hooks.Stop = [requiredHook, ...hooks.Stop];
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
      PostToolUse: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/bell-mode-hook.sh`
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
              command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/question-reflector-check.sh`
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
        },
        {
          matcher: 'Edit|Write|Bash|Task',
          hooks: [
            {
              type: 'command',
              command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/hooks/context-circuit-breaker.sh`
            }
          ]
        }
      ]
    },
    statusLine: {
      type: 'command',
      command: `"$CLAUDE_PROJECT_DIR"/${scriptBase}/misc/statusline.sh`
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
    { path: `${scriptBase}/hooks/context-warning.sh`, name: 'hook/context-warning' },
    { path: `${scriptBase}/hooks/context-circuit-breaker.sh`, name: 'hook/context-circuit-breaker' },
    { path: `${scriptBase}/hooks/bell-mode-hook.sh`, name: 'hook/bell-mode' },
    { path: `${scriptBase}/hooks/question-reflector-check.sh`, name: 'hook/question-reflector' }
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
    if (pathExists(properThemeConfig)) {
      // Both exist - legacy may conflict
      results.push({
        name: 'legacy/.claude/persona-config.yaml',
        status: 'warn',
        detail: 'May conflict with .pennyfarthing/config.local.yaml',
        fix: () => {
          unlinkSync(legacyPersonaConfig);
        }
      });
    }
    // If only legacy exists, don't warn - it's the active config
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

  // Check if it contains the canonical path
  if (currentPath.includes('misc/statusline.sh') || command.includes('misc/statusline.sh')) {
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
            command: `"$CLAUDE_PROJECT_DIR"/${CANONICAL_STATUSLINE_PATH}`
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
