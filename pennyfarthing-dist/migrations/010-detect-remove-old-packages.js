/**
 * Migration 010: Detect and remove old multi-package installs
 *
 * Pre-v11, Pennyfarthing was split into separate packages:
 * @pennyfarthing/shared, @pennyfarthing/cyclist, @pennyfarthing/benchmark.
 * These were absorbed into @pennyfarthing/core in v11 (stories 98-16/17/18).
 * This migration detects and removes old package directories from node_modules/.
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';

export const id = '010-detect-remove-old-packages';
export const description = 'Detect and remove old multi-package installs from pre-v11 era';

// Packages absorbed into @pennyfarthing/core in v11
const OLD_PACKAGES = ['shared', 'cyclist', 'benchmark'];

/**
 * Check if any old packages exist in node_modules/@pennyfarthing/.
 * Returns true if clean (no old packages), false if old packages found.
 */
export async function check(ctx) {
  const scopeDir = join(ctx.projectRoot, 'node_modules', '@pennyfarthing');

  if (!existsSync(scopeDir)) {
    return true; // No @pennyfarthing scope — nothing to clean
  }

  for (const pkg of OLD_PACKAGES) {
    if (existsSync(join(scopeDir, pkg))) {
      return false; // Old package found
    }
  }

  return true; // Clean — no old packages
}

/**
 * Remove old package directories from node_modules/@pennyfarthing/.
 * Respects ctx.dryRun — logs what would be removed without deleting.
 */
export async function up(ctx) {
  const scopeDir = join(ctx.projectRoot, 'node_modules', '@pennyfarthing');

  if (!existsSync(scopeDir)) {
    ctx.logger.info('No node_modules/@pennyfarthing/ directory — nothing to clean');
    return { success: true };
  }

  let removed = 0;

  for (const pkg of OLD_PACKAGES) {
    const pkgDir = join(scopeDir, pkg);
    if (existsSync(pkgDir)) {
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] Would remove @pennyfarthing/${pkg}`);
      } else {
        try {
          rmSync(pkgDir, { recursive: true, force: true });
          ctx.logger.info(`Removed @pennyfarthing/${pkg}`);
        } catch {
          ctx.logger.warning(`Failed to remove @pennyfarthing/${pkg}`);
        }
      }
      removed++;
    }
  }

  if (removed === 0) {
    ctx.logger.info('No old multi-package installs found');
  }

  return { success: true };
}
