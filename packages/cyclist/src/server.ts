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
  initTokenStatsBroadcast,
  broadcastStats,
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
const PORT = process.env.PORT || 1898;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createTerminalServer();
  server.listen(PORT, () => {
    console.log(`Cyclist running at http://localhost:${PORT}`);
  });
}

// ============================================================================
// Port File Discovery Pattern (Story 20-1)
// ============================================================================

const PORT_FILE_NAME = '.cyclist-port';

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
 * Get OTEL configuration environment variables based on port file.
 * Returns null if no valid port file exists.
 */
export function getOtelConfig(projectDir: string): { OTEL_EXPORTER_OTLP_PROTOCOL: string; OTEL_EXPORTER_OTLP_ENDPOINT: string } | null {
  const port = readPortFile(projectDir);

  if (port === null) {
    return null;
  }

  return {
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
  };
}
