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
    it('should return {success: true, data: ThemeInfo} for valid theme', () => {
      // Cast through unknown — current return type is ThemeInfo, target is Result<ThemeInfo>
      const result = setTheme('test-theme', testDir) as unknown as Result<unknown>;

      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true, 'Expected success to be true');
      assert.ok(result.data, 'Expected data to contain ThemeInfo');
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
    it('should return {success: true, data: path} for valid creation', () => {
      const result = createTheme('my-new-theme', testDir, { baseTheme: 'test-theme' }) as unknown as Result<string>;

      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true, 'Expected success to be true');
      assert.strictEqual(typeof result.data, 'string');
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
      assert.ok(result!.error!.includes('already exists'));
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
