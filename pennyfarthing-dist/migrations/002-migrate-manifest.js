/**
 * Migration 002: Migrate manifest from .claude/ to .pennyfarthing/
 *
 * Moves manifest.json from the legacy .claude/ location to .pennyfarthing/.
 * Idempotent — skips if already at the new location or no legacy manifest exists.
 */

import { existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';

export const id = '002-migrate-manifest';
export const description = 'Migrate manifest from .claude/ to .pennyfarthing/';

export async function up(ctx) {
  const oldPath = join(ctx.projectRoot, '.claude/manifest.json');
  const newPath = join(ctx.projectRoot, '.pennyfarthing/manifest.json');

  if (existsSync(newPath)) {
    return { success: true };
  }

  if (!existsSync(oldPath)) {
    return { success: true };
  }

  mkdirSync(join(ctx.projectRoot, '.pennyfarthing'), { recursive: true });
  renameSync(oldPath, newPath);
  ctx.logger.success('Migrated manifest from .claude/ to .pennyfarthing/');

  return { success: true };
}

export async function check(ctx) {
  const oldPath = join(ctx.projectRoot, '.claude/manifest.json');
  const newPath = join(ctx.projectRoot, '.pennyfarthing/manifest.json');

  // Already migrated if new location exists or old location doesn't
  return existsSync(newPath) || !existsSync(oldPath);
}
