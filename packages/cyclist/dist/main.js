/**
 * Electron Main Process
 *
 * Wraps the Express server in an Electron app for desktop distribution.
 * The Express server runs inside the main process and serves the UI
 * to a BrowserWindow.
 *
 * This module exports testable functions and constants for unit testing,
 * while the Electron-specific runtime code only executes in Electron context.
 */
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { getCurrentPersona, detectPennyfarthingProject, watchAgentChanges } from './pennyfarthing.js';
import { getStoryInfo, getGitInfo, writePortFile, cleanupPortFile, writePidFile, cleanupPidFile, readPidFile, isProcessRunning, getOtelConfig, findAvailablePort } from './server.js';
import { parseToolStats, createEmptyStats } from './tool-stats.js';
import { getTokenStats, setTokenStatsCallback, setToolEventCallback, aggregateTokenStats, resetTokenStats, resetEventStore, getToolEventsFiltered, getToolTypes, exportAuditLogAsJSON, exportAuditLogAsCSV, getAuditLogStats, getUserEmail, setUserEmailCallback, setBackgroundTaskCallback, } from './otlp-receiver.js';
import { ClaudeService } from './claude-service.js';
import { isTodoWriteMessage, extractTodos } from './todos.js';
import { listDirectory as listDir } from './file-browser.js';
import { getProjectDirectory, setProjectDirectory, isValidProjectDirectory, parseProjectDirArg, } from './paths.js';
import { getContextUsage } from './api/context.js';
import { getVerboseMode, setVerboseMode, loadPersistedGrants } from './settings-store.js';
import { getCurrentSettings, saveUserSettings, } from './settings.js';
import { openSettingsWindow, setMainWindowRef, setBrowserWindowRef } from './settings-window.js';
import { IPC_DATA_CHANNELS, IPC_CLAUDE_CHANNELS, IPC_DIFF_CHANNELS, IPC_SETTINGS_CHANNELS, IPC_AUDIT_LOG_CHANNELS, IPC_FILE_BROWSER_CHANNELS, IPC_COMMAND_CHANNELS, IPC_BACKGROUND_TASK_CHANNELS, } from './ipc-channels.js';
// Re-export project directory functions for external consumers
export { getProjectDirectory, setProjectDirectory, isValidProjectDirectory };
import * as fs from 'fs';
// Calculate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// =============================================================================
// Hot Reload for Development (electron-reload)
// =============================================================================
// Watches dist/* for changes and reloads BrowserWindow
// Main process changes trigger full app restart
try {
    const mod = await import('electron-reload');
    const electronReload = mod.default;
    electronReload(__dirname, {
        electron: join(__dirname, '..', 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit',
    });
    console.log('[Cyclist] Hot reload enabled - watching for file changes');
}
catch {
    // Not in development or module not available
}
// Re-export IPC channels from dedicated module
export { IPC_DATA_CHANNELS, IPC_CLAUDE_CHANNELS, IPC_AGENT_CHANNELS, IPC_DIFF_CHANNELS, IPC_SETTINGS_CHANNELS, IPC_AUDIT_LOG_CHANNELS, IPC_FILE_BROWSER_CHANNELS, IPC_COMMAND_CHANNELS, IPC_BACKGROUND_TASK_CHANNELS, } from './ipc-channels.js';
// Re-export menu builders from dedicated module
export { AGENT_DEFINITIONS, WORKFLOW_DEFINITIONS, buildAgentMenu, buildWorkflowMenu, buildToolsMenu, buildViewMenu, getMenuTemplate, } from './menu-builder.js';
import { buildAgentMenu, buildWorkflowMenu, buildToolsMenu, buildViewMenu, } from './menu-builder.js';
/**
 * Get list of registered data IPC channels (for testing)
 * Returns the data channels that setupDataIPCHandlers will register
 */
export function getDataChannels() {
    return [
        IPC_DATA_CHANNELS.STATS_GET,
        IPC_DATA_CHANNELS.PERSONA_GET,
        IPC_DATA_CHANNELS.STORY_GET,
        IPC_DATA_CHANNELS.GIT_GET,
        IPC_DATA_CHANNELS.TOOL_STATS_GET,
        IPC_DATA_CHANNELS.TOKEN_STATS_GET,
        IPC_DATA_CHANNELS.TODOS_GET,
        IPC_DATA_CHANNELS.CONTEXT_GET,
        IPC_DATA_CHANNELS.USAGE_STATS_GET, // 23-1
        IPC_DATA_CHANNELS.PROJECT_INFO_GET, // 35-2
    ];
}
// Stats state managed by main process
const currentStats = {
    model: '—',
    status: '—',
    mode: '—',
    connected: true, // SDK mode is always "connected"
};
/**
 * Get current stats (for testing)
 */
export function getStats() {
    return { ...currentStats };
}
/**
 * Format model name for display
 * "claude-opus-4-5-20251101" -> "opus 4-5"
 */
function formatModelName(model) {
    return model
        .replace(/^claude-/, '') // Remove "claude-" prefix
        .replace(/-\d{8}$/, '') // Remove date suffix like "-20251101"
        .replace(/-(\d+)-(\d+)$/, ' $1-$2'); // "opus-4-5" -> "opus 4-5"
}
/**
 * Update stats from SDK message
 * Called when SDK messages are received
 */
export function updateStatsFromSDK(message) {
    if (message.type === 'system' && 'model' in message) {
        currentStats.model = formatModelName(message.model);
        currentStats.status = 'Ready';
    }
    // Broadcast to renderer if window exists
    broadcastToRenderer(IPC_DATA_CHANNELS.STATS_UPDATE, currentStats);
}
// =============================================================================
// Tool Stats State (E5-2)
// =============================================================================
/**
 * File path for tool stats JSON (relative to project root)
 */
export const TOOL_STATS_FILE = '.session/tool-stats.json';
/**
 * Current tool stats state - updated by file watcher
 */
let currentToolStats = createEmptyStats();
/**
 * Get current tool stats (for testing and IPC)
 */
export function getToolStats() {
    return { ...currentToolStats, tools: { ...currentToolStats.tools, byType: { ...currentToolStats.tools.byType } } };
}
/**
 * Update tool stats from parsed data
 * Replaces current stats with new data
 */
export function updateToolStats(stats) {
    currentToolStats = {
        tools: {
            total: stats.tools.total,
            byType: { ...stats.tools.byType },
        },
        filesChanged: stats.filesChanged,
        errors: stats.errors,
        lastUpdated: stats.lastUpdated,
    };
    // Broadcast to renderer
    broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_STATS_UPDATE, currentToolStats);
}
/**
 * Reset tool stats to empty state
 * Called when starting a new session
 */
