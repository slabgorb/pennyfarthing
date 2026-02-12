/**
 * Version sentinel file utilities for MSSCI-14698.
 *
 * Manages the .pennyfarthing/.installed-version sentinel file that tracks
 * which version of Pennyfarthing is installed. Used by prime to detect
 * version mismatches and trigger auto-updates.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync } = fsExtra;

/**
 * Sentinel filename within .pennyfarthing/
 */
export const SENTINEL_FILENAME = '.installed-version';

/**
 * Write the version sentinel file to .pennyfarthing/.installed-version.
 *
 * Called by init.ts after successful initialization and by update.ts
 * after successful update.
 *
 * @param projectRoot - Project root directory
 * @param version - Version string to write
 * @param options - Options (dryRun skips write)
 */
export function writeVersionSentinel(
  projectRoot: string,
  version: string,
  options?: { dryRun?: boolean }
): void {
  if (options?.dryRun) {
    return;
  }

  const pfDir = join(projectRoot, '.pennyfarthing');
  ensureDirSync(pfDir);

  const sentinelPath = join(pfDir, SENTINEL_FILENAME);
  writeFileSync(sentinelPath, version + '\n', 'utf8');
}

/**
 * Read the version from the sentinel file.
 *
 * @param projectRoot - Project root directory
 * @returns Version string, or null if sentinel doesn't exist or is empty
 */
export function readVersionSentinel(projectRoot: string): string | null {
  const sentinelPath = join(projectRoot, '.pennyfarthing', SENTINEL_FILENAME);

  if (!existsSync(sentinelPath)) {
    return null;
  }

  const content = readFileSync(sentinelPath, 'utf8').trim();
  return content || null;
}
