/**
 * Tests for pyproject.toml resolution utilities
 *
 * Originally Story 117-1. AC1-AC4 removed — template and CLI generation
 * were never implemented. AC5 tests findLocalPyproject which exists.
 *
 * Run with: cd packages/core && npm run build && npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-pyproject-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── AC5: findLocalPyproject supports .pennyfarthing/ path ──────

describe('AC5: findLocalPyproject resolves .pennyfarthing/ path', () => {
  it('findLocalPyproject should find pyproject.toml in .pennyfarthing/', async () => {
    const { findLocalPyproject } = await import('../utils/python.js');

    const consumerDir = createTestDir();
    try {
      const pfDir = join(consumerDir, '.pennyfarthing');
      mkdirSync(pfDir, { recursive: true });
      writeFileSync(
        join(pfDir, 'pyproject.toml'),
        `[project]\nname = "pennyfarthing-scripts"\n`
      );

      const fakeNmPath = join(consumerDir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');
      mkdirSync(fakeNmPath, { recursive: true });

      const result = findLocalPyproject(fakeNmPath);
      assert.ok(
        result !== null,
        'findLocalPyproject should find .pennyfarthing/pyproject.toml'
      );
      assert.ok(
        result!.includes('.pennyfarthing'),
        `Should resolve to .pennyfarthing/ path, got: ${result}`
      );
    } finally {
      rmSync(consumerDir, { recursive: true, force: true });
    }
  });
});
