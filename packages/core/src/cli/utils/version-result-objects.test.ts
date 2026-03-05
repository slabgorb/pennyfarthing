/**
 * RED tests for Story 141-9 AC3a: version.ts returns result objects instead of throwing
 *
 * These tests verify that getAssetsPath() returns
 * {success, data?, error?} result objects instead of throwing exceptions.
 *
 * Expected to FAIL until implementation converts throws to result returns.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { getAssetsPath } from './version.js';

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

describe('AC3a: version.ts result objects', () => {
  describe('getAssetsPath() returns result objects', () => {
    it('should return {success: true, data: path} when pennyfarthing-dist is found', () => {
      // In the dev environment, pennyfarthing-dist/ exists relative to package
      // Cast through unknown — current return is string, target is Result<string>
      const result = getAssetsPath() as unknown as Result<string>;

      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true, 'Expected success to be true');
      assert.strictEqual(typeof result.data, 'string');
      assert.ok(result.data!.includes('pennyfarthing-dist'));
    });

    it('should return an object with success property (not a bare string)', () => {
      const result = getAssetsPath();

      // If this is still a string, the test fails — proving we need the conversion
      assert.notStrictEqual(typeof result, 'string',
        'getAssetsPath() should return a result object, not a bare string');
      assert.ok('success' in (result as unknown as object),
        'Result should have a success property');
    });
  });
});
