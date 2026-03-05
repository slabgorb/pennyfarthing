/**
 * Tests for theme-agents API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createThemeAgentsRouter, getThemeAgents } from './theme-agents.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes, createMockChainRes } from './__test-helpers.js';

describe('theme-agents API route', () => {
  it('createThemeAgentsRouter is a function', () => {
    assert.strictEqual(typeof createThemeAgentsRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createThemeAgentsRouter(() => '/tmp/test');
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createThemeAgentsRouter(() => '/tmp/test');
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('registers GET /full route', () => {
    const router = createThemeAgentsRouter(() => '/tmp/test');
    assert.ok(getRoutePaths(router).includes('/full'));
  });

  it('GET / returns agents shape', () => {
    const router = createThemeAgentsRouter(() => '/nonexistent/project');
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('agents' in result, 'Should have agents key');
  });

  it('GET /full handler does not throw', () => {
    const router = createThemeAgentsRouter(() => '/nonexistent/project');
    const layer = findRouteLayer(router, '/full', 'get');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        {},
        createMockChainRes().res,
        () => {},
      );
    });
  });
});

describe('getThemeAgents', () => {
  it('is a function', () => {
    assert.strictEqual(typeof getThemeAgents, 'function');
  });

  it('returns empty object for nonexistent project', () => {
    const result = getThemeAgents('/nonexistent/project');
    assert.deepStrictEqual(result, {});
  });

  it('returns an object', () => {
    const result = getThemeAgents('/tmp/test');
    assert.strictEqual(typeof result, 'object');
    assert.ok(result !== null);
  });
});
