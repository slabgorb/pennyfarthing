import express, { Express } from 'express';
import { fileURLToPath } from 'url';
import { createServer, Server } from 'http';
import { join } from 'path';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';

// Path resolution
import { publicDir, nodeModulesDir, portraitsDir, getProjectDirectory, getDistDir } from './paths.js';

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
  createHotspotsRouter,
  createCodeMarkersRouter,
  createPermissionsRouter,
  createAgentLoadRouter,
  createDeadCodeRouter,
  createComplexityRouter,
  createDependenciesRouter,
  createHealthScoreRouter,
} from './api/index.js';

// Settings initialization (35-6: required for font settings persistence)
import { initializeSettings, loadGrants, saveGrants } from './settings.js';

// Grant initialization (MSSCI-14321: grants must be available in standalone server mode)
import { initializeGrants, setGrantsPersistCallback, clearSessionGrants } from './settings-store.js';

// WebSocket setup
import { setupWebSocketServers } from './websocket.js';

// Plugin router loading (Story 93-6)
import { initPluginRouters } from './plugin-loader.js';

// Re-exports for main.ts and tests
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo, getAllReposGitInfo, getAllReposGitInfoAsync } from './api/index.js';
export type { GitInfo } from './api/index.js';

// BikeRack mode detection (ADR-0024, Rule 1)
// Imported from env.ts to break circular import (server → api/index → mode → server)
// Re-exported to preserve public API for main.ts, bikerack.ts, etc.
import { isBikeRackMode } from './env.js';
export { isBikeRackMode };

export const app: Express = express();

// Parse JSON bodies
app.use(express.json());

// Serve portraits from Pennyfarthing package (must be before general static)
if (portraitsDir) {
  app.use('/portraits', express.static(portraitsDir));
}

// Serve static files from public directory
app.use(express.static(publicDir, { index: false }));

// Serve Vite build output (React components) from dist/public
// This is separate from src/public to avoid Vite overwriting source files
const distPublicDir = join(getDistDir(), 'public');
if (existsSync(distPublicDir)) {
  app.use(express.static(distPublicDir));
}

// Serve node_modules for client-side imports (xterm.js)
app.use('/node_modules', express.static(nodeModulesDir));

// Health check endpoint (used by hooks to verify WheelHub is running)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Cache index.html template once at startup, inject mode flag per-request
const indexHtmlTemplate = readFileSync(join(publicDir, 'index.html'), 'utf-8');

function serveIndexHtml(_req: express.Request, res: express.Response) {
  const mode = isBikeRackMode() ? 'bikerack' : 'cyclist';
  const injected = indexHtmlTemplate.replace(
    '</head>',
    `<script>window.__CYCLIST_MODE__="${mode}";</script>\n</head>`
  );
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(injected);
}

// Both routes serve the same injected HTML — /bikerack kept for backward compat (bookmarks)
app.get('/', serveIndexHtml);
app.get('/bikerack', serveIndexHtml);

// Serve pennyfarthing logo from project root (for welcome message)
app.get('/pennyfarthing-transparent.png', (_req, res) => {
  const projectDir = getProjectDirectory() || process.cwd();
  const logoPath = join(projectDir, 'pennyfarthing-transparent.png');
  res.sendFile(logoPath, (err) => {
    if (err) {
      res.status(404).send('Logo not found');
    }
  });
});

// Wrapper that provides fallback to cwd for standalone server mode
function getProjectDir(): string {
  return getProjectDirectory() || process.cwd();
}

// Initialize settings from file (35-6: required for font settings persistence)
// Must happen before settings router is used
initializeSettings(getProjectDir());

// Initialize grants for standalone server mode (MSSCI-14321)
// In Electron mode, main.ts handles this. In standalone/web mode, we do it here.
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
// 35-1: Settings API for contextual settings
app.use('/api/settings', createSettingsRouter());
// 35-16: Background tasks API
app.use('/api/background-tasks', createBackgroundTasksRouter());
// MSSCI-11734: Enriched spans API
app.use('/api/spans', createSpansRouter());
// MSSCI-12409: Hook request API (WheelHub consolidation)
app.use('/api/hook-request', createHookRequestRouter());
// MSSCI-12469: Identity API for stats strip
app.use('/api/identity', createIdentityRouter());
// Todos API for web mode fallback
app.use('/api/todos', createTodosRouter());
// Audit log API
import { createAuditLogRouter } from './api/audit-log.js';
app.use('/api/audit-log', createAuditLogRouter());
// MSSCI-14325: Permissions API (grant management)
app.use('/api/permissions', createPermissionsRouter());
// Hotspot analysis API
app.use('/api/hotspots', createHotspotsRouter(getProjectDir));
// MSSCI-14456: Code Markers API
app.use('/api/code-markers', createCodeMarkersRouter(getProjectDir));
// MSSCI-14460: Dead Code API
app.use('/api/dead-code', createDeadCodeRouter(getProjectDir));
// MSSCI-14461: Agent Load Analyzer
app.use('/api/agent-load', createAgentLoadRouter(getProjectDir));
// MSSCI-14468: Complexity + Dependencies APIs
app.use('/api/complexity', createComplexityRouter(getProjectDir));
app.use('/api/dependencies', createDependenciesRouter(getProjectDir));
// MSSCI-14471: Health Score API
app.use('/api/health-score', createHealthScoreRouter(getProjectDir));

