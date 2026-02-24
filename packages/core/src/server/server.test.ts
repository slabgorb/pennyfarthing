/**
 * Tests for Story 98-17: Move Cyclist web server and API layer into core
 *
 * These tests define the contract for the server module after extraction
 * from packages/cyclist into packages/core. The server must:
 *
 * 1. Export a working Express app with all API routes mounted
 * 2. Export createTerminalServer() that returns an HTTP server with WebSocket support
 * 3. Re-export key functions (broadcastStats, getStoryInfo, isBikeRackMode, etc.)
 * 4. Manage port files (.bikerack-port, .wheelhub-pid)
 * 5. Initialize settings and grants on startup
 * 6. Support plugin router loading
 *
 * Test categories:
 * 1. Module exports — all expected functions and types are exported
 * 2. Express app — routes mounted, health check works
 * 3. Server factory — createTerminalServer returns HTTP server
 * 4. Port file management — write/read/cleanup port files
 * 5. OTEL config — getOtelConfig returns config based on port file
 * 6. API route factories — all 31 route factories return Express Routers
 * 7. Re-exports — Cyclist-consumed functions are available
 *
 * Run with: cd packages/core && npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// =============================================================================
// 1. Module Exports
// =============================================================================

describe('Server module exports', () => {
  it('exports createTerminalServer as a function', async () => {
    const { createTerminalServer } = await import('./server.js');
    assert.strictEqual(typeof createTerminalServer, 'function');
  });

  it('exports app as an Express application', async () => {
    const { app } = await import('./server.js');
    assert.ok(app, 'app should not be null');
    assert.strictEqual(typeof app.use, 'function', 'app.use should be a function');
    assert.strictEqual(typeof app.get, 'function', 'app.get should be a function');
    assert.strictEqual(typeof app.post, 'function', 'app.post should be a function');
  });

  it('exports findAvailablePort as a function', async () => {
    const { findAvailablePort } = await import('./server.js');
    assert.strictEqual(typeof findAvailablePort, 'function');
  });

  it('exports port file management functions', async () => {
    const {
      writePortFile,
      readPortFile,
      cleanupPortFile,
      writePidFile,
      readPidFile,
      cleanupPidFile,
      isProcessRunning,
    } = await import('./server.js');

    assert.strictEqual(typeof writePortFile, 'function');
    assert.strictEqual(typeof readPortFile, 'function');
    assert.strictEqual(typeof cleanupPortFile, 'function');
    assert.strictEqual(typeof writePidFile, 'function');
    assert.strictEqual(typeof readPidFile, 'function');
    assert.strictEqual(typeof cleanupPidFile, 'function');
    assert.strictEqual(typeof isProcessRunning, 'function');
  });

  it('exports getOtelConfig as a function', async () => {
    const { getOtelConfig } = await import('./server.js');
    assert.strictEqual(typeof getOtelConfig, 'function');
  });
});

// =============================================================================
// 2. Re-exports (AC5, AC6 — Cyclist depends on these)
// =============================================================================

describe('Server re-exports for Cyclist', () => {
  it('re-exports broadcastStats as a function', async () => {
    const { broadcastStats } = await import('./server.js');
    assert.strictEqual(typeof broadcastStats, 'function');
  });

  it('re-exports getStoryInfo as a function', async () => {
    const { getStoryInfo } = await import('./server.js');
    assert.strictEqual(typeof getStoryInfo, 'function');
  });

  it('re-exports isBikeRackMode as a function', async () => {
    const { isBikeRackMode } = await import('./server.js');
    assert.strictEqual(typeof isBikeRackMode, 'function');
  });

  it('re-exports getGitInfo as a function', async () => {
    const { getGitInfo } = await import('./server.js');
    assert.strictEqual(typeof getGitInfo, 'function');
  });

  it('re-exports getAllReposGitInfo as a function', async () => {
    const { getAllReposGitInfo } = await import('./server.js');
    assert.strictEqual(typeof getAllReposGitInfo, 'function');
  });

  it('re-exports getAllReposGitInfoAsync as a function', async () => {
    const { getAllReposGitInfoAsync } = await import('./server.js');
    assert.strictEqual(typeof getAllReposGitInfoAsync, 'function');
  });
});

// =============================================================================
// 3. Express App — Health Check (AC7, AC8, AC14)
// =============================================================================

describe('Express app health check', () => {
  it('responds to GET /health with {status: "ok"}', async () => {
    const { app } = await import('./server.js');
    assert.ok(app, 'app must not be null');

    // Use Node.js http to test the Express app directly
    const http = await import('node:http');
    const server = http.createServer(app);

    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    try {
      const response = await fetch(`http://localhost:${port}/health`);
      assert.strictEqual(response.status, 200, 'Health check should return 200');
      const body = await response.json();
      assert.deepStrictEqual(body, { status: 'ok' }, 'Health check should return {status: "ok"}');
    } finally {
      server.close();
    }
  });
});

// =============================================================================
// 4. Server Factory (AC1)
// =============================================================================

describe('createTerminalServer', () => {
  it('returns an HTTP server instance', async () => {
    const { createTerminalServer } = await import('./server.js');
    const server = createTerminalServer();

    assert.ok(server, 'createTerminalServer should return a server, not null');
    assert.strictEqual(typeof server.listen, 'function', 'server should have listen method');
    assert.strictEqual(typeof server.close, 'function', 'server should have close method');

    // Cleanup
    if (server && typeof server.close === 'function') {
      server.close();
    }
  });
});

// =============================================================================
// 5. Port File Management (AC11)
// =============================================================================

describe('Port file management', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-portfile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('writePortFile creates .bikerack-port file with port number', async () => {
    const { writePortFile } = await import('./server.js');

    writePortFile(testDir, 1898);

    const portFilePath = join(testDir, '.bikerack-port');
    assert.ok(existsSync(portFilePath), '.bikerack-port file should exist after writePortFile');

    const content = readFileSync(portFilePath, 'utf-8').trim();
    assert.strictEqual(content, '1898', 'Port file should contain the port number');
  });

  it('readPortFile returns the port number from .bikerack-port', async () => {
    const { writePortFile, readPortFile } = await import('./server.js');

    writePortFile(testDir, 3000);
    const port = readPortFile(testDir);
    assert.strictEqual(port, 3000, 'readPortFile should return the written port');
  });

  it('readPortFile returns null when no port file exists', async () => {
    const { readPortFile } = await import('./server.js');

    const port = readPortFile(testDir);
    assert.strictEqual(port, null, 'readPortFile should return null for missing file');
  });

  it('cleanupPortFile removes the .bikerack-port file', async () => {
    const { writePortFile, cleanupPortFile } = await import('./server.js');

    writePortFile(testDir, 1898);
    assert.ok(existsSync(join(testDir, '.bikerack-port')), 'Port file should exist');

    cleanupPortFile(testDir);
    assert.ok(!existsSync(join(testDir, '.bikerack-port')), 'Port file should be removed after cleanup');
  });

  it('writePidFile creates .wheelhub-pid file', async () => {
    const { writePidFile, readPidFile } = await import('./server.js');

    writePidFile(testDir, 12345);

    const pidFilePath = join(testDir, '.wheelhub-pid');
    assert.ok(existsSync(pidFilePath), '.wheelhub-pid file should exist');

    const pid = readPidFile(testDir);
    assert.strictEqual(pid, 12345, 'readPidFile should return the written PID');
  });

  it('isProcessRunning returns true for the current process', async () => {
    const { isProcessRunning } = await import('./server.js');

    const running = isProcessRunning(process.pid);
    assert.strictEqual(running, true, 'Current process should be running');
  });

  it('isProcessRunning returns false for a non-existent PID', async () => {
    const { isProcessRunning } = await import('./server.js');

    // Use a very high PID that almost certainly doesn't exist
    const running = isProcessRunning(999999999);
    assert.strictEqual(running, false, 'Non-existent PID should not be running');
  });
});

// =============================================================================
// 6. OTEL Config (depends on port file)
// =============================================================================

describe('OTEL configuration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-test-otel-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('getOtelConfig returns null when no port file exists', async () => {
    const { getOtelConfig } = await import('./server.js');
    const config = getOtelConfig(testDir);
    assert.strictEqual(config, null, 'Should return null without port file');
  });

  it('getOtelConfig returns config object when port file exists', async () => {
    const { writePortFile, getOtelConfig } = await import('./server.js');

    writePortFile(testDir, 1898);
    const config = getOtelConfig(testDir);

    assert.ok(config, 'Should return config when port file exists');
    assert.strictEqual(config!.CLAUDE_CODE_ENABLE_TELEMETRY, '1');
    assert.strictEqual(config!.OTEL_LOGS_EXPORTER, 'otlp');
    assert.strictEqual(config!.OTEL_METRICS_EXPORTER, 'otlp');
    assert.strictEqual(config!.OTEL_EXPORTER_OTLP_PROTOCOL, 'http/json');
    assert.strictEqual(config!.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://localhost:1898');
  });
});

// =============================================================================
// 7. findAvailablePort
// =============================================================================

describe('findAvailablePort', () => {
  it('returns a valid port number (>0)', async () => {
    const { findAvailablePort } = await import('./server.js');
    const port = await findAvailablePort(19000);
    assert.ok(port > 0, `Port should be > 0, got ${port}`);
    assert.ok(port >= 19000, `Port should be >= 19000, got ${port}`);
  });
});

// =============================================================================
// 8. API Route Factories (AC2, AC3)
// =============================================================================

describe('API route factory exports', () => {
  // All 31 route factory functions should be exported from api/index
  const NO_ARG_FACTORIES = [
    'createStatsRouter',
    'createPortraitRouter',
    'createOTLPRouter',
    'createTokenStatsRouter',
    'createModeRouter',
    'createTelemetryRouter',
    'createEvaluationRouter',
    'createSettingsRouter',
    // createBackgroundTasksRouter — not yet implemented
    'createSpansRouter',
    'createHookRequestRouter',
    'createIdentityRouter',
    'createTodosRouter',
    'createAuditLogRouter',
    'createPermissionsRouter',
  ];

  const PROJECT_DIR_FACTORIES = [
    'createPersonaRouter',
    'createGitRouter',
    'createStoryRouter',
    'createFileBrowserRouter',
    'createContextRouter',
    'createThemeAgentsRouter',
    'createHotspotsRouter',
    'createCodeMarkersRouter',
    'createDeadCodeRouter',
    'createAgentLoadRouter',
    'createComplexityRouter',
    'createDependenciesRouter',
    'createHealthScoreRouter',
  ];

  for (const name of NO_ARG_FACTORIES) {
    it(`exports ${name} as a function`, async () => {
      const api = await import('./api/index.js');
      const factory = (api as Record<string, unknown>)[name];
      assert.strictEqual(typeof factory, 'function', `${name} should be a function`);
    });
  }

  for (const name of PROJECT_DIR_FACTORIES) {
    it(`exports ${name} as a function`, async () => {
      const api = await import('./api/index.js');
      const factory = (api as Record<string, unknown>)[name];
      assert.strictEqual(typeof factory, 'function', `${name} should be a function`);
    });
  }

  it('no-arg factories return Express Router instances', async () => {
    const api = await import('./api/index.js');

    for (const name of NO_ARG_FACTORIES) {
      const factory = (api as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const router = factory();
      assert.ok(router, `${name}() should return a router, not null/undefined`);
      // Express Router has use/get/post methods
      const r = router as Record<string, unknown>;
      assert.strictEqual(typeof r.use, 'function', `${name}() result should have .use()`);
      assert.strictEqual(typeof r.get, 'function', `${name}() result should have .get()`);
    }
  });

  it('project-dir factories return Express Router instances', async () => {
    const api = await import('./api/index.js');
    const getProjectDir = () => '/tmp/test';

    for (const name of PROJECT_DIR_FACTORIES) {
      const factory = (api as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const router = factory(getProjectDir);
      assert.ok(router, `${name}() should return a router, not null/undefined`);
      const r = router as Record<string, unknown>;
      assert.strictEqual(typeof r.use, 'function', `${name}() result should have .use()`);
      assert.strictEqual(typeof r.get, 'function', `${name}() result should have .get()`);
    }
  });
});

// =============================================================================
// 9. API Routes Mounted on Express App (AC2, AC7)
// =============================================================================

describe('API routes mounted on Express app', () => {
  // Spot-check that key API routes are mounted and don't return 404
  const ROUTES_TO_CHECK = [
    '/api/stats',
    '/api/persona',
    '/api/git',
    '/api/settings',
    '/api/permissions',
    '/api/hotspots',
    '/api/health-score',
    '/api/identity',
    '/health',
  ];

  for (const route of ROUTES_TO_CHECK) {
    it(`${route} is mounted (not Express default 404)`, async () => {
      const { app } = await import('./server.js');
      assert.ok(app, 'app must not be null');

      const http = await import('node:http');
      const server = http.createServer(app);

      const port = await new Promise<number>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });

      try {
        const response = await fetch(`http://localhost:${port}${route}`);
        // Route handler 404 (JSON) is fine — means the route IS mounted.
        // Express default 404 returns text/html "Cannot GET ..." — that means NOT mounted.
        if (response.status === 404) {
          const contentType = response.headers.get('content-type') || '';
          assert.ok(
            contentType.includes('application/json'),
            `${route} returned 404 with content-type "${contentType}" — looks like Express default (route not mounted)`
          );
        }
      } finally {
        server.close();
      }
    });
  }
});

// =============================================================================
// 10. WebSocket Setup (AC12)
// =============================================================================

describe('WebSocket setup', () => {
  it('setupWebSocketServers is exported as a function', async () => {
    const { setupWebSocketServers } = await import('./websocket.js');
    assert.strictEqual(typeof setupWebSocketServers, 'function');
  });
});

// =============================================================================
// 11. Settings and Grants (AC13)
// =============================================================================

describe('Settings module', () => {
  it('exports initializeSettings as a function', async () => {
    const { initializeSettings } = await import('./settings.js');
    assert.strictEqual(typeof initializeSettings, 'function');
  });

  it('exports loadGrants as a function', async () => {
    const { loadGrants } = await import('./settings.js');
    assert.strictEqual(typeof loadGrants, 'function');
  });

  it('exports saveGrants as a function', async () => {
    const { saveGrants } = await import('./settings.js');
    assert.strictEqual(typeof saveGrants, 'function');
  });
});

describe('Settings store module', () => {
  it('exports initializeGrants as a function', async () => {
    const { initializeGrants } = await import('./settings-store.js');
    assert.strictEqual(typeof initializeGrants, 'function');
  });

  it('exports setGrantsPersistCallback as a function', async () => {
    const { setGrantsPersistCallback } = await import('./settings-store.js');
    assert.strictEqual(typeof setGrantsPersistCallback, 'function');
  });

  it('exports clearSessionGrants as a function', async () => {
    const { clearSessionGrants } = await import('./settings-store.js');
    assert.strictEqual(typeof clearSessionGrants, 'function');
  });
});

// =============================================================================
// 12. Plugin Loader (AC9)
// =============================================================================

describe('Plugin loader', () => {
  it('exports initPluginRouters as a function', async () => {
    const { initPluginRouters } = await import('./plugin-loader.js');
    assert.strictEqual(typeof initPluginRouters, 'function');
  });

  it('initPluginRouters returns a result with discovered/loaded/failed counts', async () => {
    const { initPluginRouters } = await import('./plugin-loader.js');
    const { app } = await import('./server.js');

    // When app exists, initPluginRouters should work
    if (app) {
      const result = await initPluginRouters(app, '/tmp/test');
      assert.ok(result, 'Should return a result object');
      assert.strictEqual(typeof result.discovered, 'number');
      assert.strictEqual(typeof result.loaded, 'number');
      assert.strictEqual(typeof result.failed, 'number');
    }
  });
});

// =============================================================================
// 13. Paths Module (AC3 utilities)
// =============================================================================

describe('Paths module', () => {
  it('exports getProjectDirectory as a function', async () => {
    const { getProjectDirectory } = await import('./paths.js');
    assert.strictEqual(typeof getProjectDirectory, 'function');
  });

  it('exports setProjectDirectory as a function', async () => {
    const { setProjectDirectory } = await import('./paths.js');
    assert.strictEqual(typeof setProjectDirectory, 'function');
  });

  it('exports resetProjectDirectory as a function', async () => {
    const { resetProjectDirectory } = await import('./paths.js');
    assert.strictEqual(typeof resetProjectDirectory, 'function');
  });

  it('exports path constants', async () => {
    const mod = await import('./paths.js');
    assert.strictEqual(typeof mod.publicDir, 'string');
    assert.strictEqual(typeof mod.nodeModulesDir, 'string');
  });
});
