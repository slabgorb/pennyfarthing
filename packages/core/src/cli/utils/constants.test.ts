/**
 * 106-4: Gate file discovery — constants include gates/ symlink
 *
 * Verifies that DIRECTORY_SYMLINKS and MANAGED_PATHS include the gates/
 * directory entry, ensuring init/update will create the symlink.
 *
 * RED phase — these tests should fail until Dev adds gates to the constants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIRECTORY_SYMLINKS,
  ALL_SYMLINKS,
  MANAGED_PATHS,
} from './constants.js';

// ---------------------------------------------------------------------------
// AC4: gates/ symlink added to init/update following existing pattern
// ---------------------------------------------------------------------------

describe('106-4: DIRECTORY_SYMLINKS includes gates', () => {
  it('has a gates entry in DIRECTORY_SYMLINKS', () => {
    const gatesEntry = DIRECTORY_SYMLINKS.find(
      (s: { name: string; link: string }) => s.name === 'gates'
    );
    assert.ok(gatesEntry, 'gates entry missing from DIRECTORY_SYMLINKS');
  });

  it('gates symlink points to .pennyfarthing/gates', () => {
    const gatesEntry = DIRECTORY_SYMLINKS.find(
      (s: { name: string; link: string }) => s.name === 'gates'
    );
    assert.equal(gatesEntry?.link, '.pennyfarthing/gates');
  });
});

describe('106-4: ALL_SYMLINKS includes gates', () => {
  it('has a gates entry in ALL_SYMLINKS', () => {
    const gatesEntry = ALL_SYMLINKS.find(
      (s: { name: string; link: string }) => s.name === 'gates'
    );
    assert.ok(gatesEntry, 'gates entry missing from ALL_SYMLINKS');
  });
});

describe('106-4: MANAGED_PATHS includes gates', () => {
  it('has .pennyfarthing/gates in MANAGED_PATHS', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = MANAGED_PATHS.includes('.pennyfarthing/gates' as any);
    assert.ok(found, '.pennyfarthing/gates missing from MANAGED_PATHS');
  });
});
