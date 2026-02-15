/**
 * Electron Preload Script
 *
 * Exposes a safe IPC bridge to the renderer process via contextBridge.
 * This script runs in a privileged context with access to Node.js APIs,
 * but only exposes a minimal, typed API to the renderer.
 *
 * Security: contextIsolation must be enabled for this to be secure.
 *
 * Note: This script MUST be compiled as CommonJS (not ES modules) for
 * Electron's sandboxed preload to work. See tsconfig.preload.json.
 */

// Type imports for Electron APIs (compiled to require() by CommonJS target)
import type { IpcRenderer, ContextBridge } from 'electron';
// IPC channel constants for type-safe channel references
import { IPC_DATA_CHANNELS } from './ipc-channels.js';

/**
 * Data API interface for sidebar data (B-2)
 * Each data type has get() for request/response and onUpdate() for subscriptions
 */
export interface ElectronDataAPI {
  /**
   * Get current data via IPC invoke
   */
  get: () => Promise<unknown>;

  /**
   * Subscribe to data updates from main process
   * Returns cleanup function to remove the listener
   */
  onUpdate: (callback: (event: unknown, data: unknown) => void) => () => void;
}

/**
 * Image data for clipboard paste (28-1)
 */
export interface PastedImage {
  dataUrl: string;
  mimeType: string;
  filename: string;
}

/**
 * Claude API interface for SDK integration (E7-3)
 * Provides methods for sending prompts and receiving streamed messages
 */
export interface ElectronClaudeAPI {
  /**
   * Send a prompt to ClaudeService (28-1: with optional images)
   * Returns when the query starts (messages stream via onMessage)
   */
  send: (prompt: string, images?: PastedImage[]) => Promise<void>;

  /**
   * Abort the current Claude query
   */
  abort: () => Promise<void>;

  /**
   * Clear the session and reset token stats (like /clear in CLI)
   */
  clear: () => Promise<void>;

  /**
   * Clear the session and reload with a new agent (MSSCI-11840)
   * Used for auto-mode context clearing when context is high
   */
  clearAndReload: (agent: string) => Promise<void>;

  /**
   * Set the permission mode for subsequent queries
   */
  setMode: (mode: 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions') => Promise<void>;

  /**
   * Get the current permission mode
   */
  getMode: () => Promise<'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions'>;

  /**
   * Set the system prompt (persona/agent context)
   * This is passed via --append-system-prompt to make personas behave as in CLI
   */
  setSystemPrompt: (prompt: string) => Promise<void>;

  /**
   * Get the current system prompt
   */
  getSystemPrompt: () => Promise<string | undefined>;

  /**
   * Subscribe to streamed messages from ClaudeService
   * Returns cleanup function to remove the listener
   */
  onMessage: (callback: (message: unknown) => void) => () => void;

  /**
   * Subscribe to query completion signal
   * Returns cleanup function to remove the listener
   */
  onComplete: (callback: () => void) => () => void;

  /**
   * Subscribe to error signals
   * Returns cleanup function to remove the listener
   */
  onError: (callback: (error: string) => void) => () => void;
}

/**
 * Context API interface for context usage updates (B-19)
 * Provides get() for request/response and onUpdate() for push updates
 */
// Context API now uses standard ElectronDataAPI pattern (B-19)

/**
 * Agent API interface for agent launcher (B-23)
 * Receives agent/workflow launch commands from Electron menu
 */
export interface ElectronAgentAPI {
  /**
   * Subscribe to agent launch events from Electron menu
   * Receives the slash command (e.g., '/sm', '/tea', '/new-work')
   */
  onLaunch: (callback: (event: unknown, command: string) => void) => void;

  /**
   * Load context for an agent (persona, behavior guide, etc.)
   * Sets the system prompt via --append-system-prompt
   */
  loadContext: (agent: string) => Promise<boolean>;
}

/**
 * Diff API interface for diff viewer (E8-2)
 * Receives diff data when Edit/Write tools modify files
 */
export interface ElectronDiffAPI {
  /**
   * Subscribe to diff updates from main process
   * Receives DiffData when Edit or Write tools are used
   * Returns cleanup function to remove the listener
   */
  onUpdate: (callback: (event: unknown, data: unknown) => void) => () => void;
}

/**
 * File browser API interface (E8-3)
 * Provides directory listing and file opening functionality
 */
export interface ElectronFileBrowserAPI {
  /**
   * List contents of a directory
   * @param path - Directory path (empty string for project root)
   */
  listDirectory: (path: string) => Promise<unknown>;

  /**
   * Open a file (triggers file viewer tab in E8-4)
   * @param path - File path to open
   */
  openFile: (path: string) => Promise<void>;

