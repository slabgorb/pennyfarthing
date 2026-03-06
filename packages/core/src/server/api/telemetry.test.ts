/**
 * Tests for telemetry API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createTelemetryRouter } from './telemetry.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('telemetry API route', () => {
  it('createTelemetryRouter is a function', () => {
    assert.strictEqual(typeof createTelemetryRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createTelemetryRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createTelemetryRouter();
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('registers GET /tdd route', () => {
    const router = createTelemetryRouter();
    assert.ok(getRoutePaths(router).includes('/tdd'));
  });

  it('registers GET /hierarchy route', () => {
    const router = createTelemetryRouter();
    assert.ok(getRoutePaths(router).includes('/hierarchy'));
  });

  it('registers GET /by-agent route', () => {
    const router = createTelemetryRouter();
    assert.ok(getRoutePaths(router).includes('/by-agent'));
  });

  it('registers GET /by-story route', () => {
    const router = createTelemetryRouter();
    assert.ok(getRoutePaths(router).includes('/by-story'));
  });

  it('GET / returns metrics shape', () => {
    const router = createTelemetryRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('metrics' in result, 'Should have metrics key');
  });

  it('GET /tdd returns metrics shape', () => {
    const router = createTelemetryRouter();
    const layer = findRouteLayer(router, '/tdd', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('metrics' in result, 'Should have metrics key');
  });

  it('GET /hierarchy returns hierarchy shape', () => {
    const router = createTelemetryRouter();
    const layer = findRouteLayer(router, '/hierarchy', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('hierarchy' in result, 'Should have hierarchy key');
  });

  it('GET /by-agent returns stats shape', () => {
    const router = createTelemetryRouter();
    const layer = findRouteLayer(router, '/by-agent', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('stats' in result, 'Should have stats key');
  });

  it('GET /by-story returns stats shape', () => {
    const router = createTelemetryRouter();
    const layer = findRouteLayer(router, '/by-story', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('stats' in result, 'Should have stats key');
  });
});
