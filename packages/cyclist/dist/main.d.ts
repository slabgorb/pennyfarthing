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
import { ToolStats } from './tool-stats.js';
import { ClaudeService, SDKMessage } from './claude-service.js';
import { type TodoItem } from './todos.js';
import { getProjectDirectory, setProjectDirectory, isValidProjectDirectory } from './paths.js';
import { ContextInfo } from './api/context.js';
import { type CyclistSettings } from './settings.js';
import { type ToolUseMessage, type SDKToolResultError } from './approval-gate.js';
export { getProjectDirectory, setProjectDirectory, isValidProjectDirectory };
export { IPC_DATA_CHANNELS, IPC_CLAUDE_CHANNELS, IPC_AGENT_CHANNELS, IPC_DIFF_CHANNELS, IPC_SETTINGS_CHANNELS, IPC_AUDIT_LOG_CHANNELS, IPC_FILE_BROWSER_CHANNELS, IPC_COMMAND_CHANNELS, IPC_BACKGROUND_TASK_CHANNELS, IPC_SKILL_CHANNELS, } from './ipc-channels.js';
export { AgentDefinition, WorkflowDefinition, AGENT_DEFINITIONS, WORKFLOW_DEFINITIONS, buildAgentMenu, buildWorkflowMenu, buildToolsMenu, buildViewMenu, getMenuTemplate, } from './menu-builder.js';
/**
 * Get list of registered data IPC channels (for testing)
 * Returns the data channels that setupDataIPCHandlers will register
 */
export declare function getDataChannels(): string[];
/**
 * Current stats state - updated by SDK messages
 * Context is handled separately via dedicated context IPC channel (B-19)
 * Exported for testing
 */
export interface StatsState {
    model: string;
    status: string;
    mode: string;
    connected: boolean;
}
/**
 * Get current stats (for testing)
 */
export declare function getStats(): StatsState;
/**
 * Update stats from SDK message
 * Called when SDK messages are received
 */
export declare function updateStatsFromSDK(message: SDKMessage): void;
/**
 * File path for tool stats JSON (relative to project root)
 */
export declare const TOOL_STATS_FILE = ".session/tool-stats.json";
/**
 * Get current tool stats (for testing and IPC)
 */
export declare function getToolStats(): ToolStats;
/**
 * Update tool stats from parsed data
 * Replaces current stats with new data
 */
export declare function updateToolStats(stats: ToolStats): void;
/**
 * Reset tool stats to empty state
 * Called when starting a new session
 */
export declare function resetToolStats(): void;
/**
 * Watch tool stats file for changes
 * Returns cleanup function to stop watching
 *
 * @param projectDir - The project directory to watch
 * @param callback - Called when stats are updated
 * @returns Cleanup function
 */
export declare function watchToolStats(projectDir: string, callback: (stats: ToolStats) => void): () => void;
/**
 * Get current todos (for testing and IPC)
 */
export declare function getTodos(): TodoItem[];
/**
 * Update todos state from TodoWrite message
 * Replaces current todos with new data and broadcasts to renderer
 */
export declare function updateTodosState(todos: TodoItem[]): void;
/**
 * Reset todos to empty state
 * Called when clearing session
 */
export declare function resetTodos(): void;
/**
 * Skill entry data model - tracks skill invocations
 */
export interface SkillEntry {
    id: string;
    skill: string;
    args?: string;
    timestamp: number;
    status: 'running' | 'completed' | 'error';
    result?: string;
    error?: string;
    durationMs?: number;
}
/**
 * Get current skill entries (for testing and IPC)
 */
export declare function getSkillEntries(): SkillEntry[];
/**
 * Handle a skill event (start, complete, error)
 * Updates state and broadcasts to renderer
 */
export declare function handleSkillEvent(entry: SkillEntry): void;
/**
 * Clear all skill entries
 * Called from IPC or when clearing session
 */
export declare function clearSkillEntries(): void;
/**
 * Reset skills to empty state
 * Called when clearing session
 */
export declare function resetSkills(): void;
/**
 * Get current context (for testing and IPC)
 */
export declare function getContext(): ContextInfo;
/**
 * Reset context state to initial values
 * Called when clearing session
 */
