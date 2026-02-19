import { readdirSync, unlinkSync, symlinkSync, lstatSync, rmSync, copyFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync, copySync } = fsExtra;
import { logger } from './logger.js';
import { pathExists, isSymlink, isDirectory } from './files.js';

/**
 * Compute relative path for symlink from link location to target
 */
export function computeRelativeSymlink(linkPath: string, targetPath: string): string {
  return relative(dirname(linkPath), targetPath);
}

/**
 * Remove a symlink or directory at the given path
 * Handles both symlinks and directories (for migration from copy mode)
 * Returns true if something was removed, false if path didn't exist
 */
export function removeSymlinkOrDirectory(path: string, dryRun: boolean = false): boolean {
  if (!pathExists(path) && !isSymlink(path)) {
    return false;
  }

  // Symlinks are always safe to remove
  if (isSymlink(path)) {
    if (dryRun) return true;
    try {
      unlinkSync(path);
      return true;
    } catch {
      return false;
    }
  }

  // Non-symlink directory: check if empty before removing
  if (isDirectory(path)) {
    const entries = readdirSync(path);
    if (entries.length > 0) {
      logger.warning(`Refusing to remove non-empty directory: ${path} (${entries.length} entries)`);
      return false;
    }
    if (dryRun) return true;
    try {
      rmSync(path, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  // Regular file
  if (dryRun) return true;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove only entries matching a prefix from a directory.
 * Preserves all other entries (user content).
 * Returns count of removed entries.
 */
export function cleanManagedEntries(dir: string, prefix: string, dryRun: boolean = false): number {
  if (!pathExists(dir)) return 0;

  const entries = readdirSync(dir);
  let count = 0;

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    count++;
    if (!dryRun) {
      const entryPath = join(dir, entry);
      try {
        // Handle both symlinks and real files/dirs
        const stat = lstatSync(entryPath);
        if (stat.isSymbolicLink() || stat.isFile()) {
          unlinkSync(entryPath);
        } else if (stat.isDirectory()) {
          rmSync(entryPath, { recursive: true });
        }
      } catch {
        // Entry may have been removed by another process
      }
    }
  }

  return count;
}

/**
 * Create commands directory with individual symlinks to each command file.
 * This allows users to add their own commands alongside built-in ones.
 */
export function createCommandsDirectory(
  projectRoot: string,
  builtInCommandsPath: string,
  projectCommandsPath: string,
  dryRun: boolean
): void {
  const commandsDir = join(projectRoot, '.claude/commands');

  // Three-way logic: symlink → migrate, directory → clean managed, missing → create
  if (isSymlink(commandsDir)) {
    // Legacy whole-directory symlink — remove and recreate as real dir
    removeSymlinkOrDirectory(commandsDir, dryRun);
    if (!dryRun) ensureDirSync(commandsDir);
  } else if (isDirectory(commandsDir)) {
    // Real directory — clean only managed (pf-*) entries, preserve user content
    cleanManagedEntries(commandsDir, 'pf-', dryRun);
  } else {
    // First install — create fresh
    if (!dryRun) ensureDirSync(commandsDir);
  }
  logger.created('.claude/commands/ (directory for built-in + user commands)');

  // Copy each built-in command (only pf-prefixed built-in commands)
  // Copies instead of symlinks to avoid drift when node_modules changes
  if (pathExists(builtInCommandsPath)) {
    const builtInCommands = readdirSync(builtInCommandsPath).filter(f => f.endsWith('.md') && f.startsWith('pf-'));
    for (const cmd of builtInCommands) {
      const destPath = join(commandsDir, cmd);
      const sourcePath = join(builtInCommandsPath, cmd);

      if (!dryRun) {
        try {
          copyFileSync(sourcePath, destPath);
        } catch (e) {
          logger.warning(`Could not copy command ${cmd}: ${e}`);
        }
      }
    }
    logger.info(`  Copied ${builtInCommands.length} built-in commands`);
  }

  // Symlink user project commands (if any exist)
  if (pathExists(projectCommandsPath)) {
    const projectCommands = readdirSync(projectCommandsPath).filter(f => f.endsWith('.md'));
    let linkedCount = 0;
    for (const cmd of projectCommands) {
      const linkPath = join(commandsDir, cmd);
      if (pathExists(linkPath)) {
        logger.warning(`  Skipping ${cmd} - would override built-in command`);
        continue;
      }

      const targetPath = join(projectCommandsPath, cmd);
      const relativeTarget = computeRelativeSymlink(linkPath, targetPath);

      if (!dryRun) {
        try {
          symlinkSync(relativeTarget, linkPath);
          linkedCount++;
        } catch (e) {
          logger.warning(`Could not create symlink for ${cmd}: ${e}`);
        }
      } else {
        linkedCount++;
      }
    }
    if (linkedCount > 0) {
      logger.info(`  Linked ${linkedCount} user commands from project/commands/`);
    }
  }
}

/**
 * Create skills directory with individual symlinks to each skill file.
 * This allows users to add their own skills alongside built-in ones.
 */
export function createSkillsDirectory(
  projectRoot: string,
  builtInSkillsPath: string,
  projectSkillsPath: string,
  dryRun: boolean
): void {
  const skillsDir = join(projectRoot, '.claude/skills');

  // Three-way logic: symlink → migrate, directory → clean managed, missing → create
  if (isSymlink(skillsDir)) {
    // Legacy whole-directory symlink — remove and recreate as real dir
    removeSymlinkOrDirectory(skillsDir, dryRun);
    if (!dryRun) ensureDirSync(skillsDir);
  } else if (isDirectory(skillsDir)) {
    // Real directory — clean only managed (pf-*) entries, preserve user content
    cleanManagedEntries(skillsDir, 'pf-', dryRun);
  } else {
    // First install — create fresh
    if (!dryRun) ensureDirSync(skillsDir);
  }
  logger.created('.claude/skills/ (directory for built-in + user skills)');

  // Copy each built-in skill directory (only pf-prefixed built-in skills)
  // Copies instead of symlinks to avoid drift when node_modules changes
  if (pathExists(builtInSkillsPath)) {
    const builtInSkills = readdirSync(builtInSkillsPath).filter(f => {
      const fullPath = join(builtInSkillsPath, f);
      return isDirectory(fullPath) && f.startsWith('pf-');
    });
    for (const skill of builtInSkills) {
      const destPath = join(skillsDir, skill);
      const sourcePath = join(builtInSkillsPath, skill);

      if (!dryRun) {
        try {
          copySync(sourcePath, destPath, { overwrite: true });
        } catch (e) {
          logger.warning(`Could not copy skill ${skill}: ${e}`);
        }
      }
    }
    logger.info(`  Copied ${builtInSkills.length} built-in skills`);
  }

  // Symlink user project skills (if any exist) - skills are directories
  if (pathExists(projectSkillsPath)) {
    const projectSkills = readdirSync(projectSkillsPath).filter(f => {
      const fullPath = join(projectSkillsPath, f);
      return isDirectory(fullPath) && !f.startsWith('.');
    });
    let linkedCount = 0;
    for (const skill of projectSkills) {
      const linkPath = join(skillsDir, skill);
      if (pathExists(linkPath)) {
        logger.warning(`  Skipping ${skill} - would override built-in skill`);
        continue;
      }

      const targetPath = join(projectSkillsPath, skill);
      const relativeTarget = computeRelativeSymlink(linkPath, targetPath);

      if (!dryRun) {
        try {
          symlinkSync(relativeTarget, linkPath);
          linkedCount++;
        } catch (e) {
          logger.warning(`Could not create symlink for ${skill}: ${e}`);
        }
      } else {
        linkedCount++;
      }
    }
    if (linkedCount > 0) {
      logger.info(`  Linked ${linkedCount} user skills from project/skills/`);
    }
  }
}

/**
 * Create a symlink from destPath to sourcePath.
 * This keeps .pennyfarthing pointing to node_modules, which is required
 * for prime.sh to find the pf package via relative path calculation.
 */
export function createDirectorySymlink(
  sourcePath: string,
  destPath: string,
  dryRun: boolean = false
): boolean {
  if (!pathExists(sourcePath)) {
    return false;
  }

  // Remove existing symlink or directory (migration from copy mode)
  removeSymlinkOrDirectory(destPath, dryRun);

  if (!dryRun) {
    try {
      const relativeTarget = relative(dirname(destPath), sourcePath);
      symlinkSync(relativeTarget, destPath);
      return true;
    } catch (e) {
      logger.warning(`Could not create symlink ${destPath} -> ${sourcePath}: ${e}`);
      return false;
    }
  }
  return true;
}

/**
 * Check if commands directory needs migration from single symlink to directory
 */
export function needsCommandsMigration(projectRoot: string): boolean {
  const commandsPath = join(projectRoot, '.claude/commands');
  return isSymlink(commandsPath);
}

/**
 * Check if skills directory needs migration from single symlink to directory
 */
export function needsSkillsMigration(projectRoot: string): boolean {
  const skillsPath = join(projectRoot, '.claude/skills');
  return isSymlink(skillsPath);
}