// Welcome message endpoint (triggered by SessionStart hook)
// Broadcasts welcome message to /ws/welcome channel for Cyclist display
import { broadcastWelcome } from './api/welcome.js';

app.post('/api/welcome', (req, res) => {
  const { project, theme } = req.body || {};
  try {
    broadcastWelcome({ project: project || '', theme: theme || '' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Welcome] Broadcast error:', err);
    res.status(500).json({ error: 'Failed to broadcast welcome' });
  }
});

// MSSCI-12275: Bell mode queue sync endpoint
// Writes message queue to .pennyfarthing/bell-queue.json for PostToolUse hook
app.post('/api/bell-queue', (req, res) => {
  const projectDir = getProjectDir();
  const queuePath = join(projectDir, '.pennyfarthing', 'bell-queue.json');
  const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');

  // Only write if bell mode is enabled (read from config.local.yaml)
  try {
    let bellModeEnabled = false;
    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf8');
      // Simple check for bell_mode: true in YAML
      bellModeEnabled = /^\s*bell_mode:\s*true/m.test(configContent);
    }

    if (bellModeEnabled) {
      const queue = req.body;
      if (Array.isArray(queue)) {
        writeFileSync(queuePath, JSON.stringify(queue, null, 2));
      }
    } else if (existsSync(queuePath)) {
      // Bell mode disabled - remove stale queue file
      unlinkSync(queuePath);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Bell Queue] Sync error:', err);
    res.status(500).json({ error: 'Failed to sync bell queue' });
  }
});

// Bell mode message consumed endpoint (called by PostToolUse hook)
// Broadcasts to browser to dequeue and display the injected message
import { broadcastBellConsumed } from './api/bell.js';

app.post('/api/bell-consumed', (req, res) => {
  const { text } = req.body || {};
  try {
    broadcastBellConsumed(text || '');
    res.json({ ok: true });
  } catch (err) {
    console.error('[Bell Consumed] Broadcast error:', err);
    res.status(500).json({ error: 'Failed to broadcast bell consumed' });
  }
});
app.use('/v1', createOTLPRouter());

// Initialize token stats WebSocket broadcast callback
initTokenStatsBroadcast();

// 35-16: Initialize background task broadcast callback
initBackgroundTaskBroadcast();

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

    // Load plugin API routers (Story 93-6)
    const pluginResult = await initPluginRouters(app, projectDir);
    if (pluginResult.discovered > 0) {
      console.log(`[Plugin] ${pluginResult.loaded} router(s) loaded, ${pluginResult.failed} failed`);
    }

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

    // Cleanup on shutdown
    process.on('SIGINT', () => {
      clearSessionGrants(); // MSSCI-14324: Clear session/once grants
      cleanupPortFile(projectDir);
      console.log('[OTEL] Cleaned up .cyclist-port file');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      clearSessionGrants(); // MSSCI-14324: Clear session/once grants
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
const APPROVAL_PORT_FILE_NAME = '.cyclist-approval-port';
const PID_FILE_NAME = '.cyclist-pid';

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

// ============================================================================
// Approval Port File Pattern (Story 33-7)
// Enables multi-instance Cyclist with isolated approval servers
// ============================================================================

/**
 * Write the approval server port to .cyclist-approval-port file.
 * Enables hook script to discover which port this instance is using.
 */
export function writeApprovalPortFile(projectDir: string, port: number): void {
  const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);
  writeFileSync(portFilePath, String(port));
}

/**
 * Remove the .cyclist-approval-port file during shutdown.
 * Prevents stale port files from causing cross-instance interference.
 */
export function cleanupApprovalPortFile(projectDir: string): void {
  const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);
  if (existsSync(portFilePath)) {
    unlinkSync(portFilePath);
  }
}

/**
 * Read the approval server port from .cyclist-approval-port file.
 * Returns null if file doesn't exist or contains invalid content.
 */
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

// ============================================================================
// PID File Pattern (Story B-24 fix)
// Tracks Claude CLI process PID to avoid killing other Cyclist sessions
// ============================================================================

/**
 * Write the Claude process PID to .cyclist-pid file.
 * Used to track which Claude process belongs to this Cyclist instance.
 */
export function writePidFile(projectDir: string, pid: number): void {
  const pidFilePath = join(projectDir, PID_FILE_NAME);
  writeFileSync(pidFilePath, String(pid));
}

/**
 * Remove the .cyclist-pid file during shutdown.
 * Prevents stale PID files from causing incorrect process termination.
 */
export function cleanupPidFile(projectDir: string): void {
  const pidFilePath = join(projectDir, PID_FILE_NAME);
  if (existsSync(pidFilePath)) {
    unlinkSync(pidFilePath);
  }
}

/**
 * Read the PID from .cyclist-pid file.
 * Returns null if file doesn't exist, is empty, or contains invalid content.
 */
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

/**
 * Check if a process with the given PID is still running.
 * Returns true if process exists, false otherwise.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
