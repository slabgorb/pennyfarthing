/**
 * Version sentinel file utilities for MSSCI-14698.
 *
 * Manages the .pennyfarthing/.installed-version sentinel file that tracks
 * which version of Pennyfarthing is installed. Used by prime to detect
 * version mismatches and trigger auto-updates.
 *
 * STUB: Implementation needed by Dev (story 98-1).
 */

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
  _projectRoot: string,
  _version: string,
  _options?: { dryRun?: boolean }
): void {
  // STUB: Not yet implemented — tests should fail on assertions
  throw new Error('writeVersionSentinel not implemented');
}

/**
 * Read the version from the sentinel file.
 *
 * @param projectRoot - Project root directory
 * @returns Version string, or null if sentinel doesn't exist or is empty
 */
export function readVersionSentinel(_projectRoot: string): string | null {
  // STUB: Not yet implemented — tests should fail on assertions
  throw new Error('readVersionSentinel not implemented');
}
