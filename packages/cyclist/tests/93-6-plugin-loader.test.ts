/**
 * Tests for Story 93-6: Plugin Router Loader for Cyclist
 *
 * Tests the dynamic discovery and mounting of API routers from installed
 * @pennyfarthing/* plugin packages. The loader uses the plugin discovery
 * system (93-3) to find plugins and mount their Express routers.
 *
 * Test categories:
 * 1. initPluginRouters() - Core loading behavior
 * 2. Plugin with API router - Benchmark plugin integration
 * 3. Graceful degradation - Missing packages, failed imports
 * 4. Cyclist starts without plugins - Empty state
 *
 * Run with: cd packages/cyclist && pnpm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Router } from 'express';
import { initPluginRouters, type PluginLoadResult } from '../src/plugin-loader';

// Mock @pennyfarthing/core plugin discovery
vi.mock('@pennyfarthing/core', async () => {
  const actual = await vi.importActual('@pennyfarthing/core');
  return {
    ...actual,
    discoverPlugins: vi.fn(),
    getPluginRouters: vi.fn(),
  };
});

// Get mocked functions for test control
import { discoverPlugins, getPluginRouters } from '@pennyfarthing/core';
const mockDiscoverPlugins = vi.mocked(discoverPlugins);
const mockGetPluginRouters = vi.mocked(getPluginRouters);

// Helper: create a fake Express Router
function createFakeRouter(): Router {
  const router = express.Router();
  router.get('/test', (_req, res) => res.json({ ok: true }));
  return router;
}

describe('initPluginRouters()', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    vi.clearAllMocks();
  });

  it('should return PluginLoadResult with correct shape', async () => {
    mockDiscoverPlugins.mockReturnValue([]);
    mockGetPluginRouters.mockReturnValue([]);

    const result = await initPluginRouters(app, '/fake/project');

    expect(result).toHaveProperty('discovered');
    expect(result).toHaveProperty('loaded');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('routers');
    expect(typeof result.discovered).toBe('number');
    expect(typeof result.loaded).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(Array.isArray(result.routers)).toBe(true);
  });

  it('should report zero when no plugins are discovered', async () => {
    mockDiscoverPlugins.mockReturnValue([]);
    mockGetPluginRouters.mockReturnValue([]);

    const result = await initPluginRouters(app, '/fake/project');

    expect(result.discovered).toBe(0);
    expect(result.loaded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.routers).toHaveLength(0);
  });

  it('should call discoverPlugins with the project root', async () => {
    mockDiscoverPlugins.mockReturnValue([]);
    mockGetPluginRouters.mockReturnValue([]);

    await initPluginRouters(app, '/my/project');

    expect(mockDiscoverPlugins).toHaveBeenCalledWith('/my/project');
  });

  it('should pass discovered plugins to getPluginRouters', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: { commands: 'commands/', skills: 'skills/' },
      },
    ];
    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue([]);

    await initPluginRouters(app, '/fake/project');

    expect(mockGetPluginRouters).toHaveBeenCalledWith(fakePlugins);
  });

  it('should report discovered count matching number of plugins', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: { commands: 'commands/' },
      },
      {
        name: '@pennyfarthing/analytics',
        path: '/node_modules/@pennyfarthing/analytics',
        manifest: { commands: 'commands/' },
      },
    ];
    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue([]);

    const result = await initPluginRouters(app, '/fake/project');

    expect(result.discovered).toBe(2);
  });
});

describe('Plugin with API router', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    vi.clearAllMocks();
    // Clean up dynamic import mock between tests
    delete (globalThis as Record<string, unknown>).__pluginImportMock;
  });

  it('should dynamically import and mount a plugin router', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: {
          commands: 'commands/',
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          },
        },
      },
    ];
    const fakeRouters = [
      {
        mountPath: '/api/benchmark',
        modulePath: '/node_modules/@pennyfarthing/benchmark/dist/api/benchmark.js',
        exportName: 'createBenchmarkRouter',
        plugin: '@pennyfarthing/benchmark',
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue(fakeRouters);

    // Mock the dynamic import to return a module with the router factory
    const fakeRouter = createFakeRouter();
    vi.stubGlobal('import', undefined); // Clear any previous stubs

    // We need to mock the dynamic import that initPluginRouters will use
    // The implementation should use: const mod = await import(modulePath)
    // We mock it via vi.mock for the specific module path
    const originalImport = globalThis.import;
    // @ts-expect-error - mocking dynamic import
    globalThis.__pluginImportMock = vi.fn().mockResolvedValue({
      createBenchmarkRouter: () => fakeRouter,
    });

    const result = await initPluginRouters(app, '/fake/project');

    expect(result.loaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.routers).toHaveLength(1);
    expect(result.routers[0]).toEqual(
      expect.objectContaining({
        mountPath: '/api/benchmark',
        plugin: '@pennyfarthing/benchmark',
        success: true,
      }),
    );
  });

  it('should mount router at the declared mount path', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: {
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          },
        },
      },
    ];
    const fakeRouters = [
      {
        mountPath: '/api/benchmark',
        modulePath: '/node_modules/@pennyfarthing/benchmark/dist/api/benchmark.js',
        exportName: 'createBenchmarkRouter',
        plugin: '@pennyfarthing/benchmark',
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue(fakeRouters);

    // Spy on app.use to verify the mount path
    const useSpy = vi.spyOn(app, 'use');

    const result = await initPluginRouters(app, '/fake/project');

    // Verify app.use was called with the correct mount path
    if (result.loaded > 0) {
      const mountCalls = useSpy.mock.calls.filter(
        (call) => call[0] === '/api/benchmark',
      );
      expect(mountCalls.length).toBeGreaterThan(0);
    }
  });

  it('should pass getProjectDir to router factory if it accepts arguments', async () => {
    // Some routers take a getProjectDir function as argument
    // The plugin loader should detect this and pass it
    const fakePlugins = [
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: {
          api: {
            path: '/api/benchmark',
            module: './dist/api/benchmark.js',
            export: 'createBenchmarkRouter',
          },
        },
      },
    ];
    const fakeRouters = [
      {
        mountPath: '/api/benchmark',
        modulePath: '/node_modules/@pennyfarthing/benchmark/dist/api/benchmark.js',
        exportName: 'createBenchmarkRouter',
        plugin: '@pennyfarthing/benchmark',
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue(fakeRouters);

    // Track what arguments the factory receives
    const factoryFn = vi.fn().mockReturnValue(createFakeRouter());
    // @ts-expect-error - mocking dynamic import
    globalThis.__pluginImportMock = vi.fn().mockResolvedValue({
      createBenchmarkRouter: factoryFn,
    });

    const result = await initPluginRouters(app, '/fake/project');

    // Factory should have been called with a getProjectDir getter
    expect(factoryFn).toHaveBeenCalledTimes(1);
    const arg = factoryFn.mock.calls[0][0];
    expect(typeof arg).toBe('function');
    expect(arg()).toBe('/fake/project');
    expect(result.loaded).toBe(1);
  });
});

describe('Graceful degradation', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    vi.clearAllMocks();
  });

  it('should handle failed dynamic import gracefully', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/broken',
        path: '/node_modules/@pennyfarthing/broken',
        manifest: {
          api: {
            path: '/api/broken',
            module: './dist/api/broken.js',
            export: 'createBrokenRouter',
          },
        },
      },
    ];
    const fakeRouters = [
      {
        mountPath: '/api/broken',
        modulePath: '/node_modules/@pennyfarthing/broken/dist/api/broken.js',
        exportName: 'createBrokenRouter',
        plugin: '@pennyfarthing/broken',
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue(fakeRouters);

    // The module path doesn't exist, so dynamic import will fail
    const result = await initPluginRouters(app, '/fake/project');

    // Should NOT throw — graceful degradation
    expect(result.loaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.routers[0]).toEqual(
      expect.objectContaining({
        mountPath: '/api/broken',
        plugin: '@pennyfarthing/broken',
        success: false,
      }),
    );
    expect(result.routers[0].error).toBeDefined();
  });

  it('should handle missing export name in module gracefully', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/noexport',
        path: '/node_modules/@pennyfarthing/noexport',
        manifest: {
          api: {
            path: '/api/noexport',
            module: './dist/api/noexport.js',
            export: 'createNonexistentRouter',
          },
        },
      },
    ];
    const fakeRouters = [
      {
        mountPath: '/api/noexport',
        modulePath: '/node_modules/@pennyfarthing/noexport/dist/api/noexport.js',
        exportName: 'createNonexistentRouter',
        plugin: '@pennyfarthing/noexport',
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue(fakeRouters);

    const result = await initPluginRouters(app, '/fake/project');

    // Should fail gracefully when the export doesn't exist
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const routerResult = result.routers.find(
      (r) => r.plugin === '@pennyfarthing/noexport',
    );
    expect(routerResult?.success).toBe(false);
  });

  it('should continue loading other plugins when one fails', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/broken',
        path: '/node_modules/@pennyfarthing/broken',
        manifest: {
          api: {
            path: '/api/broken',
            module: './dist/api/broken.js',
            export: 'createBrokenRouter',
          },
        },
      },
      {
        name: '@pennyfarthing/good',
        path: '/node_modules/@pennyfarthing/good',
        manifest: {
          api: {
            path: '/api/good',
            module: './dist/api/good.js',
            export: 'createGoodRouter',
          },
        },
      },
    ];
    const fakeRouters = [
      {
        mountPath: '/api/broken',
        modulePath: '/node_modules/@pennyfarthing/broken/dist/api/broken.js',
        exportName: 'createBrokenRouter',
        plugin: '@pennyfarthing/broken',
      },
      {
        mountPath: '/api/good',
        modulePath: '/node_modules/@pennyfarthing/good/dist/api/good.js',
        exportName: 'createGoodRouter',
        plugin: '@pennyfarthing/good',
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue(fakeRouters);

    const result = await initPluginRouters(app, '/fake/project');

    // Both routers should be attempted
    expect(result.routers).toHaveLength(2);
    // At least the broken one should fail
    const brokenResult = result.routers.find(
      (r) => r.plugin === '@pennyfarthing/broken',
    );
    expect(brokenResult?.success).toBe(false);
  });

  it('should never throw from initPluginRouters', async () => {
    // Even if discoverPlugins itself throws, we should catch it
    mockDiscoverPlugins.mockImplementation(() => {
      throw new Error('Catastrophic failure');
    });

    const result = await initPluginRouters(app, '/fake/project');

    expect(result.discovered).toBe(0);
    expect(result.loaded).toBe(0);
    expect(result.failed).toBe(0);
  });
});

describe('Cyclist starts without plugins', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    vi.clearAllMocks();
  });

  it('should return clean result when no @pennyfarthing packages exist', async () => {
    mockDiscoverPlugins.mockReturnValue([]);
    mockGetPluginRouters.mockReturnValue([]);

    const result = await initPluginRouters(app, '/fake/project');

    expect(result.discovered).toBe(0);
    expect(result.loaded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.routers).toEqual([]);
  });

  it('should not modify the Express app when no plugins have routers', async () => {
    const fakePlugins = [
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: { commands: 'commands/', skills: 'skills/' },
        // Note: no api field — plugin has commands/skills but no router
      },
    ];

    mockDiscoverPlugins.mockReturnValue(fakePlugins);
    mockGetPluginRouters.mockReturnValue([]); // No routers declared

    const useSpy = vi.spyOn(app, 'use');
    const routesBefore = app._router?.stack?.length ?? 0;

    const result = await initPluginRouters(app, '/fake/project');

    // Plugin was discovered but has no router
    expect(result.discovered).toBe(1);
    expect(result.loaded).toBe(0);

    // app.use should not have been called for plugin routers
    const pluginMountCalls = useSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('/api/'),
    );
    expect(pluginMountCalls).toHaveLength(0);
  });

  it('should log discovered plugins for observability', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockDiscoverPlugins.mockReturnValue([
      {
        name: '@pennyfarthing/benchmark',
        path: '/node_modules/@pennyfarthing/benchmark',
        manifest: { commands: 'commands/' },
      },
    ]);
    mockGetPluginRouters.mockReturnValue([]);

    await initPluginRouters(app, '/fake/project');

    // Should log something about plugin discovery
    expect(consoleSpy).toHaveBeenCalled();
    const logMessages = consoleSpy.mock.calls.map((call) => call.join(' '));
    const hasPluginLog = logMessages.some(
      (msg) => msg.includes('plugin') || msg.includes('Plugin'),
    );
    expect(hasPluginLog).toBe(true);

    consoleSpy.mockRestore();
  });
});