export function resetToolStats() {
    currentToolStats = createEmptyStats();
    // Broadcast reset to renderer
    broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_STATS_UPDATE, currentToolStats);
}
/**
 * Debounce timer for file watcher
 */
let toolStatsDebounceTimer = null;
const TOOL_STATS_DEBOUNCE_MS = 100;
/**
 * Watch tool stats file for changes
 * Returns cleanup function to stop watching
 *
 * @param projectDir - The project directory to watch
 * @param callback - Called when stats are updated
 * @returns Cleanup function
 */
export function watchToolStats(projectDir, callback) {
    const statsPath = join(projectDir, TOOL_STATS_FILE);
    const sessionDir = dirname(statsPath);
    let watcher = null;
    // Check if session directory exists
    if (!fs.existsSync(sessionDir)) {
        // Directory doesn't exist - return no-op cleanup
        console.log('Tool stats directory does not exist:', sessionDir);
        return () => { };
    }
    try {
        // Watch the session directory for changes to tool-stats.json
        watcher = fs.watch(sessionDir, (eventType, filename) => {
            if (filename === 'tool-stats.json') {
                // Debounce rapid changes
                if (toolStatsDebounceTimer) {
                    clearTimeout(toolStatsDebounceTimer);
                }
                toolStatsDebounceTimer = setTimeout(() => {
                    try {
                        if (fs.existsSync(statsPath)) {
                            const content = fs.readFileSync(statsPath, 'utf-8');
                            const parsed = parseToolStats(content);
                            if (parsed) {
                                updateToolStats(parsed);
                                callback(parsed);
                            }
                        }
                    }
                    catch (err) {
                        console.error('Error reading tool stats:', err.message);
                    }
                }, TOOL_STATS_DEBOUNCE_MS);
            }
        });
        console.log('Watching tool stats file:', statsPath);
    }
    catch (err) {
        console.error('Failed to watch tool stats:', err.message);
        return () => { };
    }
    // Return cleanup function
    return () => {
        if (toolStatsDebounceTimer) {
            clearTimeout(toolStatsDebounceTimer);
            toolStatsDebounceTimer = null;
        }
        if (watcher) {
            watcher.close();
            watcher = null;
        }
    };
}
// =============================================================================
// Todos State (B-17)
// =============================================================================
/**
 * Current todos state - updated by SDK messages containing TodoWrite
 * Persists across messages in the same session
 */
let currentTodos = [];
/**
 * Get current todos (for testing and IPC)
 */
export function getTodos() {
    return [...currentTodos];
}
/**
 * Update todos state from TodoWrite message
 * Replaces current todos with new data and broadcasts to renderer
 */
export function updateTodosState(todos) {
    currentTodos = [...todos];
    broadcastToRenderer(IPC_DATA_CHANNELS.TODOS_UPDATE, currentTodos);
}
/**
 * Reset todos to empty state
 * Called when clearing session
 */
export function resetTodos() {
    currentTodos = [];
    broadcastToRenderer(IPC_DATA_CHANNELS.TODOS_UPDATE, currentTodos);
}
// =============================================================================
// Context State (B-19)
// =============================================================================
/**
 * Current context state - updated by polling check-context.sh
 */
let currentContext = {
    percent: null,
    tokens: null,
    status: null,
    error: null,
};
/**
 * Get current context (for testing and IPC)
 */
export function getContext() {
    return { ...currentContext };
}
/**
 * Reset context state to initial values
 * Called when clearing session
 */
export function resetContext() {
    currentContext = {
        percent: null,
        tokens: null,
        status: null,
        error: null,
    };
    broadcastToRenderer(IPC_DATA_CHANNELS.CONTEXT_UPDATE, currentContext);
}
/**
 * Update context state and broadcast if changed
 * Returns true if context was updated (values changed)
 */
export function updateContextState(context) {
    // Check if values actually changed
    if (currentContext.percent === context.percent &&
        currentContext.tokens === context.tokens &&
        currentContext.status === context.status) {
        return false;
    }
    currentContext = { ...context };
    broadcastToRenderer(IPC_DATA_CHANNELS.CONTEXT_UPDATE, currentContext);
    return true;
}
/**
 * Context polling interval in milliseconds
 * 15 seconds balances responsiveness vs overhead
 */
export const CONTEXT_POLL_INTERVAL_MS = 15000;
/**
 * Timer reference for context polling
 */
let contextPollTimer = null;
/**
 * Start polling context usage
 * Calls getContextUsage periodically and broadcasts changes
 * @param projectDir - The project directory
 * @param getSessionId - Optional function to get current session ID (for session-specific context)
 */
