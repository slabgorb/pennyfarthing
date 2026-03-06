/**
 * Tests for settings API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createSettingsRouter, getSettingsForWebSocket } from './settings.js';
import { getRoutePaths, getRouteEntries, findRouteLayer, createMockChainRes } from './__test-helpers.js';

describe('settings API route', () => {
  it('createSettingsRouter is a function', () => {
    assert.strictEqual(typeof createSettingsRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createSettingsRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createSettingsRouter();
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('registers PATCH / route', () => {
    const router = createSettingsRouter();
    const entries = getRouteEntries(router);
    const patchRoot = entries.find(e => e.path === '/' && e.methods.includes('patch'));
    assert.ok(patchRoot, 'Should have PATCH / route');
  });

  it('registers layout routes', () => {
    const router = createSettingsRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/layout'), 'Should have /layout route');
    assert.ok(paths.includes('/bikerack-layout'), 'Should have /bikerack-layout route');
  });

  it('registers GET /themes route', () => {
    const router = createSettingsRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/themes'), 'Should have /themes route');
  });

  it('GET / handler does not throw synchronously', () => {
    const router = createSettingsRouter();
    const layer = findRouteLayer(router, '/', 'get');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        { query: {} },
        createMockChainRes().res,
        () => {},
      );
    });
  });

  it('GET /layout handler does not throw synchronously', () => {
    const router = createSettingsRouter();
    const layer = findRouteLayer(router, '/layout', 'get');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        {},
        createMockChainRes().res,
        () => {},
      );
    });
  });
});

describe('getSettingsForWebSocket', () => {
  it('is a function', () => {
    assert.strictEqual(typeof getSettingsForWebSocket, 'function');
  });

  it('returns a promise', () => {
    const result = getSettingsForWebSocket('/nonexistent/project');
    assert.ok(result instanceof Promise);
  });

  it('resolves to an object for nonexistent project', async () => {
    const settings = await getSettingsForWebSocket('/nonexistent/project');
    assert.strictEqual(typeof settings, 'object');
    assert.ok(settings !== null);
  });
});
