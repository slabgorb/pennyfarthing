/**
 * Tests for evaluation API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEvaluationRouter } from './evaluation.js';
import { getRoutePaths, getRouteEntries, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('evaluation API route', () => {
  it('createEvaluationRouter is a function', () => {
    assert.strictEqual(typeof createEvaluationRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createEvaluationRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers expected routes', () => {
    const router = createEvaluationRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have / route');
    assert.ok(paths.includes('/results'), 'Should have /results route');
    assert.ok(paths.includes('/summary'), 'Should have /summary route');
    assert.ok(paths.includes('/trend'), 'Should have /trend route');
    assert.ok(paths.includes('/recommendations'), 'Should have /recommendations route');
  });

  it('has GET and DELETE methods on /', () => {
    const router = createEvaluationRouter();
    const entries = getRouteEntries(router);
    const rootEntries = entries.filter(e => e.path === '/');
    const methods = rootEntries.flatMap(e => e.methods);
    assert.ok(methods.includes('get'), 'Should have GET /');
    assert.ok(methods.includes('delete'), 'Should have DELETE /');
  });

  it('GET / returns { evaluation } shape', () => {
    const router = createEvaluationRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('evaluation' in result, 'Should have evaluation key');
  });

  it('GET /results returns { results } shape', () => {
    const router = createEvaluationRouter();
    const layer = findRouteLayer(router, '/results', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('results' in result, 'Should have results key');
  });

  it('GET /summary returns { summary } shape', () => {
    const router = createEvaluationRouter();
    const layer = findRouteLayer(router, '/summary', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('summary' in result, 'Should have summary key');
  });

  it('GET /trend returns { trend } shape', () => {
    const router = createEvaluationRouter();
    const layer = findRouteLayer(router, '/trend', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('trend' in result, 'Should have trend key');
  });

  it('GET /recommendations returns { recommendations } shape', () => {
    const router = createEvaluationRouter();
    const layer = findRouteLayer(router, '/recommendations', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('recommendations' in result, 'Should have recommendations key');
    assert.ok(Array.isArray(result.recommendations), 'recommendations should be an array');
  });

  it('DELETE / returns { success: true }', () => {
    const router = createEvaluationRouter();
    const layer = findRouteLayer(router, '/', 'delete');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.deepStrictEqual(result, { success: true });
  });
});
