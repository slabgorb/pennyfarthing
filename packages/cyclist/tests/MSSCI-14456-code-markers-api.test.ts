/**
 * Story 80-3: Code markers API route tests
 * AC1: Express endpoint GET /api/code-markers?repo=&days=&type= returns JSON from Python module
 *
 * Tests the createCodeMarkersRouter function that wraps the Python codemarkers module.
 * Pattern mirrors hotspots.ts route with additional `type` query parameter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecFileException } from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => {
  const fn = vi.fn();
  return { default: { execFile: fn }, execFile: fn };
});

import { execFile } from 'child_process';
import { createCodeMarkersRouter } from '../src/api/code-markers.js';

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

const MOCK_CODE_MARKERS_RESPONSE = JSON.stringify({
  success: true,
  repo_name: 'pennyfarthing',
  repo_path: '/test/project/pennyfarthing',
  stale_threshold_days: 90,
  markers: [
    {
      path: 'src/server.ts',
      line: 42,
      marker_type: 'TODO',
      text: 'TODO: refactor this into separate module',
      author: 'testuser',
      date: '2025-11-15T10:30:00-05:00',
      age_days: 84,
      is_stale: false,
    },
    {
      path: 'src/utils.ts',
      line: 10,
      marker_type: 'FIXME',
      text: 'FIXME: handle edge case',
      author: 'testuser',
      date: '2025-06-01T10:00:00-05:00',
      age_days: 252,
      is_stale: true,
    },
  ],
  summary: {
    total_markers: 2,
    stale_markers: 1,
    by_type: { TODO: 1, FIXME: 1 },
  },
  error: null,
});

// --- Tests ---

describe('MSSCI-14456: Code Markers API (Story 80-3)', () => {
  const getProjectDir = () => '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: Express endpoint returns JSON from Python module', () => {
    it('should create a router with GET / route', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      expect(router).toBeDefined();
      // Should not throw when extracting handler
      const handler = getRouteHandler(router, 'get', '/');
      expect(handler).toBeDefined();
    });

    it('should call python3 with codemarkers module', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      expect(mockExecFile).toHaveBeenCalledWith(
        'python3',
        expect.arrayContaining(['-m', 'pf.codemarkers']),
        expect.objectContaining({
          timeout: 30000,
        }),
        expect.any(Function),
      );
    });

    it('should pass --days parameter defaulting to 90', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--days');
      const daysIdx = args.indexOf('--days');
      expect(args[daysIdx + 1]).toBe('90');
    });

    it('should pass custom days parameter', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing', days: '30' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      const daysIdx = args.indexOf('--days');
      expect(args[daysIdx + 1]).toBe('30');
    });

    it('should pass --repo when repo query param is provided', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--repo');
      expect(args).toContain('pennyfarthing');
    });

    it('should pass --path when repo is not provided', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--path');
      expect(args).toContain('/test/project');
    });

    it('should pass --type when type query param is provided', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing', type: 'stale' });
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--type');
      expect(args).toContain('stale');
    });

    it('should return parsed JSON on success', () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, MOCK_CODE_MARKERS_RESPONSE, '');
        return {} as any;
      });

      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toHaveProperty('success', true);
      expect(res._json).toHaveProperty('markers');
      expect(res._json.markers).toHaveLength(2);
      expect(res._json).toHaveProperty('summary');
    });

    it('should return 500 with error on execFile failure', () => {
      const execError: ExecFileException = new Error('Python failed');
      execError.code = 'ERR';
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(execError, '', 'Module not found');
        return {} as any;
      });

      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json).toHaveProperty('error');
    });

    it('should return 500 on invalid JSON from Python', () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, 'not valid json{{{', '');
        return {} as any;
      });

      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json.error).toContain('parse');
    });

    it('should set PYTHONPATH to pennyfarthing subdir', () => {
      const router = createCodeMarkersRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq({ repo: 'pennyfarthing' });
      const res = mockRes();
      handler(req, res);

      const opts = mockExecFile.mock.calls[0][2] as any;
      expect(opts.env.PYTHONPATH).toBe('/test/project/pennyfarthing/pennyfarthing-dist');
      expect(opts.cwd).toBe('/test/project/pennyfarthing/pennyfarthing-dist');
    });
  });
});
