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
  _app: Express,
  _projectRoot: string,
): Promise<PluginLoadResult> {
  throw new Error('not implemented');
}
