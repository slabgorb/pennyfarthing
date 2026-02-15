/**
 * Migration 010: Detect and remove old multi-package installs
 *
 * STUB — awaiting implementation (story 98-22)
 *
 * Pre-v11, Pennyfarthing was split into separate packages:
 * @pennyfarthing/shared, @pennyfarthing/cyclist, @pennyfarthing/benchmark.
 * These were absorbed into @pennyfarthing/core in v11. This migration
 * detects and removes old package directories from node_modules/.
 */

export const id = '010-detect-remove-old-packages';
export const description = 'Detect and remove old multi-package installs from pre-v11 era';

export async function up(ctx) {
  // TODO: Implement — detect and remove old packages
  return { success: true };
}

export async function check(ctx) {
  // TODO: Implement — return false if old packages found, true if clean
  return true;
}
