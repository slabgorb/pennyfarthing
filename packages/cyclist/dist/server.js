import express from 'express';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { join } from 'path';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
// Path resolution
import { publicDir, nodeModulesDir, portraitsDir, getProjectDirectory } from './paths.js';
// API routers
import { createStatsRouter, createPortraitRouter, createPersonaRouter, createGitRouter, createOTLPRouter, createStoryRouter, createFileBrowserRouter, createTokenStatsRouter, createContextRouter, createThemeAgentsRouter, createModeRouter, createTelemetryRouter, createEvaluationRouter, createBenchmarkRouter, createSettingsRouter, initTokenStatsBroadcast, } from './api/index.js';
// Settings initialization (35-6: required for font settings persistence)
import { initializeSettings } from './settings.js';
// WebSocket setup
import { setupWebSocketServers } from './websocket.js';
// Re-exports for main.ts and tests
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export { getGitInfo } from './api/index.js';
export const app = express();
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
function getProjectDir() {
    return getProjectDirectory() || process.cwd();
}
// Initialize settings from file (35-6: required for font settings persistence)
// Must happen before settings router is used
initializeSettings(getProjectDir());
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
export function createTerminalServer() {
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
const APPROVAL_PORT_FILE_NAME = '.cyclist-approval-port';
const PID_FILE_NAME = '.cyclist-pid';
/**
 * Find an available port starting from the given port.
 * Tries ports sequentially until one is available or maxAttempts reached.
 * Used by both Electron mode and standalone server mode.
 */
export async function findAvailablePort(startPort, maxAttempts = 10) {
    const net = await import('net');
    for (let port = startPort; port < startPort + maxAttempts; port++) {
        const available = await new Promise((resolve) => {
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
export function writePortFile(projectDir, port) {
    const portFilePath = join(projectDir, PORT_FILE_NAME);
    writeFileSync(portFilePath, String(port));
}
/**
 * Remove the .cyclist-port file during shutdown.
 * Prevents stale port files from pointing to non-existent servers.
 */
export function cleanupPortFile(projectDir) {
    const portFilePath = join(projectDir, PORT_FILE_NAME);
    if (existsSync(portFilePath)) {
        unlinkSync(portFilePath);
    }
}
/**
 * Read the port number from .cyclist-port file.
 * Returns null if file doesn't exist, is empty, or contains invalid content.
 */
export function readPortFile(projectDir) {
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
export function writeApprovalPortFile(projectDir, port) {
    const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);
    writeFileSync(portFilePath, String(port));
}
/**
 * Remove the .cyclist-approval-port file during shutdown.
 * Prevents stale port files from causing cross-instance interference.
 */
export function cleanupApprovalPortFile(projectDir) {
    const portFilePath = join(projectDir, APPROVAL_PORT_FILE_NAME);
    if (existsSync(portFilePath)) {
        unlinkSync(portFilePath);
    }
}
/**
 * Read the approval server port from .cyclist-approval-port file.
 * Returns null if file doesn't exist or contains invalid content.
 */
export function readApprovalPortFile(projectDir) {
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
export function writePidFile(projectDir, pid) {
    const pidFilePath = join(projectDir, PID_FILE_NAME);
    writeFileSync(pidFilePath, String(pid));
}
/**
 * Remove the .cyclist-pid file during shutdown.
 * Prevents stale PID files from causing incorrect process termination.
 */
export function cleanupPidFile(projectDir) {
    const pidFilePath = join(projectDir, PID_FILE_NAME);
    if (existsSync(pidFilePath)) {
        unlinkSync(pidFilePath);
    }
}
/**
 * Read the PID from .cyclist-pid file.
 * Returns null if file doesn't exist, is empty, or contains invalid content.
 */
export function readPidFile(projectDir) {
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
export function isProcessRunning(pid) {
    try {
        // Sending signal 0 doesn't kill the process, just checks if it exists
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
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
export function getOtelConfig(projectDir) {
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
//# sourceMappingURL=server.js.map