export function startContextPolling(projectDir, getSessionId) {
    // Initial fetch (may not have session ID yet)
    const sessionId = getSessionId?.() ?? undefined;
    const initialContext = getContextUsage(projectDir, sessionId);
    updateContextState(initialContext);
    // Set up polling
    contextPollTimer = setInterval(() => {
        // Get session ID each poll - it may become available after first message
        const currentSessionId = getSessionId?.() ?? undefined;
        const context = getContextUsage(projectDir, currentSessionId);
        const changed = updateContextState(context);
        if (changed) {
            console.log('Context updated:', context.percent, '%', currentSessionId ? `(session: ${currentSessionId.slice(0, 8)}...)` : '');
        }
    }, CONTEXT_POLL_INTERVAL_MS);
    console.log('Context polling started (every', CONTEXT_POLL_INTERVAL_MS / 1000, 's)');
    // Return cleanup function
    return () => {
        if (contextPollTimer) {
            clearInterval(contextPollTimer);
            contextPollTimer = null;
            console.log('Context polling stopped');
        }
    };
}
// =============================================================================
// Re-export usage stats from dedicated module
export { getUsageStats, USAGE_POLL_INTERVAL_MS, startUsagePolling } from './usage-stats.js';
import { getUsageStats, resetUsageStats as resetUsageStatsInternal, startUsagePolling as startUsagePollingInternal, } from './usage-stats.js';
// Wrapper functions that include broadcast
function resetUsageStats() {
    resetUsageStatsInternal((s) => broadcastToRenderer(IPC_DATA_CHANNELS.USAGE_STATS_UPDATE, s));
}
function startUsagePolling(projectDir) {
    return startUsagePollingInternal(projectDir, (s) => broadcastToRenderer(IPC_DATA_CHANNELS.USAGE_STATS_UPDATE, s));
}
// =============================================================================
// Server Control (B-2.1)
// =============================================================================
/**
 * Server startup configuration
 * In Electron mode, server can be disabled since we use IPC
 */
export const serverEnabled = false; // Disable server in Electron - use IPC instead
/**
 * Check if server should start (for testing)
 */
export function shouldStartServer() {
    // In Electron mode with IPC, server is not needed
    return serverEnabled;
}
// =============================================================================
// Window Configuration (Testable Export)
// =============================================================================
/**
 * BrowserWindow configuration
 * Exported for testing security settings
 */
export const windowConfig = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Cyclist',
    webPreferences: {
        // Security: disable node integration in renderer
        nodeIntegration: false,
        // Security: enable context isolation
        contextIsolation: true,
        // Preload script for safe IPC bridge
        preload: join(__dirname, 'preload.js'),
    },
};
/**
 * Get window configuration (for testing)
 */
export function getWindowConfig() {
    return windowConfig;
}
// =============================================================================
// Server Port (for OTEL config)
// =============================================================================
// Actual port the server is running on (for OTEL config)
let serverPort = 1898;
export function setActualPort(port) {
    serverPort = port;
}
export function getActualPort() {
    return serverPort;
}
// Parse CLI args on module load
parseProjectDirArg();
// =============================================================================
// Data IPC Handler Setup (Testable Export) - B-2
// =============================================================================
// Reference to main window for broadcasting data updates
let dataWindowRef = null;
/**
 * Set the main window reference for data broadcasts
 * Called when window is created in Electron runtime
 */
export function setMainWindow(window) {
    dataWindowRef = window;
}
/**
 * Broadcast data update to renderer via IPC
 * @param channel - The IPC channel to broadcast on
 * @param data - The data to send
 */
export function broadcastToRenderer(channel, data) {
    // Check window exists and is not destroyed before sending
    if (dataWindowRef && !dataWindowRef.webContents.isDestroyed()) {
        dataWindowRef.webContents.send(channel, data);
    }
}
/**
 * Set up IPC handlers for sidebar data communication
 * Called after app is ready in Electron
 * B-2.1: Handlers now wired to real data sources
 */
export function setupDataIPCHandlers(ipcMain) {
    // Stats handler - returns current stats state (B-2.1)
    ipcMain.handle(IPC_DATA_CHANNELS.STATS_GET, async () => {
        return currentStats;
    });
    // Persona handler - returns current persona from pennyfarthing (B-2.1)
    ipcMain.handle(IPC_DATA_CHANNELS.PERSONA_GET, async () => {
        const projectDir = getProjectDirectory();
        if (!projectDir)
            return { projectName: 'No Project' };
        const projectName = basename(projectDir);
        if (!detectPennyfarthingProject(projectDir)) {
            return { projectName };
        }
        const sessionId = process.env.CYCLIST_SESSION_ID;
        const persona = getCurrentPersona(projectDir, sessionId);
        return { ...persona, projectName };
    });
    // Story handler - returns current story from session files (B-2.1)
    ipcMain.handle(IPC_DATA_CHANNELS.STORY_GET, async () => {
        const projectDir = getProjectDirectory();
        if (!projectDir || !detectPennyfarthingProject(projectDir)) {
            return { id: null, title: null, phase: null, status: null, points: null, sprint: null };
        }
        return getStoryInfo(projectDir);
    });
    // Git handler - returns git status from repository (B-2.1)
    ipcMain.handle(IPC_DATA_CHANNELS.GIT_GET, async () => {
        const projectDir = getProjectDirectory();
        if (!projectDir)
            return null;
        return getGitInfo(projectDir);
    });
    // Tool stats handler - returns current tool stats (E5-2)
    ipcMain.handle(IPC_DATA_CHANNELS.TOOL_STATS_GET, async () => {
        return getToolStats();
    });
    // Token stats handler - returns current token stats from OTLP receiver (E6-3)
    ipcMain.handle(IPC_DATA_CHANNELS.TOKEN_STATS_GET, async () => {
        return getTokenStats();
    });
    // Todos handler - returns current todos state (B-17)
    ipcMain.handle(IPC_DATA_CHANNELS.TODOS_GET, async () => {
        return getTodos();
    });
    // Context handler - returns current context usage (B-19)
    ipcMain.handle(IPC_DATA_CHANNELS.CONTEXT_GET, async () => {
        return getContext();
    });
    // Usage stats handler - returns current usage limits (23-1)
    ipcMain.handle(IPC_DATA_CHANNELS.USAGE_STATS_GET, async () => {
        return getUsageStats();
    });
    // 35-2: Project info handler - returns directory and user email
    ipcMain.handle(IPC_DATA_CHANNELS.PROJECT_INFO_GET, async () => {
        return {
            directory: getProjectDirectory(),
            userEmail: getUserEmail(),
        };
    });
    console.log('Data IPC handlers registered:', getDataChannels());
}
/**
 * Start file watchers for project-specific data
 * Called after project directory is confirmed (post folder picker)
 */