  /**
   * Open a file in the user's external editor ($EDITOR)
   * @param path - File path to open
   * @param lineNumber - Optional line number to jump to
   */
  openInEditor: (path: string, lineNumber?: number) => Promise<boolean>;

  /**
   * Subscribe to file open events
   */
  onFileOpened: (callback: (event: unknown, data: { path: string }) => void) => void;
}

/**
 * Command API interface (23-3)
 * Provides IPC channels for Claude Code command execution
 */
export interface ElectronCommandAPI {
  /**
   * Execute a Claude Code command (e.g., '/compact', '/doctor')
   * @param command - The command to execute
   */
  execute: (command: string) => Promise<void>;

  /**
   * Subscribe to command result events
   */
  onResult: (callback: (result: unknown) => void) => void;

  /**
   * Subscribe to command error events
   */
  onError: (callback: (error: string) => void) => void;
}

/**
 * Bash Approval API interface (22-3)
 * Provides IPC channels for Bash command approval workflow
 */
export interface ElectronBashAPI {
  /**
   * Subscribe to approval request events from main process
   * Triggered when a Bash command needs user approval
   */
  onApprovalRequest: (callback: (event: unknown, data: { command: string; toolId: string }) => void) => void;

  /**
   * Send approval response back to main process
   * @param response - Approval decision with optional grantScope (33-4)
   */
  sendApprovalResponse: (response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) => Promise<void>;
}

/**
 * Audit Log API interface (22-6)
 * Provides access to tool execution audit log
 */
export interface ElectronAuditLogAPI {
  /**
   * Get all entries, optionally filtered by tool type
   */
  getEntries: (toolType?: string) => Promise<unknown[]>;

  /**
   * Get unique tool types in the log
   */
  getTypes: () => Promise<string[]>;

  /**
   * Export log as JSON or CSV
   */
  export: (format: 'json' | 'csv', toolType?: string) => Promise<string>;

  /**
   * Get stats summary
   */
  getStats: () => Promise<{ total: number; byType: Record<string, number>; successCount: number; errorCount: number }>;

  /**
   * Clear the audit log
   */
  clear: () => Promise<boolean>;

  /**
   * Subscribe to new entry events
   */
  onEntry: (callback: (entry: unknown) => void) => void;

  /**
   * Subscribe to show audit log event (from menu)
   */
  onShow: (callback: () => void) => void;
}

/**
 * Settings API interface (22-3, 22-4, 22-5, 24-1)
 * Provides access to Cyclist settings including approval gate, dangerous path gate, verbose mode,
 * and full settings panel infrastructure
 */
export interface ElectronSettingsAPI {
  /**
   * Get the current state of the Bash approval gate
   */
  getBashApprovalGate: () => Promise<boolean>;

  /**
   * Set the state of the Bash approval gate
   */
  setBashApprovalGate: (enabled: boolean) => Promise<void>;

  /**
   * Get the current state of the dangerous path gate (22-4)
   */
  getDangerousPathGate: () => Promise<boolean>;

  /**
   * Set the state of the dangerous path gate (22-4)
   */
  setDangerousPathGate: (enabled: boolean) => Promise<void>;

  /**
   * Get the current state of verbose mode (22-5)
   */
  getVerboseMode: () => Promise<boolean>;

  /**
   * Set the state of verbose mode (22-5)
   */
  setVerboseMode: (enabled: boolean) => Promise<boolean>;

  /**
   * Subscribe to verbose mode changes (22-5)
   */
  onVerboseModeChange: (callback: (event: unknown, enabled: boolean) => void) => void;

  // 24-1: Settings panel infrastructure

  /**
   * Get all current settings (24-1)
   */
  get: () => Promise<unknown>;

  /**
   * Save settings (24-1)
   */
  save: (settings: unknown) => Promise<unknown>;

  /**
   * Open settings window (24-1)
   */
  openWindow: () => Promise<void>;

  /**
   * Subscribe to settings changes (24-1)
   */
  onChanged: (callback: (settings: unknown) => void) => void;

  // 24-2: Pennyfarthing settings section

  /**
   * Get available themes from pennyfarthing-dist (24-2)
   */
  getAvailableThemes: () => Promise<string[]>;

  // 24-5: Theme browser with metadata

  /**
   * Get theme metadata for theme browser (24-5)
   */
  getThemeMetadata: () => Promise<Array<{
    id: string;
    name: string;
    description: string;
    source: string;
    tier: string | null;
    category: string;
    agentCount: number;
  }>>;
}

/**
 * Path Approval API interface (22-4)
 * Provides IPC channels for dangerous path approval workflow
 */
export interface ElectronPathAPI {
  /**
   * Subscribe to approval request events from main process
   * Triggered when a dangerous path operation needs user approval
   */
  onApprovalRequest: (callback: (event: unknown, data: { path: string; toolId: string; category: string }) => void) => void;

