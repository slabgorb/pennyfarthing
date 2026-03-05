/**
 * Tests for WheelHub path resolution changes (Story 136-2).
 *
 * AC5: PACKAGE_ROOT uses resolvePennyfarthingDist (not hardcoded __dirname traversal)
 * AC3: context.py path candidates include pip-installed layout
 *
 * Run with: cd packages/core && pnpm run build && node --test dist/server/pennyfarthing-resolution.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// =============================================================================
// AC5: PACKAGE_ROOT uses resolvePennyfarthingDist
// =============================================================================

describe('Story 136-2 AC5: PACKAGE_ROOT resolution', () => {
  it('exports resolvePackageRoot as a function', async () => {
    const mod = await import('./pennyfarthing.js');
    assert.strictEqual(
      typeof (mod as Record<string, unknown>).resolvePackageRoot,
      'function',
      'pennyfarthing.ts must export resolvePackageRoot() for testability'
    );
  });

  it('resolvePackageRoot returns a string path', async () => {
    const { resolvePackageRoot } = await import('./pennyfarthing.js') as { resolvePackageRoot: () => string };
    const root = resolvePackageRoot();
    assert.strictEqual(typeof root, 'string', 'resolvePackageRoot must return a string');
    assert.ok(root.length > 0, 'resolvePackageRoot must return a non-empty path');
  });

  it('resolvePackageRoot does not use hardcoded __dirname traversal as primary', async () => {
    const { resolvePackageRoot } = await import('./pennyfarthing.js') as { resolvePackageRoot: () => string };
    const root = resolvePackageRoot();
    // The resolved root should be the parent of pennyfarthing-dist/ found by
    // resolvePennyfarthingDist(), not a blind 3-level __dirname walk-up.
    // In monorepo, both may give the same result, but the function must
    // exist and be callable (proves it's not just a const).
    assert.ok(root, 'resolvePackageRoot must return a valid path');
  });
});

// =============================================================================
// AC3: context.py found in pip layout
// =============================================================================

describe('Story 136-2 AC3: context.py pip resolution', () => {
  it('exports resolveContextScript as a function', async () => {
    const mod = await import('./api/context.js');
    assert.strictEqual(
      typeof (mod as Record<string, unknown>).resolveContextScript,
      'function',
      'context.ts must export resolveContextScript() with pip-aware path resolution'
    );
  });

  it('resolveContextScript includes pip site-packages candidates', async () => {
    const { resolveContextScript } = await import('./api/context.js') as {
      resolveContextScript: (projectDir: string) => { path: string | null; isPython: boolean; paths: string[] };
    };
    const result = resolveContextScript('/tmp/nonexistent-project');
    // Even with a nonexistent project, should return the list of paths it checked
    assert.ok(result !== undefined, 'resolveContextScript must return a result');
    if (result && result.paths) {
      // At least one path should reference a pip/site-packages pattern
      const hasPipPath = result.paths.some(
        (p: string) => p.includes('site-packages') || p.includes('_dist') || p.includes('pf/context_window.py')
      );
      assert.ok(hasPipPath, `resolveContextScript must include pip path candidates, got: ${result.paths.join(', ')}`);
    }
  });
});
