/**
 * RED tests for Story 141-9 AC3b: manifest.ts returns result objects instead of throwing
 *
 * These tests verify that readManifest() returns
 * {success, data?, error?} result objects instead of throwing exceptions.
 *
 * Expected to FAIL until implementation converts throws to result returns.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { readManifest } from './manifest.js';

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

describe('AC3b: manifest.ts result objects', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-manifest-result-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('readManifest() returns result objects', () => {
    it('should return {success: true, data: null} when no manifest exists (not bare null)', () => {
      // Currently returns null directly — should return {success: true, data: null}
      const result = readManifest(testDir) as unknown as Result<unknown>;

      // The current behavior returns bare null. After conversion, should be a result object.
      assert.notStrictEqual(result, null, 'Should return result object, not bare null');
      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data, null);
    });

    it('should return {success: true, data: Manifest} for valid manifest', () => {
      const manifest = {
        version: '1.0.0',
        installedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        projectName: 'test-project',
        installationType: 'symlink',
        managedPaths: [],
        fileHashes: {},
      };

      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      const result = readManifest(testDir) as unknown as Result<unknown>;

      assert.strictEqual(typeof result, 'object');
      assert.notStrictEqual(result, null);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.strictEqual((result.data as { version: string }).version, '1.0.0');
    });

    it('should return {success: false, error: ...} for corrupt manifest JSON (not throw)', () => {
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        '{ this is not valid json !!!'
      );

      let result: Result<unknown>;
      let threw = false;
      try {
        result = readManifest(testDir) as unknown as Result<unknown>;
      } catch {
        threw = true;
        result = { success: false };
      }

      assert.strictEqual(threw, false, 'readManifest should not throw — should return result object');
      assert.strictEqual(result!.success, false);
      assert.strictEqual(typeof result!.error, 'string');
      assert.ok(result!.error!.includes('Failed to read manifest'));
    });
  });
});
