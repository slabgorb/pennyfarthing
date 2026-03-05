/**
 * Tests for mode API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createModeRouter, getModeInfo } from './mode.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('mode API route', () => {
  it('createModeRouter is a function', () => {
    assert.strictEqual(typeof createModeRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createModeRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createModeRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have GET / route');
  });

  it('GET / returns ModeInfo shape', () => {
    const router = createModeRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('mode' in result, 'Should have mode');
    assert.ok('nodeVersion' in result, 'Should have nodeVersion');
    assert.ok('platform' in result, 'Should have platform');
    assert.ok('pid' in result, 'Should have pid');
  });
});

describe('getModeInfo', () => {
  it('is a function', () => {
    assert.strictEqual(typeof getModeInfo, 'function');
  });

  it('returns object with all required fields', () => {
    const info = getModeInfo();
    assert.ok(info);
    assert.ok(['electron', 'web', 'unknown'].includes(info.mode), `mode should be valid, got: ${info.mode}`);
    assert.strictEqual(typeof info.isBikeRack, 'boolean');
    assert.strictEqual(typeof info.nodeVersion, 'string');
    assert.ok(info.nodeVersion.startsWith('v'), 'nodeVersion should start with v');
    assert.strictEqual(typeof info.platform, 'string');
    assert.strictEqual(typeof info.arch, 'string');
    assert.strictEqual(typeof info.pid, 'number');
    assert.ok(info.pid > 0, 'pid should be positive');
    assert.strictEqual(typeof info.uptime, 'number');
    assert.ok(info.uptime >= 0, 'uptime should be non-negative');
    assert.strictEqual(typeof info.startTime, 'string');
    assert.ok(!isNaN(new Date(info.startTime).getTime()), 'startTime should be valid ISO date');
  });

  it('returns stable results across calls', () => {
    const info1 = getModeInfo();
    const info2 = getModeInfo();
    assert.strictEqual(info1.mode, info2.mode);
    assert.strictEqual(info1.platform, info2.platform);
    assert.strictEqual(info1.pid, info2.pid);
    assert.strictEqual(info1.startTime, info2.startTime);
  });
});