export function startProjectWatchers() {
    const projectDir = getProjectDirectory();
    if (!projectDir) {
        console.warn('Cannot start watchers: no project directory');
        return;
    }
    // Start watching for tool stats file changes (E5-2)
    watchToolStats(projectDir, (_stats) => {
        console.log('Tool stats updated');
    });
    // Register token stats callback
    setTokenStatsCallback((stats) => {
        broadcastToRenderer(IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE, stats);
        console.log('Token stats broadcast:', stats.inputTokens, 'in /', stats.outputTokens, 'out');
    });
    console.log('Token stats callback registered for OTLP broadcasts');
    // Register tool event callback for audit log real-time updates
    setToolEventCallback((event) => {
        broadcastToRenderer(IPC_AUDIT_LOG_CHANNELS.ENTRY, event);
        console.log(`Tool event broadcast: ${event.toolName}`);
    });
    console.log('Tool event callback registered for audit log broadcasts');
    // 35-2: Register user email callback for project info updates
    setUserEmailCallback((email) => {
        broadcastToRenderer(IPC_DATA_CHANNELS.PROJECT_INFO_UPDATE, {
            directory: getProjectDirectory(),
            userEmail: email,
        });
        console.log(`User email discovered: ${email}`);
    });
    console.log('User email callback registered for OTLP broadcasts');
    // 31-15: Register background task completion callback
    setBackgroundTaskCallback((task) => {
        broadcastToRenderer(IPC_BACKGROUND_TASK_CHANNELS.TASK_COMPLETED, task);
        console.log(`Background task completed: ${task.subagentType} (${task.success ? 'success' : 'failed'})`);
    });
    console.log('Background task callback registered for OTLP broadcasts');
    // Start watching for agent changes
    if (detectPennyfarthingProject(projectDir)) {
        const sessionId = process.env.CYCLIST_SESSION_ID;
        const projectName = basename(projectDir);
        watchAgentChanges(projectDir, sessionId, (_agentRole) => {
            const persona = getCurrentPersona(projectDir, sessionId);
            if (persona) {
                broadcastToRenderer(IPC_DATA_CHANNELS.PERSONA_UPDATE, { ...persona, projectName });
            }
        });
        console.log('Agent change watcher started for:', projectDir);
        // Start context polling (B-19) with session ID for session-specific tracking (17-7)
        startContextPolling(projectDir, () => {
            try {
                return getClaudeService().getSessionId();
            }
            catch {
                // ClaudeService may not be initialized yet
                return null;
            }
        });
        // Start usage polling (23-1)
        startUsagePolling(projectDir);
    }
}
// =============================================================================
// Claude SDK IPC Handlers (E7-3)
// =============================================================================
// ClaudeService instance - created lazily
let claudeServiceInstance = null;
/**
 * Get the ClaudeService instance (creates if needed)
 * E7-3: Provides access to SDK service for IPC handlers
 */
export function getClaudeService() {
    if (!claudeServiceInstance) {
        const projectDir = getProjectDirectory();
        if (!projectDir)
            throw new Error('Cannot create ClaudeService: no project directory set');
        // Get OTEL config to enable telemetry streaming to Cyclist
        const otelConfig = getOtelConfig(projectDir);
        claudeServiceInstance = new ClaudeService({
            cwd: projectDir,
            env: otelConfig ?? undefined,
        });
        // B-24 fix: Track Claude process PID for targeted cleanup
        claudeServiceInstance.on('process-spawned', (pid) => {
            writePidFile(projectDir, pid);
            console.log(`[ClaudeService] Wrote PID file: ${pid}`);
        });
        if (otelConfig) {
            console.log('[ClaudeService] OTEL config enabled:', otelConfig.OTEL_EXPORTER_OTLP_ENDPOINT);
        }
        else {
            console.warn('[ClaudeService] OTEL config not available - tool events will not stream');
        }
    }
    return claudeServiceInstance;
}
/**
 * Set up IPC handlers for Claude SDK communication
 * E7-3: Handles claude:send and streams responses to renderer
 * 28-1: Adds image support via stream-json input
 */
