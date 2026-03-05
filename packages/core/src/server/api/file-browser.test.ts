/**
 * Tests for file-browser API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFileBrowserRouter } from './file-browser.js';
import { getRoutePaths, findRouteLayer, createMockChainRes } from './__test-helpers.js';

describe('file-browser API route', () => {
  it('createFileBrowserRouter is a function', () => {
    assert.strictEqual(typeof createFileBrowserRouter, 'function');
  });

  it('returns a router when called with getProjectDir', () => {
    const router = createFileBrowserRouter(() => '/tmp/test');
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET /, POST /open, POST /edit routes', () => {
    const router = createFileBrowserRouter(() => '/tmp/test');
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have GET / route');
    assert.ok(paths.includes('/open'), 'Should have POST /open route');
    assert.ok(paths.includes('/edit'), 'Should have POST /edit route');
  });

  it('GET / handler does not throw synchronously', () => {
    const router = createFileBrowserRouter(() => '/tmp/test');
    const layer = findRouteLayer(router, '/', 'get');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        { query: {} },
        createMockChainRes().res,
        () => {},
      );
    });
  });

  it('POST /open handler does not throw synchronously', () => {
    const router = createFileBrowserRouter(() => '/tmp/test');
    const layer = findRouteLayer(router, '/open', 'post');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        { body: {} },
        createMockChainRes().res,
        () => {},
      );
    });
  });

  it('POST /open with missing path calls res.status(400)', () => {
    const router = createFileBrowserRouter(() => '/tmp/test');
    const layer = findRouteLayer(router, '/open', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle({ body: {} }, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonResult && typeof jsonResult === 'object' && 'error' in (jsonResult as Record<string, unknown>));
  });
});
