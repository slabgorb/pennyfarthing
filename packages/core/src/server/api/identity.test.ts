/**
 * Tests for identity API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 *
 * Tests router factory shape — does not shell out to jira/gh CLIs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createIdentityRouter } from './identity.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('identity API route', () => {
  it('createIdentityRouter is a function', () => {
    assert.strictEqual(typeof createIdentityRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createIdentityRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createIdentityRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have GET / route');
  });

  it('construction does not throw when CLIs are absent', () => {
    assert.doesNotThrow(() => {
      createIdentityRouter();
    });
  });

  it('GET / handler returns IdentityInfo shape', () => {
    const router = createIdentityRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('jiraEmail' in result, 'Should have jiraEmail key');
    assert.ok('githubUsername' in result, 'Should have githubUsername key');
    assert.ok('avatarUrl' in result, 'Should have avatarUrl key');
  });
});
