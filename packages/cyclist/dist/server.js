import express from 'express';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { join } from 'path';
// Path resolution
import { publicDir, nodeModulesDir, portraitsDir, getProjectDirectory } from './paths.js';
// API routers
import { createStatsRouter, createPortraitRouter, createPersonaRouter, createGitRouter, createOTLPRouter, createStoryRouter, createFileBrowserRouter, createTokenStatsRouter, createContextRouter, createThemeAgentsRouter, createModeRouter, createTelemetryRouter, createEvaluationRouter, createBenchmarkRouter, initTokenStatsBroadcast, } from './api/index.js';
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
export function createTerminalServer() {
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
//# sourceMappingURL=server.js.map