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

import { Server, createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { getCurrentPersona, detectPennyfarthingProject, watchAgentChanges } from './pennyfarthing.js';
import { getStoryInfo, getAllReposGitInfo, writePortFile, cleanupPortFile, writePidFile, cleanupPidFile, readPidFile, isProcessRunning, getOtelConfig, writeApprovalPortFile, cleanupApprovalPortFile } from './server.js';
import { parseToolStats, ToolStats, createEmptyStats } from './tool-stats.js';
import {
  getTokenStats,
  setTokenStatsCallback,
  setToolEventCallback,
  TokenStats,
  ToolEvent,
  aggregateTokenStats,
  resetTokenStats,
  resetEventStore,
  getToolEventsFiltered,
  getToolTypes,
  exportAuditLogAsJSON,
  exportAuditLogAsCSV,
  getAuditLogStats,
  getUserEmail,
  setUserEmailCallback,
  setBackgroundTaskCallback,
  setBackgroundTaskStartCallback,
  BackgroundTask,
  trackBackgroundTask,
  completeBackgroundTask,
} from './otlp-receiver.js';
import { ClaudeService, SDKMessage } from './claude-service.js';
import { isTodoWriteMessage, extractTodos, type TodoItem } from './todos.js';
// Story 36-8: Import for capturing tool inputs for OTEL enrichment
import { storePendingToolInput } from './span-correlation.js';
import { listDirectory as listDir } from './file-browser.js';
import {
  getProjectDirectory,
  setProjectDirectory,
  isValidProjectDirectory,
  parseProjectDirArg,
} from './paths.js';
import { getContextUsage, ContextInfo } from './api/context.js';
import { getVerboseMode, setVerboseMode } from './settings-store.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  getCurrentSettings,
  saveUserSettings,
  initializeSettings,
  loadGrants,
  saveGrants,
  type CyclistSettings,
  type SettingsInput,
} from './settings.js';
import { broadcastBackgroundTaskEvent } from './api/background-tasks.js';
import { initializeGrants, setGrantsPersistCallback } from './settings-store.js';
// Story 33-7: Import approval gate functions for tool execution pipeline
import {
  interceptToolUse,
  requestApproval,
  createRejectionError,
  type ToolUseMessage,
  type SDKToolResultError,
} from './approval-gate.js';
import { openSettingsWindow, setMainWindowRef, setBrowserWindowRef } from './settings-window.js';
import { setBellMode } from './bell-mode.js';
import {
  IPC_DATA_CHANNELS,
  IPC_CLAUDE_CHANNELS,
  IPC_AGENT_CHANNELS,
  IPC_DIFF_CHANNELS,
  IPC_SETTINGS_CHANNELS,
  IPC_AUDIT_LOG_CHANNELS,
  IPC_FILE_BROWSER_CHANNELS,
  IPC_COMMAND_CHANNELS,
  IPC_BACKGROUND_TASK_CHANNELS,
  IPC_SKILL_CHANNELS,
  IPC_CONTEXT_CLEAR_CHANNELS,
  IPC_LAYOUT_CHANNELS,
} from './ipc-channels.js';

// Re-export project directory functions for external consumers
export { getProjectDirectory, setProjectDirectory, isValidProjectDirectory };
import * as fs from 'fs';
import { parse } from 'yaml';

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
  const electronReload = mod.default as unknown as (
    glob: string,
    options: {
      electron?: string;
      hardResetMethod?: 'exit' | 'quit';
      ignored?: RegExp | string | string[];
      followSymlinks?: boolean;
    }
  ) => void;
  // Watch only *.js files in dist/ - use glob pattern to be specific
  // This prevents rebuilds when files outside packages/cyclist change
  electronReload(join(__dirname, '**', '*.js'), {
    electron: join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit',
    followSymlinks: false,
    ignored: /node_modules/,
  });
  console.log('[Cyclist] Hot reload enabled - watching', __dirname, 'for *.js changes');
} catch {
  // Not in development or module not available
}

// Re-export IPC channels from dedicated module
export {
  IPC_DATA_CHANNELS,
  IPC_CLAUDE_CHANNELS,
  IPC_AGENT_CHANNELS,
  IPC_DIFF_CHANNELS,
  IPC_SETTINGS_CHANNELS,
  IPC_AUDIT_LOG_CHANNELS,
  IPC_FILE_BROWSER_CHANNELS,
  IPC_COMMAND_CHANNELS,
  IPC_BACKGROUND_TASK_CHANNELS,
  IPC_SKILL_CHANNELS,
  IPC_CONTEXT_CLEAR_CHANNELS,
  IPC_LAYOUT_CHANNELS,
} from './ipc-channels.js';

// Re-export menu builders from dedicated module
export {
  AgentDefinition,
  WorkflowDefinition,
  AGENT_DEFINITIONS,
  WORKFLOW_DEFINITIONS,
  buildAgentMenu,
  buildWorkflowMenu,
  buildToolsMenu,
  buildViewMenu,
  getMenuTemplate,
} from './menu-builder.js';
import {
  buildAgentMenu,
  buildWorkflowMenu,
  buildToolsMenu,
  buildViewMenu,
} from './menu-builder.js';

/**
 * Get list of registered data IPC channels (for testing)
 * Returns the data channels that setupDataIPCHandlers will register
 */
