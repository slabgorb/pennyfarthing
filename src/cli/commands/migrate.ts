import { existsSync, readFileSync, unlinkSync, lstatSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { copySync, ensureDirSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { pathExists, isSymlink, isDirectory } from '../utils/files.js';

interface MigrateOptions {
  dryRun?: boolean;
}

const SYMLINKS_TO_REMOVE = [
  'agents',
  'subagents',
  'commands',
  'guides',
  'personas',
  'core-skills',
  'hooks'
];

/**
 * Check if a project has a git submodule installation
 */
export function hasSubmodule(projectRoot: string): boolean {
  const submodulePath = join(projectRoot, '.claude/pennyfarthing');
  return pathExists(submodulePath) && isDirectory(submodulePath);
}

/**
 * Get the version of the installed submodule
 */
export function getSubmoduleVersion(projectRoot: string): string | null {
  const versionPath = join(projectRoot, '.claude/pennyfarthing/VERSION');
  if (pathExists(versionPath)) {
    try {
      return readFileSync(versionPath, 'utf8').trim();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Migrate from git submodule installation to npm installation
 */
export async function migrateFromSubmodule(
  projectRoot: string,
  options: MigrateOptions = {}
): Promise<void> {
  const submodulePath = join(projectRoot, '.claude/pennyfarthing');
  const claudeDir = join(projectRoot, '.claude');
  const dryRun = options.dryRun;

  logger.header('Migrating from git submodule...');

  // 1. Read current version
  const oldVersion = getSubmoduleVersion(projectRoot);
  if (oldVersion) {
    logger.info(`Current submodule version: ${oldVersion}`);
  }

  // 2. Remove old symlinks
  logger.info('Removing old symlinks...');
  for (const linkName of SYMLINKS_TO_REMOVE) {
    const linkPath = join(claudeDir, linkName);
    if (pathExists(linkPath) && isSymlink(linkPath)) {
      if (!dryRun) {
        unlinkSync(linkPath);
      }
      logger.removed(`.claude/${linkName} (symlink)`);
    }
  }

  // 3. Copy from submodule to new structure
  logger.newline();
  logger.info('Copying files to new structure...');

  const migrations = [
    { src: 'core/agents', dest: '.claude/core/agents' },
    { src: 'core/subagents', dest: '.claude/core/subagents' },
    { src: 'core/commands', dest: '.claude/core/commands' },
    { src: 'core/guides', dest: '.claude/core/guides' },
    { src: 'skills', dest: '.claude/skills' },
    { src: 'personas', dest: '.claude/personas' },
    { src: 'scripts/hooks', dest: 'scripts/hooks' },
    { src: 'scripts/utils', dest: 'scripts/utils' }
  ];

  for (const { src, dest } of migrations) {
    const srcPath = join(submodulePath, src);
    const destPath = join(projectRoot, dest);

    if (pathExists(srcPath)) {
      if (!dryRun) {
        ensureDirSync(destPath);
        copySync(srcPath, destPath, { overwrite: true });
      }
      logger.created(dest);
    }
  }

  // Copy statusline if it exists
  const statuslinePaths = [
    join(submodulePath, '.claude/statusline.sh'),
    join(submodulePath, 'core/statusline.sh')
  ];

  for (const statuslineSrc of statuslinePaths) {
    if (pathExists(statuslineSrc)) {
      const statuslineDest = join(projectRoot, '.claude/core/statusline.sh');
      if (!dryRun) {
        ensureDirSync(join(projectRoot, '.claude/core'));
        copySync(statuslineSrc, statuslineDest, { overwrite: true });
      }
      logger.created('.claude/core/statusline.sh');
      break;
    }
  }

  // 4. Update settings.local.json paths
  await updateSettingsPaths(projectRoot, options);

  // 5. Note about submodule removal
  logger.newline();
  logger.warning('Manual step required:');
  logger.info('  The old submodule is still at .claude/pennyfarthing/');
  logger.info('  After verifying the migration, remove it:');
  logger.newline();
  logger.info('    rm -rf .claude/pennyfarthing');
  logger.info('    git rm .claude/pennyfarthing');
  logger.info('    git commit -m "chore: migrate pennyfarthing from submodule to npm"');
  logger.newline();

  logger.success('Migration complete!');
}

/**
 * Update settings.local.json to use new paths
 */
async function updateSettingsPaths(
  projectRoot: string,
  options: MigrateOptions
): Promise<void> {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');

  if (!pathExists(settingsPath)) {
    return;
  }

  try {
    let content = readFileSync(settingsPath, 'utf8');
    const original = content;

    // Update paths from old structure to new
    const pathMappings = [
      // Old symlink paths → new core paths
      ['.claude/agents/', '.claude/core/agents/'],
      ['.claude/subagents/', '.claude/core/subagents/'],
      ['.claude/commands/', '.claude/core/commands/'],
      ['.claude/guides/', '.claude/core/guides/'],
      // Old pennyfarthing submodule paths → new paths
      ['.claude/pennyfarthing/core/agents/', '.claude/core/agents/'],
      ['.claude/pennyfarthing/core/subagents/', '.claude/core/subagents/'],
      ['.claude/pennyfarthing/core/commands/', '.claude/core/commands/'],
      ['.claude/pennyfarthing/core/guides/', '.claude/core/guides/'],
      ['.claude/pennyfarthing/skills/', '.claude/skills/'],
      ['.claude/pennyfarthing/personas/', '.claude/personas/'],
      ['.claude/pennyfarthing/scripts/', 'scripts/'],
      // Hook paths
      ['pennyfarthing/scripts/hooks/', 'scripts/hooks/']
    ];

    for (const [oldPath, newPath] of pathMappings) {
      content = content.split(oldPath).join(newPath);
    }

    if (content !== original && !options.dryRun) {
      const { writeFileSync } = await import('fs');
      writeFileSync(settingsPath, content, 'utf8');
      logger.updated('.claude/settings.local.json');
    }
  } catch (error) {
    logger.warning(`Could not update settings.local.json: ${error}`);
  }
}
