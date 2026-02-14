/**
 * MSSCI-14325: Connect /permissions skill to grant store
 *
 * Tests the permissions API router that bridges the /permissions skill
 * to settings-store.ts grant management functions.
 *
 * Acceptance Criteria:
 * - AC1: /permissions list shows active grants from settings-store.ts
 * - AC2: /permissions grant adds grants via settings-store.ts
 * - AC3: /permissions revoke removes grants including always-grants from file
 * - AC4: /permissions show displays grant details for a specific tool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addGrant,
  clearAllGrants,
  getGrants,
  getPersistedGrants,
  setGrantsPersistCallback,
} from '@pennyfarthing/core/dist/server/settings-store.js';
import type { PermissionGrant } from '@pennyfarthing/core/dist/server/settings-store.js';
import { createPermissionsRouter } from '../src/api/permissions.js';

/**
 * Helper to create a grant with defaults
 */
function makeGrant(
  overrides: Partial<PermissionGrant> & { tool: string; scope: string; grant_type: PermissionGrant['grant_type'] },
): PermissionGrant {
  return {
    granted_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Minimal mock for Express request/response to test router handlers directly.
 * We test the router logic, not Express plumbing.
 */
function mockReq(body?: Record<string, unknown>, params?: Record<string, string>, query?: Record<string, string>) {
  return {
    body: body || {},
    params: params || {},
    query: query || {},
  } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    _json: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res;
}

describe('MSSCI-14325: Permissions API Router', () => {
  beforeEach(() => {
    clearAllGrants();
    setGrantsPersistCallback(() => true);
  });

  // ===========================================================================
  // Router existence
  // ===========================================================================

  describe('Router creation', () => {
    it('should export createPermissionsRouter function', () => {
      expect(typeof createPermissionsRouter).toBe('function');
    });

    it('should return an Express Router', () => {
      const router = createPermissionsRouter();
      expect(router).toBeDefined();
      // Express routers have .use, .get, .post, .delete methods
      expect(typeof router.get).toBe('function');
      expect(typeof router.post).toBe('function');
      expect(typeof router.delete).toBe('function');
    });
  });

  // ===========================================================================
  // AC1: /permissions list shows active grants from settings-store.ts
  // ===========================================================================

  describe('AC1: GET / - List all active grants', () => {
    it('should return empty array when no grants exist', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).toEqual({ grants: [] });
    });

    it('should return all active grants from settings-store', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'always' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json.grants).toHaveLength(2);
      expect(res._json.grants[0].tool).toBe('Bash');
      expect(res._json.grants[1].tool).toBe('Edit');
    });

    it('should include grants of all three types (once, session, always)', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'always' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json.grants).toHaveLength(3);
      const grantTypes = res._json.grants.map((g: PermissionGrant) => g.grant_type);
      expect(grantTypes).toContain('once');
      expect(grantTypes).toContain('session');
      expect(grantTypes).toContain('always');
    });

    it('should return grant fields: tool, scope, grant_type, granted_at', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      const grant = res._json.grants[0];
      expect(grant).toHaveProperty('tool');
      expect(grant).toHaveProperty('scope');
      expect(grant).toHaveProperty('grant_type');
      expect(grant).toHaveProperty('granted_at');
    });
  });

  // ===========================================================================
  // AC2: /permissions grant adds grants via settings-store.ts
  // ===========================================================================

  describe('AC2: POST /grant - Add a permission grant', () => {
    it('should add a session grant via settings-store', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(201);
      expect(getGrants()).toHaveLength(1);
      expect(getGrants()[0].tool).toBe('Bash');
      expect(getGrants()[0].scope).toBe('git *');
    });

    it('should add an always grant and trigger persistence', async () => {
      let persistCalled = false;
      setGrantsPersistCallback(() => {
        persistCalled = true;
        return true;
      });

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({
        tool: 'Edit',
        scope: '/src/*',
        grant_type: 'always',
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(201);
      expect(getPersistedGrants()).toHaveLength(1);
      expect(persistCalled).toBe(true);
    });

    it('should add a once grant', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({
        tool: 'WebFetch',
        scope: '*.github.com',
        grant_type: 'once',
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(201);
      expect(getGrants()).toHaveLength(1);
      expect(getGrants()[0].grant_type).toBe('once');
    });

    it('should default to session grant type when not specified', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({
        tool: 'Bash',
        scope: 'npm *',
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(201);
      expect(getGrants()[0].grant_type).toBe('session');
    });

    it('should return 400 when tool is missing', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({ scope: 'git *' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.error).toBeDefined();
    });

    it('should return 400 when scope is missing', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({ tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.error).toBeDefined();
    });

    it('should return 400 for invalid grant_type', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'permanent',
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.error).toBeDefined();
    });

    it('should include the created grant in response', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'post', '/grant');

      const req = mockReq({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
      });
      const res = mockRes();
      await handler(req, res);

      expect(res._json.grant).toBeDefined();
      expect(res._json.grant.tool).toBe('Bash');
      expect(res._json.grant.scope).toBe('git *');
      expect(res._json.grant.granted_at).toBeDefined();
    });
  });

  // ===========================================================================
  // AC3: /permissions revoke removes grants including always-grants
  // ===========================================================================

  describe('AC3: DELETE /revoke/:tool - Revoke grants for a tool', () => {
    it('should remove all grants for a tool', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'session' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'delete', '/revoke/:tool');

      const req = mockReq({}, { tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      // Bash grants should be gone, Edit grant should remain
      const remaining = getGrants();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].tool).toBe('Edit');
    });

    it('should remove always-grants and trigger persistence callback', async () => {
      const persistedData: PermissionGrant[][] = [];
      setGrantsPersistCallback((grants) => {
        persistedData.push([...grants]);
        return true;
      });

      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));
      const persistCountAfterAdd = persistedData.length;

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'delete', '/revoke/:tool');

      const req = mockReq({}, { tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(getPersistedGrants()).toHaveLength(0);
      // Persist callback should have been called on removal
      expect(persistedData.length).toBeGreaterThan(persistCountAfterAdd);
    });

    it('should remove grants of mixed types for same tool', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'pnpm test', grant_type: 'once' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'delete', '/revoke/:tool');

      const req = mockReq({}, { tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      expect(getGrants()).toHaveLength(0);
    });

    it('should return count of removed grants', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'delete', '/revoke/:tool');

      const req = mockReq({}, { tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      expect(res._json.removed).toBe(2);
    });

    it('should return 200 with removed: 0 when tool has no grants', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'delete', '/revoke/:tool');

      const req = mockReq({}, { tool: 'NonexistentTool' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.removed).toBe(0);
    });

    it('should support optional scope parameter to revoke specific grant', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'delete', '/revoke/:tool');

      const req = mockReq({}, { tool: 'Bash' }, { scope: 'git *' });
      const res = mockRes();
      await handler(req, res);

      expect(res._json.removed).toBe(1);
      const remaining = getGrants();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].scope).toBe('npm *');
    });
  });

  // ===========================================================================
  // AC4: /permissions show displays grant details for a specific tool
  // ===========================================================================

  describe('AC4: GET /show/:tool - Show grants for a specific tool', () => {
    it('should return grants filtered by tool name', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'always' }));
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'session' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/show/:tool');

      const req = mockReq({}, { tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      expect(res._json.grants).toHaveLength(2);
      expect(res._json.grants.every((g: PermissionGrant) => g.tool === 'Bash')).toBe(true);
    });

    it('should return empty array when tool has no grants', async () => {
      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/show/:tool');

      const req = mockReq({}, { tool: 'WebFetch' });
      const res = mockRes();
      await handler(req, res);

      expect(res._json.grants).toEqual([]);
    });

    it('should include all grant details in response', async () => {
      addGrant(
        makeGrant({
          tool: 'Bash',
          scope: 'git *',
          grant_type: 'always',
          granted_at: '2026-02-06T10:00:00.000Z',
        }),
      );

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/show/:tool');

      const req = mockReq({}, { tool: 'Bash' });
      const res = mockRes();
      await handler(req, res);

      const grant = res._json.grants[0];
      expect(grant.tool).toBe('Bash');
      expect(grant.scope).toBe('git *');
      expect(grant.grant_type).toBe('always');
      expect(grant.granted_at).toBe('2026-02-06T10:00:00.000Z');
    });

    it('should be case-sensitive on tool name', async () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));

      const router = createPermissionsRouter();
      const handler = getRouteHandler(router, 'get', '/show/:tool');

      const req = mockReq({}, { tool: 'bash' });
      const res = mockRes();
      await handler(req, res);

      // 'bash' !== 'Bash' — should find nothing
      expect(res._json.grants).toHaveLength(0);
    });
  });
});

// =============================================================================
// Test utility: Extract route handler from Express router
// =============================================================================

/**
 * Extract a route handler from an Express router for direct testing.
 * This avoids needing supertest or a running server.
 */
function getRouteHandler(
  router: any,
  method: 'get' | 'post' | 'delete',
  path: string,
): (req: any, res: any) => Promise<void> {
  // Express routers store routes in router.stack
  const layer = router.stack?.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );

  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} ${path} route found on router`);
  }

  // Return the handler function
  const handler = layer.route.stack.find((s: any) => s.method === method)?.handle;
  if (!handler) {
    throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
  }

  return handler;
}
