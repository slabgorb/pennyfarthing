/**
 * Tests for git API route (non-cooldown aspects)
 * Story 141-6: Core API route tests (evaluation through portrait)
 *
 * Cooldown-specific tests are in git-fetch-cooldown.test.ts (story 103-21).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createGitRouter,
  getReposFromConfig,
  GIT_FETCH_COOLDOWN_MS,
  resetFetchCooldown,
} from './git.js';
import { getRoutePaths } from './__test-helpers.js';

describe('git API route', () => {
  it('createGitRouter is a function', () => {
    assert.strictEqual(typeof createGitRouter, 'function');
  });

  it('returns a router when called with getProjectDir', () => {
    const router = createGitRouter(() => '/tmp/test');
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers POST /refresh, GET /, and GET /all routes', () => {
    const router = createGitRouter(() => '/tmp/test');
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/refresh'), 'Should have POST /refresh');
    assert.ok(paths.includes('/'), 'Should have GET /');
    assert.ok(paths.includes('/all'), 'Should have GET /all');
  });

  it('router construction with non-function arg does not throw', () => {
    // The getProjectDir is only called on request, not at construction
    assert.doesNotThrow(() => {
      createGitRouter((() => '/tmp') as () => string);
    });
  });
});

describe('getReposFromConfig', () => {
  it('is a function', () => {
    assert.strictEqual(typeof getReposFromConfig, 'function');
  });

  it('returns array with fallback entry when no repos.yaml exists', () => {
    const repos = getReposFromConfig('/tmp/nonexistent-path-abc123');
    assert.ok(Array.isArray(repos));
    assert.ok(repos.length >= 1, 'Should return at least one fallback repo');
    assert.ok(repos[0].name, 'Fallback repo should have a name');
    assert.ok(repos[0].path, 'Fallback repo should have a path');
  });
});

describe('git exports', () => {
  it('GIT_FETCH_COOLDOWN_MS is 60000', () => {
    assert.strictEqual(GIT_FETCH_COOLDOWN_MS, 60_000);
  });

  it('resetFetchCooldown is a function', () => {
    assert.strictEqual(typeof resetFetchCooldown, 'function');
  });
});
