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
import { getCurrentPersona, detectPennyfarthingProject, watchAgentChanges } from './pennyfarthing.js';
import { getStoryInfo, getGitInfo } from './server.js';
import { parseToolStats, ToolStats, createEmptyStats } from './tool-stats.js';
import { getTokenStats, setTokenStatsCallback, TokenStats, aggregateTokenStats, resetTokenStats } from './otlp-receiver.js';
import { ClaudeService, SDKMessage } from './claude-service.js';
import { isTodoWriteMessage, extractTodos, type TodoItem } from './todos.js';
import { listDirectory as listDir, type DirectoryListing } from './file-browser.js';
import {
  getProjectDirectory,
  setProjectDirectory,
  isValidProjectDirectory,
  parseProjectDirArg,
} from './paths.js';

// Re-export project directory functions for external consumers
export { getProjectDirectory, setProjectDirectory, isValidProjectDirectory };
import * as fs from 'fs';
import { execSync } from 'child_process';

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
    options: { electron?: string; hardResetMethod?: 'exit' | 'quit' }
  ) => void;
  electronReload(__dirname, {
    electron: join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit',
  });
  console.log('[Cyclist] Hot reload enabled - watching for file changes');
} catch {
  // Not in development or module not available
}

// =============================================================================
// IPC Channel Constants (Testable Exports)
// =============================================================================

/**
 * IPC channel names for sidebar data communication (B-2)
 * Used by preload script to expose data APIs to renderer
 */
export const IPC_DATA_CHANNELS = {
  STATS_GET: 'stats:get',
  STATS_UPDATE: 'stats:update',
  PERSONA_GET: 'persona:get',
  PERSONA_UPDATE: 'persona:update',
  STORY_GET: 'story:get',
  STORY_UPDATE: 'story:update',
  GIT_GET: 'git:get',
  GIT_UPDATE: 'git:update',
  TOOL_STATS_GET: 'toolStats:get',
  TOOL_STATS_UPDATE: 'toolStats:update',
  TOKEN_STATS_GET: 'tokenStats:get',
  TOKEN_STATS_UPDATE: 'tokenStats:update',
  // B-17: Todo visualizer
  TODOS_GET: 'todos:get',
  TODOS_UPDATE: 'todos:update',
  // B-19: Context usage progress bar
  CONTEXT_UPDATE: 'context:update',
} as const;

/**
 * IPC channel names for Claude SDK communication (E7-3)
 */
export const IPC_CLAUDE_CHANNELS = {
  CLAUDE_SEND: 'claude:send',
  CLAUDE_MESSAGE: 'claude:message',
  CLAUDE_COMPLETE: 'claude:complete',
  CLAUDE_ERROR: 'claude:error',
  CLAUDE_SET_MODE: 'claude:setMode',
  CLAUDE_GET_MODE: 'claude:getMode',
  CLAUDE_ABORT: 'claude:abort',
  CLAUDE_CLEAR: 'claude:clear',
} as const;

/**
 * IPC channel names for agent launcher (B-23)
 */
export const IPC_AGENT_CHANNELS = {
  AGENT_LAUNCH: 'agent:launch',
} as const;

/**
 * IPC channel names for diff viewer (E8-2)
 */
export const IPC_DIFF_CHANNELS = {
  DIFF_UPDATE: 'diff:update',
} as const;

/**
 * IPC channel names for file browser (E8-3)
 */
export const IPC_FILE_BROWSER_CHANNELS = {
  LIST_DIRECTORY: 'file-browser:list-directory',
  OPEN_FILE: 'file-browser:open-file',
} as const;

// =============================================================================
// Agent & Workflow Definitions (B-23)
// =============================================================================

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
export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // Tactical agents (TDD flow)
  { id: 'sm', label: 'SM (Scrum Master)', command: '/sm', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+S', description: 'Story coordination and sprint management' },
  { id: 'tea', label: 'TEA (Test Engineer)', command: '/tea', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+T', description: 'Test planning and TDD' },
  { id: 'dev', label: 'Dev (Developer)', command: '/dev', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+D', description: 'Feature implementation' },
  { id: 'reviewer', label: 'Reviewer', command: '/reviewer', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+R', description: 'Code review' },
  // Strategic agents
  { id: 'architect', label: 'Architect', command: '/architect', category: 'strategic', accelerator: 'CmdOrCtrl+Shift+A', description: 'System design and architecture' },
  { id: 'pm', label: 'PM (Product Manager)', command: '/pm', category: 'strategic', accelerator: 'CmdOrCtrl+Shift+P', description: 'Product strategy and prioritization' },
  { id: 'orchestrator', label: 'Orchestrator', command: '/orchestrator', category: 'strategic', description: 'Meta coordination of agents' },
];

/**
 * Pennyfarthing workflow definitions for menu
 */
export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  { id: 'new-work', label: 'New Work', command: '/new-work', accelerator: 'CmdOrCtrl+Shift+N', description: 'Start a new story from backlog' },
  { id: 'work', label: 'Resume Work', command: '/work', accelerator: 'CmdOrCtrl+Shift+W', description: 'Resume current work session' },
  { id: 'benchmark', label: 'Benchmark', command: '/benchmark', description: 'Run agent benchmarks' },
];

/**
 * Build Electron menu for agents
 * Groups agents by category with separator between tactical and strategic
 */
export function buildAgentMenu(): { label: string; submenu: unknown[] } {
  const tacticalAgents = AGENT_DEFINITIONS.filter(a => a.category === 'tactical');
  const strategicAgents = AGENT_DEFINITIONS.filter(a => a.category === 'strategic');

  const submenu: unknown[] = [
    ...tacticalAgents.map(agent => ({
      label: agent.label,
      accelerator: agent.accelerator,
      click: () => broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, agent.command),
    })),
    { type: 'separator' },
    ...strategicAgents.map(agent => ({
      label: agent.label,
      accelerator: agent.accelerator,
      click: () => broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, agent.command),
    })),
  ];

  return {
    label: 'Agents',
    submenu,
  };
}

