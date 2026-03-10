/**
 * Story 141-17: pennyfarthing.ts CLI delegation tests
 *
 * RED STATE: These tests FAIL because pennyfarthing.ts still uses direct file
 * parsing for project detection and persona assembly. After implementation,
 * these will delegate to pf CLI subprocess calls while retaining FSWatcher.
 *
 * Covers: AC6, AC7
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

// ============================================================================
// AC6: pennyfarthing.ts project detection and persona assembly use pf CLI
// ============================================================================

describe('Story 141-17 AC6: pennyfarthing.ts CLI delegation', () => {
  describe('persona assembly delegates to pf CLI', () => {
    it('pennyfarthing.ts uses child_process for CLI calls', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      assert.ok(
        pfSource.includes('execFileSync') || pfSource.includes('child_process'),
        'pennyfarthing.ts must use child_process.execFileSync for pf CLI calls',
      );
    });

    it('does not use parseYaml for theme config loading', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // After refactor, theme config and persona data come from CLI
      assert.ok(
        !pfSource.includes('parseYaml'),
        'pennyfarthing.ts must not use parseYaml for theme loading (delegate to pf CLI)',
      );
    });

    it('does not use readFileSync for YAML file parsing', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // readFileSync+YAML pattern should be gone
      const hasYamlReading = pfSource.includes('readFileSync') && pfSource.includes("from 'yaml'");
      assert.ok(
        !hasYamlReading,
        'pennyfarthing.ts must not combine readFileSync with yaml parser',
      );
    });

    it('does not use readdirSync for persona discovery', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // readdirSync is acceptable for agent session file discovery (.session/agents/),
      // but not for persona/theme directory scanning (which should delegate to pf CLI)
      const hasThemeDiscovery =
        pfSource.includes('readdirSync') && (pfSource.includes('personas/themes') || pfSource.includes('themesDir'));
      assert.ok(
        !hasThemeDiscovery,
        'pennyfarthing.ts must not use readdirSync for persona/theme discovery (delegate to pf CLI)',
      );
    });
  });

  describe('findPennyfarthingRoot removed', () => {
    it('does not contain findPennyfarthingRoot function', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // Project detection should delegate to CLI, not walk directories
      assert.ok(
        !pfSource.includes('findPennyfarthingRoot'),
        'pennyfarthing.ts must not contain findPennyfarthingRoot (delegate to pf CLI)',
      );
    });
  });

  describe('toSlug and oceanSuffix deduplicated', () => {
    it('toSlug is imported from shared utility, not defined locally', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // toSlug should be imported, not defined with `function toSlug`
      const hasLocalToSlug = /^function toSlug/m.test(pfSource);
      assert.ok(
        !hasLocalToSlug,
        'pennyfarthing.ts must not define toSlug locally (should import from shared utility)',
      );
    });

    it('oceanSuffix is imported from shared utility, not defined locally', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      const hasLocalOceanSuffix = /^function oceanSuffix/m.test(pfSource);
      assert.ok(
        !hasLocalOceanSuffix,
        'pennyfarthing.ts must not define oceanSuffix locally (should import from shared utility)',
      );
    });
  });

  describe('result objects returned', () => {
    it('getCurrentPersona returns {success, data?, error?} pattern', async () => {
      const pfSource = readFileSync(
        new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      assert.ok(
        pfSource.includes('success') &&
          (pfSource.includes('{ success: true') || pfSource.includes('{ success: false')),
        'pennyfarthing.ts persona functions should return result objects',
      );
    });
  });
});

// ============================================================================
// AC7: FSWatcher retained for cache invalidation only
// ============================================================================

describe('Story 141-17 AC7: FSWatcher retained for cache invalidation', () => {
  it('FSWatcher is still imported', async () => {
    const pfSource = readFileSync(
      new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    // FSWatcher must remain — it's the only non-delegatable TypeScript concern
    assert.ok(
      pfSource.includes('FSWatcher') || pfSource.includes('watch'),
      'pennyfarthing.ts must retain FSWatcher import for cache invalidation',
    );
  });

  it('watch function is used for file monitoring', async () => {
    const pfSource = readFileSync(
      new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    // watchAgentChanges should still exist and use watch()
    assert.ok(
      pfSource.includes('watchAgentChanges') || pfSource.includes('watch('),
      'pennyfarthing.ts must retain watch-based file monitoring',
    );
  });

  it('cache invalidation pattern exists', async () => {
    const pfSource = readFileSync(
      new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    // After refactor, there should be cache invalidation logic
    assert.ok(
      pfSource.includes('cache') || pfSource.includes('Cache') || pfSource.includes('invalidat'),
      'pennyfarthing.ts must implement cache invalidation for subprocess results',
    );
  });

  it('cache has TTL fallback', async () => {
    const pfSource = readFileSync(
      new URL('./pennyfarthing.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    // 30-second TTL as safety fallback
    assert.ok(
      pfSource.includes('30000') || pfSource.includes('30_000') || pfSource.includes('ttl') || pfSource.includes('TTL'),
      'pennyfarthing.ts must have a cache TTL fallback (30s)',
    );
  });
});
