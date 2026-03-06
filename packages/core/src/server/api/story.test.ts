/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for story API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createStoryRouter } from './story.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('story API route', () => {
  it('createStoryRouter is a function', () => {
    assert.strictEqual(typeof createStoryRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createStoryRouter(() => '/tmp/test');
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createStoryRouter(() => '/tmp/test');
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('has exactly one route', () => {
    const router = createStoryRouter(() => '/tmp/test');
    const routes = (router as any).stack.filter((l: any) => l.route);
    assert.strictEqual(routes.length, 1);
  });

  it('GET / returns story info shape for nonexistent project', () => {
    const router = createStoryRouter(() => '/nonexistent/project');
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    // getStoryInfo returns { id: null, ... } when no session exists
    assert.ok('id' in result, 'Should have id key');
  });

  it('GET / handler does not throw for missing session', () => {
    const router = createStoryRouter(() => '/nonexistent/project');
    const layer = findRouteLayer(router, '/');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle({}, { json() { return this; } }, () => {});
    });
  });
});