export declare function resetContext(): void;
/**
 * Update context state and broadcast if changed
 * Returns true if context was updated (values changed)
 */
export declare function updateContextState(context: ContextInfo): boolean;
/**
 * Context polling interval in milliseconds
 * 15 seconds balances responsiveness vs overhead
 */
export declare const CONTEXT_POLL_INTERVAL_MS = 15000;
/**
 * Start polling context usage
 * Calls getContextUsage periodically and broadcasts changes
 * @param projectDir - The project directory
 * @param getSessionId - Optional function to get current session ID (for session-specific context)
 */
export declare function startContextPolling(projectDir: string, getSessionId?: () => string | null): () => void;
export { UsageStats, getUsageStats, USAGE_POLL_INTERVAL_MS, startUsagePolling } from './usage-stats.js';
/**
 * Server startup configuration
 * In Electron mode, server can be disabled since we use IPC
 */
export declare const serverEnabled = false;
/**
 * Check if server should start (for testing)
 */
export declare function shouldStartServer(): boolean;
/**
 * BrowserWindow configuration
 * Exported for testing security settings
 */
export declare const windowConfig: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    title: string;
    webPreferences: {
        nodeIntegration: boolean;
        contextIsolation: boolean;
        preload: string;
    };
};
/**
 * Get window configuration (for testing)
 */
export declare function getWindowConfig(): {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    title: string;
    webPreferences: {
        nodeIntegration: boolean;
        contextIsolation: boolean;
        preload: string;
    };
};
export declare function setActualPort(port: number): void;
export declare function getActualPort(): number;
/**
 * Set the main window reference for data broadcasts
 * Called when window is created in Electron runtime
 */
export declare function setMainWindow(window: {
    webContents: {
        send: (channel: string, data: unknown) => void;
        isDestroyed: () => boolean;
        executeJavaScript: (code: string) => Promise<unknown>;
    };
} | null): void;
/**
 * Broadcast data update to renderer via IPC
 * @param channel - The IPC channel to broadcast on
 * @param data - The data to send
 */
export declare function broadcastToRenderer(channel: string, data: unknown): void;
/**
 * Broadcast settings change to IPC listeners
 * AC5: Propagates settings changes to renderer via IPC
 * @param settings - The updated settings object
 */
export declare function broadcastSettingsChange(settings: CyclistSettings): void;
/**
 * Initialize app with proper orchestration
 * AC5: Orchestrates startup sequence with clear initialization flow
 * Order: 1. Settings 2. Grants 3. Store initialization
 * @param projectDir - The project directory
 */
export declare function initializeApp(projectDir?: string): CyclistSettings;
/**
 * Apply font settings directly to main window via executeJavaScript
 * 35-6: This is the reliable way to apply CSS variable changes in Electron
 * Uses webContents.executeJavaScript to set CSS custom properties on :root
 * @param settings - CyclistSettings object containing display.font_ui and display.font_mono
 */
export declare function applyFontSettingsToMainWindow(settings: CyclistSettings): void;
/**
 * Set up IPC handlers for sidebar data communication
 * Called after app is ready in Electron
 * B-2.1: Handlers now wired to real data sources
 */
export declare function setupDataIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Start file watchers for project-specific data
 * Called after project directory is confirmed (post folder picker)
 */
export declare function startProjectWatchers(): void;
/**
 * Get the ClaudeService instance (creates if needed)
 * E7-3: Provides access to SDK service for IPC handlers
 */
export declare function getClaudeService(): ClaudeService;
/**
 * Image data from clipboard paste (28-1)
 * Matches the format from editor.js pendingImages
 */
export interface PastedImage {
    dataUrl: string;
    mimeType: string;
    filename: string;
}
/**
 * Set up IPC handlers for Claude SDK communication
 * E7-3: Handles claude:send and streams responses to renderer
 * 28-1: Adds image support via stream-json input
 */
export declare function setupClaudeIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Set up IPC handlers for file browser
 * E8-3: Handles directory listing and file opening
 */
export declare function setupFileBrowserIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Flag indicating if settings have been initialized
 */
export declare const isSettingsInitialized = false;
/**
 * Handle settings:get IPC call
 * Returns current settings
 */
