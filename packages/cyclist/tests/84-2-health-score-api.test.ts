/**
 * 84-2: Health Score API Endpoint Tests
 *
 * Tests for GET /api/health-score Express route that shells out
 * to Python healthscore module and returns JSON.
 *
 * Story: MSSCI-14471 - Health score API + gauge component
 * Epic: epic-84 (Composite Health Score)
 *
 * Acceptance Criteria covered:
 * - AC1: GET /api/health-score endpoint returns JSON with score 0-100 and dimension breakdown
 * - AC2: Endpoint calls Python healthscore module via child process
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';

// Import directly from core source so vitest can apply child_process mock
// (re-export through cyclist/src/api/health-score.ts goes through @pennyfarthing/core dist
// which vitest treats as external and doesn't apply mocks to)
import { createHealthScoreRouter } from '../../core/src/server/api/health-score';

// Mock fs.existsSync to bypass pf directory check
// (the implementation guards with existsSync before calling execFile)
vi.mock('fs', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    __esModule: true,
    default: { ...actual, existsSync: vi.fn(() => true) },
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

// Mock child_process.execFile (include default export for ESM compat)
vi.mock('child_process', () => {
  const fn = vi.fn();
  return { default: { execFile: fn }, execFile: fn };
});

import { execFile } from 'child_process';
const mockExecFile = vi.mocked(execFile);

// Helper: create mock Express req/res
function createMockReqRes() {
  const req = { query: {} } as any;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as any;
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// AC1: Endpoint returns JSON with score and dimensions
// ============================================================================

describe('AC1: GET /api/health-score returns health score JSON', () => {
  it('should export createHealthScoreRouter as a function', () => {
    expect(createHealthScoreRouter).toBeDefined();
    expect(typeof createHealthScoreRouter).toBe('function');
  });

  it('should return an Express Router', () => {
    const router = createHealthScoreRouter(() => '/fake/path');
    expect(router).toBeDefined();
    // Router has .get method from Express
    expect(typeof router.get).toBe('function');
  });

  it('should return successful health score with all dimensions', () => {
    const getProjectDir = () => '/projects/test';
    const router = createHealthScoreRouter(getProjectDir);

    const fullResponse = JSON.stringify({
      success: true,
      composite_score: 72.3,
      dimensions: [
        { name: 'churn', score: 54.8, weight: 0.15 },
        { name: 'todo_density', score: 74.0, weight: 0.15 },
      ],
      cached: false,
    });

    // Simulate successful Python execution
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, fullResponse, '');
      return {} as any;
    });

    const { req, res } = createMockReqRes();

    // Find the GET / handler registered on the router
    // We need to invoke it through the router's stack
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    expect(layer).toBeDefined();

    layer.route.stack[0].handle(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        composite_score: 72.3,
      })
    );
  });

  it('should return error JSON when Python module fails', () => {
    const router = createHealthScoreRouter(() => '/projects/test');

    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(new Error('Python not found'), '', 'python3: command not found');
      return {} as any;
    });

    const { req, res } = createMockReqRes();
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    layer.route.stack[0].handle(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
  });

  it('should return error JSON when Python output is not valid JSON', () => {
    const router = createHealthScoreRouter(() => '/projects/test');

    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, 'not json output', '');
      return {} as any;
    });

    const { req, res } = createMockReqRes();
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    layer.route.stack[0].handle(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      })
    );
  });
});

// ============================================================================
// AC2: Endpoint calls Python healthscore module via child process
// ============================================================================

describe('AC2: Calls Python healthscore module via child process', () => {
  it('should call python3 with -m pf.healthscore', () => {
    const router = createHealthScoreRouter(() => '/projects/test');

    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, '{"success": true, "composite_score": 50}', '');
      return {} as any;
    });

    const { req, res } = createMockReqRes();
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    layer.route.stack[0].handle(req, res);

    expect(mockExecFile).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['-m', 'pf.healthscore']),
      expect.objectContaining({
        timeout: expect.any(Number),
      }),
      expect.any(Function),
    );
  });

  it('should pass --format json to Python CLI', () => {
    const router = createHealthScoreRouter(() => '/projects/test');

    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, '{"success": true}', '');
      return {} as any;
    });

    const { req, res } = createMockReqRes();
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    layer.route.stack[0].handle(req, res);

    const calledArgs = mockExecFile.mock.calls[0][1] as string[];
    expect(calledArgs).toContain('--format');
    expect(calledArgs).toContain('json');
  });

  it('should set PYTHONPATH to pennyfarthing subdirectory', () => {
    const router = createHealthScoreRouter(() => '/projects/test');

    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, '{"success": true}', '');
      return {} as any;
    });

    const { req, res } = createMockReqRes();
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    layer.route.stack[0].handle(req, res);

    const calledOpts = mockExecFile.mock.calls[0][2] as any;
    expect(calledOpts.env.PYTHONPATH).toContain('pennyfarthing');
  });

  it('should set timeout to 60000ms (health score runs multiple dimension probes)', () => {
    const router = createHealthScoreRouter(() => '/projects/test');

    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, '{"success": true}', '');
      return {} as any;
    });

    const { req, res } = createMockReqRes();
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get
    );
    layer.route.stack[0].handle(req, res);

    const calledOpts = mockExecFile.mock.calls[0][2] as any;
    expect(calledOpts.timeout).toBe(60000);
  });
});
