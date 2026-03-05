/**
 * Shared test helpers for API route tests
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Router } from 'express';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function getRoutePaths(router: Router): string[] {
  return (router as any).stack
    .filter((l: any) => l.route)
    .map((l: any) => l.route.path);
}

export function getRouteEntries(router: Router): Array<{ path: string; methods: string[] }> {
  return (router as any).stack
    .filter((l: any) => l.route)
    .map((l: any) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));
}

export function findRouteLayer(router: Router, path: string, method?: string): any {
  return (router as any).stack.find((l: any) => {
    if (!l.route || l.route.path !== path) return false;
    if (method) return l.route.methods?.[method];
    return true;
  });
}

export function createMockJsonRes(): { res: any; getResult: () => any } {
  let result: any = null;
  const res: any = { json(data: any) { result = data; return res; } };
  return { res, getResult: () => result };
}

export function createMockChainRes(): { res: any } {
  const res: any = {
    json() { return res; },
    status() { return res; },
  };
  return { res };
}

export function describeSingleRouteRouter(
  name: string,
  createRouter: (getProjectDir: () => string) => Router,
) {
  describe(`${name} API route`, () => {
    it(`${createRouter.name} is a function`, () => {
      assert.strictEqual(typeof createRouter, 'function');
    });

    it('returns a router when called', () => {
      const router = createRouter(() => '/tmp/test');
      assert.ok(router);
      assert.strictEqual(typeof router, 'function');
    });

    it('registers GET / route', () => {
      const router = createRouter(() => '/tmp/test');
      assert.ok(getRoutePaths(router).includes('/'), 'Should have GET / route');
    });

    it('has exactly one route', () => {
      const router = createRouter(() => '/tmp/test');
      const routes = (router as any).stack.filter((l: any) => l.route);
      assert.strictEqual(routes.length, 1);
    });

    it('GET / handler does not throw synchronously', () => {
      const router = createRouter(() => '/tmp/test');
      const layer = findRouteLayer(router, '/');
      assert.doesNotThrow(() => {
        layer.route.stack[0].handle(
          { query: {} },
          createMockChainRes().res,
          () => {},
        );
      });
    });
  });
}
