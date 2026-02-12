/**
 * Migration 006: Migrate settings.local.json from .claude/ to .pennyfarthing/
 *
 * If .claude/settings.local.json is a regular file, moves it to
 * .pennyfarthing/settings.local.json and creates a symlink at the old location.
 * Idempotent — no-op if already migrated (symlink) or nothing exists.
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, lstatSync, symlinkSync } from 'fs';
import { join } from 'path';

export const id = '006-migrate-settings-file';
export const description = 'Migrate settings.local.json from .claude/ to .pennyfarthing/';

export async function up(ctx) {
  const oldPath = join(ctx.projectRoot, '.claude/settings.local.json');
  const newPath = join(ctx.projectRoot, '.pennyfarthing/settings.local.json');

  let oldStats;
  try {
    oldStats = lstatSync(oldPath);
  } catch {
    // Old path doesn't exist — nothing to migrate
    return { success: true };
  }

  // Already a symlink — already migrated
  if (oldStats.isSymbolicLink()) {
    return { success: true };
  }

  // Old path is a real file — migrate it
  if (!existsSync(newPath)) {
    mkdirSync(join(ctx.projectRoot, '.pennyfarthing'), { recursive: true });
    renameSync(oldPath, newPath);
  } else {
    unlinkSync(oldPath);
  }

  // Create symlink at old location pointing to new
  symlinkSync('../.pennyfarthing/settings.local.json', oldPath);
  ctx.logger.success('Migrated settings.local.json to .pennyfarthing/');

  return { success: true };
}

export async function check(ctx) {
  const oldPath = join(ctx.projectRoot, '.claude/settings.local.json');

  try {
    const stats = lstatSync(oldPath);
    // If it's a symlink, migration is already done
    // If it's a regular file, migration is needed
    return stats.isSymbolicLink();
  } catch {
    // Doesn't exist — nothing to migrate, so considered "done"
    return true;
  }
}
