/**
 * Story 141-17: theme-loader CLI delegation tests
 *
 * RED STATE: These tests FAIL because theme-loader.ts still uses direct file
 * system operations (readFileSync, readdirSync, parseYaml) and contains a
 * hardcoded CATEGORY_MAP. After implementation, theme discovery and loading
 * will delegate to `pf theme list --json` and `pf theme show --json`.
 *
 * Covers: AC4, AC5
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// AC4: TypeScript theme discovery replaced with pf CLI calls
// ============================================================================

describe('Story 141-17 AC4: Theme discovery via pf CLI', () => {
  describe('listThemes delegates to pf theme list --json', () => {
    it('theme-loader uses child_process for theme listing', async () => {
      const themeLoaderSource = readFileSync(
        new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      assert.ok(
        themeLoaderSource.includes('execFileSync') || themeLoaderSource.includes('child_process'),
        'theme-loader.ts must use child_process.execFileSync for pf CLI calls',
      );
    });

    it('theme-loader does not use readdirSync for theme discovery', async () => {
      const themeLoaderSource = readFileSync(
        new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // After refactor, theme discovery should NOT walk the filesystem
      assert.ok(
        !themeLoaderSource.includes('readdirSync'),
        'theme-loader.ts must not use readdirSync for theme discovery (delegate to pf CLI)',
      );
    });
  });

  describe('loadTheme delegates to pf theme show --json', () => {
    it('theme-loader does not use readFileSync for theme YAML', async () => {
      const themeLoaderSource = readFileSync(
        new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // readFileSync for YAML loading should be gone
      const hasYamlReading =
        themeLoaderSource.includes('readFileSync') && themeLoaderSource.includes('parseYaml');
      assert.ok(
        !hasYamlReading,
        'theme-loader.ts must not use readFileSync + parseYaml for theme loading',
      );
    });

    it('theme-loader does not import yaml parser', async () => {
      const themeLoaderSource = readFileSync(
        new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      assert.ok(
        !themeLoaderSource.includes("from 'yaml'"),
        'theme-loader.ts must not import yaml parser (delegate parsing to pf CLI)',
      );
    });
  });

  describe('result objects returned', () => {
    it('theme functions return {success, data?, error?} pattern', async () => {
      const themeLoaderSource = readFileSync(
        new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      assert.ok(
        themeLoaderSource.includes('success') &&
          (themeLoaderSource.includes('{ success: true') || themeLoaderSource.includes('{ success: false')),
        'theme-loader.ts should return result objects with success field',
      );
    });
  });
});

// ============================================================================
// AC5: CATEGORY_MAP eliminated; categories declared in theme YAML
// ============================================================================

describe('Story 141-17 AC5: CATEGORY_MAP eliminated', () => {
  it('CATEGORY_MAP export is removed from theme-loader', async () => {
    const themeLoaderSource = readFileSync(
      new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    assert.ok(
      !themeLoaderSource.includes('CATEGORY_MAP'),
      'theme-loader.ts must not contain CATEGORY_MAP (categories come from theme YAML)',
    );
  });

  it('deriveCategory function is removed', async () => {
    const themeLoaderSource = readFileSync(
      new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    assert.ok(
      !themeLoaderSource.includes('deriveCategory'),
      'theme-loader.ts must not contain deriveCategory function',
    );
  });

  it('every core theme YAML has a category field', () => {
    // Resolve the themes directory
    const themesDir = join(
      new URL('.', import.meta.url).pathname.replace('/dist/', '/src/'),
      '..', '..', '..', '..', 'pennyfarthing-dist', 'personas', 'themes',
    );

    if (!existsSync(themesDir)) {
      assert.fail(`Themes directory not found at ${themesDir}`);
    }

    const themeFiles = readdirSync(themesDir).filter((f) => f.endsWith('.yaml'));
    assert.ok(themeFiles.length > 0, 'Should find at least one theme YAML file');

    for (const file of themeFiles) {
      const content = readFileSync(join(themesDir, file), 'utf8');
      assert.ok(
        /^category:/m.test(content),
        `Theme YAML ${file} must have a top-level category: field`,
      );
    }
  });

  it('CATEGORY_MAP is not exported from any core package file', async () => {
    // This is a broader grep-style check
    const themeLoaderSource = readFileSync(
      new URL('./theme-loader.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    const hasExportedMap = /export\s+(const|let|var)\s+CATEGORY_MAP/.test(themeLoaderSource);
    assert.ok(
      !hasExportedMap,
      'CATEGORY_MAP must not be exported from theme-loader.ts',
    );
  });
});
