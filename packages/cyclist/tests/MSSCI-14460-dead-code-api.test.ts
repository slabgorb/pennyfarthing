/**
 * MSSCI-14460: Dead Code API route tests (Story 81-3)
 *
 * Tests the createDeadCodeRouter Express router that wraps the Python deadcode module.
 * Pattern mirrors hotspots.ts / code-markers.ts route.
 *
 * Acceptance Criteria tested:
 * - AC1: GET /api/dead-code?days=180&layer=all returns valid JSON matching DeadCodeResult
 * - AC2: GET /api/dead-code?days=180&layer=stale returns only stale files
 * - AC3: GET /api/dead-code?days=180&layer=exports returns only unused exports
 * - AC4: GET /api/dead-code?repo=pennyfarthing&days=180 scopes to named repo
 * - AC5: PYTHONPATH set to join(projectDir, 'pennyfarthing')
 * - AC6: 30-second execFile timeout
 * - AC7: createDeadCodeRouter exported from api/index.ts
 * - AC8: Router mounted at /api/dead-code in server.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecFileException } from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => {
  const fn = vi.fn();
  return { default: { execFile: fn }, execFile: fn };
});

import { execFile } from 'child_process';
import { createDeadCodeRouter } from '../src/api/dead-code.js';

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

// --- Helpers ---

function mockReq(query?: Record<string, string>) {
  return { query: query || {} } as any;
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

function getRouteHandler(
  router: any,
  method: 'get' | 'post' | 'delete',
  path: string,
): (req: any, res: any) => void {
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

// --- Mock Data ---

const MOCK_DEAD_CODE_ALL = JSON.stringify({
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  time_window_days: 180,
  stale_files: [
    {
      path: 'src/old-util.ts',
      last_commit_date: '2025-06-01T00:00:00Z',
      days_since_last_commit: 250,
      size_bytes: 1024,
    },
  ],
  total_files: 1,
  unused_exports: [
    {
      symbol: 'unusedHelper',
      file: 'src/utils.ts',
      line: 42,
      export_type: 'named',
    },
  ],
  error: null,
});

const MOCK_DEAD_CODE_STALE = JSON.stringify({
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  time_window_days: 180,
  stale_files: [
    {
      path: 'src/old-util.ts',
      last_commit_date: '2025-06-01T00:00:00Z',
      days_since_last_commit: 250,
      size_bytes: 1024,
    },
  ],
  total_files: 1,
  error: null,
});

const MOCK_DEAD_CODE_EXPORTS = JSON.stringify({
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  unused_exports: [
    {
      symbol: 'unusedHelper',
      file: 'src/utils.ts',
      line: 42,
      export_type: 'named',
    },
  ],
  total_exports_scanned: 150,
  error: null,
});

// --- Tests ---

describe('MSSCI-14460: Dead Code API (Story 81-3)', () => {
  const getProjectDir = () => '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: GET /api/dead-code?layer=all returns combined JSON', () => {
    it('should create a router with GET / route', () => {
      const router = createDeadCodeRouter(getProjectDir);
      expect(router).toBeDefined();
      const handler = getRouteHandler(router, 'get', '/');
      expect(handler).toBeDefined();
    });

    it('should call python3 with deadcode module', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180', layer: 'all' });
      const res = mockRes();
      handler(req, res);

      expect(mockExecFile).toHaveBeenCalledWith(
        'python3',
        expect.arrayContaining(['-m', 'pf.deadcode']),
        expect.objectContaining({
          timeout: 30000,
        }),
        expect.any(Function),
      );
    });

    it('should return parsed JSON on success', async () => {
      // layer=all runs two commands: stale + exports
      mockExecFile.mockImplementation((_cmd: any, args: any, _opts: any, callback: any) => {
        const subcommand = args.find((a: string) => a === 'stale' || a === 'exports');
        if (subcommand === 'stale') {
          callback(null, MOCK_DEAD_CODE_STALE, '');
        } else {
          callback(null, MOCK_DEAD_CODE_EXPORTS, '');
        }
        return {} as any;
      });

      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180', layer: 'all' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toHaveProperty('success', true);
      expect(res._json).toHaveProperty('stale_files');
      expect(res._json.stale_files).toHaveLength(1);
      expect(res._json).toHaveProperty('unused_exports');
      expect(res._json.unused_exports).toHaveLength(1);
    });
  });

  describe('AC2: layer=stale returns only stale files', () => {
    it('should pass "stale" as subcommand when layer=stale', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180', layer: 'stale' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      // The layer value should appear as a subcommand in the args
      expect(args).toContain('stale');
    });
  });

  describe('AC3: layer=exports returns only unused exports', () => {
    it('should pass "exports" as subcommand when layer=exports', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180', layer: 'exports' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('exports');
    });
  });

  describe('AC4: repo param scopes analysis', () => {
    it('should pass --repo when repo query param is provided', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing', days: '180' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--repo');
      expect(args).toContain('pennyfarthing');
    });

    it('should pass --path when repo is not provided', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--path');
      expect(args).toContain('/test/project');
    });
  });

  describe('AC5: PYTHONPATH configuration', () => {
    it('should set PYTHONPATH to pennyfarthing subdir', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180' });
      const res = mockRes();
      handler(req, res);

      const opts = mockExecFile.mock.calls[0][2] as any;
      expect(opts.env.PYTHONPATH).toBe('/test/project/pennyfarthing/pennyfarthing-dist');
      expect(opts.cwd).toBe('/test/project/pennyfarthing/pennyfarthing-dist');
    });
  });

  describe('AC6: 30-second timeout', () => {
    it('should set execFile timeout to 30000ms', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180' });
      const res = mockRes();
      handler(req, res);

      const opts = mockExecFile.mock.calls[0][2] as any;
      expect(opts.timeout).toBe(30000);
    });
  });

  describe('Default parameter values', () => {
    it('should default days to 180', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--days');
      const daysIdx = args.indexOf('--days');
      expect(args[daysIdx + 1]).toBe('180');
    });

    it('should default layer to "all" (runs both stale and exports commands)', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, MOCK_DEAD_CODE_STALE, '');
        return {} as any;
      });

      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      await handler(req, res);

      // layer=all runs two separate commands: stale + exports
      expect(mockExecFile).toHaveBeenCalledTimes(2);
      const firstArgs = mockExecFile.mock.calls[0][1] as string[];
      const secondArgs = mockExecFile.mock.calls[1][1] as string[];
      expect(firstArgs).toContain('stale');
      expect(secondArgs).toContain('exports');
    });

    it('should pass --format json', () => {
      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--format');
      expect(args).toContain('json');
    });
  });

  describe('Error handling', () => {
    it('should return 500 with error on execFile failure', async () => {
      const execError: ExecFileException = new Error('Python failed');
      execError.code = 'ERR';
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(execError, '', 'Module not found');
        return {} as any;
      });

      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180', layer: 'stale' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json).toHaveProperty('error');
    });

    it('should return 500 on invalid JSON from Python', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, 'not valid json{{{', '');
        return {} as any;
      });

      const router = createDeadCodeRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ days: '180', layer: 'stale' });
      const res = mockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json.error).toContain('parse');
    });
  });
});
