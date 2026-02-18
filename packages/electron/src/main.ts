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

import { Server } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
// Electron types are available at runtime via require('electron') in startElectronApp()
// Core server exports (paths, ports, story, git, etc.)
import {
  getStoryInfo,
  getAllReposGitInfoAsync,
  writePortFile,
  cleanupPortFile,
  writePidFile,
  cleanupPidFile,
  readPidFile,
  isProcessRunning,
  getOtelConfig,
  getProjectDirectory,
  setProjectDirectory,
  isValidProjectDirectory,
  parseProjectDirArg,
  clearSessionGrants,
} from '@pennyfarthing/core/server';
// Core server submodules
import { getCurrentPersona, detectPennyfarthingProject, watchAgentChanges } from '@pennyfarthing/core/dist/server/pennyfarthing.js';
import { selectContextTier, getPrimeContextJson } from '@pennyfarthing/cyclist/dist/prime.js';
import { listDirectory as listDir } from '@pennyfarthing/core/dist/server/file-browser.js';
import { getContextUsage, type ContextInfo } from '@pennyfarthing/core/dist/server/api/context.js';
import { getVerboseMode, setVerboseMode, initializeGrants, setGrantsPersistCallback } from '@pennyfarthing/core/dist/server/settings-store.js';
import {
  getCurrentSettings,
  saveUserSettings,
  initializeSettings,
  loadGrants,
  saveGrants,
  type CyclistSettings,
  type SettingsInput,
} from '@pennyfarthing/core/dist/server/settings.js';
import { broadcastBackgroundTaskEvent } from '@pennyfarthing/core/dist/server/api/background-tasks.js';
import { setBellMode } from '@pennyfarthing/core/dist/server/bell-mode.js';
// Cyclist modules (real OTLP, WebSocket, ClaudeService, utilities)
import { parseToolStats, type ToolStats, createEmptyStats } from '@pennyfarthing/cyclist/dist/tool-stats.js';
import {
  getTokenStats,
  setTokenStatsCallback,
  setToolEventCallback,
  type TokenStats,
  type ToolEvent,
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
  type BackgroundTask,
  trackBackgroundTask,
  completeBackgroundTask,
  getBackgroundTaskByToolId,
  getBackgroundTasks,
} from '@pennyfarthing/cyclist/dist/otlp-receiver.js';
import { ClaudeService, type SDKMessage } from '@pennyfarthing/cyclist/dist/claude-service.js';
import { isTodoWriteMessage, extractTodos, type TodoItem } from '@pennyfarthing/cyclist/dist/todos.js';
// Story 36-8: Import for capturing tool inputs for OTEL enrichment
import { storePendingToolInput } from '@pennyfarthing/cyclist/dist/span-correlation.js';
import { setStoryUpdateCallback, setGitUpdateCallback, broadcastClaudeMessage, setClaudeSendCallback, setClaudeAbortCallback, setClaudeClearCallback, setClaudeSetModeCallback, setClaudeGetModeCallback, setClaudeClearAndReloadCallback, broadcastTodosUpdate, broadcastContextUpdate, broadcastPanelToggle } from '@pennyfarthing/cyclist/dist/websocket.js';
import { openSettingsWindow, setMainWindowRef, setBrowserWindowRef } from '@pennyfarthing/cyclist/dist/settings-window.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  IPC_DATA_CHANNELS,
  IPC_CLAUDE_CHANNELS,
  IPC_AGENT_CHANNELS,
  IPC_SETTINGS_CHANNELS,
  IPC_AUDIT_LOG_CHANNELS,
  IPC_FILE_BROWSER_CHANNELS,
  IPC_COMMAND_CHANNELS,
  IPC_BACKGROUND_TASK_CHANNELS,
  IPC_SKILL_CHANNELS,
  IPC_LAYOUT_CHANNELS,
  IPC_AVATAR_CHANNELS,
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
  IPC_AVATAR_CHANNELS,
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
  setPanelToggleBroadcast,
} from './menu-builder.js';