export declare function handleSettingsGet(): Promise<CyclistSettings>;
/**
 * Handle settings:save IPC call
 * Saves settings and returns result with success flag
 * Also writes theme to persona-config.local.yaml for Pennyfarthing compatibility (24-2)
 */
export declare function handleSettingsSave(settings: Partial<CyclistSettings>): Promise<{
    success: boolean;
    settings?: CyclistSettings;
}>;
export { ThemeMetadata, ThemeAgent, ThemeMetadataWithAgents, CATEGORY_MAP, deriveCategory, getThemeMetadataCache, getAvailableThemes, loadThemeMetadata, loadThemeMetadataWithAgents, } from './theme-metadata.js';
export { registerSettingsShortcut } from './menu-builder.js';
/**
 * Set up IPC handlers for settings
 * 22-5: Handles verbose mode setting get/set
 * 24-1: Handles full settings panel infrastructure
 */
export declare function setupSettingsIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Set up IPC handlers for audit log
 * 22-6: Handles audit log get/filter/export/clear
 */
export declare function setupAuditLogIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Set up IPC handlers for skill panel
 * 35-12: Handles skill invocation tracking via IPC
 */
export declare function setupSkillIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Get list of registered command channels (for testing)
 * 23-3: Allows tests to verify channel registration
 */
export declare function getCommandChannels(): string[];
/**
 * Set up IPC handlers for command execution
 * 23-3: Handles Claude Code command execution via IPC
 */
export declare function setupCommandIPCHandlers(ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void;
/**
 * Result from processToolUseWithApproval
 */
export interface ApprovalResult {
    needsApproval: boolean;
    passThrough: boolean;
    approved?: boolean;
    rejected?: boolean;
    errorMessage?: SDKToolResultError;
}
/**
 * Set the IPC sender function (for testing)
 */
export declare function setIPCSender(sender: ((channel: string, data: unknown) => void) | null): void;
/**
 * Set the tool executor function (for testing)
 */
export declare function setToolExecutor(executor: ((message: ToolUseMessage) => void) | null): void;
/**
 * Set the error injector function (for testing)
 */
export declare function setErrorInjector(injector: ((error: SDKToolResultError) => void) | null): void;
/**
 * Send an approval request to the renderer via IPC
 */
export declare function sendApprovalRequest(toolId: string, toolName: string, context: Record<string, unknown>): void;
/**
 * Handle permission response from renderer
 * Called by IPC handler when user responds to approval modal
 */
export declare function handlePermissionResponse(response: {
    toolId: string;
    approved: boolean;
    grantScope?: 'once' | 'session' | 'always';
}): void;
/**
 * Process a tool_use message with approval gate check
 * This is the main integration point for story 33-7
 *
 * @param message - The tool_use message to process
 * @returns ApprovalResult indicating whether approval is needed and outcome
 */
export declare function processToolUseWithApproval(message: ToolUseMessage): Promise<ApprovalResult>;
/**
 * Set up IPC handlers for approval gate
 * Story 33-7: Handles permission request/response flow
 */
export declare function setupApprovalIPCHandlers(ipcMain: {
    handle?: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
    on?: (channel: string, handler: (event: unknown, ...args: unknown[]) => void) => void;
}): void;
/**
 * Resolve a pending hook approval (called when user responds to modal)
 */
export declare function resolveHookApproval(toolId: string, approved: boolean, grantScope?: 'once' | 'session' | 'always'): void;
/**
 * Start the approval hook server with dynamic port selection
 * Uses findAvailablePort to avoid conflicts with other Cyclist instances
 * Writes port to .cyclist-approval-port for hook discovery
 */
export declare function startApprovalServer(): Promise<void>;
/**
 * Stop the approval hook server and clean up port file
 */
export declare function stopApprovalServer(): void;
/**
 * Get the current approval server port (for testing)
 */
export declare function getApprovalServerPort(): number | null;
/**
 * Save session ID to file for persistence across app restarts
 * E7-3: Session persistence support
 */
export declare function saveSessionId(sessionId: string): void;
/**
 * Load session ID from file (returns null if not found)
 * E7-3: Session restoration support
 */
export declare function loadSessionId(): string | null;
/**
 * Clear saved session ID (for new conversation)
 * E7-3: New conversation support
 */
export declare function clearSessionId(): void;
//# sourceMappingURL=main.d.ts.map