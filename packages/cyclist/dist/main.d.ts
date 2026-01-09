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
export { getProjectDirectory, setProjectDirectory, isValidProjectDirectory };
/**
 * IPC channel names for sidebar data communication (B-2)
 * Used by preload script to expose data APIs to renderer
 */
export declare const IPC_DATA_CHANNELS: {
    readonly STATS_GET: "stats:get";
    readonly STATS_UPDATE: "stats:update";
    readonly PERSONA_GET: "persona:get";
    readonly PERSONA_UPDATE: "persona:update";
    readonly STORY_GET: "story:get";
    readonly STORY_UPDATE: "story:update";
    readonly GIT_GET: "git:get";
    readonly GIT_UPDATE: "git:update";
    readonly TOOL_STATS_GET: "toolStats:get";
    readonly TOOL_STATS_UPDATE: "toolStats:update";
    readonly TOKEN_STATS_GET: "tokenStats:get";
    readonly TOKEN_STATS_UPDATE: "tokenStats:update";
    readonly TODOS_GET: "todos:get";
    readonly TODOS_UPDATE: "todos:update";
    readonly CONTEXT_GET: "context:get";
    readonly CONTEXT_UPDATE: "context:update";
    readonly TOOL_EVENTS_UPDATE: "toolEvents:update";
};
/**
 * IPC channel names for Claude SDK communication (E7-3)
 */
export declare const IPC_CLAUDE_CHANNELS: {
    readonly CLAUDE_SEND: "claude:send";
    readonly CLAUDE_MESSAGE: "claude:message";
    readonly CLAUDE_COMPLETE: "claude:complete";
    readonly CLAUDE_ERROR: "claude:error";
    readonly CLAUDE_SET_MODE: "claude:setMode";
    readonly CLAUDE_GET_MODE: "claude:getMode";
    readonly CLAUDE_ABORT: "claude:abort";
    readonly CLAUDE_CLEAR: "claude:clear";
};
/**
 * IPC channel names for agent launcher (B-23)
 */
export declare const IPC_AGENT_CHANNELS: {
    readonly AGENT_LAUNCH: "agent:launch";
};
/**
 * IPC channel names for diff viewer (E8-2)
 */
export declare const IPC_DIFF_CHANNELS: {
    readonly DIFF_UPDATE: "diff:update";
};
/**
 * IPC channel names for file browser (E8-3)
 */
export declare const IPC_FILE_BROWSER_CHANNELS: {
    readonly LIST_DIRECTORY: "file-browser:list-directory";
    readonly OPEN_FILE: "file-browser:open-file";
    readonly OPEN_IN_EDITOR: "file-browser:open-in-editor";
};
/**
 * Agent definition for Electron menu
 */
export interface AgentDefinition {
    id: string;
    label: string;
    command: string;
    category: 'tactical' | 'strategic';
    accelerator?: string;
    description?: string;
}
/**
 * Workflow definition for Electron menu
 */
export interface WorkflowDefinition {
    id: string;
    label: string;
    command: string;
    accelerator?: string;
    description?: string;
}
/**
 * Pennyfarthing agent definitions for menu
 * Tactical agents follow the TDD flow: SM → TEA → Dev → Reviewer
 * Strategic agents handle architecture and planning
 */
export declare const AGENT_DEFINITIONS: AgentDefinition[];
/**
 * Pennyfarthing workflow definitions for menu
 */
export declare const WORKFLOW_DEFINITIONS: WorkflowDefinition[];
/**
 * Build Electron menu for agents
 * Groups agents by category with separator between tactical and strategic
 */
export declare function buildAgentMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Build Electron menu for workflows
 */
export declare function buildWorkflowMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Get list of registered data IPC channels (for testing)
 * Returns the data channels that setupDataIPCHandlers will register
 */
export declare function getDataChannels(): string[];
/**
 * Current stats state - updated by SDK messages
 * Exported for testing
 */
export interface StatsState {
    model: string;
    status: string;
    context: string;
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
 */
export declare function startContextPolling(projectDir: string): () => void;
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
    };
} | null): void;
/**
 * Broadcast data update to renderer via IPC
 * @param channel - The IPC channel to broadcast on
 * @param data - The data to send
 */
export declare function broadcastToRenderer(channel: string, data: unknown): void;
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
 * Set up IPC handlers for Claude SDK communication
 * E7-3: Handles claude:send and streams responses to renderer
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