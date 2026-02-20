/**
 * Shared settings.local.json utilities for init, update, and doctor commands
 * Handles merging required hooks into existing settings
 */

import { readFileSync, writeFileSync, readdirSync, statSync, lstatSync, unlinkSync, symlinkSync, renameSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync } = fsExtra;
import { logger } from './logger.js';
import { pathExists } from './files.js';

type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
};

/**
 * Get list of installed skill names from the skills directory
 */
export function getInstalledSkillNames(projectRoot: string): string[] {
  const skillsDir = join(projectRoot, '.claude/skills');
  if (!pathExists(skillsDir)) {
    return [];
  }

  try {
    const entries = readdirSync(skillsDir);
    return entries.filter((entry: string) => {
      if (entry.startsWith('.')) return false;
      const entryPath = join(skillsDir, entry);
      try {
        const stats = statSync(entryPath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Legacy statusline paths that should be migrated to `pf hooks statusline`
 */
const LEGACY_STATUSLINE_PATHS = [
  '.claude/core/statusline.sh',
  '.claude/statusline.sh',
  '.claude/pennyfarthing/statusline.sh',
  '.claude/pennyfarthing/scripts/statusline.sh',
  '.claude/scripts/statusline.sh',
  '.pennyfarthing/scripts/statusline.sh',
  '.pennyfarthing/scripts/misc/statusline.sh',
  'scripts/misc/statusline.sh'
];

/**
 * Legacy script paths that should be migrated to .pennyfarthing/scripts/
 */
const LEGACY_SCRIPT_PATHS = [
  '.claude/pennyfarthing/scripts/',
  '.claude/scripts/'
];

/**
 * Legacy project hook paths that should be migrated to .pennyfarthing/project/hooks/
 */
const LEGACY_PROJECT_HOOK_PATHS = [
  '.claude/project/hooks/'
];

/**
 * Map of legacy .sh hook commands to their `pf hooks` replacements.
 * Used during init/update/doctor to migrate existing settings.
 */
/**
 * Canonical hook command prefix — uses pf.sh wrapper (no global pf install needed).
 * $CLAUDE_PROJECT_DIR is set by Claude Code for hook execution contexts.
 */
const PF_SH = '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh';

export const LEGACY_HOOK_MIGRATIONS: Record<string, string> = {
  'session-start.sh': `${PF_SH} hooks session-start`,
  'welcome-hook.sh': `${PF_SH} hooks session-start`,
  'question-reflector-check.sh': `${PF_SH} hooks reflector-check`,
  'session-stop.sh': `${PF_SH} hooks session-stop`,
  'pre-edit-check.sh': `${PF_SH} hooks pre-edit-check`,
  'context-warning.sh': `${PF_SH} hooks context-warning`,
  'context-circuit-breaker.sh': `${PF_SH} hooks context-breaker`,
  'cyclist-pretooluse-hook.sh': `${PF_SH} hooks cyclist-pretooluse`,
  'schema-validation.sh': `${PF_SH} hooks schema-validation`,
  'bell-mode-hook.sh': `${PF_SH} hooks bell-mode`,
  'sprint-yaml-validation.sh': `${PF_SH} hooks sprint-yaml`,
  'statusline.sh': `${PF_SH} hooks statusline`,
};

/**
 * Check if a hook entry contains a specific hook by command substring
 */
function hookEntryContains(entry: unknown, substring: string): boolean {
  if (typeof entry === 'object' && entry !== null) {
    const hookEntry = entry as HookEntry;
    return hookEntry.hooks?.some(h => h.command?.includes(substring)) ?? false;
  }
  return false;
}

/**
 * Find a hook entry by command substring
 */
function findHookEntry(hookArray: unknown[], substring: string): unknown | undefined {
  return hookArray.find((entry: unknown) => hookEntryContains(entry, substring));
}

/**
 * Migrate hook paths from legacy locations to .pennyfarthing/scripts/
 * and .claude/project/hooks/ to .pennyfarthing/project/hooks/
 * Also migrates .sh hook scripts and bare `pf hooks` commands to pf.sh wrapper.
 */
export function migrateHookPaths(hookArray: unknown[]): boolean {
  let migrated = false;
  for (const entry of hookArray) {
    if (typeof entry === 'object' && entry !== null) {
      const hookEntry = entry as HookEntry;
      if (hookEntry.hooks) {
        for (const h of hookEntry.hooks) {
          if (h.command) {
            // Migrate .sh hooks to pf.sh wrapper commands
            let shMigrated = false;
            for (const [shName, pfCommand] of Object.entries(LEGACY_HOOK_MIGRATIONS)) {
              if (h.command.includes(shName)) {
                h.command = pfCommand;
                migrated = true;
                shMigrated = true;
                break;
              }
            }
            if (shMigrated) continue;

            // Migrate bare `pf hooks X` to pf.sh wrapper path
            // Bare `pf` is not in PATH for consumer installs
            const barePfMatch = h.command.match(/^pf\s+hooks\s+(.+)$/);
            if (barePfMatch) {
              h.command = `${PF_SH} hooks ${barePfMatch[1]}`;
              migrated = true;
              continue;
            }

            // Legacy directory path migrations (for non-hook scripts)
            for (const legacyPath of LEGACY_SCRIPT_PATHS) {
              if (h.command.includes(legacyPath)) {
                h.command = h.command.replace(legacyPath, '.pennyfarthing/scripts/');
                migrated = true;
                break;
              }
            }
            for (const legacyPath of LEGACY_PROJECT_HOOK_PATHS) {
              if (h.command.includes(legacyPath)) {
                h.command = h.command.replace(legacyPath, '.pennyfarthing/project/hooks/');
                migrated = true;
                break;
              }
            }
          }
        }
      }
    }
  }
  return migrated;
}

/**
 * Merge required hooks into existing settings.local.json
 * This ensures critical hooks are always configured
 *
 * @param projectRoot - Project root directory
 * @param assetsPath - Path to pennyfarthing-dist assets
 * @param options - Options including dryRun and registerSkills
 * @returns true if any changes were made
 */
export async function mergeSettingsLocalJson(
  projectRoot: string,
  assetsPath: string,
  options: { dryRun?: boolean; registerSkills?: boolean }
): Promise<boolean> {
  const settingsPath = join(projectRoot, '.pennyfarthing/settings.local.json');
  const templatePath = join(assetsPath, 'templates/settings.local.json.template');

  if (!pathExists(templatePath)) {
    logger.warning('settings.local.json template not found');
    return false;
  }

  const templateContent = JSON.parse(readFileSync(templatePath, 'utf8'));

  // Get installed skills to register in permissions
  const installedSkills = options.registerSkills ? getInstalledSkillNames(projectRoot) : [];

  // If no existing settings, create from template with all installed skills
  if (!pathExists(settingsPath)) {
    if (installedSkills.length > 0) {
      const permissions = templateContent.permissions?.allow || [];
      for (const skill of installedSkills) {
        const skillPermission = `Skill(${skill})`;
        if (!permissions.includes(skillPermission)) {
          permissions.push(skillPermission);
        }
      }
      templateContent.permissions = { ...templateContent.permissions, allow: permissions };
    }

    if (!options.dryRun) {
      ensureDirSync(join(projectRoot, '.pennyfarthing'));
      writeFileSync(settingsPath, JSON.stringify(templateContent, null, 2), 'utf8');
    }
    logger.created('.pennyfarthing/settings.local.json');
    if (installedSkills.length > 0) {
      logger.info(`  Registered ${installedSkills.length} skills in permissions`);
    }
    return true;
  }

  // Read existing settings
  let existingSettings: Record<string, unknown>;
  try {
    existingSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    logger.warning('Could not parse existing settings.local.json, skipping merge');
    return false;
  }

  let modified = false;

  // Ensure hooks object exists
  if (!existingSettings.hooks) {
    existingSettings.hooks = {};
    modified = true;
  }

  const hooks = existingSettings.hooks as Record<string, unknown>;

  // Merge SessionStart hooks - critical for PROJECT_ROOT
  if (!hooks.SessionStart) {
    hooks.SessionStart = templateContent.hooks?.SessionStart || [];
    modified = true;
    logger.info('Added missing SessionStart hooks');
  } else if (Array.isArray(hooks.SessionStart)) {
    const hasSessionStartHook = hooks.SessionStart.some((entry: unknown) =>
      hookEntryContains(entry, 'session-start.sh') || hookEntryContains(entry, 'pf.sh hooks session-start') || hookEntryContains(entry, 'pf hooks session-start')
    );

    if (!hasSessionStartHook && templateContent.hooks?.SessionStart) {
      const sessionStartEntry = findHookEntry(templateContent.hooks.SessionStart, 'pf.sh hooks session-start');
      if (sessionStartEntry) {
        hooks.SessionStart = [sessionStartEntry, ...hooks.SessionStart];
        modified = true;
        logger.info('Added missing session-start hook');
      }
    }

    // Check for auto-load-sm hook (auto-invokes /sm on new sessions)
    const hasAutoLoadSm = (hooks.SessionStart as unknown[]).some((entry: unknown) =>
      hookEntryContains(entry, 'auto-load-sm')
    );

    if (!hasAutoLoadSm && templateContent.hooks?.SessionStart) {
      const autoLoadSmEntry = findHookEntry(templateContent.hooks.SessionStart, 'auto-load-sm');
      if (autoLoadSmEntry) {
        hooks.SessionStart = [...(hooks.SessionStart as unknown[]), autoLoadSmEntry];
        modified = true;
        logger.info('Added missing auto-load-sm hook');
      }
    }
  }

  // Merge SessionEnd hooks if missing
  if (!hooks.SessionEnd && templateContent.hooks?.SessionEnd) {
    hooks.SessionEnd = templateContent.hooks.SessionEnd;
    modified = true;
    logger.info('Added missing SessionEnd hooks');
  }

  // Merge Stop hooks if missing (question reflector enforcement)
  if (!hooks.Stop && templateContent.hooks?.Stop) {
    hooks.Stop = templateContent.hooks.Stop;
    modified = true;
    logger.info('Added missing Stop hooks');
  } else if (Array.isArray(hooks.Stop)) {
    const hasReflectorHook = hooks.Stop.some((entry: unknown) =>
      hookEntryContains(entry, 'question-reflector-check') || hookEntryContains(entry, 'pf.sh hooks reflector-check') || hookEntryContains(entry, 'pf hooks reflector-check')
    );

    if (!hasReflectorHook && templateContent.hooks?.Stop) {
      const reflectorEntry = findHookEntry(templateContent.hooks.Stop, 'pf.sh hooks reflector-check');
      if (reflectorEntry) {
        hooks.Stop = [reflectorEntry, ...hooks.Stop];
        modified = true;
        logger.info('Added missing reflector-check hook');
      }
    }
  }

  // Merge PostToolUse hooks if missing (bell mode)
  if (!hooks.PostToolUse && templateContent.hooks?.PostToolUse) {
    hooks.PostToolUse = templateContent.hooks.PostToolUse;
    modified = true;
    logger.info('Added missing PostToolUse hooks');
  } else if (Array.isArray(hooks.PostToolUse)) {
    const hasBellModeHook = hooks.PostToolUse.some((entry: unknown) =>
      hookEntryContains(entry, 'bell-mode-hook') || hookEntryContains(entry, 'pf.sh hooks bell-mode') || hookEntryContains(entry, 'pf hooks bell-mode')
    );

    if (!hasBellModeHook && templateContent.hooks?.PostToolUse) {
      const bellModeEntry = findHookEntry(templateContent.hooks.PostToolUse, 'pf.sh hooks bell-mode');
      if (bellModeEntry) {
        hooks.PostToolUse = [bellModeEntry, ...hooks.PostToolUse];
        modified = true;
        logger.info('Added missing bell-mode hook');
      }
    }
  }

  // Merge PreToolUse hooks - ensure all required hooks are configured
  if (!hooks.PreToolUse && templateContent.hooks?.PreToolUse) {
    hooks.PreToolUse = templateContent.hooks.PreToolUse;
    modified = true;
    logger.info('Added missing PreToolUse hooks');
  } else if (Array.isArray(hooks.PreToolUse)) {
    // Check for context-circuit-breaker / context-breaker
    const hasCircuitBreaker = hooks.PreToolUse.some((entry: unknown) =>
      hookEntryContains(entry, 'context-circuit-breaker') || hookEntryContains(entry, 'pf.sh hooks context-breaker') || hookEntryContains(entry, 'pf hooks context-breaker')
    );

    if (!hasCircuitBreaker && templateContent.hooks?.PreToolUse) {
      const circuitBreakerEntry = findHookEntry(templateContent.hooks.PreToolUse, 'pf.sh hooks context-breaker');
      if (circuitBreakerEntry) {
        hooks.PreToolUse = [...hooks.PreToolUse, circuitBreakerEntry];
        modified = true;
        logger.info('Added missing context-breaker hook');
      }
    }

    // Check for schema-validation hook
    const hasSchemaValidation = (hooks.PreToolUse as unknown[]).some((entry: unknown) =>
      hookEntryContains(entry, 'schema-validation')
    );

    if (!hasSchemaValidation && templateContent.hooks?.PreToolUse) {
      const schemaValidationEntry = findHookEntry(templateContent.hooks.PreToolUse, 'pf.sh hooks schema-validation');
      if (schemaValidationEntry) {
        hooks.PreToolUse = [...(hooks.PreToolUse as unknown[]), schemaValidationEntry];
        modified = true;
        logger.info('Added missing schema-validation hook');
      }
    }

    // Check for cyclist-pretooluse hook (Cyclist permissions integration)
    const hasCyclistPreToolUse = (hooks.PreToolUse as unknown[]).some((entry: unknown) =>
      hookEntryContains(entry, 'cyclist-pretooluse') || hookEntryContains(entry, 'pf.sh hooks cyclist-pretooluse') || hookEntryContains(entry, 'pf hooks cyclist-pretooluse')
    );

    if (!hasCyclistPreToolUse && templateContent.hooks?.PreToolUse) {
      const cyclistEntry = findHookEntry(templateContent.hooks.PreToolUse, 'pf.sh hooks cyclist-pretooluse');
      if (cyclistEntry) {
        hooks.PreToolUse = [...(hooks.PreToolUse as unknown[]), cyclistEntry];
        modified = true;
        logger.info('Added missing cyclist-pretooluse hook');
      }
    }
  }

  // Ensure statusLine is configured and points to pf.sh wrapper
  const statusLine = existingSettings.statusLine as Record<string, unknown> | undefined;
  if (!statusLine) {
    existingSettings.statusLine = templateContent.statusLine;
    modified = true;
    logger.info('Added missing statusLine configuration');
  } else if (statusLine.command && typeof statusLine.command === 'string') {
    if (!statusLine.command.includes('pf.sh hooks statusline')) {
      // Migrate bare `pf hooks statusline` to wrapper path
      if (statusLine.command === 'pf hooks statusline' || statusLine.command.match(/^pf\s+hooks\s+statusline$/)) {
        statusLine.command = `${PF_SH} hooks statusline`;
        modified = true;
        logger.info('Migrated bare pf statusLine to pf.sh wrapper');
      } else {
        // Migrate legacy .sh paths
        for (const legacyPath of LEGACY_STATUSLINE_PATHS) {
          if (statusLine.command.includes(legacyPath)) {
            statusLine.command = `${PF_SH} hooks statusline`;
            modified = true;
            logger.info('Migrated statusLine to pf.sh hooks statusline');
            break;
          }
        }
      }
    }
  }

  // Migrate hook paths from legacy locations to .pennyfarthing/scripts/
  for (const hookType of ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'Stop']) {
    if (Array.isArray(hooks[hookType])) {
      if (migrateHookPaths(hooks[hookType] as unknown[])) {
        modified = true;
        logger.info(`Migrated ${hookType} hook paths to new location`);
      }
    }
  }

  // Merge skill permissions - ensure all installed skills are registered
  if (installedSkills.length > 0) {
    if (!existingSettings.permissions) {
      existingSettings.permissions = { allow: [] };
      modified = true;
    }
    const permissions = existingSettings.permissions as Record<string, unknown>;
    if (!permissions.allow) {
      permissions.allow = [];
      modified = true;
    }
    const allowList = permissions.allow as string[];

    let skillsAdded = 0;
    for (const skill of installedSkills) {
      const skillPermission = `Skill(${skill})`;
      if (!allowList.includes(skillPermission)) {
        allowList.push(skillPermission);
        skillsAdded++;
        modified = true;
      }
    }
    if (skillsAdded > 0) {
      logger.info(`Registered ${skillsAdded} missing skills in permissions`);
    }
  }

  if (modified && !options.dryRun) {
    writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');
    logger.updated('.pennyfarthing/settings.local.json');
  } else if (!modified) {
    logger.skipped('.pennyfarthing/settings.local.json', 'already configured');
  }

  return modified;
}

/**
 * Create a symlink at .claude/settings.local.json pointing to .pennyfarthing/settings.local.json
 * Idempotent — no-op if correct symlink already exists.
 */
export function ensureSettingsSymlink(projectRoot: string): void {
  const symlinkPath = join(projectRoot, '.claude/settings.local.json');
  const relativeTarget = '../.pennyfarthing/settings.local.json';

  // Already a symlink — nothing to do
  try {
    if (lstatSync(symlinkPath).isSymbolicLink()) {
      return;
    }
    // Exists but is a real file — migrate it first (creates symlink as side effect)
    migrateSettingsFile(projectRoot);
    return;
  } catch {
    // Doesn't exist yet — continue to create
  }

  ensureDirSync(join(projectRoot, '.claude'));
  symlinkSync(relativeTarget, symlinkPath);
}

/**
 * Migrate settings.local.json from .claude/ (old) to .pennyfarthing/ (new).
 * If .claude/settings.local.json is a regular file, move it to .pennyfarthing/
 * and replace with a symlink. Idempotent — no-op if already migrated or nothing exists.
 */
export function migrateSettingsFile(projectRoot: string): void {
  const oldPath = join(projectRoot, '.claude/settings.local.json');
  const newPath = join(projectRoot, '.pennyfarthing/settings.local.json');

  // Check if old path exists at all
  let oldStats;
  try {
    oldStats = lstatSync(oldPath);
  } catch {
    // Old path doesn't exist — nothing to migrate
    return;
  }

  // Already a symlink — already migrated
  if (oldStats.isSymbolicLink()) {
    return;
  }

  // Old path is a real file — migrate it
  if (!pathExists(newPath)) {
    // No file at new location — move the old one there
    ensureDirSync(join(projectRoot, '.pennyfarthing'));
    renameSync(oldPath, newPath);
  } else {
    // New location already has a file — just remove the old one
    unlinkSync(oldPath);
  }

  // Create symlink at old location pointing to new
  symlinkSync('../.pennyfarthing/settings.local.json', oldPath);
}
