/**
 * Story 83-3: Complexity API route tests
 * AC1: GET /api/complexity returns ComplexityResult JSON from Python module
 *
 * Tests the createComplexityRouter function that wraps the Python complexity module.
 * Pattern mirrors hotspots.ts / code-markers.ts routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecFileException } from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => {
  const fn = vi.fn();
  return { default: { execFile: fn }, execFile: fn };
});

import { execFile } from 'child_process';
import { createComplexityRouter } from '../src/api/complexity.js';

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

const MOCK_COMPLEXITY_RESPONSE = JSON.stringify({
  success: true,
  target_path: '/test/project/pennyfarthing',
  file_count: 3,
  files: [
    {
      path: 'src/server.ts',
      total_lines: 250,
      longest_function: 45,
      avg_cyclomatic_complexity: 4.2,
      max_nesting_depth: 3,
      function_count: 8,
    },
    {
      path: 'src/utils.ts',
      total_lines: 80,
      longest_function: 20,
      avg_cyclomatic_complexity: 2.1,
      max_nesting_depth: 2,
      function_count: 5,
    },
    {
      path: 'src/api/hotspots.ts',
      total_lines: 65,
      longest_function: 30,
      avg_cyclomatic_complexity: 3.0,
      max_nesting_depth: 2,
      function_count: 1,
    },
  ],
  error: null,
});

// --- Tests ---

describe('MSSCI-14468: Complexity API (Story 83-3)', () => {
  const getProjectDir = () => '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: Express endpoint returns ComplexityResult JSON from Python module', () => {
    it('should create a router with GET / route', () => {
      const router = createComplexityRouter(getProjectDir);
      expect(router).toBeDefined();
      const handler = getRouteHandler(router, 'get', '/');
      expect(handler).toBeDefined();
    });

    it('should call python3 with complexity module', () => {
      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(mockExecFile).toHaveBeenCalledWith(
        'python3',
        expect.arrayContaining(['-m', 'pf.complexity']),
        expect.objectContaining({
          timeout: 30000,
        }),
        expect.any(Function),
      );
    });

    it('should pass --format json by default', () => {
      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--format');
      const fmtIdx = args.indexOf('--format');
      expect(args[fmtIdx + 1]).toBe('json');
    });

    it('should pass --path defaulting to project dir', () => {
      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--path');
      expect(args).toContain('/test/project');
    });

    it('should pass --top when top query param is provided', () => {
      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ top: '20' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--top');
      expect(args).toContain('20');
    });

    it('should return parsed JSON on success', () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, MOCK_COMPLEXITY_RESPONSE, '');
        return {} as any;
      });

      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toHaveProperty('success', true);
      expect(res._json).toHaveProperty('files');
      expect(res._json.files).toHaveLength(3);
      expect(res._json.files[0]).toHaveProperty('avg_cyclomatic_complexity');
    });

    it('should return 500 with error on execFile failure', () => {
      const execError: ExecFileException = new Error('Python failed');
      execError.code = 'ERR';
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(execError, '', 'Module not found');
        return {} as any;
      });

      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json).toHaveProperty('error');
    });

    it('should return 500 on invalid JSON from Python', () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, 'not valid json{{{', '');
        return {} as any;
      });

      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json.error).toContain('parse');
    });

    it('should set PYTHONPATH to pennyfarthing subdir', () => {
      const router = createComplexityRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const opts = mockExecFile.mock.calls[0][2] as any;
      expect(opts.env.PYTHONPATH).toBe('/test/project/pennyfarthing/pennyfarthing-dist');
      expect(opts.cwd).toBe('/test/project/pennyfarthing/pennyfarthing-dist');
    });
  });
});
