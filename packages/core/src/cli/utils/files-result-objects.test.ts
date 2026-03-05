/**
 * RED tests for Story 141-9 AC2: files.ts returns result objects instead of throwing
 *
 * These tests verify that findMonorepoRoot() returns
 * {success, data?, error?} result objects instead of throwing exceptions.
 *
 * Expected to FAIL until implementation converts throws to result returns.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { findMonorepoRoot } from './files.js';

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

describe('AC2: files.ts result objects', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-files-result-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findMonorepoRoot() returns result objects', () => {
    it('should return {success: true, data: path} when root is found', () => {
      const projectDir = join(testDir, 'my-project');
      mkdirSync(join(projectDir, '.pennyfarthing'), { recursive: true });
      const nestedDir = join(projectDir, 'src', 'deep');
      mkdirSync(nestedDir, { recursive: true });

      // Cast through unknown — current return is string, target is Result<string>
      const result = findMonorepoRoot(nestedDir) as unknown as Result<string>;

      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true, 'Expected success to be true');
      assert.strictEqual(typeof result.data, 'string');
      assert.strictEqual(result.data, projectDir);
    });

    it('should return {success: false, error: ...} when root is not found (not throw)', () => {
      const isolatedDir = join(testDir, 'no-project', 'nested');
      mkdirSync(isolatedDir, { recursive: true });

      let result: Result<string>;
      let threw = false;
      try {
        result = findMonorepoRoot(isolatedDir) as unknown as Result<string>;
      } catch {
        threw = true;
        result = { success: false };
      }

      assert.strictEqual(threw, false, 'findMonorepoRoot should not throw — should return result object');
      assert.strictEqual(result!.success, false);
      assert.strictEqual(typeof result!.error, 'string');
      assert.ok(result!.error!.includes('Could not find project root'));
    });

    it('should return {success: true, data: path} for framework repo (pennyfarthing-dist + packages)', () => {
      const frameworkDir = join(testDir, 'framework');
      mkdirSync(join(frameworkDir, 'pennyfarthing-dist'), { recursive: true });
      mkdirSync(join(frameworkDir, 'packages'), { recursive: true });
      const deepDir = join(frameworkDir, 'packages', 'core', 'src');
      mkdirSync(deepDir, { recursive: true });

      const result = findMonorepoRoot(deepDir) as unknown as Result<string>;

      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true, 'Expected success to be true');
      assert.strictEqual(result.data, frameworkDir);
    });
  });
});
