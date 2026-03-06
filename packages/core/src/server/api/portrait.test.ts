/**
 * Tests for portrait API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createPortraitRouter, getCurrentPortrait } from './portrait.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('portrait API route', () => {
  it('createPortraitRouter is a function', () => {
    assert.strictEqual(typeof createPortraitRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createPortraitRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / and POST / routes', () => {
    const router = createPortraitRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have / route');
  });

  it('GET / returns current portrait', () => {
    const router = createPortraitRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('src' in result, 'Should have src key');
    assert.strictEqual(typeof result.src, 'string');
  });

  it('POST / with valid src returns { success: true, src }', () => {
    const router = createPortraitRouter();
    const layer = findRouteLayer(router, '/', 'post');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle(
      { body: { src: 'https://example.com/img.png' } },
      res,
      () => {},
    );
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.src, 'https://example.com/img.png');
  });

  it('POST / with missing src returns 400', () => {
    const router = createPortraitRouter();
    const layer = findRouteLayer(router, '/', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle({ body: {} }, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.deepStrictEqual(jsonResult, { error: 'Invalid portrait src' });
  });

  it('POST / with non-string src returns 400', () => {
    const router = createPortraitRouter();
    const layer = findRouteLayer(router, '/', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle({ body: { src: 123 } }, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.deepStrictEqual(jsonResult, { error: 'Invalid portrait src' });
  });

  it('POST / updates state visible via GET', () => {
    const router = createPortraitRouter();

    // POST to set
    const postLayer = findRouteLayer(router, '/', 'post');
    const { res: postRes } = createMockJsonRes();
    postLayer.route.stack[0].handle(
      { body: { src: 'https://example.com/new.png' } },
      postRes,
      () => {},
    );

    // GET to verify
    const getLayer = findRouteLayer(router, '/', 'get');
    const { res: getRes, getResult } = createMockJsonRes();
    getLayer.route.stack[0].handle({}, getRes, () => {});
    const result = getResult();
    assert.strictEqual(result.src, 'https://example.com/new.png');
  });
});

describe('getCurrentPortrait', () => {
  it('is a function', () => {
    assert.strictEqual(typeof getCurrentPortrait, 'function');
  });

  it('returns an object with src string', () => {
    const portrait = getCurrentPortrait();
    assert.ok(portrait);
    assert.strictEqual(typeof portrait.src, 'string');
  });
});
