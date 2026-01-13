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
    readonly USAGE_STATS_GET: "usageStats:get";
    readonly USAGE_STATS_UPDATE: "usageStats:update";
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
 * IPC channel names for settings (22-5, 24-1)
 */
export declare const IPC_SETTINGS_CHANNELS: {
    readonly VERBOSE_MODE_GET: "settings:getVerboseMode";
    readonly VERBOSE_MODE_SET: "settings:setVerboseMode";
    readonly VERBOSE_MODE_UPDATE: "settings:verboseModeUpdate";
    readonly GET: "settings:get";
    readonly SAVE: "settings:save";
    readonly CHANGED: "settings:changed";
    readonly OPEN_WINDOW: "settings:openWindow";
    readonly GET_AVAILABLE_THEMES: "settings:getAvailableThemes";
    readonly GET_THEME_METADATA: "settings:getThemeMetadata";
};
/**
 * IPC channel names for audit log (22-6)
 */
export declare const IPC_AUDIT_LOG_CHANNELS: {
    readonly GET_ENTRIES: "auditLog:getEntries";
    readonly GET_TYPES: "auditLog:getTypes";
    readonly EXPORT: "auditLog:export";
    readonly GET_STATS: "auditLog:getStats";
    readonly CLEAR: "auditLog:clear";
    readonly ENTRY: "auditLog:entry";
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
 * IPC channel names for command execution (23-3)
 * Used to execute Claude Code commands via IPC rather than PTY injection
 */
export declare const IPC_COMMAND_CHANNELS: {
    readonly EXECUTE: "command:execute";
    readonly RESULT: "command:result";
    readonly ERROR: "command:error";
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
 * Build Tools menu with Execution Log (Story 22-6)
 */
export declare function buildToolsMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Build custom View menu with Verbose Mode toggle (Story 22-5)
 * Includes standard view items plus custom Cyclist options
 */
export declare function buildViewMenu(): {
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
/**
 * Usage stats structure - tracks Claude API usage limits
 */
export interface UsageStats {
    fiveHourPercent: number;
    weeklyPercent: number;
    fiveHourResetAt: string | null;
    weeklyResetAt: string | null;
    planType: 'pro' | 'max' | 'unknown';
}
/**
 * Get current usage stats (for testing and IPC)
 */
export declare function getUsageStats(): UsageStats;
/**
 * Update usage stats state and broadcast if changed
 */
export declare function updateUsageStats(stats: UsageStats): boolean;
/**
 * Reset usage stats to default values
 */
export declare function resetUsageStats(): void;
/**
 * Usage polling interval in milliseconds
 * 60 seconds is reasonable for usage data that changes slowly
 */
export declare const USAGE_POLL_INTERVAL_MS = 60000;
/**
 * Start polling usage stats
 * Uses ccusage CLI to read local JSONL files for usage data
 */
export declare function startUsagePolling(_projectDir: string): () => void;
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
 * Saves settings and returns updated settings
 * Also writes theme to persona-config.local.yaml for Pennyfarthing compatibility (24-2)
 */
export declare function handleSettingsSave(settings: Partial<CyclistSettings>): Promise<CyclistSettings>;
/**
 * Get available themes from pennyfarthing-dist/personas/themes (24-2)
 * Returns sorted list of theme names
 */
export declare function getAvailableThemes(): Promise<string[]>;
/**
 * Theme metadata interface for theme browser
 */
export interface ThemeMetadata {
    id: string;
    name: string;
    description: string;
    source: string;
    tier: 'S' | 'A' | 'B' | 'U';
    category: string;
    agentCount: number;
}
/**
 * Agent data within a theme (24-6)
 */
export interface ThemeAgent {
    character: string;
    quote?: string;
    style?: string;
    role?: string;
}
/**
 * Extended theme metadata including agent mappings (24-6)
 */
export interface ThemeMetadataWithAgents extends ThemeMetadata {
    agents: {
        sm?: ThemeAgent;
        tea?: ThemeAgent;
        dev?: ThemeAgent;
        reviewer?: ThemeAgent;
        architect?: ThemeAgent;
        pm?: ThemeAgent;
        orchestrator?: ThemeAgent;
        'tech-writer'?: ThemeAgent;
        'ux-designer'?: ThemeAgent;
        devops?: ThemeAgent;
    };
}
/**
 * Category mapping for known themes (24-5)
 * Maps theme IDs or source patterns to categories
 */
export declare const CATEGORY_MAP: Record<string, string>;
/**
 * Derive category from theme ID and source (24-5)
 * Uses CATEGORY_MAP for known themes, falls back to pattern matching
 */
export declare function deriveCategory(themeId: string, source: string): string;
/**
 * Get cached theme metadata
 */
export declare function getThemeMetadataCache(): ThemeMetadata[] | null;
/**
 * Load theme metadata from YAML files (24-5)
 * Parses all theme files and extracts metadata for the browser
 */
export declare function loadThemeMetadata(): Promise<ThemeMetadata[]>;
/**
 * Load theme metadata including agent character mappings (24-6)
 * Extended version of loadThemeMetadata for the preview panel
 */
export declare function loadThemeMetadataWithAgents(): Promise<ThemeMetadataWithAgents[]>;
/**
 * Register settings keyboard shortcut
 * Called during app initialization
 */
export declare function registerSettingsShortcut(): void;
/**
 * Get the menu template for testing
 * Returns the full menu structure including settings
 */
export declare function getMenuTemplate(): Array<{
    role?: string;
    label?: string;
    submenu?: Array<{
        label?: string;
        accelerator?: string;
        click?: () => void;
    }>;
}>;
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