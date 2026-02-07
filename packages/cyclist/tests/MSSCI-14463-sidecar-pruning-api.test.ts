/**
 * MSSCI-14463: Agent Load Analyzer — Story 82-2: Sidecar pruning API
 *
 * Tests the POST /api/agent-load/prune-sidecar endpoint that resets
 * a sidecar file to its template, computes tokensFreed, and invalidates
 * the agent-load cache.
 *
 * Acceptance Criteria:
 * - AC1: POST /api/agent-load/prune-sidecar endpoint in agent-load.ts
 * - AC2: Validates {agent, file} input against whitelists
 * - AC3: Reads current sidecar, computes tokensFreed via char count / 4
 * - AC4: Reads template from pennyfarthing-dist/templates/sidecar/{file}.template
 * - AC5: Replaces ${AGENT_NAME} placeholder with title-case agent name
 * - AC6: Writes template content to .pennyfarthing/sidecars/{agent}/{file}
 * - AC7: Clears the 82-1 GET cache after successful prune
 * - AC8: Returns {success: true, tokensFreed, agent, file}
 * - AC9: Error handling: 400 for invalid input, 404 for missing sidecar
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgentLoadRouter } from '../src/api/agent-load.js';

const PRIMARY_AGENTS = [
  'sm', 'tea', 'dev', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator',
] as const;

const VALID_SIDECAR_FILES = ['patterns.md', 'gotchas.md', 'decisions.md'] as const;

/**
 * Mock Express request with optional body and query
 */
function mockReq(body?: Record<string, unknown>, query?: Record<string, string>) {
  return {
    body: body || {},
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

// Template content for patterns.md (matches real template structure)
const PATTERNS_TEMPLATE = `# \${AGENT_NAME} Patterns

Capture successful patterns discovered during \${AGENT_NAME} work.

---

## Examples to Add

Keep 5-15 active patterns.
`;

// Existing sidecar content (much longer than template = positive tokensFreed)
const EXISTING_SIDECAR_CONTENT = `# Dev Patterns

Capture successful patterns discovered during Dev work.

## Pattern: Always Use Vitest

**Context:** Testing in Cyclist packages.
**Solution:** Use vitest with vi.mock for all tests.
**Example:**
\`\`\`typescript
import { vi } from 'vitest';
vi.mock('../src/module.js');
\`\`\`
**Why it works:** Consistent test runner across monorepo.

---

## Pattern: Express Router Testing

**Context:** Testing API routes without HTTP.
**Solution:** Extract route handler via router.stack.
**Why it works:** Fast unit tests, no server needed.

---

More content here to make the sidecar longer than the template...
This ensures tokensFreed is positive when pruning.
Additional lines of accumulated knowledge.
Even more patterns that have been added over time.
`;

// Mock fs and prime modules
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../src/prime.js', () => ({
  getPrimeContextJson: vi.fn(),
  getPrimeContextAsync: vi.fn(),
  buildPrimeCommand: vi.fn(),
  parsePrimeOutput: vi.fn(),
}));

