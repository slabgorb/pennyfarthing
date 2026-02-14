/**
 * Plugin loader stubs for server module.
 * STUB: Will be replaced with real implementation from cyclist/src/plugin-loader.ts
 */

import type { Express } from 'express';

export interface PluginResult {
  discovered: number;
  loaded: number;
  failed: number;
}

export async function initPluginRouters(_app: Express, _projectDir: string): Promise<PluginResult> {
  return { discovered: 0, loaded: 0, failed: 0 };
}
