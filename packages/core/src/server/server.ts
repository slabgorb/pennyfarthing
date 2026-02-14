/**
 * Server module for @pennyfarthing/core.
 *
 * WheelHub Express server with all API routes, WebSocket support,
 * port management, settings initialization, and OTEL configuration.
 *
 * Extracted from packages/cyclist/src/server.ts (Story 98-17).
 */

import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import { join } from 'path';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';

// Path resolution
import { getProjectDirectory } from './paths.js';

// API routers
import {
  createStatsRouter,
  createPortraitRouter,
  createPersonaRouter,
  createGitRouter,
  createOTLPRouter,
  createStoryRouter,
  createFileBrowserRouter,
  createTokenStatsRouter,
  createContextRouter,
  createThemeAgentsRouter,
  createModeRouter,
  createTelemetryRouter,
  createEvaluationRouter,
  createSettingsRouter,
  initTokenStatsBroadcast,
  createBackgroundTasksRouter,
  initBackgroundTaskBroadcast,
  createSpansRouter,
  createHookRequestRouter,
  createIdentityRouter,
  createTodosRouter,
  createAuditLogRouter,
  createHotspotsRouter,
  createCodeMarkersRouter,
  createPermissionsRouter,
  createAgentLoadRouter,
  createDeadCodeRouter,
  createComplexityRouter,
  createDependenciesRouter,
  createHealthScoreRouter,
} from './api/index.js';

// Settings initialization
import { initializeSettings, loadGrants, saveGrants } from './settings.js';

// Grant initialization
import { initializeGrants, setGrantsPersistCallback } from './settings-store.js';

// WebSocket setup
import { setupWebSocketServers } from './websocket.js';

// Plugin router loading
import { initPluginRouters } from './plugin-loader.js';

// Re-exports for Cyclist and external consumers
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo, getAllReposGitInfo, getAllReposGitInfoAsync } from './api/index.js';
export type { GitInfo } from './api/index.js';

// BikeRack mode detection
import { isBikeRackMode } from './env.js';
export { isBikeRackMode };

// =============================================================================
// Express App
// =============================================================================

export const app: Express = express();

// Parse JSON bodies
app.use(express.json());

// Health check endpoint (used by hooks to verify WheelHub is running)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Wrapper that provides fallback to cwd for standalone server mode
function getProjectDir(): string {
  return getProjectDirectory() || process.cwd();
}

// Initialize settings from file
initializeSettings(getProjectDir());

// Initialize grants for standalone server mode
const grants = loadGrants();
initializeGrants(grants);
setGrantsPersistCallback(saveGrants);

// Mount API routers
app.use('/api/stats', createStatsRouter());
app.use('/api/portrait', createPortraitRouter());
app.use('/api/persona', createPersonaRouter(getProjectDir));
app.use('/api/story', createStoryRouter(getProjectDir));
app.use('/api/git', createGitRouter(getProjectDir));
app.use('/api/files', createFileBrowserRouter(getProjectDir));
app.use('/api/token-stats', createTokenStatsRouter());
app.use('/api/context', createContextRouter(getProjectDir));
app.use('/api/theme-agents', createThemeAgentsRouter(getProjectDir));
app.use('/api/mode', createModeRouter());
app.use('/api/telemetry', createTelemetryRouter());
app.use('/api/evaluation', createEvaluationRouter());
app.use('/api/settings', createSettingsRouter());
app.use('/api/background-tasks', createBackgroundTasksRouter());
app.use('/api/spans', createSpansRouter());
app.use('/api/hook-request', createHookRequestRouter());
app.use('/api/identity', createIdentityRouter());
app.use('/api/todos', createTodosRouter());
app.use('/api/audit-log', createAuditLogRouter());
app.use('/api/permissions', createPermissionsRouter());
app.use('/api/hotspots', createHotspotsRouter(getProjectDir));
app.use('/api/code-markers', createCodeMarkersRouter(getProjectDir));
app.use('/api/dead-code', createDeadCodeRouter(getProjectDir));
app.use('/api/agent-load', createAgentLoadRouter(getProjectDir));
app.use('/api/complexity', createComplexityRouter(getProjectDir));
app.use('/api/dependencies', createDependenciesRouter(getProjectDir));
app.use('/api/health-score', createHealthScoreRouter(getProjectDir));

