/**
 * Tests for agent-load API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAgentLoadRouter } from './agent-load.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('agent-load API route', () => {
  it('createAgentLoadRouter is a function', () => {
    assert.strictEqual(typeof createAgentLoadRouter, 'function');
  });

  it('returns a router (function) when called with getProjectDir', () => {
    const router = createAgentLoadRouter(() => '/tmp/test');
    assert.ok(router, 'Router should be defined');
    assert.strictEqual(typeof router, 'function', 'Router should be callable');
  });

  it('router has stack property with registered routes', () => {
    const router = createAgentLoadRouter(() => '/tmp/test');
    const paths = getRoutePaths(router);
    assert.ok(paths.length >= 2, 'Should have at least 2 routes (GET / and GET /:agent)');
  });

  it('registers GET / and GET /:agent routes', () => {
    const router = createAgentLoadRouter(() => '/tmp/test');
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have GET / route');
    assert.ok(paths.includes('/:agent'), 'Should have GET /:agent route');
  });

  it('GET / handler returns expected JSON shape', () => {
    const router = createAgentLoadRouter(() => '/tmp/test');
    const layer = findRouteLayer(router, '/', 'get');
    assert.ok(layer, 'GET / layer should exist');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});

    const jsonResult = getResult();
    assert.ok(jsonResult, 'Should have called res.json');
    assert.ok(Array.isArray(jsonResult.agents), 'agents should be an array');
    assert.strictEqual(jsonResult.agents.length, 0);
    assert.strictEqual(jsonResult.totalAcrossAllAgents, 0);
    assert.strictEqual(jsonResult.summary, null);
    assert.ok(jsonResult.cachedAt, 'cachedAt should be set');
  });

  it('GET / cachedAt is a valid ISO timestamp', () => {
    const router = createAgentLoadRouter(() => '/tmp/test');
    const layer = findRouteLayer(router, '/', 'get');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});

    const date = new Date(getResult().cachedAt);
    assert.ok(!isNaN(date.getTime()), 'cachedAt should be a valid date');
  });

  it('GET /:agent handler returns agent context shape', () => {
    const router = createAgentLoadRouter(() => '/tmp/nonexistent');
    const layer = findRouteLayer(router, '/:agent');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({ params: { agent: 'nonexistent' } }, res, () => {});

    const jsonResult = getResult();
    assert.ok(jsonResult, 'Should have called res.json');
    assert.strictEqual(jsonResult.agent, 'nonexistent');
    assert.ok('context' in jsonResult, 'Should have context key');
  });
});