export function getDataChannels(): string[] {
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

// =============================================================================
// Stats State (B-2.1)
// =============================================================================

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

// Stats state managed by main process
const currentStats: StatsState = {
  model: '—',
  status: '—',
  mode: '—',
  connected: true, // SDK mode is always "connected"
};

/**
 * Get current stats (for testing)
 */
export function getStats(): StatsState {
  return { ...currentStats };
}

/**
 * Format model name for display
 * "claude-opus-4-5-20251101" -> "opus 4-5"
 */
function formatModelName(model: string): string {
  return model
    .replace(/^claude-/, '')           // Remove "claude-" prefix
    .replace(/-\d{8}$/, '')            // Remove date suffix like "-20251101"
    .replace(/-(\d+)-(\d+)$/, ' $1-$2'); // "opus-4-5" -> "opus 4-5"
}

/**
 * Update stats from SDK message
 * Called when SDK messages are received
 */
export function updateStatsFromSDK(message: SDKMessage): void {
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
let currentToolStats: ToolStats = createEmptyStats();

/**
 * Get current tool stats (for testing and IPC)
 */
export function getToolStats(): ToolStats {
  return { ...currentToolStats, tools: { ...currentToolStats.tools, byType: { ...currentToolStats.tools.byType } } };
}

/**
 * Update tool stats from parsed data
 * Replaces current stats with new data
 */
export function updateToolStats(stats: ToolStats): void {
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
export function resetToolStats(): void {
  currentToolStats = createEmptyStats();
  // Broadcast reset to renderer
  broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_STATS_UPDATE, currentToolStats);
}

/**
 * Debounce timer for file watcher
 */
let toolStatsDebounceTimer: NodeJS.Timeout | null = null;
const TOOL_STATS_DEBOUNCE_MS = 100;

/**
 * Watch tool stats file for changes
 * Returns cleanup function to stop watching
 *
 * @param projectDir - The project directory to watch
 * @param callback - Called when stats are updated
 * @returns Cleanup function
 */
export function watchToolStats(projectDir: string, callback: (stats: ToolStats) => void): () => void {
  const statsPath = join(projectDir, TOOL_STATS_FILE);
  const sessionDir = dirname(statsPath);

  let watcher: fs.FSWatcher | null = null;

  // Check if session directory exists
  if (!fs.existsSync(sessionDir)) {
    // Directory doesn't exist - return no-op cleanup
    console.log('Tool stats directory does not exist:', sessionDir);
    return () => {};
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
          } catch (err) {
            console.error('Error reading tool stats:', (err as Error).message);
          }
        }, TOOL_STATS_DEBOUNCE_MS);
      }
    });

    console.log('Watching tool stats file:', statsPath);
  } catch (err) {
    console.error('Failed to watch tool stats:', (err as Error).message);
    return () => {};
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
let currentTodos: TodoItem[] = [];

/**
 * Get current todos (for testing and IPC)
 */
export function getTodos(): TodoItem[] {
  return [...currentTodos];
}

/**
 * Update todos state from TodoWrite message
 * Replaces current todos with new data and broadcasts to renderer
 */
export function updateTodosState(todos: TodoItem[]): void {
  currentTodos = [...todos];
  broadcastToRenderer(IPC_DATA_CHANNELS.TODOS_UPDATE, currentTodos);
}

/**
 * Reset todos to empty state
 * Called when clearing session
 */
export function resetTodos(): void {
  currentTodos = [];
  broadcastToRenderer(IPC_DATA_CHANNELS.TODOS_UPDATE, currentTodos);
}

// =============================================================================
// Skill State (35-12)
// =============================================================================

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
 * Current skill invocations - updated when Skill tool is used
 */
let currentSkillEntries: SkillEntry[] = [];

/**
 * Get current skill entries (for testing and IPC)
 */
export function getSkillEntries(): SkillEntry[] {
  return [...currentSkillEntries];
}

/**
 * Handle a skill event (start, complete, error)
 * Updates state and broadcasts to renderer
 */
export function handleSkillEvent(entry: SkillEntry): void {
  const existingIndex = currentSkillEntries.findIndex((e) => e.id === entry.id);

  if (existingIndex >= 0) {
    // Update existing entry
    currentSkillEntries[existingIndex] = { ...currentSkillEntries[existingIndex], ...entry };
  } else {
    // Add new entry at top (reverse chronological)
    currentSkillEntries.unshift(entry);
  }

  broadcastToRenderer(IPC_SKILL_CHANNELS.SKILL_START, entry);
}

/**
 * Clear all skill entries
 * Called from IPC or when clearing session
 */
export function clearSkillEntries(): void {
  currentSkillEntries = [];
  broadcastToRenderer(IPC_SKILL_CHANNELS.SKILL_CLEAR, null);
}

/**
 * Reset skills to empty state
 * Called when clearing session
 */
export function resetSkills(): void {
  currentSkillEntries = [];
}

// =============================================================================
// Context State (B-19)
// =============================================================================

/**
 * Current context state - updated by polling check-context.sh
 */
let currentContext: ContextInfo = {
  percent: null,
  tokens: null,
  status: null,
  error: null,
  baseline: null,
  usableTokens: null,
  usablePercent: null,
  available: null,
};

/**
 * Get current context (for testing and IPC)
 */
export function getContext(): ContextInfo {
  return { ...currentContext };
}

/**
 * Reset context state to initial values
 * Called when clearing session
 */
export function resetContext(): void {
  currentContext = {
    percent: null,
    tokens: null,
    status: null,
    error: null,
    baseline: null,
    usableTokens: null,
    usablePercent: null,
    available: null,
  };
  broadcastToRenderer(IPC_DATA_CHANNELS.CONTEXT_UPDATE, currentContext);
}

/**
 * Update context state and broadcast if changed
 * Returns true if context was updated (values changed)
 */
export function updateContextState(context: ContextInfo): boolean {
  // Check if values actually changed
  if (
    currentContext.percent === context.percent &&
    currentContext.tokens === context.tokens &&
    currentContext.status === context.status
  ) {
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
let contextPollTimer: NodeJS.Timeout | null = null;

/**
 * Start polling context usage
 * Calls getContextUsage periodically and broadcasts changes
 * @param projectDir - The project directory
 * @param getSessionId - Optional function to get current session ID (for session-specific context)
 */
export function startContextPolling(projectDir: string, getSessionId?: () => string | null): () => void {
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
export { UsageStats, getUsageStats, USAGE_POLL_INTERVAL_MS, startUsagePolling } from './usage-stats.js';
import {
  getUsageStats,
  resetUsageStats as resetUsageStatsInternal,
  startUsagePolling as startUsagePollingInternal,
  setUserEmail as setUsageStatsUserEmail,
} from './usage-stats.js';

// Wrapper functions that include broadcast
function resetUsageStats(): void {
  resetUsageStatsInternal((s) => broadcastToRenderer(IPC_DATA_CHANNELS.USAGE_STATS_UPDATE, s));
}

function startUsagePolling(projectDir: string): () => void {
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
export function shouldStartServer(): boolean {
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
export function setActualPort(port: number): void {
  serverPort = port;
}
export function getActualPort(): number {
  return serverPort;
}

// Parse CLI args on module load
parseProjectDirArg();

// =============================================================================
// Data IPC Handler Setup (Testable Export) - B-2
// =============================================================================

// Reference to main window for broadcasting data updates
// 35-6: Extended type to include executeJavaScript for font settings
let dataWindowRef: {
  webContents: {
    send: (channel: string, data: unknown) => void;
    isDestroyed: () => boolean;
    executeJavaScript: (code: string) => Promise<unknown>;
  }
} | null = null;

/**
 * Set the main window reference for data broadcasts
 * Called when window is created in Electron runtime
 */
export function setMainWindow(window: {
  webContents: {
    send: (channel: string, data: unknown) => void;
    isDestroyed: () => boolean;
    executeJavaScript: (code: string) => Promise<unknown>;
  }
} | null): void {
  dataWindowRef = window;
}

/**
 * Broadcast data update to renderer via IPC
 * @param channel - The IPC channel to broadcast on
 * @param data - The data to send
 */
export function broadcastToRenderer(channel: string, data: unknown): void {
  // Check window exists and is not destroyed before sending
  if (dataWindowRef && !dataWindowRef.webContents.isDestroyed()) {
    dataWindowRef.webContents.send(channel, data);
  }
}

/**
 * Broadcast settings change to IPC listeners
 * AC5: Propagates settings changes to renderer via IPC
 * @param settings - The updated settings object
 */
export function broadcastSettingsChange(settings: CyclistSettings): void {
  broadcastToRenderer(IPC_SETTINGS_CHANNELS.CHANGED, settings);
}

/**
 * Initialize app with proper orchestration
 * AC5: Orchestrates startup sequence with clear initialization flow
 * Order: 1. Settings 2. Grants 3. Store initialization
 * @param projectDir - The project directory
 */
export function initializeApp(projectDir?: string): CyclistSettings {
  // 1. Initialize file-based settings
  const settings = initializeSettings(projectDir);

  // 2. Load grants from file
  const grants = loadGrants();

  // 3. Initialize runtime store with grants
  initializeGrants(grants);

  // 4. Set up persistence callback so store changes write to file
  setGrantsPersistCallback(saveGrants);

  return settings;
}

/**
 * Apply font settings to main window (stub - fonts not currently used)
 */
export function applyFontSettingsToMainWindow(_settings: CyclistSettings): void {
  // Font settings removed - function kept for API compatibility
}

/**
 * Set up IPC handlers for sidebar data communication
 * Called after app is ready in Electron
 * B-2.1: Handlers now wired to real data sources
 */
export function setupDataIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {

  // Stats handler - returns current stats state (B-2.1)
  ipcMain.handle(IPC_DATA_CHANNELS.STATS_GET, async () => {
    return currentStats;
  });

  // Persona handler - returns current persona from pennyfarthing (B-2.1, 37-8)
  // Returns complete persona object with all fields the sidebar expects.
  // When no active session/theme, returns null for persona-specific fields
  // but always provides displayName (uses projectName as fallback).
  ipcMain.handle(IPC_DATA_CHANNELS.PERSONA_GET, async () => {
    const projectDir = getProjectDirectory();
    if (!projectDir) {
      return {
        projectName: 'No Project',
        character: null,
        displayName: 'No Project',
        role: null,
        roleDescription: null,
        style: null,
        theme: null,
        slug: null,
        quote: null,
        helper: null,
        ocean: null,
      };
    }
    const projectName = basename(projectDir);
    if (!detectPennyfarthingProject(projectDir)) {
      return {
        projectName,
        character: null,
        displayName: projectName,
        role: null,
        roleDescription: null,
        style: null,
        theme: null,
        slug: null,
        quote: null,
        helper: null,
        ocean: null,
      };
    }
    const sessionId = process.env.CYCLIST_SESSION_ID;
    const persona = getCurrentPersona(projectDir, sessionId);
    if (!persona) {
      return {
        projectName,
        character: null,
        displayName: projectName,
        role: null,
        roleDescription: null,
        style: null,
        theme: null,
        slug: null,
        quote: null,
        helper: null,
        ocean: null,
      };
    }
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

  // Git handler - returns git status for all repos (multi-repo support)
  ipcMain.handle(IPC_DATA_CHANNELS.GIT_GET, async () => {
    const projectDir = getProjectDirectory();
    if (!projectDir) return null;
    return { repos: getAllReposGitInfo(projectDir) };
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
export function startProjectWatchers(): void {
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
  setTokenStatsCallback((stats: TokenStats) => {
    broadcastToRenderer(IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE, stats);
    console.log('Token stats broadcast:', stats.inputTokens, 'in /', stats.outputTokens, 'out');
  });
  console.log('Token stats callback registered for OTLP broadcasts');

  // Register tool event callback for audit log real-time updates
  setToolEventCallback((event: ToolEvent) => {
    broadcastToRenderer(IPC_AUDIT_LOG_CHANNELS.ENTRY, event);
    console.log(`Tool event broadcast: ${event.toolName}`);
  });
  console.log('Tool event callback registered for audit log broadcasts');

  // 35-2: Register user email callback for project info updates
  setUserEmailCallback((email: string) => {
    // Update usage stats with user email for account-specific settings
    setUsageStatsUserEmail(email);
    broadcastToRenderer(IPC_DATA_CHANNELS.PROJECT_INFO_UPDATE, {
      directory: getProjectDirectory(),
      userEmail: email,
    });
    console.log(`User email discovered: ${email}`);
  });
  console.log('User email callback registered for OTLP broadcasts');

  // 35-16: Register background task start callback
  // Broadcast to BOTH Electron IPC and WebSocket clients
  setBackgroundTaskStartCallback((task: BackgroundTask) => {
    broadcastToRenderer(IPC_BACKGROUND_TASK_CHANNELS.TASK_STARTED, task);
    broadcastBackgroundTaskEvent('task:started', task);
    console.log(`Background task started: ${task.subagentType} - ${task.description}`);
  });

  // 31-15: Register background task completion callback
  // Broadcast to BOTH Electron IPC and WebSocket clients
  setBackgroundTaskCallback((task: BackgroundTask) => {
    broadcastToRenderer(IPC_BACKGROUND_TASK_CHANNELS.TASK_COMPLETED, task);
    broadcastBackgroundTaskEvent('task:completed', task);
    console.log(`Background task completed: ${task.subagentType} (${task.success ? 'success' : 'failed'})`);
  });
  console.log('Background task callbacks registered for OTLP broadcasts');

  // Start watching for agent changes
  if (detectPennyfarthingProject(projectDir)) {
    const sessionId = process.env.CYCLIST_SESSION_ID;
    const projectName = basename(projectDir);
    watchAgentChanges(projectDir, sessionId, (_agentRole: string) => {
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
      } catch {
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
let claudeServiceInstance: ClaudeService | null = null;

/**
 * Get the ClaudeService instance (creates if needed)
 * E7-3: Provides access to SDK service for IPC handlers
 */
export function getClaudeService(): ClaudeService {
  if (!claudeServiceInstance) {
    const projectDir = getProjectDirectory();
    if (!projectDir) throw new Error('Cannot create ClaudeService: no project directory set');
    // Get OTEL config to enable telemetry streaming to Cyclist
    const otelConfig = getOtelConfig(projectDir);
    claudeServiceInstance = new ClaudeService({
      cwd: projectDir,
      env: otelConfig ?? undefined,
    });

    // B-24 fix: Track Claude process PID for targeted cleanup
    claudeServiceInstance.on('process-spawned', (pid: number) => {
      writePidFile(projectDir, pid);
      console.log(`[ClaudeService] Wrote PID file: ${pid}`);
    });

    if (otelConfig) {
      console.log('[ClaudeService] OTEL config enabled:', otelConfig.OTEL_EXPORTER_OTLP_ENDPOINT);
    } else {
      console.warn('[ClaudeService] OTEL config not available - tool events will not stream');
    }
  }
  return claudeServiceInstance;
}

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
export function setupClaudeIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_SEND, async (_event: unknown, ...args: unknown[]) => {
    const prompt = args[0] as string;
    const images = (args[1] as PastedImage[]) || [];
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
          const usage = message.usage as {
            input_tokens: number;
            output_tokens: number;
            cache_read_tokens?: number;
            cache_creation_tokens?: number;
          };
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
          const assistantMsg = message as { message?: { content?: Array<{ type: string; name?: string; id?: string; input?: Record<string, unknown> }> } };
          const content = assistantMsg.message?.content;
          if (content && Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                // Story 33-7: Wire approval gate into tool execution pipeline
                // Check if this tool_use needs approval and trigger modal if so
                const toolUseMessage = {
                  type: 'tool_use' as const,
                  tool_name: block.name,
                  tool_id: block.id,
                  input: block.input as Record<string, unknown>,
                };
                // Fire and forget - we observe the stream, we don't control execution
                // This triggers the approval modal UI when gate is enabled
                processToolUseWithApproval(toolUseMessage);

                // Story 36-8: Capture ALL tool inputs for OTEL enrichment correlation
                // Story 36-9: This is the primary correlation mechanism since Claude Code
                // OTEL logs don't include traceId/spanId at logRecord level
                if (block.id && block.name && block.input) {
                  storePendingToolInput(block.id, block.name, block.input);
                }

                if (block.name === 'Edit') {
                  const input = block.input as { file_path: string; old_string: string; new_string: string };
                  broadcastToRenderer(IPC_DIFF_CHANNELS.DIFF_UPDATE, {
                    id: block.id || `edit-${Date.now()}`,
                    filePath: input.file_path,
                    oldContent: input.old_string,
                    newContent: input.new_string,
                    toolType: 'Edit',
                    timestamp: Date.now(),
                  });
                } else if (block.name === 'Write') {
                  const input = block.input as { file_path: string; content: string };
                  broadcastToRenderer(IPC_DIFF_CHANNELS.DIFF_UPDATE, {
                    id: block.id || `write-${Date.now()}`,
                    filePath: input.file_path,
                    oldContent: '',
                    newContent: input.content,
                    toolType: 'Write',
                    timestamp: Date.now(),
                    isNewFile: true,
                  });
                } else if (block.name === 'Skill') {
                  // 35-12: Track skill invocations
                  const input = block.input as { skill: string; args?: string };
                  handleSkillEvent({
                    id: block.id || `skill-${Date.now()}`,
                    skill: input.skill,
                    args: input.args,
                    timestamp: Date.now(),
                    status: 'running',
                  });
                } else if (block.name === 'Task') {
                  // Background tasks fix: detect from message stream, not OTEL
                  // OTEL logs do NOT emit tool_parameters for Task tools
                  const input = block.input as {
                    description?: string;
                    subagent_type?: string;
                    run_in_background?: boolean;
                  };
                  trackBackgroundTask({
                    taskId: block.id || `task-${Date.now()}`,
                    description: input.description || '',
                    subagentType: input.subagent_type || '',
                    startedAt: Date.now(),
                    isBackground: input.run_in_background === true,
                  });
                }
              }
            }
          }
        }

        // 35-12: Check for tool_result blocks to update skill completion status
        if (message.type === 'user') {
          const userMsg = message as { message?: { content?: Array<{ type: string; tool_use_id?: string; content?: string; is_error?: boolean }> } };
          const content = userMsg.message?.content;
          if (content && Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                // Find matching skill entry and update it
                const existingEntry = currentSkillEntries.find((e) => e.id === block.tool_use_id);
                if (existingEntry) {
                  const startTime = existingEntry.timestamp;
                  const durationMs = Date.now() - startTime;
                  handleSkillEvent({
                    ...existingEntry,
                    status: block.is_error ? 'error' : 'completed',
                    result: block.is_error ? undefined : (typeof block.content === 'string' ? block.content.slice(0, 200) : undefined),
                    error: block.is_error ? (typeof block.content === 'string' ? block.content.slice(0, 200) : 'Unknown error') : undefined,
                    durationMs,
                  });
                }

                // Background task completion detection from message stream
                // tool_use_id matches the taskId we stored when Task tool was invoked
                const completedTask = completeBackgroundTask(
                  block.tool_use_id,
                  !block.is_error,
                  block.is_error ? undefined : (typeof block.content === 'string' ? block.content.slice(0, 500) : undefined),
                  block.is_error ? (typeof block.content === 'string' ? block.content.slice(0, 500) : 'Task failed') : undefined
                );
                if (completedTask) {
                  console.log(`[main] Background task completed from stream: ${completedTask.taskId} (${completedTask.success ? 'success' : 'error'})`);
                }
              }
            }
          }
        }
      }
      broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_COMPLETE, null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_ERROR, errorMessage);
      throw error;
    }
  });

  // Permission mode handlers
  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_SET_MODE, async (_event: unknown, ...args: unknown[]) => {
    const mode = args[0] as 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions';
    const service = getClaudeService();
    service.setPermissionMode(mode);
    return mode;
  });

  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_GET_MODE, async () => {
    const service = getClaudeService();
    return service.getPermissionMode();
  });

  // Interrupt handler - stops current Claude turn (like Escape in CLI)
  // Uses abort() to fully kill the process - SIGINT alone doesn't reliably stop Claude CLI
  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_ABORT, async () => {
    const service = getClaudeService();
    console.log('[main] CLAUDE_ABORT called - aborting Claude process');
    service.abort();
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
    resetSkills(); // 35-12: Clear skill invocations
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

  // Clear and reload handler - clears session and loads new agent (MSSCI-11840)
  ipcMain.handle(IPC_CONTEXT_CLEAR_CHANNELS.CLEAR_AND_LOAD, async (_event: unknown, ...args: unknown[]) => {
    const agent = args[0] as string;
    const service = getClaudeService();
    console.log(`[main] Context clear and reload: ${agent}`);

    // Clear session state and WAIT for process to fully exit
    // This prevents race conditions where new process spawns before old one dies
    await service.clearSessionAsync();
    clearSessionId();
    resetTokenStats();
    resetTodos();
    resetEventStore();
    resetToolStats();
    resetSkills();
    resetContext();
    resetUsageStats();

    // Broadcast zeroed stats to update UI immediately
    broadcastToRenderer(IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE, getTokenStats());
    broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_STATS_UPDATE, createEmptyStats());
    broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_EVENTS_UPDATE, []);
    broadcastToRenderer(IPC_DATA_CHANNELS.CONTEXT_UPDATE, { percent: 0, contextWindow: 0 });
    broadcastToRenderer(IPC_DATA_CHANNELS.PERSONA_UPDATE, null);

    // Launch the new agent via the agent launch event
    broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, agent);

    console.log(`Session cleared and agent launch triggered: ${agent}`);
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
export function setupFileBrowserIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // List directory handler - returns directory contents
  ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.LIST_DIRECTORY, async (_event: unknown, ...args: unknown[]) => {
    const dirPath = args[0] as string;
    const projectDir = getProjectDirectory();
    if (!projectDir) {
      throw new Error('No project directory set');
    }
    return listDir(dirPath, projectDir);
  });

  // Open file handler - opens file in OS default application (Story 35-11)
  ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.OPEN_FILE, async (_event: unknown, ...args: unknown[]) => {
    const filePath = args[0] as string;
    console.log('[FileBrowser] Opening file in OS default app:', filePath);

    try {
      const { shell } = require('electron');
      const result = await shell.openPath(filePath);
      if (result) {
        // shell.openPath returns empty string on success, error message on failure
        console.error('[FileBrowser] Failed to open file:', result);
        throw new Error(result);
      }
      broadcastToRenderer('file-browser:file-opened', { path: filePath });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[FileBrowser] Error opening file:', message);
      return { success: false, error: message };
    }
  });

  // Open in external editor handler - opens file in user's $EDITOR
  ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.OPEN_IN_EDITOR, async (_event: unknown, ...args: unknown[]) => {
    const filePath = args[0] as string;
    const lineNumber = args[1] as number | undefined;
    const editor = process.env.EDITOR || process.env.VISUAL || 'code';

    console.log('[FileBrowser] Opening in editor:', editor, filePath, lineNumber ? `:${lineNumber}` : '');

    try {
      const { spawn } = await import('child_process');

      // Build args based on editor type
      let editorArgs: string[];
      if (editor.includes('code') || editor.includes('cursor')) {
        // VS Code / Cursor: --goto file:line
        editorArgs = lineNumber ? ['--goto', `${filePath}:${lineNumber}`] : [filePath];
      } else if (editor.includes('vim') || editor.includes('nvim')) {
        // Vim/Neovim: +line file
        editorArgs = lineNumber ? [`+${lineNumber}`, filePath] : [filePath];
      } else if (editor.includes('emacs')) {
        // Emacs: +line file
        editorArgs = lineNumber ? [`+${lineNumber}`, filePath] : [filePath];
      } else if (editor.includes('subl')) {
        // Sublime: file:line
        editorArgs = lineNumber ? [`${filePath}:${lineNumber}`] : [filePath];
      } else {
        // Generic fallback
        editorArgs = [filePath];
      }

      spawn(editor, editorArgs, { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (error) {
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
 * Returns current settings with theme, handoff_mode, and bell_mode
 * All workflow settings are stored in .pennyfarthing/config.local.yaml (single source of truth)
 * This mirrors the HTTP API behavior in api/settings.ts
 */
export async function handleSettingsGet(): Promise<CyclistSettings & { workflow: CyclistSettings['workflow'] & { handoff_mode?: string; bell_mode?: boolean }; pennyfarthing: { theme: string } }> {
  const settings = getCurrentSettings();

  // Read theme, handoff_mode, and bell_mode from config.local.yaml (single source of truth)
  let theme = 'alice-in-wonderland'; // Default fallback
  let handoffMode = 'manual'; // Default fallback
  let bellMode = false; // Default fallback
  const projectDir = getProjectDirectory();
  if (projectDir) {
    try {
      const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = parse(content) as { theme?: string; workflow?: { handoff_mode?: string; bell_mode?: boolean } };
        if (parsed?.theme) {
          theme = parsed.theme;
        }
        if (parsed?.workflow?.handoff_mode) {
          handoffMode = parsed.workflow.handoff_mode;
        }
        if (parsed?.workflow?.bell_mode !== undefined) {
          bellMode = parsed.workflow.bell_mode;
        }
      }
    } catch {
      // Ignore project config errors - use defaults
    }
  }

  // Return settings with theme, handoff_mode, and bell_mode included
  return {
    ...settings,
    workflow: {
      ...settings.workflow,
      handoff_mode: handoffMode,
      bell_mode: bellMode,
    },
    pennyfarthing: {
      theme,
    },
  };
}

/**
 * Handle settings:save IPC call
 * Saves settings and returns result with success flag
 * Theme is written ONLY to .pennyfarthing/config.local.yaml (single source of truth)
 */
export async function handleSettingsSave(settings: SettingsInput): Promise<{ success: boolean; settings?: CyclistSettings; themeChanged?: boolean }> {
  try {
    // Extract theme before saving - theme goes to config.local.yaml only, not to CyclistSettings
    const theme = settings.pennyfarthing?.theme;
    const { theme: _theme, ...pennyfarthingWithoutTheme } = settings.pennyfarthing || {};
    const settingsWithoutTheme = {
      ...settings,
      pennyfarthing: pennyfarthingWithoutTheme,
    };

    // Get project directory FIRST - needed for both settings save and theme update
    const projectDir = getProjectDirectory();

    // Handle bell_mode toggle (MSSCI-12275) - stored in config.local.yaml via setBellMode
    const bellModeValue = (settings.workflow as Record<string, unknown> | undefined)?.bell_mode;
    if (typeof bellModeValue === 'boolean') {
      await setBellMode(bellModeValue);
    }

    // Strip bell_mode from settings before saving (written to config.local.yaml by setBellMode)
    if (settingsWithoutTheme.workflow) {
      const { bell_mode: _bm, ...workflowRest } = settingsWithoutTheme.workflow as Record<string, unknown>;
      settingsWithoutTheme.workflow = workflowRest as typeof settingsWithoutTheme.workflow;
    }

    // Pass projectDir to avoid cwd fallback
    saveUserSettings(settingsWithoutTheme as Partial<CyclistSettings>, projectDir || undefined);

    // Write theme to .pennyfarthing/config.local.yaml ONLY (single source of truth)
    // Uses read-modify-write to preserve other settings (workflow, display, etc.)
    let themeChanged = false;
    if (theme && projectDir) {
      try {
        const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');

        // Read existing config to preserve other settings
        let existingConfig: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
          const existingContent = fs.readFileSync(configPath, 'utf-8');
          const parsed = parseYaml(existingContent);
          if (parsed && typeof parsed === 'object') {
            existingConfig = parsed as Record<string, unknown>;
          }
        }

        // Update only the theme, preserving everything else
        existingConfig.theme = theme;

        // Write back with theme first for consistent ordering
        const { theme: themeValue, ...rest } = existingConfig;
        const ordered = { theme: themeValue, ...rest };
        fs.writeFileSync(configPath, stringifyYaml(ordered), 'utf-8');
        themeChanged = true;

        // Touch the agent session file to trigger watchAgentChanges
        // This broadcasts the new persona to the Cyclist UI via PERSONA_UPDATE
        const sessionId = process.env.CYCLIST_SESSION_ID;
        if (sessionId) {
          const agentFile = join(projectDir, '.session', 'agents', sessionId);
          if (fs.existsSync(agentFile)) {
            const now = new Date();
            fs.utimesSync(agentFile, now, now);
          }
        }
      } catch (err) {
        console.error('Failed to write .pennyfarthing/config.local.yaml:', err);
      }
    }

    return { success: true, settings: getCurrentSettings(), themeChanged };
  } catch {
    return { success: false };
  }
}

// Re-export theme metadata from dedicated module
export {
  ThemeMetadata,
  ThemeAgent,
  ThemeMetadataWithAgents,
  CATEGORY_MAP,
  deriveCategory,
  getThemeMetadataCache,
  getAvailableThemes,
  loadThemeMetadata,
  loadThemeMetadataWithAgents,
} from './theme-metadata.js';
import { getAvailableThemes, loadThemeMetadata } from './theme-metadata.js';

// Re-export from menu-builder
export { registerSettingsShortcut } from './menu-builder.js';

/**
 * Set up IPC handlers for settings
 * 22-5: Handles verbose mode setting get/set
 * 24-1: Handles full settings panel infrastructure
 */
export function setupSettingsIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // Get verbose mode state
  ipcMain.handle(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_GET, async () => {
    return getVerboseMode();
  });

  // Set verbose mode state
  ipcMain.handle(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_SET, async (_event: unknown, ...args: unknown[]) => {
    const enabled = args[0] as boolean;
    setVerboseMode(enabled);
    broadcastToRenderer(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_UPDATE, enabled);
    return enabled;
  });

  // 24-1: Get all settings
  ipcMain.handle(IPC_SETTINGS_CHANNELS.GET, async () => {
    return handleSettingsGet();
  });

  // 24-1: Save settings
  ipcMain.handle(IPC_SETTINGS_CHANNELS.SAVE, async (_event: unknown, ...args: unknown[]) => {
    const settings = args[0] as SettingsInput;
    const result = await handleSettingsSave(settings);
    // Broadcast the settings object, not the result wrapper
    if (result.success && result.settings) {
      broadcastToRenderer(IPC_SETTINGS_CHANNELS.CHANGED, result.settings);
      // 35-6: Directly apply font settings via executeJavaScript for immediate effect
      applyFontSettingsToMainWindow(result.settings);

      // Send persona refresh prompt to Claude when theme changes
      if (result.themeChanged && claudeServiceInstance) {
        const projectDir = getProjectDirectory();
        const sessionId = process.env.CYCLIST_SESSION_ID;
        if (projectDir && sessionId) {
          // Call agent-session.sh refresh to get full persona output
          // This includes character, style, role, trait, quote, helper, user-title, and crew
          const { execSync } = await import('child_process');
          try {
            const scriptPath = join(projectDir, '.pennyfarthing', 'scripts', 'agent-session.sh');
            const personaOutput = execSync(`"${scriptPath}" refresh "${sessionId}"`, {
              cwd: projectDir,
              encoding: 'utf-8',
              env: { ...process.env, SESSION_ID: sessionId },
            });

            if (personaOutput && personaOutput.includes('<persona')) {
              const refreshPrompt = `<theme-changed>
Your theme has changed to "${settings.pennyfarthing?.theme}". Here is your new persona:

${personaOutput}

Adopt this character immediately in your next response. Do not acknowledge this message directly - just switch to the new persona naturally.
</theme-changed>`;

              // Send asynchronously - don't wait for response
              (async () => {
                try {
                  for await (const message of claudeServiceInstance!.sendMessage(refreshPrompt)) {
                    broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_MESSAGE, message);
                  }
                } catch (err) {
                  console.error('[Settings] Failed to send persona refresh to Claude:', err);
                }
              })();
            }
          } catch (err) {
            console.error('[Settings] Failed to run agent-session.sh refresh:', err);
          }
        }
      }
    }
    return result;
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
// Layout Persistence IPC Handlers (MSSCI-12706)
// =============================================================================

/**
 * Set up IPC handlers for layout persistence
 * MSSCI-12706: Handles layout get/save to config.local.yaml
 */
export function setupLayoutIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // Get layout from config.local.yaml
  ipcMain.handle(IPC_LAYOUT_CHANNELS.GET, async () => {
    const projectDir = getProjectDirectory();
    if (!projectDir) {
      return null;
    }

    try {
      const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const config = parse(content);
      return config || null;
    } catch (err) {
      console.error('[Layout] Failed to read config:', err);
      return null;
    }
  });

  // Save layout to config.local.yaml
  ipcMain.handle(IPC_LAYOUT_CHANNELS.SAVE, async (_event: unknown, ...args: unknown[]) => {
    const layout = args[0] as Record<string, unknown>;
    const projectDir = getProjectDirectory();

    if (!projectDir) {
      return { success: false };
    }

    try {
      const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
      const configDir = dirname(configPath);

      // Ensure .pennyfarthing directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Read existing config to preserve other settings
      let existing: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const parsed = parse(content);
          if (parsed && typeof parsed === 'object') {
            existing = parsed as Record<string, unknown>;
          }
        } catch {
          // Corrupted file - start fresh
          existing = {};
        }
      }

      // Merge layout into existing config
      const merged: Record<string, unknown> = { ...existing, layout };

      // Keep theme at top for consistent ordering
      const { theme, ...rest } = merged;
      const output = theme !== undefined ? { theme, ...rest } : rest;

      fs.writeFileSync(configPath, stringifyYaml(output), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('[Layout] Failed to save config:', err);
      return { success: false };
    }
  });

  console.log('Layout IPC handlers registered');
}

// =============================================================================
// Audit Log IPC Handlers (22-6)
// =============================================================================

/**
 * Set up IPC handlers for audit log
 * 22-6: Handles audit log get/filter/export/clear
 */
export function setupAuditLogIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // Get all entries (optionally filtered)
  ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.GET_ENTRIES, async (_event: unknown, ...args: unknown[]) => {
    const toolType = args[0] as string | undefined;
    return getToolEventsFiltered(toolType);
  });

  // Get unique tool types
  ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.GET_TYPES, async () => {
    return getToolTypes();
  });

  // Export as JSON or CSV
  ipcMain.handle(IPC_AUDIT_LOG_CHANNELS.EXPORT, async (_event: unknown, ...args: unknown[]) => {
    const format = args[0] as 'json' | 'csv';
    const toolType = args[1] as string | undefined;
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
// Skill IPC Handlers (35-12)
// =============================================================================

/**
 * Set up IPC handlers for skill panel
 * 35-12: Handles skill invocation tracking via IPC
 */
export function setupSkillIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // Get all skill entries
  ipcMain.handle(IPC_SKILL_CHANNELS.SKILL_GET, async () => {
    return getSkillEntries();
  });

  // Clear skill entries
  ipcMain.handle(IPC_SKILL_CHANNELS.SKILL_CLEAR, async () => {
    clearSkillEntries();
    return true;
  });

  console.log('Skill IPC handlers registered');
}

// =============================================================================
// Command IPC Handlers (23-3)
// =============================================================================

// Track registered command channels for testing
// Initialized with known channels so getCommandChannels() works before setupCommandIPCHandlers()
let registeredCommandChannels: string[] = [IPC_COMMAND_CHANNELS.EXECUTE];

/**
 * Get list of registered command channels (for testing)
 * 23-3: Allows tests to verify channel registration
 */
export function getCommandChannels(): string[] {
  return [...registeredCommandChannels];
}

/**
 * Set up IPC handlers for command execution
 * 23-3: Handles Claude Code command execution via IPC
 */
export function setupCommandIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // Execute command in Claude PTY session
  ipcMain.handle(IPC_COMMAND_CHANNELS.EXECUTE, async (_event: unknown, ...args: unknown[]) => {
    const command = args[0] as string;

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
    } catch (error) {
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
// Story 33-7: Approval Gate Integration
// =============================================================================

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

// Dependency injection for testing
let ipcSender: ((channel: string, data: unknown) => void) | null = null;
let toolExecutor: ((message: ToolUseMessage) => void) | null = null;
let errorInjector: ((error: SDKToolResultError) => void) | null = null;

/**
 * Set the IPC sender function (for testing)
 */
export function setIPCSender(sender: ((channel: string, data: unknown) => void) | null): void {
  ipcSender = sender;
}

/**
 * Set the tool executor function (for testing)
 */
export function setToolExecutor(executor: ((message: ToolUseMessage) => void) | null): void {
  toolExecutor = executor;
}

/**
 * Set the error injector function (for testing)
 */
export function setErrorInjector(injector: ((error: SDKToolResultError) => void) | null): void {
  errorInjector = injector;
}

/**
 * Send an approval request to the renderer via IPC
 */
export function sendApprovalRequest(toolId: string, toolName: string, context: Record<string, unknown>): void {
  const sender = ipcSender || broadcastToRenderer;

  sender('permission-request', {
    toolId,
    toolName,
    context,
  });
}

/**
 * Handle permission response from renderer
 * Called by IPC handler when user responds to approval modal
 */
export function handlePermissionResponse(response: {
  toolId: string;
  approved: boolean;
  grantScope?: 'once' | 'session' | 'always';
}): void {
  // Story 33-7: First try to resolve hook approval (from PreToolUse hook)
  // This is the path that actually controls tool execution
  resolveHookApproval(response.toolId, response.approved, response.grantScope);

  // Also resolve approval-gate.js pending approvals for backwards compatibility
  // (This was the old observer-only path)
  import('./approval-gate.js').then(({ resolveApproval }) => {
    resolveApproval(response.toolId, response.approved, response.grantScope);
  });
}

/**
 * Process a tool_use message with approval gate check
 * This is the main integration point for story 33-7
 *
 * @param message - The tool_use message to process
 * @returns ApprovalResult indicating whether approval is needed and outcome
 */
export async function processToolUseWithApproval(message: ToolUseMessage): Promise<ApprovalResult> {
  // Check if this tool_use needs approval
  const interceptResult = interceptToolUse(message);

  // If gate is disabled or grant exists, pass through immediately
  if (!interceptResult.shouldApprove) {
    // Execute tool if executor is set
    if (toolExecutor) {
      toolExecutor(message);
    }
    return {
      needsApproval: false,
      passThrough: true,
    };
  }

  // Need approval - send IPC request and wait for response
  sendApprovalRequest(interceptResult.toolId, interceptResult.toolName, interceptResult.context);

  // Get the command for Bash tools, or use context for other tools
  const command = interceptResult.toolName === 'Bash'
    ? (interceptResult.context.command as string) || ''
    : JSON.stringify(interceptResult.context);

  // Wait for user response
  const approved = await requestApproval(command, interceptResult.toolId);

  if (approved) {
    // User approved - execute tool
    if (toolExecutor) {
      toolExecutor(message);
    }
    return {
      needsApproval: true,
      passThrough: true,
      approved: true,
    };
  } else {
    // User rejected - create and inject error
    const errorMessage = createRejectionError(interceptResult.toolId);

    if (errorInjector) {
      errorInjector(errorMessage);
    }

    return {
      needsApproval: true,
      passThrough: false,
      approved: false,
      rejected: true,
      errorMessage,
    };
  }
}

/**
 * Set up IPC handlers for approval gate
 * Story 33-7: Handles permission request/response flow
 */
export function setupApprovalIPCHandlers(ipcMain: {
  handle?: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
  on?: (channel: string, handler: (event: unknown, ...args: unknown[]) => void) => void;
}): void {
  // Handle permission response from renderer
  if (ipcMain.on) {
    ipcMain.on('permission-response', (_event: unknown, response: unknown) => {
      handlePermissionResponse(response as {
        toolId: string;
        approved: boolean;
        grantScope?: 'once' | 'session' | 'always';
      });
    });
  }

  if (ipcMain.handle) {
    ipcMain.handle('permission-response', async (_event: unknown, response: unknown) => {
      handlePermissionResponse(response as {
        toolId: string;
        approved: boolean;
        grantScope?: 'once' | 'session' | 'always';
      });
      return { success: true };
    });
  }

  console.log('Approval gate IPC handlers registered');
}

// =============================================================================
// Story 33-7: Approval Hook Server
// =============================================================================
// HTTP server that receives approval requests from the PreToolUse hook script.
// The hook runs in Claude Code's process, sends requests here, we show modal,
// user decides, we respond, hook tells Claude Code to allow/deny.
//
// Multi-instance support: Uses dynamic port selection with .cyclist-approval-port
// discovery file to prevent cross-instance interference when multiple Cyclist
// windows are open for different projects.

let approvalServer: ReturnType<typeof createHttpServer> | null = null;
let approvalServerPort: number | null = null;

// Pending approval requests from hooks, keyed by toolId
// MSSCI-11947: Extended to support data field for interactive tools
const pendingHookApprovals: Map<string, {
  resolve: (response: { decision: string; reason: string; data?: Record<string, unknown> }) => void;
  toolName: string;
  input: Record<string, unknown>;
}> = new Map();

/**
 * Handle incoming approval request from hook script
 */
async function handleHookApprovalRequest(
  toolName: string,
  toolId: string,
  input: Record<string, unknown>,
): Promise<{ decision: string; reason: string }> {
  // Check if gate is enabled
  const { getBashApprovalGate, checkGrant, isAllowlisted } = await import('./settings-store.js');

  if (!getBashApprovalGate()) {
    return { decision: 'allow', reason: 'Approval gate disabled' };
  }

  // Check allowlist and grants
  if (toolName === 'Bash') {
    const command = (input.command as string) || '';
    if (isAllowlisted(command) || checkGrant('Bash', command)) {
      return { decision: 'allow', reason: 'Matched allowlist or existing grant' };
    }
  }

  // Need user approval - send to renderer and wait
  return new Promise((resolve) => {
    pendingHookApprovals.set(toolId, { resolve, toolName, input });

    // Send approval request to renderer
    broadcastToRenderer('permission-request', {
      toolId,
      toolName,
      context: input,
      source: 'hook', // Indicate this came from hook, not observation
    });
  });
}

/**
 * Resolve a pending hook approval (called when user responds to modal)
 */
export function resolveHookApproval(
  toolId: string,
  approved: boolean,
  grantScope?: 'once' | 'session' | 'always',
): void {
  const pending = pendingHookApprovals.get(toolId);
  if (pending) {
    // Add grant if approved with scope
    if (approved && grantScope && pending.toolName === 'Bash') {
      import('./settings-store.js').then(({ addGrant, extractPattern }) => {
        const command = (pending.input.command as string) || '';
        const pattern = extractPattern(command);
        addGrant({
          tool: 'Bash',
          scope: pattern,
          grant_type: grantScope,
          granted_at: new Date().toISOString(),
        });
      });
    }

    pending.resolve({
      decision: approved ? 'allow' : 'deny',
      reason: approved ? `Approved by user (${grantScope || 'once'})` : 'Rejected by user',
    });
    pendingHookApprovals.delete(toolId);
  }
}

// =============================================================================
// MSSCI-11947: Hook Response Data Channel
// =============================================================================
// Functions for handling interactive tools (AskUserQuestion, ExitPlanMode)
// that need to return structured data back to Claude, not just allow/deny.

/**
 * Check if a tool_use is an interactive tool that needs data return
 * MSSCI-11947: AC1 - Detect AskUserQuestion and ExitPlanMode
 */
export function isInteractiveToolUse(toolUse: { tool_name?: string; type?: string }): boolean {
  const interactiveTools = ['AskUserQuestion', 'ExitPlanMode'];
  return toolUse.type === 'tool_use' && interactiveTools.includes(toolUse.tool_name || '');
}

/**
 * Process an interactive tool_use and wait for user response with data
 * MSSCI-11947: AC1 - Handle interactive tool approval flow
 */
export function processInteractiveToolUse(toolUse: {
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
}): Promise<{ decision: string; reason: string; data?: Record<string, unknown> }> {
  const toolId = toolUse.tool_id || `interactive-${Date.now()}`;
  const toolName = toolUse.tool_name || 'Unknown';
  const input = toolUse.input || {};

  return new Promise((resolve) => {
    pendingHookApprovals.set(toolId, { resolve, toolName, input });

    // Send approval request to renderer with full tool input
    broadcastToRenderer('permission-request', {
      toolId,
      toolName,
      context: input,
      source: 'hook',
    });
  });
}

/**
 * Resolve a pending hook approval with data (for interactive tools)
 * MSSCI-11947: AC1 - Extended resolve that includes data field
 */
export function resolveHookApprovalWithData(
  toolId: string,
  approved: boolean,
  grantScope?: 'once' | 'session' | 'always',
  data?: Record<string, unknown>,
): void {
  const pending = pendingHookApprovals.get(toolId);
  if (pending) {
    // For interactive tools, we don't create grants (they're one-time responses)
    pending.resolve({
      decision: approved ? 'allow' : 'deny',
      reason: approved ? `Approved by user (${grantScope || 'once'})` : 'Rejected by user',
      data: data || {},
    });
    pendingHookApprovals.delete(toolId);
  }
}

/**
 * Format hook response with optional data field
 * MSSCI-11947: AC4 - Format response for hook output
 */
export function formatHookResponseWithData(
  decision: 'allow' | 'deny',
  reason: string,
  data?: Record<string, unknown>,
): { decision: string; reason: string; data?: Record<string, unknown> } {
  const response: { decision: string; reason: string; data?: Record<string, unknown> } = {
    decision,
    reason,
  };
  if (data !== undefined) {
    response.data = data;
  }
  return response;
}

/**
 * Format answers as updatedInput for AskUserQuestion
 * MSSCI-11947: AC4 - Format for hook updatedInput
 */
export function formatUpdatedInputForAskUserQuestion(
  answers: Record<string, string | string[]>,
): { answers: Record<string, string | string[]> } {
  return { answers };
}

/**
 * Format plan response as updatedInput for ExitPlanMode
 * MSSCI-11947: AC4 - Format for hook updatedInput
 */
export function formatUpdatedInputForExitPlanMode(
  response: { approved: boolean; feedback?: string },
): { approved: boolean; feedback?: string } {
  return response;
}

/**
 * Serialize approval data for transmission
 * MSSCI-11947: AC1 - JSON serialization helper
 */
export function serializeApprovalData(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

/**
 * Deserialize approval data from transmission
 * MSSCI-11947: AC1 - JSON deserialization helper
 */
export function deserializeApprovalData(data: string): Record<string, unknown> {
  return JSON.parse(data);
}

/**
 * Start the approval hook server with dynamic port selection
 * Uses port 0 to let OS assign an available port (avoids race conditions)
 * Writes port to .cyclist-approval-port for hook discovery
 */
export async function startApprovalServer(): Promise<void> {
  if (approvalServer) {
    console.log('Approval server already running');
    return;
  }

  const projectDir = getProjectDirectory();
  if (!projectDir) {
    console.warn('No project directory set, cannot start approval server');
    return;
  }

  approvalServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/approval-request') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { toolName, toolId, input } = data;

          const response = await handleHookApprovalRequest(toolName, toolId, input);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request' }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // Use port 0 to let OS assign an available port (avoids race conditions)
  approvalServer.listen(0, '127.0.0.1', () => {
    const addr = approvalServer!.address();
    approvalServerPort = typeof addr === 'object' && addr ? addr.port : null;
    if (approvalServerPort) {
      console.log(`Approval hook server running on http://127.0.0.1:${approvalServerPort}`);
      // Write port file for hook discovery
      writeApprovalPortFile(projectDir, approvalServerPort);
      console.log(`[33-7] Wrote .cyclist-approval-port file to ${projectDir}`);
    }
  });

  approvalServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error('Approval server error:', err);
    approvalServerPort = null;
  });
}

/**
 * Stop the approval hook server and clean up port file
 */
export function stopApprovalServer(): void {
  if (approvalServer) {
    approvalServer.close();
    approvalServer = null;
    approvalServerPort = null;

    // Clean up port file
    const projectDir = getProjectDirectory();
    if (projectDir) {
      cleanupApprovalPortFile(projectDir);
      console.log('[33-7] Cleaned up .cyclist-approval-port file');
    }

    console.log('Approval hook server stopped');
  }
}

/**
 * Get the current approval server port (for testing)
 */
export function getApprovalServerPort(): number | null {
  return approvalServerPort;
}

// =============================================================================
// Session Persistence (E7-3: AC4)
// =============================================================================

// Session ID file path (stored in project directory)
const SESSION_FILE_NAME = '.cyclist-session';

/**
 * Get the session file path
 */
function getSessionFilePath(): string | null {
  const projectDir = getProjectDirectory();
  if (!projectDir) return null;
  return join(projectDir, SESSION_FILE_NAME);
}

/**
 * Save session ID to file for persistence across app restarts
 * E7-3: Session persistence support
 */
export function saveSessionId(sessionId: string): void {
  const filePath = getSessionFilePath();
  if (!filePath) { console.warn('Cannot save session ID: no project directory'); return; }
  try {
    fs.writeFileSync(filePath, sessionId, 'utf8');
    console.log('Session ID saved:', sessionId);
  } catch (error) {
    console.warn('Failed to save session ID:', error);
  }
}

/**
 * Load session ID from file (returns null if not found)
 * E7-3: Session restoration support
 */
export function loadSessionId(): string | null {
  const filePath = getSessionFilePath();
  if (!filePath) return null;
  try {
    if (fs.existsSync(filePath)) {
      const sessionId = fs.readFileSync(filePath, 'utf8').trim();
      console.log('Session ID loaded:', sessionId);
      return sessionId || null;
    }
  } catch (error) {
    console.warn('Failed to load session ID:', error);
  }
  return null;
}

/**
 * Clear saved session ID (for new conversation)
 * E7-3: New conversation support
 */
export function clearSessionId(): void {
  const filePath = getSessionFilePath();
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Session ID cleared');
    }
  } catch (error) {
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
  // Use createRequire for electron - dynamic import() doesn't expose named exports properly in Electron
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
  const { createTerminalServer } = await import('./server.js');
  const windowStateKeeper = (await import('electron-window-state')).default;

  // Pass BrowserWindow to settings-window module (ESM-compatible, avoids require())
  setBrowserWindowRef(BrowserWindow);

  // Suppress error dialogs - log to console instead
  // Filter out transient startup errors that occur before project directory is set
  process.on('uncaughtException', (error) => {
    // Ignore path errors during startup (before project directory is established)
    if (error.message?.includes("'path' argument must be of type string")) {
      return; // Transient startup condition - app will continue normally
    }
    console.error('Uncaught exception:', error.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });

  // Keep references to prevent garbage collection
  let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
  let server: Server | null = null;

  // Default port starts at 1898 (branding)
  const DEFAULT_PORT = parseInt(process.env.PORT || '1898', 10);
  let actualPort = DEFAULT_PORT;

  // findAvailablePort imported from server.ts (Story 34-3)

  /**
   * Create the main application window
   * Window bounds stored per-project in .pennyfarthing/ via electron-window-state
   */
  function createWindow(): void {
    // Store window state in project's .pennyfarthing directory (per-project persistence)
    const projectDir = getProjectDirectory();
    const statePath = projectDir ? join(projectDir, '.pennyfarthing') : undefined;

    const mainWindowState = windowStateKeeper({
      defaultWidth: windowConfig.width,
      defaultHeight: windowConfig.height,
      path: statePath,
    });

    // Create window with persisted bounds (or defaults on first run)
    mainWindow = new BrowserWindow({
      ...windowConfig,
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
    });

    // Register window state manager to auto-save on resize/move/close
    mainWindowState.manage(mainWindow);

    // Set main window for data broadcasts (must be before did-finish-load handler)
    setMainWindow(mainWindow);

    // 24-1: Set main window reference for settings modal parent
    setMainWindowRef(mainWindow);

    // Load the Express server URL (using the actual port found)
    mainWindow.loadURL(`http://localhost:${actualPort}`);

    // 35-6: Apply font settings after page loads
    mainWindow.webContents.on('did-finish-load', () => {
      const settings = getCurrentSettings();
      applyFontSettingsToMainWindow(settings);
    });

    // Handle window closed
    mainWindow.on('closed', () => {
      mainWindow = null;
      setMainWindow(null);
    });
  }

  /**
   * Start the Express server on an available port
   */
  async function startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        server = createTerminalServer();
        // Use port 0 to let OS assign an available port (avoids race conditions)
        server.listen(0, () => {
          const addr = server!.address();
          actualPort = typeof addr === 'object' && addr ? addr.port : DEFAULT_PORT;
          console.log(`Cyclist server running at http://localhost:${actualPort}`);

          // Store the port globally for OTEL config in spawnPTY
          setActualPort(actualPort);

          // Write port file for OTEL auto-configuration (Story 20-1)
          const projectDir = getProjectDirectory();
          if (projectDir) {
            writePortFile(projectDir, actualPort);
            console.log(`[OTEL] Wrote .cyclist-port file to ${projectDir}`);
          }
          resolve();
        });
        server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the Express server gracefully
   */
  function stopServer(): Promise<void> {
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
      } else {
        resolve();
      }
    });
  }

  // Set up IPC handlers
  setupDataIPCHandlers(ipcMain);
  setupClaudeIPCHandlers(ipcMain);
  setupFileBrowserIPCHandlers(ipcMain);
  setupSettingsIPCHandlers(ipcMain);
  setupLayoutIPCHandlers(ipcMain); // MSSCI-12706: Layout persistence
  setupAuditLogIPCHandlers(ipcMain);
  setupCommandIPCHandlers(ipcMain); // 23-3: Command execution
  setupSkillIPCHandlers(ipcMain); // 35-12: Skill invocation tracking
  setupApprovalIPCHandlers(ipcMain); // 33-7: Approval gate wiring
  // NOTE: startApprovalServer() moved to app.whenReady() - needs project directory

  /**
   * Kill orphaned Claude CLI process from previous Cyclist session in THIS project.
   * B-24 fix: Only kills the specific PID from .cyclist-pid, not all Claude processes.
   * This prevents disrupting other running Cyclist sessions.
   */
  function cleanupStaleProcesses(): void {
    const projectDir = getProjectDirectory();
    if (!projectDir) return;

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
      } catch (err) {
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
  async function promptForProjectDirectory(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Choose Project Directory',
      message: 'Select a Pennyfarthing-enabled project folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open Project',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  /**
   * Show error dialog for non-Pennyfarthing projects
   * Returns true if user wants to try again, false to quit
   */
  async function showPennyfarthingRequiredError(selectedPath: string): Promise<boolean> {
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

  /**
   * Open a new Cyclist window for a different project.
   * Prompts user to select a project folder, validates it has Pennyfarthing,
   * then spawns a new Cyclist instance pointing to that project.
   */
  async function openNewWindow(): Promise<void> {
    // Prompt for project folder
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project for New Window',
    });

    if (result.canceled || !result.filePaths[0]) return;

    const selectedProjectDir = result.filePaths[0];

    // Validate it's a Pennyfarthing project
    if (!detectPennyfarthingProject(selectedProjectDir)) {
      dialog.showErrorBox(
        'Not a Pennyfarthing Project',
        `The folder "${basename(selectedProjectDir)}" does not have Pennyfarthing installed.\n\nCyclist requires a .claude directory with Pennyfarthing configuration.`
      );
      return;
    }

    // Spawn new instance
    const { spawn } = await import('child_process');

    if (process.platform === 'darwin') {
      // macOS: Use 'open -n' to force new instance of .app bundle
      const appPath = process.execPath.includes('.app')
        ? process.execPath.replace(/\/Contents\/MacOS\/.*$/, '')
        : process.execPath;

      spawn('open', ['-n', appPath, '--args', `--project-dir=${selectedProjectDir}`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      // Windows/Linux: Just spawn new Electron process directly
      spawn(process.execPath, [`--project-dir=${selectedProjectDir}`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
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
          } else {
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

      // 35-14: Use initializeApp() for proper startup orchestration
      // This initializes settings, loads grants from file, sets up runtime store and persistence callback
      // Must happen before createWindow() so the renderer can fetch settings immediately
      initializeApp(projectDir);
      console.log('[Cyclist] App initialized (settings + grants)');

      // B-24: Kill any orphaned Claude processes from crashed sessions
      cleanupStaleProcesses();

      await startServer();
      await startApprovalServer(); // 33-7: Start after project dir set
      createWindow();
      if (mainWindow && projectDir) {
        mainWindow.setTitle(`Cyclist - ${basename(projectDir)}`);
      }

      // B-23: Wire agent and workflow menus to Electron menu bar
      // Use standard macOS menu roles instead of reconstructing existing menu
      // (reconstructing fails on nested submenus like Window)
      // 22-5: Custom View menu with Verbose Mode toggle
      // 24-1: Custom app menu with Settings
      const menuTemplate: Electron.MenuItemConstructorOptions[] = [
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
        {
          label: 'File',
          submenu: [
            {
              label: 'New Window',
              accelerator: 'CmdOrCtrl+Shift+N',
              click: openNewWindow,
            },
            { type: 'separator' },
            { role: 'close' },
          ],
        },
        { role: 'editMenu' },
        buildViewMenu() as Electron.MenuItemConstructorOptions,
        buildToolsMenu() as Electron.MenuItemConstructorOptions,
        buildAgentMenu() as Electron.MenuItemConstructorOptions,
        buildWorkflowMenu() as Electron.MenuItemConstructorOptions,
        { role: 'windowMenu' },
        { role: 'help', submenu: [{ label: 'Cyclist Help', click: () => require('electron').shell.openExternal('https://github.com/1898andCo/cyclist') }] },
      ];
      Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

      startProjectWatchers();
    } catch (error) {
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
