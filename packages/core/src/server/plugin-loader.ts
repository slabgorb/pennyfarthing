/**
 * Plugin Router Loader for server module.
 * Extracted from packages/cyclist/src/plugin-loader.ts (Story 98-17).
 *
 * Dynamically discovers and mounts API routers from installed
 * @pennyfarthing/* plugin packages using the plugin discovery system.
 */

import type { Express } from 'express';
import { discoverPlugins, getPluginRouters } from '../index.js';
import type { PluginRouter } from '../index.js';

export interface PluginRouterResult {
  mountPath: string;
  plugin: string;
  success: boolean;
  error?: string;
}

export interface PluginLoadResult {
  discovered: number;
  loaded: number;
  failed: number;
  routers: PluginRouterResult[];
}

async function dynamicImport(modulePath: string): Promise<Record<string, unknown>> {
  const mock = (globalThis as Record<string, unknown>).__pluginImportMock as
    | ((path: string) => Promise<Record<string, unknown>>)
    | undefined;
  if (mock) {
    return mock(modulePath);
  }
  return import(modulePath);
}

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
    return result;
  }

  result.discovered = plugins.length;

  let routerSpecs: PluginRouter[];
  try {
    routerSpecs = getPluginRouters(plugins);
  } catch {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      result.routers.push({
        mountPath: spec.mountPath,
        plugin: spec.plugin,
        success: false,
        error: errorMessage,
      });
      result.failed++;
    }
  }

  return result;
}
