/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for token-stats API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTokenStatsRouter, getTokenStatsClients, broadcastTokenStats } from './token-stats.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('token-stats API route', () => {
  it('createTokenStatsRouter is a function', () => {
    assert.strictEqual(typeof createTokenStatsRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createTokenStatsRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createTokenStatsRouter();
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('has exactly one route', () => {
    const router = createTokenStatsRouter();
    const routes = (router as any).stack.filter((l: any) => l.route);
    assert.strictEqual(routes.length, 1);
  });

  it('GET / returns token stats', () => {
    const router = createTokenStatsRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.strictEqual(typeof result, 'object');
  });
});

describe('getTokenStatsClients', () => {
  beforeEach(() => {
    getTokenStatsClients().clear();
  });

  it('returns a Set', () => {
    assert.ok(getTokenStatsClients() instanceof Set);
  });

  it('returns same instance across calls', () => {
    assert.strictEqual(getTokenStatsClients(), getTokenStatsClients());
  });
});

describe('broadcastTokenStats', () => {
  beforeEach(() => {
    getTokenStatsClients().clear();
  });

  it('is a function', () => {
    assert.strictEqual(typeof broadcastTokenStats, 'function');
  });

  it('does not throw with no clients', () => {
    assert.doesNotThrow(() => broadcastTokenStats({} as any));
  });

  it('sends JSON to OPEN clients', () => {
    const clients = getTokenStatsClients();
    const sent: string[] = [];
    const mockClient = { readyState: 1, send(d: string) { sent.push(d); } };
    clients.add(mockClient as any);

    broadcastTokenStats({ inputTokens: 100, outputTokens: 50 } as any);

    assert.strictEqual(sent.length, 1);
    const parsed = JSON.parse(sent[0]);
    assert.strictEqual(parsed.inputTokens, 100);
    assert.strictEqual(parsed.outputTokens, 50);
  });

  it('skips non-OPEN clients', () => {
    const clients = getTokenStatsClients();
    const sent: string[] = [];
    clients.add({ readyState: 3, send(d: string) { sent.push(d); } } as any);

    broadcastTokenStats({} as any);
    assert.strictEqual(sent.length, 0);
  });
});
