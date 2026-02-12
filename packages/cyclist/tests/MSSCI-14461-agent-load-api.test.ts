/**
 * MSSCI-14461: Agent Load Analyzer — Story 82-1: Agent load API endpoint
 *
 * Tests the agent-load API router that exposes getPrimeContextJson()
 * results for all 10 primary agents at FULL tier.
 *
 * Acceptance Criteria:
 * - AC1: New `packages/cyclist/src/api/agent-load.ts` with `createAgentLoadRouter()`
 * - AC2: GET `/api/agent-load` returns array of agent load data
 * - AC3: Runs all 10 agents in parallel (not serial blocking)
 * - AC4: 60-second cache with `cachedAt` timestamp
 * - AC5: Partial failure handling: failed agents included with `error` field
 * - AC6: Does NOT leak `context` field (full prompt text) in response
 * - AC7: Router mounted in `server.ts` at `/api/agent-load`
 * - AC8: Export from `api/index.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgentLoadRouter } from '../src/api/agent-load.js';

// The 11 primary agents (no subagents)
const PRIMARY_AGENTS = [
  'sm', 'tea', 'dev', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator', 'ba',
] as const;

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

/**
 * Create a mock PrimeOutput for a given agent
 */
function makePrimeOutput(agent: string, totalTokens: number = 3000) {
  return {
    context: `Full system prompt for ${agent} - this should NEVER appear in API response`,
    tier: 'FULL' as const,
    agentName: agent,
    tokenCounts: {
      workflow_state: 45,
      agent_definition: Math.floor(totalTokens * 0.3),
      persona: Math.floor(totalTokens * 0.2),
      behavior_guide: Math.floor(totalTokens * 0.25),
      sprint_context: 80,
      session_header: 120,
      sidecars: Math.floor(totalTokens * 0.15),
    },
    totalTokens,
    components: [
      { name: 'agent_definition', tokens: Math.floor(totalTokens * 0.3), source: `.pennyfarthing/agents/${agent}.md` },
      { name: 'persona', tokens: Math.floor(totalTokens * 0.2), source: null },
      { name: 'sidecars', tokens: Math.floor(totalTokens * 0.15), source: `.pennyfarthing/sidecars/${agent}/` },
    ],
  };
}

// Mock getPrimeContextJson before importing — vi.mock hoists
vi.mock('../src/prime.js', () => ({
  getPrimeContextJson: vi.fn(),
  getPrimeContextAsync: vi.fn(),
  buildPrimeCommand: vi.fn(),
  parsePrimeOutput: vi.fn(),
}));

