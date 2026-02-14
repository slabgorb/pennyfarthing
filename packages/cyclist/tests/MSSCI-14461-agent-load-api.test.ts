/**
 * MSSCI-14461: Agent Load Analyzer — Story 82-1: Agent load API endpoint
 *
 * Tests the agent-load API router stub (moved to @pennyfarthing/core).
 * The implementation is now a minimal stub that returns empty data for GET /
 * and delegates to getPrimeContextJson for GET /:agent.
 *
 * Acceptance Criteria:
 * - AC1: createAgentLoadRouter() exports and returns a Router
 * - AC2: GET `/api/agent-load` returns stub response: { agents: [], summary: null }
 * - AC3: Parallel execution — N/A for stub (no agents loaded)
 * - AC4: 60-second cache — N/A for stub (no cache)
 * - AC5: Partial failure handling — N/A for stub (no agents loaded)
 * - AC6: Does NOT leak `context` field in response
 * - AC7: Router has GET / route
 * - AC8: Export from `api/index.ts`
 */

import { describe, it, expect } from 'vitest';
import { createAgentLoadRouter } from '../src/api/agent-load.js';

/**
 * Mock Express request
 */
function mockReq(query?: Record<string, string>) {
  return {
    query: query || {},
  } as any;
}

/**
 * Mock Express response with status/json capture
 */
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

/**
 * Extract a route handler from an Express router for direct testing.
 */
function getRouteHandler(
  router: any,
  method: 'get' | 'post' | 'delete',
  path: string,
): (req: any, res: any) => Promise<void> {
  const layer = router.stack?.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );

  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} ${path} route found on router`);
  }

  const handler = layer.route.stack.find((s: any) => s.method === method)?.handle;
  if (!handler) {
    throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
  }

  return handler;
}

describe('MSSCI-14461: Agent Load API (Story 82-1)', () => {

  // ===========================================================================
  // AC1: createAgentLoadRouter exists and returns a Router
  // ===========================================================================

  describe('AC1: createAgentLoadRouter() exports and returns Router', () => {
    it('should export createAgentLoadRouter as a function', () => {
      expect(typeof createAgentLoadRouter).toBe('function');
    });

    it('should return an Express Router when called', () => {
      const router = createAgentLoadRouter(() => '/test/project');
      expect(router).toBeDefined();
      expect(typeof router.get).toBe('function');
      expect(typeof router.post).toBe('function');
    });

    it('should accept a getProjectDir function parameter', () => {
      const getProjectDir = vi.fn(() => '/test/project');
      const router = createAgentLoadRouter(getProjectDir);
      expect(router).toBeDefined();
    });
  });

  // ===========================================================================
  // AC2: GET / returns stub response
  // ===========================================================================

  describe('AC2: GET / - Returns stub response', () => {
    it('should return empty agents array (stub behavior)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toHaveProperty('agents');
      expect(res._json.agents).toHaveLength(0);
    });

    it('should return summary: null (stub behavior)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).toHaveProperty('summary');
      expect(res._json.summary).toBeNull();
    });

    it('should return exactly { agents: [], summary: null }', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).toEqual({ agents: [], summary: null });
    });

    it('should NOT include cachedAt (not implemented in stub)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).not.toHaveProperty('cachedAt');
    });

    it('should NOT include totalAcrossAllAgents (not implemented in stub)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).not.toHaveProperty('totalAcrossAllAgents');
    });
  });

  // ===========================================================================
  // AC3: Parallel execution — N/A for stub (no agents loaded)
  // ===========================================================================

  describe('AC3: Parallel execution (not applicable to stub)', () => {
    it.skip('should call all 11 agents without waiting for each sequentially', async () => {
      // SKIP: Stub doesn't load agents in parallel, it returns empty array
    });
  });

  // ===========================================================================
  // AC4: 60-second cache — N/A for stub (no cache)
  // ===========================================================================

  describe('AC4: 60-second cache (not applicable to stub)', () => {
    it.skip('should return cached result on second call within 60 seconds', async () => {
      // SKIP: Stub has no cache, always returns fresh { agents: [], summary: null }
    });

    it.skip('should refresh cache after 60 seconds', async () => {
      // SKIP: Stub has no cache to refresh
    });

    it.skip('should return same cachedAt for cached responses', async () => {
      // SKIP: Stub has no cachedAt property
    });
  });

  // ===========================================================================
  // AC5: Partial failure handling — N/A for stub (no agents loaded)
  // ===========================================================================

  describe('AC5: Partial failure handling (not applicable to stub)', () => {
    it.skip('should include failed agents with error field when getPrimeContextJson returns null', async () => {
      // SKIP: Stub returns empty agents array, no failure handling
    });

    it.skip('should still return successful agents when some fail', async () => {
      // SKIP: Stub returns empty agents array
    });

    it.skip('should return 500 when ALL agents fail', async () => {
      // SKIP: Stub always returns 200 with { agents: [], summary: null }
    });

    it.skip('should exclude failed agents from totalAcrossAllAgents sum', async () => {
      // SKIP: Stub doesn't return totalAcrossAllAgents
    });
  });

  // ===========================================================================
  // AC6: Does NOT leak context field
  // ===========================================================================

  describe('AC6: No context field leakage', () => {
    it('should NOT include context field in stub response', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      // Stub returns { agents: [], summary: null } with no context field
      expect(res._json).not.toHaveProperty('context');
      expect(res._json.agents).toHaveLength(0);
    });
  });

  // ===========================================================================
  // AC7: Router mounting (tested via route handler extraction)
  // ===========================================================================

  describe('AC7: Router has GET / route', () => {
    it('should have a GET / route registered', () => {
      const router = createAgentLoadRouter(() => '/test/project');
      // If getRouteHandler throws, the route doesn't exist
      const handler = getRouteHandler(router, 'get', '/');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  });

  // ===========================================================================
  // AC8: Export from api/index.ts
  // ===========================================================================

  describe('AC8: Barrel export from api/index.ts', () => {
    it('should export createAgentLoadRouter from api/index.ts', async () => {
      const apiModule = await import('../src/api/index.js');
      expect(apiModule).toHaveProperty('createAgentLoadRouter');
      expect(typeof apiModule.createAgentLoadRouter).toBe('function');
    });
  });
});
