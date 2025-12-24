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

  // Migrate to new pennyfarthing/ structure
  const migrations = [
    { src: 'core/agents', dest: '.claude/pennyfarthing/agents' },
    { src: 'core/subagents', dest: '.claude/pennyfarthing/subagents' },
    { src: 'core/commands', dest: '.claude/pennyfarthing/commands' },
    { src: 'core/guides', dest: '.claude/pennyfarthing/guides' },
    { src: 'skills', dest: '.claude/pennyfarthing/skills' },
    { src: 'personas', dest: '.claude/pennyfarthing/personas' },
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
      const statuslineDest = join(projectRoot, '.claude/pennyfarthing/statusline.sh');
      if (!dryRun) {
        ensureDirSync(join(projectRoot, '.claude/pennyfarthing'));
        copySync(statuslineSrc, statuslineDest, { overwrite: true });
      }
      logger.created('.claude/pennyfarthing/statusline.sh');
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

    // Update paths from old structures to new pennyfarthing/ structure
    const pathMappings = [
      // Old core/ paths → new pennyfarthing/ paths
      ['.claude/core/agents/', '.claude/pennyfarthing/agents/'],
      ['.claude/core/subagents/', '.claude/pennyfarthing/subagents/'],
      ['.claude/core/commands/', '.claude/pennyfarthing/commands/'],
      ['.claude/core/guides/', '.claude/pennyfarthing/guides/'],
      ['.claude/core/statusline.sh', '.claude/pennyfarthing/statusline.sh'],
      // Old direct symlink paths → new pennyfarthing/ paths
      ['.claude/skills/', '.claude/pennyfarthing/skills/'],
      ['.claude/personas/', '.claude/pennyfarthing/personas/'],
      // Old submodule paths → new paths
      ['.claude/pennyfarthing/core/', '.claude/pennyfarthing/'],
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
