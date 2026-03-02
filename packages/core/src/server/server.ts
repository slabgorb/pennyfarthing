/**
 * Server module for @pennyfarthing/core.
 *
 * WheelHub Express server with all API routes, WebSocket support,
 * port management, settings initialization, and OTEL configuration.
 *
 * Extracted from packages/cyclist/src/server.ts (Story 98-17).
 */

import express, { type Express } from 'express';
import { fileURLToPath } from 'url';
import { createServer, type Server } from 'http';
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
  createProjectInfoRouter,
} from './api/index.js';

// Settings initialization
import { initializeSettings, loadGrants, saveGrants } from './settings.js';

// Grant initialization
import { initializeGrants, setGrantsPersistCallback, clearSessionGrants } from './settings-store.js';
export { clearSessionGrants };

// WebSocket setup
import { setupWebSocketServers } from './websocket.js';

// Plugin router loading
import { initPluginRouters } from './plugin-loader.js';

// Welcome and bell imports for inline endpoints
import { broadcastWelcome } from './api/welcome.js';
import { broadcastBellConsumed } from './api/bell.js';

// OTLP provider registry (lets Cyclist wire its real implementation into core's API routes)
export { setOTLPProvider, storePendingToolInput } from './otlp-receiver.js';
export type { OTLPProvider } from './otlp-receiver.js';
// Local import for inline route handler (re-export above doesn't bind locally)
import { storePendingToolInput } from './otlp-receiver.js';

// Re-exports for Cyclist and external consumers
export { broadcastStats, initTokenStatsBroadcast } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo, getAllReposGitInfo, getAllReposGitInfoAsync } from './api/index.js';
export type { GitInfo } from './api/index.js';

// Path re-exports (Cyclist needs these for its own static file layer)
export { publicDir, nodeModulesDir, portraitsDir, getProjectDirectory, getDistDir } from './paths.js';
export { setProjectDirectory, resetProjectDirectory, parseProjectDirArg, isValidProjectDirectory } from './paths.js';

// Mode detection — entry point determines mode (Story 124-4)
import { getMode, setMode } from './env.js';
export { getMode, setMode };

// =============================================================================
// Express App
// =============================================================================

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
const distPublicDir = join(getDistDir(), 'public');
if (existsSync(distPublicDir)) {
  app.use(express.static(distPublicDir));
}

// Serve node_modules for client-side imports
app.use('/node_modules', express.static(nodeModulesDir));

// Health check endpoint (used by hooks to verify WheelHub is running)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Cache index.html template once at startup, inject mode flag per-request
let indexHtmlTemplate: string | null = null;
const indexHtmlPath = join(publicDir, 'index.html');
if (existsSync(indexHtmlPath)) {
  indexHtmlTemplate = readFileSync(indexHtmlPath, 'utf-8');
}

function serveIndexHtml(_req: express.Request, res: express.Response) {
  if (!indexHtmlTemplate) {
    res.status(404).send('index.html not found');
    return;
  }
  const mode = getMode();
  const injected = indexHtmlTemplate.replace(
    '</head>',
    `<script>window.__PF_MODE__="${mode}";</script>\n</head>`
  );
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(injected);
}

// Both routes serve the same injected HTML — /bikerack kept for backward compat
app.get('/', serveIndexHtml);
app.get('/bikerack', serveIndexHtml);

// Serve pennyfarthing logo from project root
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

// Export getProjectDir for external use
export { getProjectDir };

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
app.use('/api/project-info', createProjectInfoRouter(getProjectDir));

// Mount OTLP at /v1 (standard OTEL endpoint)
app.use('/v1', createOTLPRouter());

// Welcome message endpoint (triggered by SessionStart hook)
app.post('/api/welcome', (req, res) => {
  const { project, theme, show_nudge } = req.body || {};
  try {
    broadcastWelcome({ project: project || '', theme: theme || '', showNudge: !!show_nudge });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to broadcast welcome' });
  }
});

// Bell mode queue sync endpoint
app.post('/api/bell-queue', (req, res) => {
  const projectDir = getProjectDir();
  const queuePath = join(projectDir, '.pennyfarthing', 'bell-queue.json');
  const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');

  try {
    let bellModeEnabled = false;
    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf8');
      bellModeEnabled = /^\s*bell_mode:\s*true/m.test(configContent);
    }

    if (bellModeEnabled) {
      const queue = req.body;
      if (Array.isArray(queue)) {
        writeFileSync(queuePath, JSON.stringify(queue, null, 2));
      }
    } else if (existsSync(queuePath)) {
      unlinkSync(queuePath);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to sync bell queue' });
  }
});

// Bell mode message consumed endpoint
app.post('/api/bell-consumed', (req, res) => {
  const { text } = req.body || {};
  try {
    broadcastBellConsumed(text || '');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to broadcast bell consumed' });
  }
});

// Story 120-13: Pending tool input endpoint (hook-based forwarding for audit log enrichment)
app.post('/api/pending-tool-input', (req, res) => {
  const { toolName, toolId, input } = req.body || {};
  if (!toolName || !toolId) {
    res.status(400).json({ error: 'Missing required fields: toolName, toolId' });
    return;
  }
  try {
    storePendingToolInput(toolId, toolName, input || {});
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to store pending tool input' });
  }
});

// Initialize broadcast callbacks
initTokenStatsBroadcast();

// =============================================================================
// Server Factory
// =============================================================================

export function createTerminalServer(): Server {
  const server = createServer(app);
  setupWebSocketServers(server, getProjectDir);
  return server;
}

// Start server only when run directly (not imported for tests)
const DEFAULT_PORT = parseInt(process.env.PORT || '1898', 10);

if (process.argv[1] === fileURLToPath(import.meta.url) && import.meta.url.endsWith('/server.js')) {
  (async () => {
    const server = createTerminalServer();
    const projectDir = getProjectDir();

    const pluginResult = await initPluginRouters(app, projectDir);
    if (pluginResult.discovered > 0) {
      console.log(`[Plugin] ${pluginResult.loaded} router(s) loaded, ${pluginResult.failed} failed`);
    }

    const actualPort = await findAvailablePort(DEFAULT_PORT);
    if (actualPort !== DEFAULT_PORT) {
      console.log(`Port ${DEFAULT_PORT} in use, using ${actualPort} instead`);
    }

    server.listen(actualPort, '127.0.0.1', () => {
      console.log(`Cyclist running at http://127.0.0.1:${actualPort}`);
      writePortFile(projectDir, actualPort);
    });

    process.on('SIGINT', () => {
      clearSessionGrants();
      cleanupPortFile(projectDir);
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      clearSessionGrants();
      cleanupPortFile(projectDir);
      process.exit(0);
    });
  })();
}

// =============================================================================
// Port File Discovery Pattern (Story 20-1)
// Port Conflict Detection (Story 34-3)
// =============================================================================

const PORT_FILE_NAME = '.bikerack-port';
const PID_FILE_NAME = '.wheelhub-pid';

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
      testServer.listen(port, '127.0.0.1');
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
