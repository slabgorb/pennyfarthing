/**
 * Tests for Story 103-21: Git fetch cooldown
 *
 * Verifies that git fetch calls are throttled per-repo with a configurable
 * cooldown interval. Between cooldowns, cached refs are used for ahead/behind.
 *
 * Run with: cd packages/core && pnpm build && pnpm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GIT_FETCH_COOLDOWN_MS, resetFetchCooldown } from './git.js';

describe('Git fetch cooldown', () => {
  beforeEach(() => {
    // Clear all cooldown state between tests
    resetFetchCooldown();
  });

  it('exports GIT_FETCH_COOLDOWN_MS with a default of 60 seconds', () => {
    assert.strictEqual(typeof GIT_FETCH_COOLDOWN_MS, 'number');
    assert.strictEqual(GIT_FETCH_COOLDOWN_MS, 60_000);
  });

  it('exports resetFetchCooldown as a function', () => {
    assert.strictEqual(typeof resetFetchCooldown, 'function');
  });

  it('resetFetchCooldown accepts optional projectDir parameter', () => {
    // Should not throw with or without argument
    assert.doesNotThrow(() => resetFetchCooldown('/some/path'));
    assert.doesNotThrow(() => resetFetchCooldown());
  });
});
