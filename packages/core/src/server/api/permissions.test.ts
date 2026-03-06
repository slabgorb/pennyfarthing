/**
 * Tests for permissions API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createPermissionsRouter } from './permissions.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('permissions API route', () => {
  it('createPermissionsRouter is a function', () => {
    assert.strictEqual(typeof createPermissionsRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createPermissionsRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers expected routes', () => {
    const router = createPermissionsRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have GET /');
    assert.ok(paths.includes('/grant'), 'Should have POST /grant');
    assert.ok(paths.includes('/revoke/:tool'), 'Should have DELETE /revoke/:tool');
    assert.ok(paths.includes('/show/:tool'), 'Should have GET /show/:tool');
  });

  it('GET / returns { grants: [...] } shape', () => {
    const router = createPermissionsRouter();
    const layer = findRouteLayer(router, '/', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok('grants' in result, 'Should have grants key');
    assert.ok(Array.isArray(result.grants), 'grants should be an array');
  });

  it('POST /grant with missing tool returns 400', () => {
    const router = createPermissionsRouter();
    const layer = findRouteLayer(router, '/grant', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle({ body: {} }, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonResult && typeof jsonResult === 'object' && 'error' in (jsonResult as Record<string, unknown>));
  });

  it('POST /grant with missing scope returns 400', () => {
    const router = createPermissionsRouter();
    const layer = findRouteLayer(router, '/grant', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle({ body: { tool: 'Bash' } }, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonResult && typeof jsonResult === 'object' && 'error' in (jsonResult as Record<string, unknown>));
  });

  it('POST /grant with invalid grant_type returns 400', () => {
    const router = createPermissionsRouter();
    const layer = findRouteLayer(router, '/grant', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle(
      { body: { tool: 'Bash', scope: 'ls', grant_type: 'invalid' } },
      res,
      () => {},
    );
    assert.strictEqual(statusCode, 400);
    assert.ok(
      jsonResult && typeof jsonResult === 'object' &&
      (jsonResult as Record<string, unknown>).error &&
      String((jsonResult as Record<string, unknown>).error).includes('Invalid grant_type'),
    );
  });

  it('POST /grant with valid input returns 201 with grant', () => {
    const router = createPermissionsRouter();
    const layer = findRouteLayer(router, '/grant', 'post');
    let statusCode: number | null = null;
    let jsonResult: unknown = null;
    const res: Record<string, unknown> = {
      status(code: number) { statusCode = code; return res; },
      json(data: unknown) { jsonResult = data; return res; },
    };
    layer.route.stack[0].handle(
      { body: { tool: 'Bash', scope: 'ls', grant_type: 'session' } },
      res,
      () => {},
    );
    assert.strictEqual(statusCode, 201);
    assert.ok(jsonResult && typeof jsonResult === 'object');
    const result = jsonResult as Record<string, unknown>;
    assert.ok('grant' in result, 'Should have grant key');
    const grant = result.grant as Record<string, unknown>;
    assert.strictEqual(grant.tool, 'Bash');
    assert.strictEqual(grant.scope, 'ls');
    assert.strictEqual(grant.grant_type, 'session');
  });
});