export function setupClaudeIPCHandlers(ipcMain) {
    ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_SEND, async (_event, ...args) => {
        const prompt = args[0];
        const images = args[1] || [];
        const service = getClaudeService();
        if (images.length > 0) {
            console.log(`[main] Processing ${images.length} pasted image(s) via stream-json`);
        }
        try {
            for await (const message of service.sendMessage(prompt, { images })) {
                broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_MESSAGE, message);
                // Update stats from SDK message (model info, etc.)
                updateStatsFromSDK(message);
                // Extract token usage from result messages and update sidebar stats
                if (message.type === 'result' && 'usage' in message && message.usage) {
                    const usage = message.usage;
                    aggregateTokenStats({
                        inputTokens: usage.input_tokens,
                        outputTokens: usage.output_tokens,
                        cacheReadTokens: usage.cache_read_tokens,
                        cacheCreationTokens: usage.cache_creation_tokens,
                    });
                }
                // B-17: Extract and broadcast todos from TodoWrite messages
                if (isTodoWriteMessage(message)) {
                    const todos = extractTodos(message);
                    updateTodosState(todos);
                }
                // E8-2: Broadcast diff data for Edit/Write tool messages
                // Tool_use blocks are nested inside 'assistant' messages under message.content[]
                if (message.type === 'assistant') {
                    const assistantMsg = message;
                    const content = assistantMsg.message?.content;
                    if (content && Array.isArray(content)) {
                        for (const block of content) {
                            if (block.type === 'tool_use') {
                                if (block.name === 'Edit') {
                                    const input = block.input;
                                    broadcastToRenderer(IPC_DIFF_CHANNELS.DIFF_UPDATE, {
                                        id: block.id || `edit-${Date.now()}`,
                                        filePath: input.file_path,
                                        oldContent: input.old_string,
                                        newContent: input.new_string,
                                        toolType: 'Edit',
                                        timestamp: Date.now(),
                                    });
                                }
                                else if (block.name === 'Write') {
                                    const input = block.input;
                                    broadcastToRenderer(IPC_DIFF_CHANNELS.DIFF_UPDATE, {
                                        id: block.id || `write-${Date.now()}`,
                                        filePath: input.file_path,
                                        oldContent: '',
                                        newContent: input.content,
                                        toolType: 'Write',
                                        timestamp: Date.now(),
                                        isNewFile: true,
                                    });
                                }
                            }
                        }
                    }
                }
            }
            broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_COMPLETE, null);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_ERROR, errorMessage);
            throw error;
        }
    });
    // Permission mode handlers
    ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_SET_MODE, async (_event, ...args) => {
        const mode = args[0];
        const service = getClaudeService();
        service.setPermissionMode(mode);
        return mode;
    });
    ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_GET_MODE, async () => {
        const service = getClaudeService();
        return service.getPermissionMode();
    });
    // Interrupt handler - stops current Claude turn (like Escape in CLI)
    ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_ABORT, async () => {
        const service = getClaudeService();
        service.interrupt();
        return true;
    });
    // Clear handler - resets all session state (like /clear in CLI)
    ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_CLEAR, async () => {
        const service = getClaudeService();
        service.clearSession();
        clearSessionId();
        resetTokenStats();
        resetTodos();
        resetEventStore(); // Clear tool events (changed files, diffs)
        resetToolStats();
        resetContext(); // Clear context percentage
        resetUsageStats(); // Clear usage stats (23-2)
        // Broadcast zeroed stats to update UI immediately
        broadcastToRenderer(IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE, getTokenStats());
        broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_STATS_UPDATE, createEmptyStats());
        broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_EVENTS_UPDATE, []);
        broadcastToRenderer(IPC_DATA_CHANNELS.CONTEXT_UPDATE, { percent: 0, contextWindow: 0 }); // (23-2)
        broadcastToRenderer(IPC_DATA_CHANNELS.PERSONA_UPDATE, null); // Clear persona (23-2)
        console.log('Session cleared: tokens, todos, tool events, tool stats, context, usage, persona');
        return true;
    });
    console.log('Claude SDK IPC handlers registered');
}
// =============================================================================
// File Browser IPC Handlers (E8-3)
// =============================================================================
/**
 * Set up IPC handlers for file browser
 * E8-3: Handles directory listing and file opening
 */
export function setupFileBrowserIPCHandlers(ipcMain) {
    // List directory handler - returns directory contents
    ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.LIST_DIRECTORY, async (_event, ...args) => {
        const dirPath = args[0];
        const projectDir = getProjectDirectory();
        if (!projectDir) {
            throw new Error('No project directory set');
        }
        return listDir(dirPath, projectDir);
    });
    // Open file handler - broadcasts file open event (for E8-4 integration)
    ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.OPEN_FILE, async (_event, ...args) => {
        const filePath = args[0];
        // For E8-3: Just log the file open request
        // E8-4 will add actual file viewer tab creation
        console.log('[FileBrowser] Open file requested:', filePath);
        broadcastToRenderer('file-browser:file-opened', { path: filePath });
        return true;
    });
    // Open in external editor handler - opens file in user's $EDITOR
    ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.OPEN_IN_EDITOR, async (_event, ...args) => {
        const filePath = args[0];
        const lineNumber = args[1];
        const editor = process.env.EDITOR || process.env.VISUAL || 'code';
        console.log('[FileBrowser] Opening in editor:', editor, filePath, lineNumber ? `:${lineNumber}` : '');
        try {
            const { spawn } = await import('child_process');
            // Build args based on editor type
            let editorArgs;
            if (editor.includes('code') || editor.includes('cursor')) {
                // VS Code / Cursor: --goto file:line
                editorArgs = lineNumber ? ['--goto', `${filePath}:${lineNumber}`] : [filePath];
            }
            else if (editor.includes('vim') || editor.includes('nvim')) {
                // Vim/Neovim: +line file
                editorArgs = lineNumber ? [`+${lineNumber}`, filePath] : [filePath];
            }
            else if (editor.includes('emacs')) {
                // Emacs: +line file
                editorArgs = lineNumber ? [`+${lineNumber}`, filePath] : [filePath];
            }
            else if (editor.includes('subl')) {
                // Sublime: file:line
                editorArgs = lineNumber ? [`${filePath}:${lineNumber}`] : [filePath];
            }
            else {
                // Generic fallback
                editorArgs = [filePath];
            }
            spawn(editor, editorArgs, { detached: true, stdio: 'ignore' }).unref();
            return true;
        }
        catch (error) {
            console.error('[FileBrowser] Failed to open in editor:', error);
            return false;
        }
    });
    console.log('File browser IPC handlers registered');
}
// =============================================================================
// Settings IPC Handlers (22-5)
// =============================================================================
// =============================================================================
// Settings State (24-1)
// =============================================================================
/**
 * Flag indicating if settings have been initialized
 */
