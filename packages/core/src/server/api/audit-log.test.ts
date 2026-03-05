/**
 * Tests for audit-log API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createAuditLogRouter } from './audit-log.js';
import { resetEventStore } from '../otlp-receiver.js';
import { getRouteEntries, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('audit-log API route', () => {
  beforeEach(() => {
    resetEventStore();
  });

  it('createAuditLogRouter is a function', () => {
    assert.strictEqual(typeof createAuditLogRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createAuditLogRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers all expected route paths', () => {
    const router = createAuditLogRouter();
    const routes = getRouteEntries(router);

    const expected = [
      { path: '/', method: 'get' },
      { path: '/events', method: 'get' },
      { path: '/types', method: 'get' },
      { path: '/stats', method: 'get' },
      { path: '/export/json', method: 'get' },
      { path: '/export/csv', method: 'get' },
      { path: '/', method: 'delete' },
    ];

    for (const e of expected) {
      const found = routes.find((r) => r.path === e.path && r.methods.includes(e.method));
      assert.ok(found, `Route ${e.method.toUpperCase()} ${e.path} should exist`);
    }
  });

  it('GET / returns entries array with total', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/', 'get');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});

    const result = getResult();
    assert.ok(result);
    assert.ok(Array.isArray(result.entries));
    assert.strictEqual(typeof result.total, 'number');
    assert.strictEqual(result.entries.length, result.total);
  });

  it('GET /events returns events array with total', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/events');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({ query: {} }, res, () => {});

    const result = getResult();
    assert.ok(result);
    assert.ok(Array.isArray(result.events));
    assert.strictEqual(typeof result.total, 'number');
  });

  it('GET /types returns types array', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/types');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});

    const result = getResult();
    assert.ok(result);
    assert.ok(Array.isArray(result.types));
  });

  it('GET /stats returns stats object', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/stats');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});

    const result = getResult();
    assert.ok(result);
    assert.strictEqual(typeof result, 'object');
  });

  it('GET /export/json returns JSON content type', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/export/json');

    let contentType: string | null = null;
    let sent: any = null;
    const mockRes: any = {
      type(t: string) { contentType = t; return mockRes; },
      send(d: any) { sent = d; return mockRes; },
    };
    layer.route.stack[0].handle({}, mockRes, () => {});

    assert.strictEqual(contentType, 'application/json');
    assert.ok(sent !== null, 'Should send content');
  });

  it('GET /export/csv returns CSV content type', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/export/csv');

    let contentType: string | null = null;
    let sent: any = null;
    const mockRes: any = {
      type(t: string) { contentType = t; return mockRes; },
      send(d: any) { sent = d; return mockRes; },
    };
    layer.route.stack[0].handle({}, mockRes, () => {});

    assert.strictEqual(contentType, 'text/csv');
    assert.ok(sent !== null, 'Should send content');
  });

  it('DELETE / resets event store and returns success', () => {
    const router = createAuditLogRouter();
    const layer = findRouteLayer(router, '/', 'delete');

    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});

    const result = getResult();
    assert.ok(result);
    assert.strictEqual(result.success, true);
  });
});
