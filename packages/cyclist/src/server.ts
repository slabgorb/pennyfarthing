/**
 * Server module for Cyclist.
 *
 * Thin wrapper around @pennyfarthing/core/server that overrides
 * createTerminalServer to use Cyclist's real WebSocket implementation
 * and wires the real OTLP receiver into core's API routes.
 *
 * All Express app configuration, API routes, settings initialization,
 * and utility functions are provided by core. Cyclist adds WebSocket support
 * and the real OTLP data source.
 *
 * Story 98-17: Move web server and API layer into core.
 */

import { createServer, type Server } from 'http';

// Import core's pre-configured Express app, project dir helper, and OTLP provider setter
import {
  app,
  getProjectDir,
  setOTLPProvider,
  initTokenStatsBroadcast,
} from '@pennyfarthing/core/server';

// Import Cyclist's real WebSocket implementation (1600+ lines)
// Core has a no-op stub; Cyclist provides the real thing with 15+ channel handlers
import { setupWebSocketServers } from './websocket.js';

// Import real OTLP functions from Cyclist's otlp-receiver (~1000 lines)
import {
  getTokenStats as realGetTokenStats,
  addTokenStatsListener as realAddTokenStatsListener,
  getBackgroundTasks as realGetBackgroundTasks,
  parseOTLPLogs,
  processLogEvents,
  parseOTLPMetrics,
  aggregateTokenStats,
  getToolEvents,
  getToolEventsFiltered as realGetToolEventsFiltered,
  getToolTypes as realGetToolTypes,
  getAuditLogStats as realGetAuditLogStats,
  exportAuditLogAsJSON as realExportAuditLogAsJSON,
  exportAuditLogAsCSV as realExportAuditLogAsCSV,
  resetEventStore as realResetEventStore,
} from './otlp-receiver.js';

import type { OTLPProvider } from '@pennyfarthing/core/server';

// Wire the real OTLP implementation into core's API route stubs.
// Core's server.ts calls initTokenStatsBroadcast() at module load (before this runs),
// so the first call hits the stub (no-op). After setting the provider, we re-call it
// to register the real broadcast callback.
//
// Note: Cyclist's TokenStats/ToolEvent types are structurally compatible with core's
// but TypeScript sees them as distinct nominal types. The provider cast is safe because
// cyclist's types are supersets of core's (more fields, same base shape).
// Map cyclist's TokenStats (totalCostUsd, lastUpdated) to core's (totalCost, index sig)
function mapTokenStats(stats: ReturnType<typeof realGetTokenStats>) {
  return {
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    cacheCreationTokens: stats.cacheCreationTokens,
    cacheReadTokens: stats.cacheReadTokens,
    totalCost: stats.totalCostUsd,
    lastUpdated: stats.lastUpdated,
  };
}

const provider: OTLPProvider = {
  getTokenStats() {
    return mapTokenStats(realGetTokenStats());
  },
  addTokenStatsListener(callback) {
    realAddTokenStatsListener((stats) => {
      callback(mapTokenStats(stats));
    });
  },
  getBackgroundTasks() {
    return realGetBackgroundTasks() as unknown as ReturnType<OTLPProvider['getBackgroundTasks']>;
  },
  processOTLPLogs(body: unknown) {
    const rawEvents = parseOTLPLogs(body);
    if (rawEvents.length > 0) {
      void processLogEvents(rawEvents);
    }
  },
  processOTLPMetrics(body: unknown) {
    const parsed = parseOTLPMetrics(body);
    aggregateTokenStats(parsed);
  },
  processOTLPTraces(_body: unknown) {
    // Traces are not processed by Cyclist — no-op
  },
  getAuditLog() {
    return getToolEvents() as unknown as ReturnType<OTLPProvider['getAuditLog']>;
  },
  getToolEventsFiltered(opts?: unknown) {
    return realGetToolEventsFiltered(opts as string | undefined) as unknown as ReturnType<OTLPProvider['getToolEventsFiltered']>;
  },
  getToolTypes: realGetToolTypes,
  getAuditLogStats: realGetAuditLogStats as unknown as OTLPProvider['getAuditLogStats'],
  exportAuditLogAsJSON: realExportAuditLogAsJSON,
  exportAuditLogAsCSV: realExportAuditLogAsCSV,
  resetEventStore: realResetEventStore,
};

setOTLPProvider(provider);

// Re-initialize broadcast callbacks now that the real provider is set.
// The first calls during core's module load were no-ops (stub was active).
initTokenStatsBroadcast();

/**
 * Create HTTP server with Cyclist's WebSocket support.
 * Overrides core's no-op WebSocket stub with the real implementation
 * that handles stats, persona, token-stats, bell, welcome, hooks, etc.
 */
export function createTerminalServer(): Server {
  const server = createServer(app);
  setupWebSocketServers(server, getProjectDir);
  return server;
}

// Re-export everything from core's server module that cyclist consumers need.
// bikerack.ts needs: createTerminalServer (overridden above), findAvailablePort
// main.ts needs: getStoryInfo, getAllReposGitInfoAsync, writePortFile, cleanupPortFile,
//                writePidFile, cleanupPidFile, readPidFile, isProcessRunning, getOtelConfig
// websocket.ts needs: getOtelConfig, isBikeRackMode
export {
  app,
  getProjectDir,
  // API re-exports
  broadcastStats,
  getStoryInfo,
  getGitInfo,
  getAllReposGitInfo,
  getAllReposGitInfoAsync,
  // Path utilities
  publicDir,
  nodeModulesDir,
  portraitsDir,
  getProjectDirectory,
  getDistDir,
  setProjectDirectory,
  resetProjectDirectory,
  parseProjectDirArg,
  isValidProjectDirectory,
  // Server utilities
  findAvailablePort,
  writePortFile,
  cleanupPortFile,
  readPortFile,
  writePidFile,
  cleanupPidFile,
  readPidFile,
  isProcessRunning,
  // OTEL
  getOtelConfig,
  // Env
  isBikeRackMode,
  // Grants
  clearSessionGrants,
} from '@pennyfarthing/core/server';

// Type re-exports
export type {
  StoryInfo,
  WorkflowStep,
  CriteriaItem,
  GitInfo,
  OtelConfig,
} from '@pennyfarthing/core/server';