export const isSettingsInitialized = false;
/**
 * Handle settings:get IPC call
 * Returns current settings
 */
export async function handleSettingsGet() {
    return getCurrentSettings();
}
/**
 * Handle settings:save IPC call
 * Saves settings and returns result with success flag
 * Also writes theme to persona-config.local.yaml for Pennyfarthing compatibility (24-2)
 */
export async function handleSettingsSave(settings) {
    try {
        saveUserSettings(settings);
        // 24-2: Dual-write theme to persona-config.local.yaml for Pennyfarthing compatibility
        const projectDir = getProjectDirectory();
        if (settings.pennyfarthing?.theme && projectDir) {
            try {
                const personaConfigPath = join(projectDir, '.claude', 'persona-config.local.yaml');
                fs.writeFileSync(personaConfigPath, `theme: "${settings.pennyfarthing.theme}"\n`, 'utf-8');
            }
            catch (err) {
                console.error('Failed to write persona-config.local.yaml:', err);
            }
        }
        return { success: true, settings: getCurrentSettings() };
    }
    catch {
        return { success: false };
    }
}
// Re-export theme metadata from dedicated module
export { CATEGORY_MAP, deriveCategory, getThemeMetadataCache, getAvailableThemes, loadThemeMetadata, loadThemeMetadataWithAgents, } from './theme-metadata.js';
import { getAvailableThemes, loadThemeMetadata } from './theme-metadata.js';
// Re-export from menu-builder
export { registerSettingsShortcut } from './menu-builder.js';
/**
 * Set up IPC handlers for settings
 * 22-5: Handles verbose mode setting get/set
 * 24-1: Handles full settings panel infrastructure
 */
export function setupSettingsIPCHandlers(ipcMain) {
    // Get verbose mode state
    ipcMain.handle(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_GET, async () => {
        return getVerboseMode();
    });
    // Set verbose mode state
    ipcMain.handle(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_SET, async (_event, ...args) => {
        const enabled = args[0];
        setVerboseMode(enabled);
        broadcastToRenderer(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_UPDATE, enabled);
        return enabled;
    });
    // 24-1: Get all settings
    ipcMain.handle(IPC_SETTINGS_CHANNELS.GET, async () => {
        return handleSettingsGet();
    });
    // 24-1: Save settings
    ipcMain.handle(IPC_SETTINGS_CHANNELS.SAVE, async (_event, ...args) => {
        const settings = args[0];
        const updated = await handleSettingsSave(settings);
        broadcastToRenderer(IPC_SETTINGS_CHANNELS.CHANGED, updated);
        return updated;
    });
    // 24-1: Open settings window
    ipcMain.handle(IPC_SETTINGS_CHANNELS.OPEN_WINDOW, async () => {
        openSettingsWindow();
    });
    // 24-2: Get available themes
    ipcMain.handle(IPC_SETTINGS_CHANNELS.GET_AVAILABLE_THEMES, async () => {
        return getAvailableThemes();
    });
    // 24-5: Get theme metadata
    ipcMain.handle(IPC_SETTINGS_CHANNELS.GET_THEME_METADATA, async () => {
        return loadThemeMetadata();
    });
    console.log('Settings IPC handlers registered');
}
// =============================================================================
// Audit Log IPC Handlers (22-6)
// =============================================================================
/**
 * Set up IPC handlers for audit log
 * 22-6: Handles audit log get/filter/export/clear
 */
export function setupAuditLogIPCHandlers(ipcMain) {
    // Get all entries (optionally filtered)
    ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.GET_ENTRIES, async (_event, ...args) => {
        const toolType = args[0];
        return getToolEventsFiltered(toolType);
    });
    // Get unique tool types
    ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.GET_TYPES, async () => {
        return getToolTypes();
    });
    // Export as JSON or CSV
    ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.EXPORT, async (_event, ...args) => {
        const format = args[0];
        const toolType = args[1];
        if (format === 'csv') {
            return exportAuditLogAsCSV(toolType);
        }
        return exportAuditLogAsJSON(toolType);
    });
    // Get stats summary
    ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.GET_STATS, async () => {
        return getAuditLogStats();
    });
    // Clear audit log (reuses existing resetEventStore)
    ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.CLEAR, async () => {
        resetEventStore();
        return true;
    });
    console.log('Audit log IPC handlers registered');
}
// =============================================================================
// Command IPC Handlers (23-3)
// =============================================================================
// Track registered command channels for testing
// Initialized with known channels so getCommandChannels() works before setupCommandIPCHandlers()
let registeredCommandChannels = [IPC_COMMAND_CHANNELS.EXECUTE];
/**
 * Get list of registered command channels (for testing)
 * 23-3: Allows tests to verify channel registration
 */
export function getCommandChannels() {
    return [...registeredCommandChannels];
}
/**
 * Set up IPC handlers for command execution
 * 23-3: Handles Claude Code command execution via IPC
 */
