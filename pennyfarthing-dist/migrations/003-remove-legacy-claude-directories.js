/**
 * Migration 003: Remove legacy .claude/ directories
 *
 * Removes .claude/{agents,guides,personas,scripts} which now live
 * under .pennyfarthing/ as symlinks to node_modules.
 * Does NOT touch .claude/commands or .claude/skills (required for Claude Code discovery).
 */

import { existsSync, lstatSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

export const id = '003-remove-legacy-claude-directories';
export const description = 'Remove legacy .claude/{agents,guides,personas,scripts} directories';

const LEGACY_DIRS = ['agents', 'guides', 'personas', 'scripts'];

function removePath(fullPath) {
  try {
    const stats = lstatSync(fullPath);
    if (stats.isSymbolicLink()) {
      unlinkSync(fullPath);
    } else {
      rmSync(fullPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore errors — path may not exist or be inaccessible
  }
}

export async function up(ctx) {
  for (const name of LEGACY_DIRS) {
    const legacyPath = join(ctx.projectRoot, '.claude', name);
    if (existsSync(legacyPath) || isSymlink(legacyPath)) {
      removePath(legacyPath);
      ctx.logger.info(`Removed legacy .claude/${name}`);
    }
  }
  return { success: true };
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function check(ctx) {
  // Already done if none of the legacy directories exist
  return LEGACY_DIRS.every(name => {
    const legacyPath = join(ctx.projectRoot, '.claude', name);
    return !existsSync(legacyPath) && !isSymlink(legacyPath);
  });
}
