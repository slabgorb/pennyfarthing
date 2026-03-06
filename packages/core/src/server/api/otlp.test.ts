/**
 * Tests for OTLP API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createOTLPRouter } from './otlp.js';
import { getRoutePaths, getRouteEntries, findRouteLayer, createMockJsonRes, createMockChainRes } from './__test-helpers.js';

describe('OTLP API route', () => {
  it('createOTLPRouter is a function', () => {
    assert.strictEqual(typeof createOTLPRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createOTLPRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers POST /logs, /metrics, /traces routes', () => {
    const router = createOTLPRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/logs'), 'Should have POST /logs');
    assert.ok(paths.includes('/metrics'), 'Should have POST /metrics');
    assert.ok(paths.includes('/traces'), 'Should have POST /traces');
  });

  it('all routes use POST method', () => {
    const router = createOTLPRouter();
    const entries = getRouteEntries(router);
    for (const entry of entries) {
      assert.ok(entry.methods.includes('post'), `${entry.path} should be POST`);
    }
  });

  it('POST /logs with valid body returns { partialSuccess: {} }', () => {
    const router = createOTLPRouter();
    const layer = findRouteLayer(router, '/logs', 'post');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({ body: { resourceLogs: [] } }, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.deepStrictEqual(result, { partialSuccess: {} });
  });

  it('POST /metrics with valid body returns { partialSuccess: {} }', () => {
    const router = createOTLPRouter();
    const layer = findRouteLayer(router, '/metrics', 'post');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({ body: { resourceMetrics: [] } }, res, () => {});
    const result = getResult();
    assert.deepStrictEqual(result, { partialSuccess: {} });
  });

  it('POST /traces with valid body returns { partialSuccess: {} }', () => {
    const router = createOTLPRouter();
    const layer = findRouteLayer(router, '/traces', 'post');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({ body: { resourceSpans: [] } }, res, () => {});
    const result = getResult();
    assert.deepStrictEqual(result, { partialSuccess: {} });
  });

  it('POST /logs with null body does not throw (caught internally)', () => {
    const router = createOTLPRouter();
    const layer = findRouteLayer(router, '/logs', 'post');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        { body: null },
        createMockChainRes().res,
        () => {},
      );
    });
  });
});
