/**
 * Tests for stats API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createStatsRouter, getCurrentStats, getStatsClients, updatePwd, broadcastStats } from './stats.js';
import { getRoutePaths, getRouteEntries, findRouteLayer, createMockJsonRes, createMockChainRes } from './__test-helpers.js';

describe('stats API route', () => {
  it('createStatsRouter is a function', () => {
    assert.strictEqual(typeof createStatsRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createStatsRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createStatsRouter();
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('registers POST / route', () => {
    const router = createStatsRouter();
    const entries = getRouteEntries(router);
    const postRoot = entries.find(e => e.path === '/' && e.methods.includes('post'));
    assert.ok(postRoot, 'Should have POST / route');
  });

  it('GET / returns current stats shape', () => {
    const router = createStatsRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('model' in result, 'Should have model');
    assert.ok('status' in result, 'Should have status');
    assert.ok('pwd' in result, 'Should have pwd');
  });

  it('POST / handler does not throw synchronously', () => {
    const router = createStatsRouter();
    const layer = findRouteLayer(router, '/', 'post');
    assert.doesNotThrow(() => {
      layer.route.stack[0].handle(
        { body: { model: 'test-model' } },
        createMockChainRes().res,
        () => {},
      );
    });
  });

  it('POST / validates model type', () => {
    const router = createStatsRouter();
    const layer = findRouteLayer(router, '/', 'post');
    let statusCode: number | undefined;
    let jsonResult: any;
    const res: any = {
      status(code: number) { statusCode = code; return res; },
      json(data: any) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle({ body: { model: 123 } }, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonResult?.error);
  });
});

describe('getCurrentStats', () => {
  it('returns object with expected keys', () => {
    const stats = getCurrentStats();
    assert.ok('model' in stats);
    assert.ok('status' in stats);
    assert.ok('pwd' in stats);
  });
});

describe('getStatsClients', () => {
  beforeEach(() => {
    getStatsClients().clear();
  });

  it('returns a Set', () => {
    assert.ok(getStatsClients() instanceof Set);
  });

  it('returns same instance across calls', () => {
    assert.strictEqual(getStatsClients(), getStatsClients());
  });
});

describe('broadcastStats', () => {
  beforeEach(() => {
    getStatsClients().clear();
  });

  it('is a function', () => {
    assert.strictEqual(typeof broadcastStats, 'function');
  });

  it('does not throw with no clients', () => {
    assert.doesNotThrow(() => broadcastStats({ model: 'test' } as any));
  });
});

describe('updatePwd', () => {
  it('is a function', () => {
    assert.strictEqual(typeof updatePwd, 'function');
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => updatePwd('/tmp/test'));
  });
});