  /**
   * Send approval response back to main process
   * @param response - Approval decision with optional grantScope (33-4)
   */
  sendApprovalResponse: (response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) => Promise<void>;
}

/**
 * Permission API interface (33-3)
 * Provides generic IPC channels for any tool permission approval
 */
export interface ElectronPermissionAPI {
  /**
   * Subscribe to permission request events from main process
   * Triggered when any tool needs user approval
   */
  onRequest: (callback: (event: unknown, data: {
    toolName: string;
    toolId: string;
    context: Record<string, unknown>;
    reason?: string;
  }) => void) => void;

  /**
   * Send permission response back to main process
   * @param response - Approval decision with optional grantScope
   */
  sendResponse: (response: {
    toolId: string;
    approved: boolean;
    grantScope?: 'once' | 'session' | 'always';
  }) => Promise<void>;
}

/**
 * Theme API interface (24-9)
 * Provides IPC channels for quick theme switcher
 */
export interface ElectronThemeAPI {
  /**
   * Subscribe to show quick switcher event from menu
   */
  onShowQuickSwitcher: (callback: () => void) => void;
}

/**
 * Tools API interface
 * Provides IPC channels for tool panel toggle
 */
export interface ElectronToolsAPI {
  /**
   * Subscribe to toggle panel event from menu
   */
  onTogglePanel: (callback: () => void) => void;
}

/**
 * Background Task type (35-16, MSSCI-12784)
 */
interface BackgroundTaskData {
  taskId: string;
  description: string;
  subagentType: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'pending' | 'completed';
  success?: boolean;
  output?: string;
  error?: string;
  isBackground?: boolean;
}

/**
 * Background Task API interface (31-15, 35-16, MSSCI-12784)
 * Provides IPC channels for background task notifications
 */
export interface ElectronBackgroundTaskAPI {
  /**
   * Get all current background tasks (MSSCI-12784)
   * Used to fetch accurate state when Background tab opens
   */
  getAll: () => Promise<BackgroundTaskData[]>;

  /**
   * Subscribe to background task start events (35-16)
   * Triggered when a Task with run_in_background: true is registered
   */
  onStarted: (callback: (event: unknown, task: BackgroundTaskData) => void) => void;

  /**
   * Subscribe to background task completion events (31-15)
   * Triggered when a Task with run_in_background: true completes
   */
  onCompleted: (callback: (event: unknown, task: BackgroundTaskData) => void) => void;
}

/**
 * Skill entry data model (35-12)
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
 * Skill API interface (35-12)
 * Provides IPC channels for skill invocation tracking
 */
export interface ElectronSkillAPI {
  /**
   * Get all skill entries
   */
  getEntries: () => Promise<SkillEntry[]>;

  /**
   * Clear all skill entries
   */
  clear: () => Promise<boolean>;

  /**
   * Subscribe to skill start events
   * Triggered when a Skill tool is invoked
   */
  onStart: (callback: (event: unknown, entry: SkillEntry) => void) => void;

  /**
   * Subscribe to skill clear events
   * Triggered when skill log is cleared
   */
  onClear: (callback: () => void) => void;
}

/**
 * Layout API interface (MSSCI-12706)
 * Provides IPC channels for saving/restoring workspace layout
 */
export interface ElectronLayoutAPI {
  /**
   * Get current layout from config.local.yaml
   */
  get: () => Promise<unknown>;

  /**
   * Save layout to config.local.yaml
   */
  save: (layout: unknown) => Promise<{ success: boolean }>;

  /**
   * Subscribe to layout update events
   */
  onUpdate: (callback: (event: unknown, layout: unknown) => void) => void;
}

/**
 * Avatar API interface (MSSCI-12777)
 * Provides IPC channels for user avatar fetching and caching
 */
export interface ElectronAvatarAPI {
  /**
   * Get user avatar (uses full fallback chain on main process)
   */
  get: () => Promise<string>;

  /**
   * Fetch avatar from GitHub via gh CLI
   */
  fetchFromGitHub: () => Promise<{ avatar_url: string } | null>;

  /**
   * Get cached avatar URL
   */
  getCached: () => Promise<string | null>;

  /**
   * Cache avatar URL
   */
  setCached: (url: string) => Promise<void>;

