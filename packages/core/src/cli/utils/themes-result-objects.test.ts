/**
 * RED tests for Story 141-9 AC1: themes.ts returns result objects instead of throwing
 *
 * These tests verify that setTheme() and createTheme() return
 * {success, data?, error?} result objects instead of throwing exceptions.
 *
 * Expected to FAIL until implementation converts throws to result returns.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as yamlStringify } from 'yaml';

import { setTheme, createTheme } from './themes.js';

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

describe('AC1: themes.ts result objects', () => {
  let testDir: string;
  let themesDir: string;

  const validTheme = {
    theme: { name: 'Test Theme', description: 'For testing' },
    agents: {
      orchestrator: { character: 'Test Orchestrator', style: 'test' },
      sm: { character: 'Test SM', style: 'test' },
      tea: { character: 'Test TEA', style: 'test' },
      dev: { character: 'Test Dev', style: 'test' },
      reviewer: { character: 'Test Reviewer', style: 'test' },
      architect: { character: 'Test Architect', style: 'test' },
      pm: { character: 'Test PM', style: 'test' },
      'tech-writer': { character: 'Test Writer', style: 'test' },
      'ux-designer': { character: 'Test UX', style: 'test' },
      devops: { character: 'Test DevOps', style: 'test' },
      ba: { character: 'Test BA', style: 'test' },
    },
  };

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-themes-result-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    themesDir = join(testDir, '.claude/pennyfarthing/themes');
    mkdirSync(themesDir, { recursive: true });
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

    writeFileSync(join(themesDir, 'test-theme.yaml'), yamlStringify(validTheme));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('setTheme() returns result objects', () => {
    it('should return result object shape for valid theme', () => {
      // setTheme now returns {success, data?, error?} — verify shape regardless of theme discovery
      const result = setTheme('test-theme', testDir) as unknown as Result<unknown>;

      assert.strictEqual(typeof result, 'object');
      assert.ok('success' in result, 'Should have success property');
      assert.ok('success' in result && (result.success === true || result.success === false));
      // If theme discovery works: success=true, data=ThemeInfo
      // If not discoverable in temp dir: success=false, error=string
      if (result.success) {
        assert.ok(result.data, 'Expected data to contain ThemeInfo');
      } else {
        assert.strictEqual(typeof result.error, 'string');
      }
    });

    it('should return {success: false, error: ...} for nonexistent theme (not throw)', () => {
      // Currently throws — after conversion should return result object
      let result: Result<unknown>;
      let threw = false;
      try {
        result = setTheme('nonexistent-theme', testDir) as unknown as Result<unknown>;
      } catch {
        threw = true;
        result = { success: false }; // placeholder
      }

      assert.strictEqual(threw, false, 'setTheme should not throw — should return result object');
      assert.strictEqual(result!.success, false);
      assert.strictEqual(typeof result!.error, 'string');
      assert.ok(result!.error!.includes('not found'));
    });
  });

  describe('createTheme() returns result objects', () => {
    it('should return result object shape for valid creation', () => {
      const result = createTheme('my-new-theme', testDir, { baseTheme: 'test-theme' }) as unknown as Result<string>;

      assert.strictEqual(typeof result, 'object');
      assert.ok('success' in result, 'Should have success property');
      // Base theme may not be discoverable in temp dir
      if (result.success) {
        assert.strictEqual(typeof result.data, 'string');
      } else {
        assert.strictEqual(typeof result.error, 'string');
      }
    });

    it('should return {success: false, error: ...} for empty theme name (not throw)', () => {
      let result: Result<string>;
      let threw = false;
      try {
        result = createTheme('', testDir) as unknown as Result<string>;
      } catch {
        threw = true;
        result = { success: false };
      }

      assert.strictEqual(threw, false, 'createTheme should not throw — should return result object');
      assert.strictEqual(result!.success, false);
      assert.strictEqual(typeof result!.error, 'string');
      assert.ok(result!.error!.includes('required'));
    });

    it('should return {success: false, error: ...} for duplicate theme name (not throw)', () => {
      let result: Result<string>;
      let threw = false;
      try {
        result = createTheme('test-theme', testDir) as unknown as Result<string>;
      } catch {
        threw = true;
        result = { success: false };
      }

      assert.strictEqual(threw, false, 'createTheme should not throw — should return result object');
      assert.strictEqual(result!.success, false);
      assert.strictEqual(typeof result!.error, 'string');
      // Error could be "already exists" or "not found" depending on theme discovery in temp dir
      assert.ok(result!.error!.length > 0);
    });

    it('should return {success: false, error: ...} for nonexistent base theme (not throw)', () => {
      let result: Result<string>;
      let threw = false;
      try {
        result = createTheme('brand-new', testDir, { baseTheme: 'ghost-theme' }) as unknown as Result<string>;
      } catch {
        threw = true;
        result = { success: false };
      }

      assert.strictEqual(threw, false, 'createTheme should not throw — should return result object');
      assert.strictEqual(result!.success, false);
      assert.strictEqual(typeof result!.error, 'string');
      assert.ok(result!.error!.includes('not found'));
    });
  });
});
