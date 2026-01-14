import express, { Express } from 'express';
import { fileURLToPath } from 'url';
import { createServer, Server } from 'http';
import { join } from 'path';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';

// Path resolution
import { publicDir, nodeModulesDir, portraitsDir, getProjectDirectory } from './paths.js';

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
  createBenchmarkRouter,
  createSettingsRouter,
  initTokenStatsBroadcast,
} from './api/index.js';

// WebSocket setup
import { setupWebSocketServers } from './websocket.js';

// Re-exports for main.ts and tests
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo } from './api/index.js';
export type { GitInfo } from './api/index.js';

export const app: Express = express();

// Parse JSON bodies
app.use(express.json());

// Serve portraits from Pennyfarthing package (must be before general static)
if (portraitsDir) {
  app.use('/portraits', express.static(portraitsDir));
}

// Serve static files from public directory
app.use(express.static(publicDir));

// Serve node_modules for client-side imports (xterm.js)
app.use('/node_modules', express.static(nodeModulesDir));

// Serve index.html for root route
app.get('/', (_req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

// Wrapper that provides fallback to cwd for standalone server mode
function getProjectDir(): string {
  return getProjectDirectory() || process.cwd();
}

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
app.use('/api/benchmark', createBenchmarkRouter(getProjectDir));
// 35-1: Settings API for contextual settings
app.use('/api/settings', createSettingsRouter());
app.use('/v1', createOTLPRouter());

// Initialize token stats WebSocket broadcast callback
initTokenStatsBroadcast();

// Create HTTP server with WebSocket support
export function createTerminalServer(): Server {
  const server = createServer(app);
  setupWebSocketServers(server, getProjectDir);
  return server;
}

// Start server only when run directly (not imported for tests)
const DEFAULT_PORT = parseInt(process.env.PORT || '1898', 10);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const server = createTerminalServer();
    const projectDir = getProjectDir();

    // Find available port (Story 34-3)
    const actualPort = await findAvailablePort(DEFAULT_PORT);
    if (actualPort !== DEFAULT_PORT) {
      console.log(`Port ${DEFAULT_PORT} in use, using ${actualPort} instead`);
    }

    server.listen(actualPort, () => {
      console.log(`Cyclist running at http://localhost:${actualPort}`);
      // Write port file for OTEL auto-configuration (Story 20-1)
      writePortFile(projectDir, actualPort);
      console.log(`[OTEL] Wrote .cyclist-port file to ${projectDir}`);
    });

    // Cleanup port file on shutdown
    process.on('SIGINT', () => {
      cleanupPortFile(projectDir);
      console.log('[OTEL] Cleaned up .cyclist-port file');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanupPortFile(projectDir);
      process.exit(0);
    });
  })();
}

// ============================================================================
// Port File Discovery Pattern (Story 20-1)
// Port Conflict Detection (Story 34-3)
// ============================================================================

const PORT_FILE_NAME = '.cyclist-port';

/**
 * Find an available port starting from the given port.
 * Tries ports sequentially until one is available or maxAttempts reached.
 * Used by both Electron mode and standalone server mode.
 */
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

/**
 * Write the server port to a .cyclist-port file for auto-discovery.
 * Called when Cyclist server starts to enable hook-based OTEL configuration.
 */
export function writePortFile(projectDir: string, port: number): void {
  const portFilePath = join(projectDir, PORT_FILE_NAME);
  writeFileSync(portFilePath, String(port));
}

/**
 * Remove the .cyclist-port file during shutdown.
 * Prevents stale port files from pointing to non-existent servers.
 */
export function cleanupPortFile(projectDir: string): void {
  const portFilePath = join(projectDir, PORT_FILE_NAME);
  if (existsSync(portFilePath)) {
    unlinkSync(portFilePath);
  }
}

/**
 * Read the port number from .cyclist-port file.
 * Returns null if file doesn't exist, is empty, or contains invalid content.
 */
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

/**
 * OTEL configuration type for Claude Code telemetry
 * Extends Record<string, string> for compatibility with process.env spreading
 */
export interface OtelConfig extends Record<string, string> {
  CLAUDE_CODE_ENABLE_TELEMETRY: string;
  OTEL_LOGS_EXPORTER: string;
  OTEL_METRICS_EXPORTER: string;
  OTEL_EXPORTER_OTLP_PROTOCOL: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
}

/**
 * Get OTEL configuration environment variables based on port file.
 * Returns null if no valid port file exists.
 *
 * Claude Code requires explicit opt-in for telemetry:
 * - CLAUDE_CODE_ENABLE_TELEMETRY=1 to enable telemetry
 * - OTEL_LOGS_EXPORTER=otlp to export tool events
 * - OTEL_METRICS_EXPORTER=otlp to export token metrics
 *
 * @see https://code.claude.com/docs/en/monitoring-usage
 */
export function getOtelConfig(projectDir: string): OtelConfig | null {
  const port = readPortFile(projectDir);

  if (port === null) {
    return null;
  }

  return {
    // Enable telemetry (opt-in required)
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    // Configure exporters for logs (tool events) and metrics (tokens)
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'otlp',
    // HTTP/JSON protocol for Cyclist's Express server
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
  };
}