  /**
   * Clear avatar cache
   */
  clearCache: () => Promise<void>;
}

export interface ElectronAPI {
  stats: ElectronDataAPI;
  persona: ElectronDataAPI;
  story: ElectronDataAPI;
  git: ElectronDataAPI;
  toolStats: ElectronDataAPI;
  tokenStats: ElectronDataAPI;
  todos: ElectronDataAPI; // B-17: Todo visualizer
  context: ElectronDataAPI; // B-19: Context usage progress bar
  usageStats: ElectronDataAPI; // 23-1: Usage limits
  projectInfo: ElectronDataAPI; // 35-2: Project info (user email)
  claude: ElectronClaudeAPI;
  agent: ElectronAgentAPI; // B-23: Agent launcher
  diff: ElectronDiffAPI; // E8-2: Diff viewer
  fileBrowser: ElectronFileBrowserAPI; // E8-3: File browser
  command: ElectronCommandAPI; // 23-3: Command execution
  bash: ElectronBashAPI; // 22-3: Bash approval gate
  path: ElectronPathAPI; // 22-4: Dangerous path approval gate
  permission: ElectronPermissionAPI; // 33-3: Generic permission approval
  settings: ElectronSettingsAPI; // 22-3, 22-4: Settings API
  auditLog: ElectronAuditLogAPI; // 22-6: Audit log
  theme: ElectronThemeAPI; // 24-9: Quick theme switcher
  tools: ElectronToolsAPI; // Tool panel toggle
  backgroundTask: ElectronBackgroundTaskAPI; // 31-15: Background task notifications
  skill: ElectronSkillAPI; // 35-12: Skill invocation tracking
  layout: ElectronLayoutAPI; // MSSCI-12706: Layout persistence
  avatar: ElectronAvatarAPI; // MSSCI-12777: User avatar
  shell: { openExternal: (url: string) => Promise<void> };
}

// Check if we're running in Electron (has contextBridge available)
const isElectron = typeof process !== 'undefined' &&
  process.versions &&
  process.versions.electron;

/**
 * Create a data API for a specific channel
 * @param ipcRenderer - The ipcRenderer module (or null for tests)
 * @param getChannel - The channel name for get requests
 * @param updateChannel - The channel name for update subscriptions
 */
function createDataAPI(
  ipcRenderer: { invoke: (channel: string) => Promise<unknown>; on: (channel: string, callback: (event: unknown, data: unknown) => void) => void; removeListener: (channel: string, callback: (event: unknown, data: unknown) => void) => void } | null,
  getChannel: string,
  updateChannel: string
): ElectronDataAPI {
  if (ipcRenderer) {
    return {
      get: () => ipcRenderer.invoke(getChannel),
      onUpdate: (callback: (event: unknown, data: unknown) => void) => {
        ipcRenderer.on(updateChannel, callback);
        // Return cleanup function to remove listener on unmount
        return () => ipcRenderer.removeListener(updateChannel, callback);
      },
    };
  } else {
    // Test environment - return no-op functions
    return {
      get: () => Promise.resolve(null),
      onUpdate: (_callback: (event: unknown, data: unknown) => void) => {
        // No-op in test environment - return no-op cleanup
        return () => {};
      },
    };
  }
}

/**
 * Create the electron API object
 * In Electron: uses actual ipcRenderer
 * In Node (tests): returns mock functions
 */
function createElectronAPI(): ElectronAPI {
  if (isElectron) {
    // Running in Electron - use actual IPC
    // Using require() for Electron modules (CommonJS required for preload)
    const { ipcRenderer } = require('electron');

    return {
      // Data APIs for sidebar (B-2)
      stats: createDataAPI(ipcRenderer, 'stats:get', 'stats:update'),
      persona: createDataAPI(ipcRenderer, 'persona:get', 'persona:update'),
      story: createDataAPI(ipcRenderer, 'story:get', 'story:update'),
      git: createDataAPI(ipcRenderer, 'git:get', 'git:update'),
      // Tool stats API (E5-2)
      toolStats: createDataAPI(ipcRenderer, 'toolStats:get', 'toolStats:update'),
      // Token stats API (E6-3)
      tokenStats: createDataAPI(ipcRenderer, 'tokenStats:get', 'tokenStats:update'),
      // Todos API (B-17)
      todos: createDataAPI(ipcRenderer, 'todos:get', 'todos:update'),
      // Context API (B-19)
      context: createDataAPI(ipcRenderer, 'context:get', 'context:update'),
      // Usage Stats API (23-1)
      usageStats: createDataAPI(ipcRenderer, 'usageStats:get', 'usageStats:update'),
      // 35-2: Project Info API (directory and user email)
      projectInfo: createDataAPI(ipcRenderer, 'projectInfo:get', 'projectInfo:update'),
      // Claude SDK API (E7-3, 28-1: images support, MSSCI-11840: clearAndReload)
      claude: {
        send: (prompt: string, images?: Array<{ dataUrl: string; mimeType: string; filename: string }>) =>
          ipcRenderer.invoke('claude:send', prompt, images || []),
        abort: () => ipcRenderer.invoke('claude:abort'),
        clear: () => ipcRenderer.invoke('claude:clear'),
        clearAndReload: (agent: string) => ipcRenderer.invoke('context:clearAndLoad', agent),
        setMode: (mode: 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions') => ipcRenderer.invoke('claude:setMode', mode),
        getMode: () => ipcRenderer.invoke('claude:getMode') as Promise<'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions'>,
        setSystemPrompt: (prompt: string) => ipcRenderer.invoke('claude:setSystemPrompt', prompt),
        getSystemPrompt: () => ipcRenderer.invoke('claude:getSystemPrompt') as Promise<string | undefined>,
        onMessage: (callback: (message: unknown) => void) => {
          const handler = (_event: unknown, msg: unknown) => callback(msg);
          ipcRenderer.on('claude:message', handler);
          return () => ipcRenderer.removeListener('claude:message', handler);
        },
        onComplete: (callback: () => void) => {
          const handler = () => callback();
          ipcRenderer.on('claude:complete', handler);
          return () => ipcRenderer.removeListener('claude:complete', handler);
        },
        onError: (callback: (error: string) => void) => {
          const handler = (_event: unknown, err: unknown) => callback(err as string);
          ipcRenderer.on('claude:error', handler);
          return () => ipcRenderer.removeListener('claude:error', handler);
        },
      },
      // Agent launcher API (B-23)
      agent: {
        onLaunch: (callback: (event: unknown, command: string) => void) => {
          ipcRenderer.on('agent:launch', callback);
        },
        loadContext: (agent: string) => ipcRenderer.invoke('agent:loadContext', agent),
      },
      // Diff viewer API (E8-2)
      diff: {
        onUpdate: (callback: (event: unknown, data: unknown) => void) => {
          ipcRenderer.on('diff:update', callback);
          return () => ipcRenderer.removeListener('diff:update', callback);
        },
      },
      // File browser API (E8-3)
      fileBrowser: {
        listDirectory: (path: string) => ipcRenderer.invoke('file-browser:list-directory', path),
        openFile: (path: string) => ipcRenderer.invoke('file-browser:open-file', path),
        openInEditor: (path: string, lineNumber?: number) => ipcRenderer.invoke('file-browser:open-in-editor', path, lineNumber),
        onFileOpened: (callback: (event: unknown, data: { path: string }) => void) => {
          ipcRenderer.on('file-browser:file-opened', callback);
        },
      },
      // Command API (23-3)
      command: {
        execute: (command: string) => ipcRenderer.invoke('command:execute', command),
        onResult: (callback: (result: unknown) => void) => {
          ipcRenderer.on('command:result', (_event: unknown, result: unknown) => callback(result));
        },
        onError: (callback: (error: string) => void) => {
          ipcRenderer.on('command:error', (_event: unknown, error: unknown) => callback(error as string));
        },
      },
      // Bash approval API (22-3, 33-4)
      bash: {
        onApprovalRequest: (callback: (event: unknown, data: { command: string; toolId: string }) => void) => {
          ipcRenderer.on('bash:approval-request', callback);
        },
        sendApprovalResponse: (response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) =>
          ipcRenderer.invoke('bash:approval-response', response),
      },
      // Dangerous path approval API (22-4, 33-4)
      path: {
        onApprovalRequest: (callback: (event: unknown, data: { path: string; toolId: string; category: string }) => void) => {
          ipcRenderer.on('path:approval-request', callback);
        },
        sendApprovalResponse: (response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) =>
          ipcRenderer.invoke('path:approval-response', response),
      },
      // Generic permission API (33-3)
      permission: {
        onRequest: (callback: (event: unknown, data: { toolName: string; toolId: string; context: Record<string, unknown>; reason?: string }) => void) => {
          ipcRenderer.on('permission:request', callback);
        },
        sendResponse: (response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) =>
          ipcRenderer.invoke('permission:response', response),
      },
      // Settings API (22-3, 22-4, 22-5, 24-1)
      settings: {
        getBashApprovalGate: () => ipcRenderer.invoke('settings:getBashApprovalGate') as Promise<boolean>,
        setBashApprovalGate: (enabled: boolean) => ipcRenderer.invoke('settings:setBashApprovalGate', enabled),
        getDangerousPathGate: () => ipcRenderer.invoke('settings:getDangerousPathGate') as Promise<boolean>,
        setDangerousPathGate: (enabled: boolean) => ipcRenderer.invoke('settings:setDangerousPathGate', enabled),
        getVerboseMode: () => ipcRenderer.invoke('settings:getVerboseMode') as Promise<boolean>,
        setVerboseMode: (enabled: boolean) => ipcRenderer.invoke('settings:setVerboseMode', enabled) as Promise<boolean>,
        onVerboseModeChange: (callback: (event: unknown, enabled: boolean) => void) => {
          ipcRenderer.on('settings:verboseModeUpdate', callback);
        },
        // 24-1: Settings panel infrastructure
        get: () => ipcRenderer.invoke('settings:get'),
        save: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
        openWindow: () => ipcRenderer.invoke('settings:openWindow'),
        onChanged: (callback: (settings: unknown) => void) => {
          ipcRenderer.on('settings:changed', (_event: unknown, settings: unknown) => callback(settings));
        },
        // 24-2: Pennyfarthing settings section
        getAvailableThemes: () => ipcRenderer.invoke('settings:getAvailableThemes') as Promise<string[]>,
        // 24-5: Theme browser with metadata
        getThemeMetadata: () => ipcRenderer.invoke('settings:getThemeMetadata') as Promise<Array<{
          id: string;
          name: string;
          description: string;
          source: string;
          tier: string | null;
          category: string;
          agentCount: number;
        }>>,
      },
      // Audit Log API (22-6)
      auditLog: {
        getEntries: (toolType?: string) => ipcRenderer.invoke('auditLog:getEntries', toolType) as Promise<unknown[]>,
        getTypes: () => ipcRenderer.invoke('auditLog:getTypes') as Promise<string[]>,
        export: (format: 'json' | 'csv', toolType?: string) => ipcRenderer.invoke('auditLog:export', format, toolType) as Promise<string>,
        getStats: () => ipcRenderer.invoke('auditLog:getStats') as Promise<{ total: number; byType: Record<string, number>; successCount: number; errorCount: number }>,
        clear: () => ipcRenderer.invoke('auditLog:clear') as Promise<boolean>,
        onEntry: (callback: (entry: unknown) => void) => {
          ipcRenderer.on('auditLog:entry', (_event: unknown, entry: unknown) => callback(entry));
        },
        onShow: (callback: () => void) => {
          ipcRenderer.on('tools:showAuditLog', () => callback());
        },
      },
      // Theme API (24-9)
      theme: {
        onShowQuickSwitcher: (callback: () => void) => {
          ipcRenderer.on('theme:showQuickSwitcher', () => callback());
        },
      },
      // Tools API (tool panel toggle)
      tools: {
        onTogglePanel: (callback: () => void) => {
          ipcRenderer.on('tools:toggleToolPanel', () => callback());
        },
      },
      // Background Task API (31-15, 35-16, MSSCI-12784)
      backgroundTask: {
        getAll: () => ipcRenderer.invoke('backgroundTask:getAll') as Promise<BackgroundTaskData[]>,
        onStarted: (callback: (event: unknown, task: BackgroundTaskData) => void) => {
          ipcRenderer.on('backgroundTask:started', callback);
        },
        onCompleted: (callback: (event: unknown, task: BackgroundTaskData) => void) => {
          ipcRenderer.on('backgroundTask:completed', callback);
        },
      },
      // Skill API (35-12)
      skill: {
        getEntries: () => ipcRenderer.invoke('skill:get') as Promise<SkillEntry[]>,
        clear: () => ipcRenderer.invoke('skill:clear') as Promise<boolean>,
        onStart: (callback: (event: unknown, entry: SkillEntry) => void) => {
          ipcRenderer.on('skill:start', callback);
        },
        onClear: (callback: () => void) => {
          ipcRenderer.on('skill:clear', () => callback());
        },
      },
      // Layout API (MSSCI-12706)
      layout: {
        get: () => ipcRenderer.invoke('layout:get'),
        save: (layout: unknown) => ipcRenderer.invoke('layout:save', layout) as Promise<{ success: boolean }>,
        onUpdate: (callback: (event: unknown, layout: unknown) => void) => {
          ipcRenderer.on('layout:update', callback);
        },
      },
      // Avatar API (MSSCI-12777)
      avatar: {
        get: () => ipcRenderer.invoke('avatar:get') as Promise<string>,
        fetchFromGitHub: () => ipcRenderer.invoke('avatar:fetchFromGitHub') as Promise<{ avatar_url: string } | null>,
        getCached: () => ipcRenderer.invoke('avatar:getCached') as Promise<string | null>,
        setCached: (url: string) => ipcRenderer.invoke('avatar:setCached', url),
        clearCache: () => ipcRenderer.invoke('avatar:clearCache'),
      },
      // Shell API - open URLs in system browser
      shell: {
        openExternal: (url: string) => {
          const { shell } = require('electron');
          return shell.openExternal(url);
        },
      },
    };
  } else {
    // Running in Node (tests) - return testable structure
    return {
      // Data APIs for sidebar (B-2) - test stubs
      stats: createDataAPI(null, 'stats:get', 'stats:update'),
      persona: createDataAPI(null, 'persona:get', 'persona:update'),
      story: createDataAPI(null, 'story:get', 'story:update'),
      git: createDataAPI(null, 'git:get', 'git:update'),
      // Tool stats API (E5-2) - test stub
      toolStats: createDataAPI(null, 'toolStats:get', 'toolStats:update'),
      // Token stats API (E6-3) - test stub
      tokenStats: createDataAPI(null, 'tokenStats:get', 'tokenStats:update'),
      // Todos API (B-17) - test stub
      todos: createDataAPI(null, 'todos:get', 'todos:update'),
      // Context API (B-19) - test stub
      context: createDataAPI(null, 'context:get', 'context:update'),
      // Usage Stats API (23-1) - test stub
      usageStats: createDataAPI(null, 'usageStats:get', 'usageStats:update'),
      // 35-2: Project Info API - test stub
      projectInfo: createDataAPI(null, 'projectInfo:get', 'projectInfo:update'),
      // Claude SDK API (E7-3, MSSCI-11840) - test stub
      claude: {
        send: (_prompt: string) => Promise.resolve(),
        abort: () => Promise.resolve(),
        clear: () => Promise.resolve(),
        clearAndReload: (_agent: string) => Promise.resolve(),
        setMode: (_mode: 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions') => Promise.resolve(),
        getMode: () => Promise.resolve('default' as const),
        setSystemPrompt: (_prompt: string) => Promise.resolve(),
        getSystemPrompt: () => Promise.resolve(undefined),
        onMessage: (_callback: (message: unknown) => void) => {
          // No-op in test environment - return cleanup function
          return () => {};
        },
        onComplete: (_callback: () => void) => {
          // No-op in test environment - return cleanup function
          return () => {};
        },
        onError: (_callback: (error: string) => void) => {
          // No-op in test environment - return cleanup function
          return () => {};
        },
      },
      // Agent launcher API (B-23) - test stub
      agent: {
        onLaunch: (_callback: (event: unknown, command: string) => void) => {
          // No-op in test environment
        },
        loadContext: (_agent: string) => Promise.resolve(false),
      },
      // Diff viewer API (E8-2) - test stub
      diff: {
        onUpdate: (_callback: (event: unknown, data: unknown) => void) => {
          // No-op in test environment - return no-op cleanup
          return () => {};
        },
      },
      // File browser API (E8-3) - test stub
      fileBrowser: {
        listDirectory: (_path: string) => Promise.resolve({ path: '', entries: [] }),
        openFile: (_path: string) => Promise.resolve(),
        openInEditor: (_path: string, _lineNumber?: number) => Promise.resolve(true),
        onFileOpened: (_callback: (event: unknown, data: { path: string }) => void) => {
          // No-op in test environment
        },
      },
      // Command API (23-3) - test stub
      command: {
        execute: (_command: string) => Promise.resolve(),
        onResult: (_callback: (result: unknown) => void) => {
          // No-op in test environment
        },
        onError: (_callback: (error: string) => void) => {
          // No-op in test environment
        },
      },
      // Bash approval API (22-3, 33-4) - test stub
      bash: {
        onApprovalRequest: (_callback: (event: unknown, data: { command: string; toolId: string }) => void) => {
          // No-op in test environment
        },
        sendApprovalResponse: (_response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) =>
          Promise.resolve(),
      },
      // Dangerous path approval API (22-4, 33-4) - test stub
      path: {
        onApprovalRequest: (_callback: (event: unknown, data: { path: string; toolId: string; category: string }) => void) => {
          // No-op in test environment
        },
        sendApprovalResponse: (_response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) =>
          Promise.resolve(),
      },
      // Generic permission API (33-3) - test stub
      permission: {
        onRequest: (_callback: (event: unknown, data: { toolName: string; toolId: string; context: Record<string, unknown>; reason?: string }) => void) => {
          // No-op in test environment
        },
        sendResponse: (_response: { toolId: string; approved: boolean; grantScope?: 'once' | 'session' | 'always' }) =>
          Promise.resolve(),
      },
      // Settings API (22-3, 22-4, 22-5, 24-1) - test stub
      settings: {
        getBashApprovalGate: () => Promise.resolve(false),
        setBashApprovalGate: (_enabled: boolean) => Promise.resolve(),
        getDangerousPathGate: () => Promise.resolve(true),
        setDangerousPathGate: (_enabled: boolean) => Promise.resolve(),
        getVerboseMode: () => Promise.resolve(false),
        setVerboseMode: (_enabled: boolean) => Promise.resolve(false),
        onVerboseModeChange: (_callback: (event: unknown, enabled: boolean) => void) => {
          // No-op in test environment
        },
        // 24-1: Settings panel infrastructure - test stub
        get: () => Promise.resolve({
          workflow: { auto_handoff: false, handoff_confirm: true },
          display: { show_flow: true, sidebar_width: 300 },
          notifications: { phase_change: true, sound: false },
          pennyfarthing: { theme: 'alice-in-wonderland' },
        }),
        save: (_settings: unknown) => Promise.resolve({
          workflow: { auto_handoff: false, handoff_confirm: true },
          display: { show_flow: true, sidebar_width: 300 },
          notifications: { phase_change: true, sound: false },
          pennyfarthing: { theme: 'alice-in-wonderland' },
        }),
        openWindow: () => Promise.resolve(),
        onChanged: (_callback: (settings: unknown) => void) => {
          // No-op in test environment
        },
        // 24-2: Pennyfarthing settings section - test stub
        getAvailableThemes: () => Promise.resolve(['alice-in-wonderland', 'a-team', 'star-trek']),
        // 24-5: Theme browser with metadata - test stub
        getThemeMetadata: () => Promise.resolve([
          { id: 'alice-in-wonderland', name: 'Alice in Wonderland', description: 'Characters from Wonderland', source: 'Lewis Carroll', tier: 'S', category: 'Literature', agentCount: 10 },
          { id: 'a-team', name: 'A-Team', description: 'The A-Team crew', source: 'TV Series', tier: 'A', category: 'TV Series', agentCount: 10 },
          { id: 'star-trek', name: 'Star Trek', description: 'Star Trek characters', source: 'TV Series', tier: null, category: 'TV Series', agentCount: 10 },
        ]),
      },
      // Audit Log API (22-6) - test stub
      auditLog: {
        getEntries: (_toolType?: string) => Promise.resolve([]),
        getTypes: () => Promise.resolve([]),
        export: (_format: 'json' | 'csv', _toolType?: string) => Promise.resolve(''),
        getStats: () => Promise.resolve({ total: 0, byType: {}, successCount: 0, errorCount: 0 }),
        clear: () => Promise.resolve(true),
        onEntry: (_callback: (entry: unknown) => void) => {
          // No-op in test environment
        },
        onShow: (_callback: () => void) => {
          // No-op in test environment
        },
      },
      // Theme API (24-9) - test stub
      theme: {
        onShowQuickSwitcher: (_callback: () => void) => {
          // No-op in test environment
        },
      },
      // Tools API - test stub
      tools: {
        onTogglePanel: (_callback: () => void) => {
          // No-op in test environment
        },
      },
      // Background Task API (31-15, 35-16, MSSCI-12784) - test stub
      backgroundTask: {
        getAll: () => Promise.resolve([]),
        onStarted: (_callback: (event: unknown, task: BackgroundTaskData) => void) => {
          // No-op in test environment
        },
        onCompleted: (_callback: (event: unknown, task: BackgroundTaskData) => void) => {
          // No-op in test environment
        },
      },
      // Skill API (35-12) - test stub
      skill: {
        getEntries: () => Promise.resolve([]),
        clear: () => Promise.resolve(true),
        onStart: (_callback: (event: unknown, entry: SkillEntry) => void) => {
          // No-op in test environment
        },
        onClear: (_callback: () => void) => {
          // No-op in test environment
        },
      },
      // Layout API (MSSCI-12706) - test stub
      layout: {
        get: () => Promise.resolve(null),
        save: (_layout: unknown) => Promise.resolve({ success: true }),
        onUpdate: (_callback: (event: unknown, layout: unknown) => void) => {
          // No-op in test environment
        },
      },
      // Avatar API (MSSCI-12777) - test stub
      avatar: {
        get: () => Promise.resolve('data:image/svg+xml;base64,PHN2Zz4='),
        fetchFromGitHub: () => Promise.resolve(null),
        getCached: () => Promise.resolve(null),
        setCached: (_url: string) => Promise.resolve(),
        clearCache: () => Promise.resolve(),
      },
      // Shell API - test stub
      shell: {
        openExternal: (_url: string) => Promise.resolve(),
      },
    };
  }
}

/**
 * The electron API exposed to the renderer
 * Tests can import this directly to verify structure
 */
export const electronAPI: ElectronAPI = createElectronAPI();

// In Electron, expose via contextBridge
if (isElectron) {
  const { contextBridge } = require('electron');
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
}

// Default export for test compatibility
export default electronAPI;