export function setupCommandIPCHandlers(ipcMain) {
    // Execute command in Claude PTY session
    ipcMain.handle(IPC_COMMAND_CHANNELS.EXECUTE, async (_event, ...args) => {
        const command = args[0];
        // Get the Claude service singleton
        const service = getClaudeService();
        if (!service) {
            broadcastToRenderer(IPC_COMMAND_CHANNELS.ERROR, 'Claude service not initialized');
            throw new Error('Claude service not initialized');
        }
        try {
            // Send command to Claude and stream results
            // The command will be executed in the PTY session
            for await (const message of service.sendMessage(command)) {
                broadcastToRenderer(IPC_COMMAND_CHANNELS.RESULT, message);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            broadcastToRenderer(IPC_COMMAND_CHANNELS.ERROR, message);
            throw error;
        }
    });
    // Track registered channels
    registeredCommandChannels = [IPC_COMMAND_CHANNELS.EXECUTE];
    console.log('Command IPC handlers registered');
}
// =============================================================================
// Session Persistence (E7-3: AC4)
// =============================================================================
// Session ID file path (stored in project directory)
const SESSION_FILE_NAME = '.cyclist-session';
/**
 * Get the session file path
 */
function getSessionFilePath() {
    const projectDir = getProjectDirectory();
    if (!projectDir)
        return null;
    return join(projectDir, SESSION_FILE_NAME);
}
/**
 * Save session ID to file for persistence across app restarts
 * E7-3: Session persistence support
 */
export function saveSessionId(sessionId) {
    const filePath = getSessionFilePath();
    if (!filePath) {
        console.warn('Cannot save session ID: no project directory');
        return;
    }
    try {
        fs.writeFileSync(filePath, sessionId, 'utf8');
        console.log('Session ID saved:', sessionId);
    }
    catch (error) {
        console.warn('Failed to save session ID:', error);
    }
}
/**
 * Load session ID from file (returns null if not found)
 * E7-3: Session restoration support
 */
export function loadSessionId() {
    const filePath = getSessionFilePath();
    if (!filePath)
        return null;
    try {
        if (fs.existsSync(filePath)) {
            const sessionId = fs.readFileSync(filePath, 'utf8').trim();
            console.log('Session ID loaded:', sessionId);
            return sessionId || null;
        }
    }
    catch (error) {
        console.warn('Failed to load session ID:', error);
    }
    return null;
}
/**
 * Clear saved session ID (for new conversation)
 * E7-3: New conversation support
 */
export function clearSessionId() {
    const filePath = getSessionFilePath();
    if (!filePath)
        return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Session ID cleared');
        }
    }
    catch (error) {
        console.warn('Failed to clear session ID:', error);
    }
}
// =============================================================================
// Electron Runtime (Only executes in Electron context)
// =============================================================================
// Check if running in Electron
const isElectron = typeof process !== 'undefined' &&
    process.versions &&
    process.versions.electron;
