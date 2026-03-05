/**
 * Tests for todos API route
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTodosRouter, getWebModeTodos, setWebModeTodos } from './todos.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('todos API route', () => {
  beforeEach(() => {
    setWebModeTodos([]);
  });

  it('createTodosRouter is a function', () => {
    assert.strictEqual(typeof createTodosRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createTodosRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createTodosRouter();
    assert.ok(getRoutePaths(router).includes('/'));
  });

  it('has exactly one route', () => {
    const router = createTodosRouter();
    const routes = (router as any).stack.filter((l: any) => l.route);
    assert.strictEqual(routes.length, 1);
  });

  it('GET / returns empty array by default', () => {
    const router = createTodosRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(Array.isArray(result), 'Should return an array');
    assert.strictEqual(result.length, 0);
  });

  it('GET / returns todos after setWebModeTodos', () => {
    const todos = [
      { id: '1', content: 'Test todo', activeForm: 'test', status: 'pending' as const },
    ];
    setWebModeTodos(todos);
    const router = createTodosRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, '1');
  });
});

describe('getWebModeTodos', () => {
  beforeEach(() => {
    setWebModeTodos([]);
  });

  it('returns empty array initially', () => {
    const todos = getWebModeTodos();
    assert.ok(Array.isArray(todos));
    assert.strictEqual(todos.length, 0);
  });

  it('returns what was set', () => {
    const input = [
      { id: 'a', content: 'hello', activeForm: 'form', status: 'in_progress' as const },
    ];
    setWebModeTodos(input);
    const result = getWebModeTodos();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'a');
  });
});

describe('setWebModeTodos', () => {
  it('is a function', () => {
    assert.strictEqual(typeof setWebModeTodos, 'function');
  });

  it('replaces existing todos', () => {
    setWebModeTodos([{ id: '1', content: 'x', activeForm: 'f', status: 'pending' }]);
    setWebModeTodos([{ id: '2', content: 'y', activeForm: 'g', status: 'completed' }]);
    const result = getWebModeTodos();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, '2');
  });
});