describe('MSSCI-14463: Sidecar Pruning API (Story 82-2)', () => {
  let mockFs: {
    readFileSync: ReturnType<typeof vi.fn>;
    writeFileSync: ReturnType<typeof vi.fn>;
    existsSync: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    const fs = await import('node:fs');
    mockFs = {
      readFileSync: fs.readFileSync as ReturnType<typeof vi.fn>,
      writeFileSync: fs.writeFileSync as ReturnType<typeof vi.fn>,
      existsSync: fs.existsSync as ReturnType<typeof vi.fn>,
    };
    mockFs.readFileSync.mockReset();
    mockFs.writeFileSync.mockReset();
    mockFs.existsSync.mockReset();

    // Default: sidecar exists, template exists
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('.template')) {
        return PATTERNS_TEMPLATE;
      }
      return EXISTING_SIDECAR_CONTENT;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // AC1: POST /prune-sidecar endpoint exists
  // ===========================================================================

  describe('AC1: POST /prune-sidecar route exists', () => {
    it('should have a POST /prune-sidecar route registered on the router', () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  });

  // ===========================================================================
  // AC2: Input validation
  // ===========================================================================

  describe('AC2: Validates {agent, file} input', () => {
    it('should return 400 for invalid agent name', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'invalid-agent', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
      expect(res._json.error).toBeDefined();
    });

    it('should return 400 for invalid sidecar file name', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'secrets.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
      expect(res._json.error).toBeDefined();
    });

    it('should return 400 when agent field is missing', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
    });

    it('should return 400 when file field is missing', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
    });

    it('should accept all 10 valid primary agents', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      for (const agent of PRIMARY_AGENTS) {
        mockFs.readFileSync.mockReset();
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockImplementation((filePath: string) => {
          if (typeof filePath === 'string' && filePath.endsWith('.template')) {
            return PATTERNS_TEMPLATE;
          }
          return EXISTING_SIDECAR_CONTENT;
        });

        const req = mockReq({ agent, file: 'patterns.md' });
        const res = mockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res._json.success).toBe(true);
      }
    });

    it('should accept all 3 valid sidecar file names', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      for (const file of VALID_SIDECAR_FILES) {
        mockFs.readFileSync.mockReset();
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockImplementation((filePath: string) => {
          if (typeof filePath === 'string' && filePath.endsWith('.template')) {
            return PATTERNS_TEMPLATE;
          }
          return EXISTING_SIDECAR_CONTENT;
        });

        const req = mockReq({ agent: 'dev', file });
        const res = mockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res._json.success).toBe(true);
      }
    });
  });

  // ===========================================================================
  // AC3: tokensFreed calculation
  // ===========================================================================

  describe('AC3: Computes tokensFreed via character count / 4', () => {
    it('should compute tokensFreed as Math.floor((oldLen - newLen) / 4)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      // Template with AGENT_NAME replaced should be shorter than existing content
      const templateResolved = PATTERNS_TEMPLATE.replace(/\$\{AGENT_NAME\}/g, 'Dev');
      const expectedTokensFreed = Math.floor(
        (EXISTING_SIDECAR_CONTENT.length - templateResolved.length) / 4,
      );

      expect(res._json.tokensFreed).toBe(expectedTokensFreed);
      expect(res._json.tokensFreed).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // AC4: Template reading
  // ===========================================================================

  describe('AC4: Reads template from pennyfarthing-dist/templates/sidecar/', () => {
    it('should read the template file matching the requested sidecar', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      // Verify readFileSync was called with a path ending in patterns.md.template
      const templateCall = mockFs.readFileSync.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].endsWith('patterns.md.template'),
      );
      expect(templateCall).toBeDefined();
    });
  });

  // ===========================================================================
  // AC5: Agent name formatting
  // ===========================================================================

  describe('AC5: Replaces ${AGENT_NAME} with title-case agent name', () => {
    it('should format simple agent name to title case (dev → Dev)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      // Check that writeFileSync was called with content containing "Dev" not "${AGENT_NAME}"
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain('Dev');
      expect(writtenContent).not.toContain('${AGENT_NAME}');
    });

    it('should format hyphenated agent name (tech-writer → Tech-Writer)', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'tech-writer', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain('Tech-Writer');
      expect(writtenContent).not.toContain('${AGENT_NAME}');
    });

    it('should format ux-designer → UX-Designer', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'ux-designer', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain('UX-Designer');
    });
  });

  // ===========================================================================
  // AC6: Writes template to sidecar path
  // ===========================================================================

  describe('AC6: Writes template to .pennyfarthing/sidecars/{agent}/{file}', () => {
    it('should write to the correct sidecar path', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writePath = mockFs.writeFileSync.mock.calls[0][0] as string;
      expect(writePath).toContain('.pennyfarthing/sidecars/dev/patterns.md');
    });
  });

  // ===========================================================================
  // AC7: Cache invalidation
  // ===========================================================================

  describe('AC7: Clears GET cache after successful prune', () => {
    it('should invalidate the GET cache so next request fetches fresh data', async () => {
      const primeModule = await import('../src/prime.js');
      const mockGetPrime = primeModule.getPrimeContextJson as ReturnType<typeof vi.fn>;
      mockGetPrime.mockImplementation((agent: string) => ({
        context: `prompt for ${agent}`,
        tier: 'FULL',
        agentName: agent,
        tokenCounts: { agent_definition: 1000 },
        totalTokens: 1000,
        components: [],
      }));

      const router = createAgentLoadRouter(() => '/test/project');
      const getHandler = getRouteHandler(router, 'get', '/');
      const postHandler = getRouteHandler(router, 'post', '/prune-sidecar');

      // First GET — populates cache
      const req1 = mockReq();
      const res1 = mockRes();
      await getHandler(req1, res1);
      const callCountAfterFirstGet = mockGetPrime.mock.calls.length;

      // POST prune — should clear cache
      const pruneReq = mockReq({ agent: 'dev', file: 'patterns.md' });
      const pruneRes = mockRes();
      await postHandler(pruneReq, pruneRes);
      expect(pruneRes._json.success).toBe(true);

      // Second GET — should refetch (cache was invalidated)
      const req2 = mockReq();
      const res2 = mockRes();
      await getHandler(req2, res2);

      // Should have called getPrimeContextJson again (10 more calls)
      expect(mockGetPrime.mock.calls.length).toBe(callCountAfterFirstGet + 10);
    });
  });

  // ===========================================================================
  // AC8: Response shape
  // ===========================================================================

  describe('AC8: Returns {success, tokensFreed, agent, file}', () => {
    it('should return success response with all required fields', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toEqual(
        expect.objectContaining({
          success: true,
          tokensFreed: expect.any(Number),
          agent: 'dev',
          file: 'patterns.md',
        }),
      );
    });
  });

  // ===========================================================================
  // AC9: Error handling
  // ===========================================================================

  describe('AC9: Error handling — 400 and 404', () => {
    it('should return 404 when sidecar file does not exist', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        if (typeof filePath === 'string' && filePath.includes('sidecars/')) {
          return false;
        }
        return true; // template exists
      });

      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res._json.success).toBe(false);
      expect(res._json.error).toBeDefined();
    });

    it('should return 400 with descriptive error for invalid agent', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'hacker', file: 'patterns.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
      expect(typeof res._json.error).toBe('string');
    });

    it('should return 400 with descriptive error for invalid file', async () => {
      const router = createAgentLoadRouter(() => '/test/project');
      const handler = getRouteHandler(router, 'post', '/prune-sidecar');

      const req = mockReq({ agent: 'dev', file: 'malware.md' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
      expect(typeof res._json.error).toBe('string');
    });
  });
});