if (isElectron) {
    // Dynamic imports to avoid errors in Node test environment
    const { app, BrowserWindow, ipcMain, dialog, Menu } = await import('electron');
    const { createTerminalServer } = await import('./server.js');
    // Pass BrowserWindow to settings-window module (ESM-compatible, avoids require())
    setBrowserWindowRef(BrowserWindow);
    // Suppress error dialogs - log to console instead
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error.message);
    });
    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled rejection:', reason);
    });
    // Keep references to prevent garbage collection
    let mainWindow = null;
    let server = null;
    // Default port starts at 1898 (branding)
    const DEFAULT_PORT = parseInt(process.env.PORT || '1898', 10);
    let actualPort = DEFAULT_PORT;
    // findAvailablePort imported from server.ts (Story 34-3)
    /**
     * Create the main application window
     */
    function createWindow() {
        mainWindow = new BrowserWindow(windowConfig);
        // Load the Express server URL (using the actual port found)
        mainWindow.loadURL(`http://localhost:${actualPort}`);
        // Handle window closed
        mainWindow.on('closed', () => {
            mainWindow = null;
            setMainWindow(null);
        });
        // Set main window for data broadcasts
        setMainWindow(mainWindow);
        // 24-1: Set main window reference for settings modal parent
        setMainWindowRef(mainWindow);
    }
    /**
     * Start the Express server on an available port
     */
    async function startServer() {
        // Find an available port
        actualPort = await findAvailablePort(DEFAULT_PORT);
        if (actualPort !== DEFAULT_PORT) {
            console.log(`Port ${DEFAULT_PORT} in use, using ${actualPort} instead`);
        }
        // Store the port globally for OTEL config in spawnPTY
        setActualPort(actualPort);
        return new Promise((resolve, reject) => {
            try {
                server = createTerminalServer();
                server.listen(actualPort, () => {
                    console.log(`Cyclist server running at http://localhost:${actualPort}`);
                    // Write port file for OTEL auto-configuration (Story 20-1)
                    const projectDir = getProjectDirectory();
                    if (projectDir) {
                        writePortFile(projectDir, actualPort);
                        console.log(`[OTEL] Wrote .cyclist-port file to ${projectDir}`);
                    }
                    resolve();
                });
                server.on('error', reject);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Stop the Express server gracefully
     */
    function stopServer() {
        return new Promise((resolve) => {
            // Clean up port file before stopping (Story 20-1)
            const projectDir = getProjectDirectory();
            if (projectDir) {
                cleanupPortFile(projectDir);
                console.log('[OTEL] Cleaned up .cyclist-port file');
            }
            if (server) {
                server.close(() => {
                    console.log('Cyclist server stopped');
                    server = null;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    // Set up IPC handlers
    setupDataIPCHandlers(ipcMain);
    setupClaudeIPCHandlers(ipcMain);
    setupFileBrowserIPCHandlers(ipcMain);
    setupSettingsIPCHandlers(ipcMain);
    setupAuditLogIPCHandlers(ipcMain);
    setupCommandIPCHandlers(ipcMain); // 23-3: Command execution
    /**
     * Kill orphaned Claude CLI process from previous Cyclist session in THIS project.
     * B-24 fix: Only kills the specific PID from .cyclist-pid, not all Claude processes.
     * This prevents disrupting other running Cyclist sessions.
     */
    function cleanupStaleProcesses() {
        const projectDir = getProjectDirectory();
        if (!projectDir)
            return;
        const stalePid = readPidFile(projectDir);
        if (!stalePid) {
            // No PID file means no stale process to clean up
            return;
        }
        // Check if the process is still running
        if (isProcessRunning(stalePid)) {
            try {
                process.kill(stalePid, 'SIGTERM');
                console.log(`[Cyclist] Cleaned up stale Claude process (PID: ${stalePid})`);
            }
            catch (err) {
                console.warn(`[Cyclist] Failed to kill stale process ${stalePid}:`, err);
            }
        }
        // Clean up the stale PID file
        cleanupPidFile(projectDir);
    }
    /**
     * Show folder picker dialog
     * Returns the selected path or null if canceled
     */
    async function promptForProjectDirectory() {
        const result = await dialog.showOpenDialog({
            title: 'Choose Project Directory',
            message: 'Select a Pennyfarthing-enabled project folder',
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: 'Open Project',
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return result.filePaths[0];
    }
    /**
     * Show error dialog for non-Pennyfarthing projects
     * Returns true if user wants to try again, false to quit
     */
    async function showPennyfarthingRequiredError(selectedPath) {
        const result = await dialog.showMessageBox({
            type: 'error',
            title: 'Pennyfarthing Required',
            message: 'This folder is not a Pennyfarthing-enabled project',
            detail: `The folder "${basename(selectedPath)}" does not have Pennyfarthing installed.\n\nCyclist requires a .claude directory with Pennyfarthing configuration.\n\nPlease select a different folder or install Pennyfarthing in this project first.`,
            buttons: ['Choose Different Folder', 'Quit'],
            defaultId: 0,
            cancelId: 1,
        });
        return result.response === 0; // true if "Choose Different Folder"
    }
    // App ready - check for project directory, validate Pennyfarthing, then start
    app.whenReady().then(async () => {
        try {
            let projectDir = getProjectDirectory();
            // Loop until we have a valid Pennyfarthing project or user quits
            while (true) {
                // If no project directory, show folder picker
                if (!projectDir) {
                    console.log('[Cyclist] No project directory, showing folder picker');
                    const selectedPath = await promptForProjectDirectory();
                    if (!selectedPath) {
                        console.log('[Cyclist] User canceled folder selection');
                        app.quit();
                        return;
                    }
                    // Validate and set the directory
                    if (isValidProjectDirectory(selectedPath)) {
                        setProjectDirectory(selectedPath);
                        projectDir = selectedPath;
                    }
                    else {
                        continue; // Invalid path, try again
                    }
                }
                // Check for Pennyfarthing installation
                if (!detectPennyfarthingProject(projectDir)) {
                    console.log('[Cyclist] Not a Pennyfarthing project:', projectDir);
                    const tryAgain = await showPennyfarthingRequiredError(projectDir);
                    if (!tryAgain) {
                        console.log('[Cyclist] User chose to quit');
                        app.quit();
                        return;
                    }
                    // Reset and let user pick again
                    projectDir = null;
                    continue;
                }
                // Valid Pennyfarthing project found
                break;
            }
            console.log('[Cyclist] Using Pennyfarthing project:', projectDir);
            // 33-4: Load persisted permission grants from settings
            loadPersistedGrants();
            // B-24: Kill any orphaned Claude processes from crashed sessions
            cleanupStaleProcesses();
            await startServer();
            createWindow();
            if (mainWindow && projectDir) {
                mainWindow.setTitle(`Cyclist - ${basename(projectDir)}`);
            }
            // B-23: Wire agent and workflow menus to Electron menu bar
            // Use standard macOS menu roles instead of reconstructing existing menu
            // (reconstructing fails on nested submenus like Window)
            // 22-5: Custom View menu with Verbose Mode toggle
            // 24-1: Custom app menu with Settings
            const menuTemplate = [
                {
                    label: 'Cyclist',
                    submenu: [
                        { role: 'about' },
                        { type: 'separator' },
                        { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: () => openSettingsWindow() },
                        { type: 'separator' },
                        { role: 'services' },
                        { type: 'separator' },
                        { role: 'hide' },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        { role: 'quit' },
                    ],
                },
                { role: 'fileMenu' },
                { role: 'editMenu' },
                buildViewMenu(),
                buildToolsMenu(),
                buildAgentMenu(),
                buildWorkflowMenu(),
                { role: 'windowMenu' },
                { role: 'help', submenu: [{ label: 'Cyclist Help', click: () => require('electron').shell.openExternal('https://github.com/1898andCo/cyclist') }] },
            ];
            Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
            startProjectWatchers();
        }
        catch (error) {
            console.error('Failed to start Cyclist:', error);
            app.quit();
        }
    });
    // macOS: re-create window when dock icon clicked and no windows open
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    // Quit when all windows are closed (except on macOS)
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
    // Clean up before quitting
    app.on('before-quit', async () => {
        // B-24: Abort any running Claude CLI process
        if (claudeServiceInstance) {
            claudeServiceInstance.abort();
        }
        // B-24 fix: Clean up PID file on graceful shutdown
        const projectDir = getProjectDirectory();
        if (projectDir) {
            cleanupPidFile(projectDir);
            console.log('[Cyclist] Cleaned up PID file');
        }
        await stopServer();
    });
}
//# sourceMappingURL=main.js.map