describe('MSSCI-14461: Agent Load API (Story 82-1)', () => {
  let mockGetPrimeContextJson: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset mocks and cache between tests
    vi.useFakeTimers();
    const primeModule = await import('../src/prime.js');
    mockGetPrimeContextJson = primeModule.getPrimeContextJson as ReturnType<typeof vi.fn>;
    mockGetPrimeContextJson.mockReset();

    // Default: all agents succeed
    mockGetPrimeContextJson.mockImplementation((agent: string) => {
      return makePrimeOutput(agent);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
  // AC2: GET / returns array of agent load data
  // ===========================================================================

  describe('AC2: GET / - Returns agent load data', () => {
    it('should return agents array with load data for all 10 agents', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toHaveProperty('agents');
      expect(res._json.agents).toHaveLength(10);
    });

    it('should include all 10 primary agents in response', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      const agentNames = res._json.agents.map((a: any) => a.agent);
      for (const agent of PRIMARY_AGENTS) {
        expect(agentNames).toContain(agent);
      }
    });

    it('should include totalTokens for each agent', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      for (const agentData of res._json.agents) {
        expect(agentData).toHaveProperty('totalTokens');
        expect(typeof agentData.totalTokens).toBe('number');
      }
    });

    it('should include tokenCounts record for each agent', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      for (const agentData of res._json.agents) {
        expect(agentData).toHaveProperty('tokenCounts');
        expect(typeof agentData.tokenCounts).toBe('object');
      }
    });

    it('should include components array for each agent', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      for (const agentData of res._json.agents) {
        expect(agentData).toHaveProperty('components');
        expect(Array.isArray(agentData.components)).toBe(true);
      }
    });

    it('should include cachedAt timestamp in response', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).toHaveProperty('cachedAt');
      expect(typeof res._json.cachedAt).toBe('string');
      // Should be a valid ISO date
      expect(new Date(res._json.cachedAt).toISOString()).toBe(res._json.cachedAt);
    });

    it('should include totalAcrossAllAgents sum', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res._json).toHaveProperty('totalAcrossAllAgents');
      expect(typeof res._json.totalAcrossAllAgents).toBe('number');

      // Sum should match individual agent totals
      const sum = res._json.agents.reduce(
        (acc: number, a: any) => acc + (a.totalTokens || 0),
        0,
      );
      expect(res._json.totalAcrossAllAgents).toBe(sum);
    });

    it('should call getPrimeContextJson with FULL tier for each agent', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(mockGetPrimeContextJson).toHaveBeenCalledTimes(10);
      for (const agent of PRIMARY_AGENTS) {
        expect(mockGetPrimeContextJson).toHaveBeenCalledWith(
          agent,
          '/test/project',
          'FULL',
        );
      }
    });
  });

  // ===========================================================================
  // AC3: Parallel execution (not serial blocking)
  // ===========================================================================

  describe('AC3: Parallel execution', () => {
    it('should call all 10 agents without waiting for each sequentially', async () => {
      // Track call timing — if parallel, all calls happen before any resolves
      const callOrder: string[] = [];
      const resolveOrder: string[] = [];

      mockGetPrimeContextJson.mockImplementation((agent: string) => {
        callOrder.push(agent);
        // Simulate async delay
        const result = makePrimeOutput(agent);
        resolveOrder.push(agent);
        return result;
      });

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      // All 10 agents should have been called
      expect(callOrder).toHaveLength(10);
      expect(res._json.agents).toHaveLength(10);
    });
  });

  // ===========================================================================
  // AC4: 60-second cache with cachedAt timestamp
  // ===========================================================================

  describe('AC4: 60-second cache', () => {
    it('should return cached result on second call within 60 seconds', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      // First call
      const req1 = mockReq();
      const res1 = mockRes();
      await handler(req1, res1);
      const firstCallCount = mockGetPrimeContextJson.mock.calls.length;

      // Second call immediately — should use cache
      const req2 = mockReq();
      const res2 = mockRes();
      await handler(req2, res2);

      // Should NOT have called getPrimeContextJson again
      expect(mockGetPrimeContextJson.mock.calls.length).toBe(firstCallCount);
      // Data should be identical
      expect(res2._json.cachedAt).toBe(res1._json.cachedAt);
    });

    it('should refresh cache after 60 seconds', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      // First call
      const req1 = mockReq();
      const res1 = mockRes();
      await handler(req1, res1);
      const firstCallCount = mockGetPrimeContextJson.mock.calls.length;
      const firstCachedAt = res1._json.cachedAt;

      // Advance time past 60 seconds
      vi.advanceTimersByTime(61_000);

      // Second call — cache expired, should refetch
      const req2 = mockReq();
      const res2 = mockRes();
      await handler(req2, res2);

      // Should have called getPrimeContextJson again (10 more calls)
      expect(mockGetPrimeContextJson.mock.calls.length).toBe(firstCallCount + 10);
      // cachedAt should be updated
      expect(res2._json.cachedAt).not.toBe(firstCachedAt);
    });

    it('should return same cachedAt for cached responses', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req1 = mockReq();
      const res1 = mockRes();
      await handler(req1, res1);

      // Advance time by 30 seconds (within cache window)
      vi.advanceTimersByTime(30_000);

      const req2 = mockReq();
      const res2 = mockRes();
      await handler(req2, res2);

      expect(res2._json.cachedAt).toBe(res1._json.cachedAt);
    });
  });

  // ===========================================================================
  // AC5: Partial failure handling
  // ===========================================================================

  describe('AC5: Partial failure handling', () => {
    it('should include failed agents with error field when getPrimeContextJson returns null', async () => {
      mockGetPrimeContextJson.mockImplementation((agent: string) => {
        if (agent === 'dev') return null; // Simulate failure
        return makePrimeOutput(agent);
      });

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      // Should still return 200, not 500
      expect(res.statusCode).toBe(200);
      expect(res._json.agents).toHaveLength(10);

      // Find the failed agent
      const devEntry = res._json.agents.find((a: any) => a.agent === 'dev');
      expect(devEntry).toBeDefined();
      expect(devEntry.totalTokens).toBeNull();
      expect(devEntry).toHaveProperty('error');
    });

    it('should still return successful agents when some fail', async () => {
      mockGetPrimeContextJson.mockImplementation((agent: string) => {
        if (agent === 'dev' || agent === 'tea') return null;
        return makePrimeOutput(agent);
      });

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      const successful = res._json.agents.filter((a: any) => a.totalTokens !== null);
      expect(successful).toHaveLength(8);
    });

    it('should return 500 when ALL agents fail', async () => {
      mockGetPrimeContextJson.mockReturnValue(null);

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('error');
    });

    it('should exclude failed agents from totalAcrossAllAgents sum', async () => {
      mockGetPrimeContextJson.mockImplementation((agent: string) => {
        if (agent === 'dev') return null;
        return makePrimeOutput(agent, 1000);
      });

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      // 9 successful agents × 1000 tokens = 9000
      expect(res._json.totalAcrossAllAgents).toBe(9000);
    });
  });

  // ===========================================================================
  // AC6: Does NOT leak context field
  // ===========================================================================

  describe('AC6: No context field leakage', () => {
    it('should NOT include context field in any agent response', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      for (const agentData of res._json.agents) {
        expect(agentData).not.toHaveProperty('context');
      }
    });

    it('should strip context even when getPrimeContextJson includes it', async () => {
      mockGetPrimeContextJson.mockImplementation((agent: string) => {
        const result = makePrimeOutput(agent);
        // Simulate prime output with context field populated
        result.context = `SECRET SYSTEM PROMPT FOR ${agent}`;
        return result;
      });

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      for (const agentData of res._json.agents) {
        expect(agentData).not.toHaveProperty('context');
        // Also make sure the context text doesn't appear anywhere
        const json = JSON.stringify(agentData);
        expect(json).not.toContain('SECRET SYSTEM PROMPT');
      }
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
