/**
 * Story 83-3: Dependencies API route tests
 * AC2: GET /api/dependencies returns DependenciesResult JSON from Python module
 *
 * Tests the createDependenciesRouter function that wraps the Python dependencies module.
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
import { createDependenciesRouter } from '../src/api/dependencies.js';

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

const MOCK_DEPENDENCIES_RESPONSE = JSON.stringify({
  success: true,
  target_path: '/test/project/pennyfarthing',
  outdated: [
    {
      name: 'express',
      current: '4.18.0',
      wanted: '4.18.2',
      latest: '5.0.0',
      type: 'dependencies',
    },
    {
      name: 'vitest',
      current: '1.0.0',
      wanted: '1.6.0',
      latest: '2.0.0',
      type: 'devDependencies',
    },
  ],
  advisories: [
    { severity: 'high', count: 1 },
    { severity: 'moderate', count: 3 },
  ],
  error: null,
});

// --- Tests ---

describe('MSSCI-14468: Dependencies API (Story 83-3)', () => {
  const getProjectDir = () => '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC2: Express endpoint returns DependenciesResult JSON from Python module', () => {
    it('should create a router with GET / route', () => {
      const router = createDependenciesRouter(getProjectDir);
      expect(router).toBeDefined();
      const handler = getRouteHandler(router, 'get', '/');
      expect(handler).toBeDefined();
    });

    it('should call python3 with dependencies module', () => {
      const router = createDependenciesRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(mockExecFile).toHaveBeenCalledWith(
        'python3',
        expect.arrayContaining(['-m', 'pennyfarthing_scripts.dependencies']),
        expect.objectContaining({
          timeout: 30000,
        }),
        expect.any(Function),
      );
    });

    it('should pass --format json by default', () => {
      const router = createDependenciesRouter(getProjectDir);
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
      const router = createDependenciesRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--path');
      expect(args).toContain('/test/project');
    });

    it('should return parsed JSON on success', () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, MOCK_DEPENDENCIES_RESPONSE, '');
        return {} as any;
      });

      const router = createDependenciesRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json).toHaveProperty('success', true);
      expect(res._json).toHaveProperty('outdated');
      expect(res._json.outdated).toHaveLength(2);
      expect(res._json.outdated[0]).toHaveProperty('name', 'express');
      expect(res._json).toHaveProperty('advisories');
      expect(res._json.advisories).toHaveLength(2);
    });

    it('should return 500 with error on execFile failure', () => {
      const execError: ExecFileException = new Error('Python failed');
      execError.code = 'ERR';
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(execError, '', 'Module not found');
        return {} as any;
      });

      const router = createDependenciesRouter(getProjectDir);
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

      const router = createDependenciesRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json).toHaveProperty('success', false);
      expect(res._json.error).toContain('parse');
    });

    it('should set PYTHONPATH to pennyfarthing subdir', () => {
      const router = createDependenciesRouter(getProjectDir);
      const handler = getRouteHandler(router, 'get', '/');

      const req = mockReq();
      const res = mockRes();
      handler(req, res);

      const opts = mockExecFile.mock.calls[0][2] as any;
      expect(opts.env.PYTHONPATH).toBe('/test/project/pennyfarthing');
      expect(opts.cwd).toBe('/test/project/pennyfarthing');
    });
  });
});