/**
 * Build Electron menu for workflows
 */
export function buildWorkflowMenu(): { label: string; submenu: unknown[] } {
  const submenu = WORKFLOW_DEFINITIONS.map(workflow => ({
    label: workflow.label,
    accelerator: workflow.accelerator,
    click: () => broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, workflow.command),
  }));

  return {
    label: 'Workflows',
    submenu,
  };
}

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
  ];
}

// =============================================================================
// Stats State (B-2.1)
// =============================================================================

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

// Stats state managed by main process
let currentStats: StatsState = {
  model: '—',
  status: '—',
  context: '—',
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
let dataWindowRef: { webContents: { send: (channel: string, data: unknown) => void; isDestroyed: () => boolean } } | null = null;

/**
 * Set the main window reference for data broadcasts
 * Called when window is created in Electron runtime
 */
export function setMainWindow(window: { webContents: { send: (channel: string, data: unknown) => void; isDestroyed: () => boolean } } | null): void {
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

  // Persona handler - returns current persona from pennyfarthing (B-2.1)
  ipcMain.handle(IPC_DATA_CHANNELS.PERSONA_GET, async () => {
    const projectDir = getProjectDirectory();
    if (!projectDir) return { projectName: 'No Project' };
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
    if (!projectDir) return null;
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
    claudeServiceInstance = new ClaudeService({ cwd: projectDir });
  }
  return claudeServiceInstance;
}

/**
 * Set up IPC handlers for Claude SDK communication
 * E7-3: Handles claude:send and streams responses to renderer
 */
export function setupClaudeIPCHandlers(ipcMain: {
  handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => void;
}): void {
  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_SEND, async (_event: unknown, ...args: unknown[]) => {
    const prompt = args[0] as string;
    const service = getClaudeService();

    try {
      for await (const message of service.sendMessage(prompt)) {
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
        if (message.type === 'tool_use') {
          const toolMsg = message as { tool_name: string; tool_id: string; input: Record<string, unknown> };
          if (toolMsg.tool_name === 'Edit') {
            const input = toolMsg.input as { file_path: string; old_string: string; new_string: string };
            broadcastToRenderer(IPC_DIFF_CHANNELS.DIFF_UPDATE, {
              id: toolMsg.tool_id,
              filePath: input.file_path,
              oldContent: input.old_string,
              newContent: input.new_string,
              toolType: 'Edit',
              timestamp: Date.now(),
            });
          } else if (toolMsg.tool_name === 'Write') {
            const input = toolMsg.input as { file_path: string; content: string };
            broadcastToRenderer(IPC_DIFF_CHANNELS.DIFF_UPDATE, {
              id: toolMsg.tool_id,
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
  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_ABORT, async () => {
    const service = getClaudeService();
    service.interrupt();
    return true;
  });

  // Clear handler - resets session and token stats (like /clear in CLI)
  ipcMain.handle(IPC_CLAUDE_CHANNELS.CLAUDE_CLEAR, async () => {
    const service = getClaudeService();
    service.clearSession();
    clearSessionId();
    resetTokenStats();
    resetTodos(); // B-17: Clear todos on session clear
    // Broadcast zeroed token stats to update sidebar immediately
    broadcastToRenderer(IPC_DATA_CHANNELS.TOKEN_STATS_UPDATE, getTokenStats());
    console.log('Session and token stats cleared');
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

  // Open file handler - broadcasts file open event (for E8-4 integration)
  ipcMain.handle(IPC_FILE_BROWSER_CHANNELS.OPEN_FILE, async (_event: unknown, ...args: unknown[]) => {
    const filePath = args[0] as string;
    // For E8-3: Just log the file open request
    // E8-4 will add actual file viewer tab creation
    console.log('[FileBrowser] Open file requested:', filePath);
    broadcastToRenderer('file-browser:file-opened', { path: filePath });
    return true;
  });

  console.log('File browser IPC handlers registered');
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
  // Dynamic imports to avoid errors in Node test environment
  const { app, BrowserWindow, ipcMain, dialog, Menu } = await import('electron');
  const { createTerminalServer } = await import('./server.js');

  // Suppress error dialogs - log to console instead
  process.on('uncaughtException', (error) => {
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

  /**
   * Find an available port starting from the given port
   */
  async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
    const net = await import('net');

    for (let port = startPort; port < startPort + maxAttempts; port++) {
      const available = await new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
          server.close();
          resolve(true);
        });
        server.listen(port);
      });

      if (available) {
        return port;
      }
    }

    throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
  }

  /**
   * Create the main application window
   */
  function createWindow(): void {
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
  }

  /**
   * Start the Express server on an available port
   */
  async function startServer(): Promise<void> {
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

  /**
   * Kill any orphaned Claude CLI processes from previous Cyclist sessions
   * B-24: Prevents duplicate message handling from zombie processes
   */
  function cleanupStaleProcesses(): void {
    try {
      // Kill any orphaned claude processes that were spawned with stream-json output
      execSync('pkill -f "claude.*--output-format stream-json"', { stdio: 'ignore' });
      console.log('[Cyclist] Cleaned up stale Claude processes');
    } catch {
      // pkill returns non-zero if no processes found - that's expected and fine
    }
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
      const menuTemplate: Electron.MenuItemConstructorOptions[] = [
        { role: 'appMenu' },
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
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
    await stopServer();
  });
}
