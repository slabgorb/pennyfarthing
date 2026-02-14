/**
 * Server module for Cyclist.
 *
 * Thin wrapper around @pennyfarthing/core/server that overrides
 * createTerminalServer to use Cyclist's real WebSocket implementation.
 *
 * All Express app configuration, API routes, settings initialization,
 * and utility functions are provided by core. Cyclist adds WebSocket support.
 *
 * Story 98-17: Move web server and API layer into core.
 */

import { createServer, type Server } from 'http';

// Import core's pre-configured Express app and project dir helper
import { app, getProjectDir } from '@pennyfarthing/core/server';

// Import Cyclist's real WebSocket implementation (1600+ lines)
// Core has a no-op stub; Cyclist provides the real thing with 15+ channel handlers
import { setupWebSocketServers } from './websocket.js';

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
  writeApprovalPortFile,
  cleanupApprovalPortFile,
  readApprovalPortFile,
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