// Local imports for menu building
import {
  buildAgentMenu,
  buildWorkflowMenu,
  buildToolsMenu,
  buildViewMenu,
  setPanelToggleBroadcast,
  setSettingsOpener,
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

/**
 * Enriched SDK message with subagent context (MSSCI-12776)
 * Added fields for UI display when message is from a subagent
 */
type EnrichedSDKMessage = SDKMessage & {
  subagent_type?: string;
  subagent_name?: string;
};

/**
 * Enrich SDK message with subagent context (MSSCI-12776)
 * If message has parent_tool_use_id, look up the Task that spawned it
 * and add subagent_name and subagent_type for UI display
 */
function enrichMessageWithSubagentContext(message: SDKMessage): EnrichedSDKMessage {
  // Check if message has parent_tool_use_id (indicates it's from a subagent)
  const parentId = (message as { parent_tool_use_id?: string | null }).parent_tool_use_id;
  if (!parentId) {
    return message;
  }

  // Look up the Task that spawned this subagent
  const task = getBackgroundTaskByToolId(parentId);
  if (!task) {
    return message;
  }

  // Enrich message with subagent context
  return {
    ...message,
    subagent_type: task.subagentType,
    subagent_name: task.description,
  };
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
 * Replaces current todos with new data and broadcasts to renderer and WebSocket
 */
export function updateTodosState(todos: TodoItem[]): void {
  currentTodos = [...todos];
  broadcastToRenderer(IPC_DATA_CHANNELS.TODOS_UPDATE, currentTodos);
  // Also broadcast via WebSocket for React components
  broadcastTodosUpdate(currentTodos.map((t, i) => ({
    id: `todo-${i}`,
    content: t.content,
    activeForm: t.activeForm,
    status: t.status,
  })));
}

/**
 * Reset todos to empty state
 * Called when clearing session
 */
export function resetTodos(): void {
  currentTodos = [];
  broadcastToRenderer(IPC_DATA_CHANNELS.TODOS_UPDATE, currentTodos);
  // Also broadcast via WebSocket for React components
  broadcastTodosUpdate([]);
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
 * Current active agent name for tier calculation
 * Set when agent is loaded via AGENT_LOAD_CONTEXT or AGENT_NEW_SESSION
 * MSSCI-12799: Required for tier display in DebugPanel
 */
let currentAgentName: string | null = null;

/**
 * Get the current agent name
 */
export function getCurrentAgent(): string | null {
  return currentAgentName;
}

/**
 * Set the current agent name and update ClaudeService state
 */
export function setCurrentAgent(agent: string | null): void {
  currentAgentName = agent;
  // Also update ClaudeService's lastAgent for tier calculation
  if (claudeServiceInstance) {
    claudeServiceInstance.setLastAgent(agent);
  }
}

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
  // MSSCI-12799: Clear current agent when context is reset
  currentAgentName = null;
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
  // Check if values actually changed (including tier for MSSCI-12799)
  if (
    currentContext.percent === context.percent &&
    currentContext.tokens === context.tokens &&
    currentContext.status === context.status &&
    currentContext.tier === context.tier
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
 * Calculate the current tier from ClaudeService state
 * MSSCI-12799: Used to include tier in context broadcast
 */
function calculateCurrentTier(): ReturnType<typeof selectContextTier> | undefined {
  if (!currentAgentName || !claudeServiceInstance) {
    return undefined;
  }
  const state = claudeServiceInstance.getContextState();
  return selectContextTier(currentAgentName, state);
}

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
  // MSSCI-12799: Include tier in context
  initialContext.tier = calculateCurrentTier();
  updateContextState(initialContext);

  // Set up polling
  contextPollTimer = setInterval(() => {
    // Get session ID each poll - it may become available after first message
    const currentSessionId = getSessionId?.() ?? undefined;
    const context = getContextUsage(projectDir, currentSessionId);
    // MSSCI-12799: Include tier in context
    context.tier = calculateCurrentTier();
    const changed = updateContextState(context);
    if (changed) {
      console.log('Context updated:', context.percent, '%', context.tier ? `tier=${context.tier}` : '', currentSessionId ? `(session: ${currentSessionId.slice(0, 8)}...)` : '');
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
export { type UsageStats, getUsageStats, USAGE_POLL_INTERVAL_MS, startUsagePolling } from '@pennyfarthing/cyclist/dist/usage-stats.js';
import {
  getUsageStats,
  resetUsageStats as resetUsageStatsInternal,
  startUsagePolling as startUsagePollingInternal,
  setUserEmail as setUsageStatsUserEmail,
} from '@pennyfarthing/cyclist/dist/usage-stats.js';

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
  // Prevent white flash: hide window until content is painted
  show: false,
  backgroundColor: '#1a1a2e',
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
  // Uses async version to avoid blocking event loop and git lock conflicts
  ipcMain.handle(IPC_DATA_CHANNELS.GIT_GET, async () => {
    const projectDir = getProjectDirectory();
    if (!projectDir) return null;
    return { repos: await getAllReposGitInfoAsync(projectDir) };
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

  // MSSCI-12784: Background tasks handler - returns all current tasks
  // Used when Background tab opens to get accurate snapshot
  ipcMain.handle(IPC_BACKGROUND_TASK_CHANNELS.TASK_GET_ALL, async () => {
    return getBackgroundTasks();
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

  // Register story update callback to bridge WebSocket to Electron IPC
  // This fixes panels not updating without page reload
  setStoryUpdateCallback((storyInfo) => {
    broadcastToRenderer(IPC_DATA_CHANNELS.STORY_UPDATE, storyInfo);
  });

  // Register git update callback to bridge WebSocket to Electron IPC
  setGitUpdateCallback((reposInfo) => {
    broadcastToRenderer(IPC_DATA_CHANNELS.GIT_UPDATE, reposInfo);
  });
  console.log('Story and git update callbacks registered for IPC broadcasts');

  // Register Claude command callbacks to bridge WebSocket to ClaudeService
  // This allows React components to communicate via WebSocket in Electron mode
  setClaudeSendCallback(async (prompt, images, onMessage, onComplete, onError) => {
    try {
      const service = getClaudeService();
      if (images.length > 0) {
        console.log(`[main] WebSocket callback processing ${images.length} pasted image(s)`);
      }
      for await (const message of service.sendMessage(prompt, { images })) {
        // Enrich messages with subagent context (same as IPC handler)
        const enrichedMessage = enrichMessageWithSubagentContext(message);

        // Send to this specific WebSocket client
        onMessage(enrichedMessage);

        // Also broadcast to IPC for Electron renderer
        broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_MESSAGE, enrichedMessage);

        // Update stats
        updateStatsFromSDK(message);

        // Handle TodoWrite messages
        if (isTodoWriteMessage(message)) {
          const todos = extractTodos(message);
          updateTodosState(todos);
        }

        // MSSCI-14190: Process tool_use messages for diff tracking (same as IPC handler)
        // This was missing from the WebSocket callback path!
        processToolUseFromMessage(message);

        // Complete subagent tasks when tool_result arrives
        // CLI format: discrete tool_result message
        if (message.type === 'tool_result') {
          const msg = message as { tool_id?: string; output?: string; is_error?: boolean };
          if (msg.tool_id) {
            const task = getBackgroundTaskByToolId(msg.tool_id);
            if (task) {
              completeBackgroundTask(msg.tool_id, !msg.is_error,
                msg.is_error ? undefined : msg.output?.slice(0, 500),
                msg.is_error ? (msg.output?.slice(0, 500) || 'Task failed') : undefined);
            }
          }
        }
        // SDK format: tool_result nested in user message content
        if (message.type === 'user') {
          const userMsg = message as { message?: { content?: Array<{ type: string; tool_use_id?: string; content?: string; is_error?: boolean }> } };
          if (userMsg.message?.content) {
            for (const block of userMsg.message.content) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                const task = getBackgroundTaskByToolId(block.tool_use_id);
                if (task) {
                  completeBackgroundTask(block.tool_use_id, !block.is_error,
                    block.is_error ? undefined : (typeof block.content === 'string' ? block.content.slice(0, 500) : undefined),
                    block.is_error ? (typeof block.content === 'string' ? block.content.slice(0, 500) : 'Task failed') : undefined);
                }
              }
            }
          }
        }
      }
      onComplete();
      broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_COMPLETE, null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onError(errorMessage);
      broadcastToRenderer(IPC_CLAUDE_CHANNELS.CLAUDE_ERROR, errorMessage);
    }
  });

  setClaudeAbortCallback(() => {
    try {
      const service = getClaudeService();
      console.log('[WebSocket] Abort callback triggered');
      service.abort();
    } catch (error) {
      console.error('[WebSocket] Error in abort callback:', error);
    }
  });

  setClaudeClearCallback(() => {
    try {
      const service = getClaudeService();
      service.clearSession();
      clearSessionId();
      resetTokenStats();
      resetTodos();
      resetEventStore();
      resetToolStats();
      resetSkills();
      resetContext();
      resetUsageStats();
      // Broadcast zeroed stats
      broadcastToRenderer(IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE, getTokenStats());
      broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_STATS_UPDATE, createEmptyStats());
      broadcastToRenderer(IPC_DATA_CHANNELS.TOOL_EVENTS_UPDATE, []);
      broadcastToRenderer(IPC_DATA_CHANNELS.CONTEXT_UPDATE, { percent: 0, contextWindow: 0 });
      broadcastToRenderer(IPC_DATA_CHANNELS.PERSONA_UPDATE, null);
      console.log('[WebSocket] Session cleared via callback');
    } catch (error) {
      console.error('[WebSocket] Error in clear callback:', error);
    }
  });

  setClaudeSetModeCallback((mode) => {
    try {
      const service = getClaudeService();
      service.setPermissionMode(mode);
      console.log('[WebSocket] Permission mode set to:', mode);
    } catch (error) {
      console.error('[WebSocket] Error in setMode callback:', error);
    }
  });

  setClaudeGetModeCallback(() => {
    try {
      const service = getClaudeService();
      return service.getPermissionMode();
    } catch (error) {
      console.error('[WebSocket] Error in getMode callback:', error);
      return 'default';
    }
  });

  // TirePump: Clear session and reload agent via WebSocket
  setClaudeClearAndReloadCallback(async (agent: string) => {
    const service = getClaudeService();
    console.log(`[WebSocket] TirePump: clearAndReload agent "${agent}"`);

    // Clear session state and WAIT for process to fully exit
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

    // Load prime context for the agent (JSON mode: get context + metadata)
    if (projectDir) {
      const agentName = agent.startsWith('/') ? agent.slice(1) : agent;
      setCurrentAgent(agentName);
      const state = service.getContextState();
      const tier = selectContextTier(agentName, state);
      const primeOutput = getPrimeContextJson(agentName, projectDir, tier);
      if (primeOutput?.context) {
        // Same as before — set system prompt for Claude subprocess
        service.setSystemPrompt(primeOutput.context);
        console.log(`[WebSocket] TirePump: Set system prompt for agent "${agentName}" tier=${tier}`);

        // Broadcast prime metadata to DebugPanel via /ws/context
        broadcastContextUpdate({
          percent: null, tokens: null, status: null, error: null,
          baseline: null, usableTokens: null, usablePercent: null, available: null,
          tier: primeOutput.tier ?? tier,
          tokenCounts: primeOutput.tokenCounts,
          totalTokens: primeOutput.totalTokens,
        });
      }
    }

    // Launch the new agent via the agent launch event
    broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, agent);
    console.log(`[WebSocket] TirePump: Session cleared and agent launch triggered: ${agent}`);
  });

  console.log('Claude SDK callbacks registered for WebSocket bridge');

  // Start watching for agent changes
  if (detectPennyfarthingProject(projectDir)) {
    const sessionId = process.env.CYCLIST_SESSION_ID;
    const projectName = basename(projectDir);
    watchAgentChanges(projectDir, sessionId, (agentRole: string) => {
      // MSSCI-12799: Track current agent for tier selection
      setCurrentAgent(agentRole);
      console.log(`[main] Agent change detected: ${agentRole}`);

      // Update persona display
      const persona = getCurrentPersona(projectDir, sessionId);
      if (persona) {
        broadcastToRenderer(IPC_DATA_CHANNELS.PERSONA_UPDATE, { ...persona, projectName });
      }

      // Note: Agent context is injected via the message stream when the user
      // runs an agent command (e.g., /dev). We don't inject it here via
      // setSystemPrompt because that kills the running process.
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
// Tool Use Processing for OTEL Correlation
// =============================================================================

/**
 * Process tool_use messages from any SDK message format for OTEL correlation
 * Handles both discrete tool_use messages and nested tool_use in assistant messages
 * ADR-0020: Diff tracking removed - ChangedPanel now uses git as source of truth
 */
function processToolUseFromMessage(message: SDKMessage): void {
  const processBlock = (toolName: string | undefined, toolId: string | undefined, toolInput: Record<string, unknown> | undefined) => {
    if (!toolName) return;
    // Store for OTEL correlation
    if (toolId && toolInput) {
      storePendingToolInput(toolId, toolName, toolInput);

      // Track all Task tool subagents (background and foreground)
      // All must be tracked so enrichMessageWithSubagentContext can look them up
      if (toolName === 'Task') {
        const description = (toolInput.description as string) || (toolInput.prompt as string)?.substring(0, 50) || 'Subagent task';
        const subagentType = (toolInput.subagent_type as string) || 'general-purpose';
        const isBackground = toolInput.run_in_background === true;
        trackBackgroundTask({
          taskId: toolId,
          description,
          subagentType,
          startedAt: Date.now(),
          isBackground,
        });
      }
    }
  };

  // Format 1: Discrete tool_use messages (CLI streaming format)
  if (message.type === 'tool_use') {
    const toolMsg = message as { tool_name?: string; tool_id?: string; input?: Record<string, unknown> };
    processBlock(toolMsg.tool_name, toolMsg.tool_id, toolMsg.input);
  }

  // Format 2: Nested inside assistant messages (SDK format)
  if (message.type === 'assistant') {
    const assistantMsg = message as { message?: { content?: Array<{ type: string; name?: string; id?: string; input?: Record<string, unknown> }> } };
    const content = assistantMsg.message?.content;
    if (content && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use') {
          processBlock(block.name, block.id, block.input);
        }
      }
    }
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

// NOTE: setupClaudeIPCHandlers removed - Claude communication uses WebSocket exclusively
// See useClaude hook and setClaudeSendCallback in startProjectWatchers()

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

// handleSettingsGet - REMOVED (React uses REST /api/settings)
// The equivalent functionality is in api/settings.ts getSettingsForWebSocket()

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
  type ThemeMetadata,
  type ThemeAgent,
  type ThemeMetadataWithAgents,
  CATEGORY_MAP,
  deriveCategory,
  getThemeMetadataCache,
  loadThemeMetadataWithAgents,
} from '@pennyfarthing/cyclist/dist/theme-metadata.js';
// getAvailableThemes, loadThemeMetadata - REMOVED (React uses REST /api/settings/themes)

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

  // 24-1: Get all settings - REMOVED (React uses REST /api/settings)
  // ipcMain.handle(IPC_SETTINGS_CHANNELS.GET, ...)

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
                    // Also broadcast to WebSocket clients for React components
                    broadcastClaudeMessage(message);
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

  // 24-2: Get available themes - REMOVED (React uses REST /api/settings/themes)
  // ipcMain.handle(IPC_SETTINGS_CHANNELS.GET_AVAILABLE_THEMES, ...)

  // 24-5: Get theme metadata - REMOVED (React uses REST /api/settings/themes)
  // ipcMain.handle(IPC_SETTINGS_CHANNELS.GET_THEME_METADATA, ...)

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
// Avatar IPC Handlers (MSSCI-12777)
// =============================================================================

// In-memory avatar cache (persists for session)
let cachedAvatarUrl: string | null = null;

/**
 * Default silhouette SVG data URL
 */
const DEFAULT_AVATAR =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzY2NiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMTUiIHI9IjgiIGZpbGw9IiNhYWEiLz48ZWxsaXBzZSBjeD0iMjAiIGN5PSIzNSIgcng9IjEyIiByeT0iMTAiIGZpbGw9IiNhYWEiLz48L3N2Zz4=';

/**
 * Set up IPC handlers for user avatar
 * MSSCI-12777: Handles avatar fetching from GitHub with caching
 */
export function setupAvatarIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  // Get user avatar (full fallback chain)
  ipcMain.handle(IPC_AVATAR_CHANNELS.GET, async () => {
    // Check cache first
    if (cachedAvatarUrl) {
      return cachedAvatarUrl;
    }

    // Try GitHub
    try {
      const { execSync } = await import('child_process');
      const result = execSync('gh api /user', { encoding: 'utf-8', timeout: 5000 });
      const userData = JSON.parse(result);
      if (userData?.avatar_url) {
        cachedAvatarUrl = userData.avatar_url;
        return cachedAvatarUrl;
      }
    } catch {
      // gh CLI not available or not authenticated
    }

    return DEFAULT_AVATAR;
  });

  // Fetch from GitHub via gh CLI
  ipcMain.handle(IPC_AVATAR_CHANNELS.FETCH_FROM_GITHUB, async () => {
    try {
      const { execSync } = await import('child_process');
      const result = execSync('gh api /user', { encoding: 'utf-8', timeout: 5000 });
      const userData = JSON.parse(result);
      if (userData?.avatar_url) {
        return { avatar_url: userData.avatar_url };
      }
      return null;
    } catch {
      return null;
    }
  });

  // Get cached avatar
  ipcMain.handle(IPC_AVATAR_CHANNELS.GET_CACHED, async () => {
    return cachedAvatarUrl;
  });

  // Set cached avatar
  ipcMain.handle(IPC_AVATAR_CHANNELS.SET_CACHED, async (_event: unknown, ...args: unknown[]) => {
    const url = args[0] as string;
    cachedAvatarUrl = url;
  });

  // Clear avatar cache
  ipcMain.handle(IPC_AVATAR_CHANNELS.CLEAR_CACHE, async () => {
    cachedAvatarUrl = null;
  });

  console.log('Avatar IPC handlers registered');
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
// Electron App Entry Point (called from bikeshow.ts after app.whenReady)
// =============================================================================

export async function createElectronApp(): Promise<void> {
  // Use createRequire for electron - dynamic import() doesn't expose named exports properly in Electron
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
  const { createTerminalServer, app: expressApp } = await import('@pennyfarthing/cyclist/dist/server.js');
  const { initPluginRouters } = await import('@pennyfarthing/core/dist/server/plugin-loader.js');
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

    // Prevent HTML <title> from overwriting window title
    mainWindow.on('page-title-updated', (e: Electron.Event) => {
      e.preventDefault();
    });

    // Show window once content is painted (prevents white flash on launch)
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
    });

    // 35-6: Apply font settings after page loads
    mainWindow.webContents.on('did-finish-load', () => {
      const settings = getCurrentSettings();
      applyFontSettingsToMainWindow(settings);
      // Set title with project directory name after page loads
      const dir = getProjectDirectory();
      if (dir) {
        mainWindow?.setTitle(`Cyclist - ${basename(dir)}`);
      }
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
    server = createTerminalServer();

    // Load plugin API routers (Story 93-6)
    const pluginProjectDir = getProjectDirectory();
    if (pluginProjectDir) {
      const pluginResult = await initPluginRouters(expressApp, pluginProjectDir);
      if (pluginResult.discovered > 0) {
        console.log(`[Plugin] ${pluginResult.loaded} router(s) loaded, ${pluginResult.failed} failed`);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        // Use port 0 to let OS assign an available port (avoids race conditions)
        server!.listen(0, () => {
          const addr = server!.address();
          actualPort = typeof addr === 'object' && addr ? addr.port : DEFAULT_PORT;
          console.log(`Cyclist server running at http://localhost:${actualPort}`);

          // Store the port globally for OTEL config in spawnPTY
          setActualPort(actualPort);

          // Write port file for OTEL auto-configuration (Story 20-1)
          const projectDir = getProjectDirectory();
          if (projectDir) {
            writePortFile(projectDir, actualPort);
            console.log(`[OTEL] Wrote .bikerack-port file to ${projectDir}`);
          }
          resolve();
        });
        server!.on('error', reject);
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
        console.log('[OTEL] Cleaned up .bikerack-port file');
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
  // NOTE: Claude IPC handlers removed - using WebSocket exclusively (useClaude hook)
  setupDataIPCHandlers(ipcMain);
  setupFileBrowserIPCHandlers(ipcMain);
  setupSettingsIPCHandlers(ipcMain);
  setupLayoutIPCHandlers(ipcMain); // MSSCI-12706: Layout persistence
  setupAvatarIPCHandlers(ipcMain); // MSSCI-12777: User avatar
  setupAuditLogIPCHandlers(ipcMain);
  setupCommandIPCHandlers(ipcMain); // 23-3: Command execution
  setupSkillIPCHandlers(ipcMain); // 35-12: Skill invocation tracking

  /**
   * Kill orphaned Claude CLI process from previous Cyclist session in THIS project.
   * B-24 fix: Only kills the specific PID from .wheelhub-pid, not all Claude processes.
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

  // Initialize project directory, validate Pennyfarthing, then start
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

      // Set Electron mode flag for WebSocket server
      // In Electron mode, Claude messages are broadcast from main.ts, not per-connection ClaudeService
      process.env.CYCLIST_ELECTRON_MODE = '1';

      await startServer();
      createWindow();

      // B-23: Wire agent and workflow menus to Electron menu bar
      // Wire panel toggle to WebSocket broadcast
      setPanelToggleBroadcast(broadcastPanelToggle);
      // Wire settings window opener (dependency injection to avoid cyclist import in menu-builder)
      setSettingsOpener(() => openSettingsWindow());

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

  // macOS: re-create window when dock icon clicked and no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Clean up before quitting
  app.on('before-quit', async () => {
    // B-24: Abort any running Claude CLI process
    if (claudeServiceInstance) {
      claudeServiceInstance.abort();
    }
    // MSSCI-14324: Clear session/once grants on shutdown
    clearSessionGrants();

    // B-24 fix: Clean up PID file on graceful shutdown
    const projectDir = getProjectDirectory();
    if (projectDir) {
      cleanupPidFile(projectDir);
      console.log('[Cyclist] Cleaned up PID file');
    }
    await stopServer();
  });
}