// Mount OTLP at /v1 (standard OTEL endpoint)
app.use('/v1', createOTLPRouter());

// Initialize broadcast callbacks
initTokenStatsBroadcast();
initBackgroundTaskBroadcast();

// =============================================================================
// Server Factory
// =============================================================================

export function createTerminalServer(): Server {
  const server = createServer(app);
  setupWebSocketServers(server, getProjectDir);
  return server;
}

// =============================================================================
// Port File Discovery Pattern (Story 20-1)
// Port Conflict Detection (Story 34-3)
// =============================================================================

const PORT_FILE_NAME = '.cyclist-port';
const APPROVAL_PORT_FILE_NAME = '.cyclist-approval-port';
const PID_FILE_NAME = '.cyclist-pid';

export async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  const net = await import('net');

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const testServer = net.createServer();
      testServer.once('error', () => resolve(false));
      testServer.once('listening', () => {
        testServer.close();
        resolve(true);
      });
      testServer.listen(port);
    });

    if (available) {
      return port;
    }
  }

  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

export function writePortFile(projectDir: string, port: number): void {
  const portFilePath = join(projectDir, PORT_FILE_NAME);
  writeFileSync(portFilePath, String(port));
}

export function cleanupPortFile(projectDir: string): void {
  const portFilePath = join(projectDir, PORT_FILE_NAME);
  if (existsSync(portFilePath)) {
    unlinkSync(portFilePath);
  }
}

export function readPortFile(projectDir: string): number | null {
  const portFilePath = join(projectDir, PORT_FILE_NAME);

  if (!existsSync(portFilePath)) {
    return null;
  }

  const content = readFileSync(portFilePath, 'utf-8').trim();

  if (!content) {
    return null;
  }

  const port = parseInt(content, 10);

  if (isNaN(port)) {
    return null;
  }

  return port;
}

// =============================================================================
// Approval Port File (Story 33-7)
// =============================================================================

export function writeApprovalPortFile(projectDir: string, port: number): void {
  const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);
  writeFileSync(portFilePath, String(port));
}

export function cleanupApprovalPortFile(projectDir: string): void {
  const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);
  if (existsSync(portFilePath)) {
    unlinkSync(portFilePath);
  }
}

export function readApprovalPortFile(projectDir: string): number | null {
  const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);

  if (!existsSync(portFilePath)) {
    return null;
  }

  const content = readFileSync(portFilePath, 'utf-8').trim();

  if (!content) {
    return null;
  }

  const port = parseInt(content, 10);

  if (isNaN(port)) {
    return null;
  }

  return port;
}

// =============================================================================
// PID File (Story B-24 fix)
// =============================================================================

export function writePidFile(projectDir: string, pid: number): void {
  const pidFilePath = join(projectDir, PID_FILE_NAME);
  writeFileSync(pidFilePath, String(pid));
}

export function cleanupPidFile(projectDir: string): void {
  const pidFilePath = join(projectDir, PID_FILE_NAME);
  if (existsSync(pidFilePath)) {
    unlinkSync(pidFilePath);
  }
}

export function readPidFile(projectDir: string): number | null {
  const pidFilePath = join(projectDir, PID_FILE_NAME);

  if (!existsSync(pidFilePath)) {
    return null;
  }

  const content = readFileSync(pidFilePath, 'utf-8').trim();

  if (!content) {
    return null;
  }

  const pid = parseInt(content, 10);

  if (isNaN(pid)) {
    return null;
  }

  return pid;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// OTEL Configuration
// =============================================================================

export interface OtelConfig extends Record<string, string> {
  CLAUDE_CODE_ENABLE_TELEMETRY: string;
  OTEL_LOGS_EXPORTER: string;
  OTEL_METRICS_EXPORTER: string;
  OTEL_EXPORTER_OTLP_PROTOCOL: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
}

export function getOtelConfig(projectDir: string): OtelConfig | null {
  const port = readPortFile(projectDir);

  if (port === null) {
    return null;
  }

  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
  };
}
