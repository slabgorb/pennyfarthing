/**
 * Plugin Router Loader for Cyclist
 *
 * Story 93-6: Dynamically discover and mount API routers from installed
 * @pennyfarthing/* plugin packages using the plugin discovery system (93-3).
 *
 * Replaces the old hardcoded initPennyfarthingFeatures() dynamic import
 * with a generic plugin-based approach.
 */

import type { Express } from 'express';
import { discoverPlugins, getPluginRouters } from '@pennyfarthing/core';
import type { PluginRouter } from '@pennyfarthing/core';

/**
 * Result of loading a single plugin router.
 */
export interface PluginRouterResult {
  /** Express mount path (e.g., "/api/benchmark") */
  mountPath: string;
  /** Plugin that provides this router */
  plugin: string;
  /** Whether the router was loaded successfully */
  success: boolean;
  /** Error message if loading failed */
  error?: string;
}

/**
 * Result of initializing all plugin routers.
 */
export interface PluginLoadResult {
  /** Total plugins discovered */
  discovered: number;
  /** Routers successfully loaded */
  loaded: number;
  /** Routers that failed to load */
  failed: number;
  /** Details for each router */
  routers: PluginRouterResult[];
}

/**
 * Dynamically import a module, using test mock if available.
 */
async function dynamicImport(modulePath: string): Promise<Record<string, unknown>> {
  // Allow tests to mock dynamic imports via globalThis
  const mock = (globalThis as Record<string, unknown>).__pluginImportMock as
    | ((path: string) => Promise<Record<string, unknown>>)
    | undefined;
  if (mock) {
    return mock(modulePath);
  }
  return import(modulePath);
}

/**
 * Discover and mount plugin API routers onto an Express app.
 *
 * Uses the plugin discovery system from @pennyfarthing/core to find
 * installed plugin packages, then dynamically imports and mounts their
 * declared API routers.
 *
 * @param app - Express application to mount routers on
 * @param projectRoot - Project root directory (for node_modules discovery)
 * @returns Result with details about discovered and loaded routers
 */
export async function initPluginRouters(
  app: Express,
  projectRoot: string,
): Promise<PluginLoadResult> {
  const result: PluginLoadResult = {
    discovered: 0,
    loaded: 0,
    failed: 0,
    routers: [],
  };

  let plugins;
  try {
    plugins = discoverPlugins(projectRoot);
  } catch {
    console.log('[Plugin] Plugin discovery failed, continuing without plugins');
    return result;
  }

  result.discovered = plugins.length;

  if (plugins.length > 0) {
    const names = plugins.map((p) => p.name).join(', ');
    console.log(`[Plugin] Discovered ${plugins.length} plugin(s): ${names}`);
  }

  let routerSpecs: PluginRouter[];
  try {
    routerSpecs = getPluginRouters(plugins);
  } catch {
    console.log('[Plugin] Failed to get plugin routers');
    return result;
  }

  for (const spec of routerSpecs) {
    try {
      const mod = await dynamicImport(spec.modulePath);
      const factory = mod[spec.exportName];

      if (typeof factory !== 'function') {
        throw new Error(`Export '${spec.exportName}' is not a function`);
      }

      const router = factory(() => projectRoot);
      app.use(spec.mountPath, router);

      result.routers.push({
        mountPath: spec.mountPath,
        plugin: spec.plugin,
        success: true,
      });
      result.loaded++;
      console.log(`[Plugin] Mounted router: ${spec.plugin} → ${spec.mountPath}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      result.routers.push({
        mountPath: spec.mountPath,
        plugin: spec.plugin,
        success: false,
        error: errorMessage,
      });
      result.failed++;
      console.log(`[Plugin] Failed to load router from ${spec.plugin}: ${errorMessage}`);
    }
  }

  return result;
}
