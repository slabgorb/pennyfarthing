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
   */
  onUpdate: (callback: (event: unknown, data: unknown) => void) => void;
}

/**
 * Claude API interface for SDK integration (E7-3)
 * Provides methods for sending prompts and receiving streamed messages
 */
export interface ElectronClaudeAPI {
  /**
   * Send a prompt to ClaudeService
   * Returns when the query starts (messages stream via onMessage)
   */
  send: (prompt: string) => Promise<void>;

  /**
   * Abort the current Claude query
   */
  abort: () => Promise<void>;

  /**
   * Clear the session and reset token stats (like /clear in CLI)
   */
  clear: () => Promise<void>;

  /**
   * Set the permission mode for subsequent queries
   */
  setMode: (mode: 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions') => Promise<void>;

  /**
   * Get the current permission mode
   */
  getMode: () => Promise<'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions'>;

  /**
   * Subscribe to streamed messages from ClaudeService
   */
  onMessage: (callback: (message: unknown) => void) => void;

  /**
   * Subscribe to query completion signal
   */
  onComplete: (callback: () => void) => void;

  /**
   * Subscribe to error signals
   */
  onError: (callback: (error: string) => void) => void;
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
}

/**
 * Diff API interface for diff viewer (E8-2)
 * Receives diff data when Edit/Write tools modify files
 */
export interface ElectronDiffAPI {
  /**
   * Subscribe to diff updates from main process
   * Receives DiffData when Edit or Write tools are used
   */
  onUpdate: (callback: (event: unknown, data: unknown) => void) => void;
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

export interface ElectronAPI {
  stats: ElectronDataAPI;
  persona: ElectronDataAPI;
  story: ElectronDataAPI;
  git: ElectronDataAPI;
  toolStats: ElectronDataAPI;
  tokenStats: ElectronDataAPI;
  todos: ElectronDataAPI; // B-17: Todo visualizer
  context: ElectronDataAPI; // B-19: Context usage progress bar
  claude: ElectronClaudeAPI;
  agent: ElectronAgentAPI; // B-23: Agent launcher
  diff: ElectronDiffAPI; // E8-2: Diff viewer
  fileBrowser: ElectronFileBrowserAPI; // E8-3: File browser
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
  ipcRenderer: { invoke: (channel: string) => Promise<unknown>; on: (channel: string, callback: (event: unknown, data: unknown) => void) => void } | null,
  getChannel: string,
  updateChannel: string
): ElectronDataAPI {
  if (ipcRenderer) {
    return {
      get: () => ipcRenderer.invoke(getChannel),
      onUpdate: (callback: (event: unknown, data: unknown) => void) => {
        // Multiple modules can subscribe to the same channel
        // On page refresh, old listeners are garbage collected
        ipcRenderer.on(updateChannel, callback);
      },
    };
  } else {
    // Test environment - return no-op functions
    return {
      get: () => Promise.resolve(null),
      onUpdate: (_callback: (event: unknown, data: unknown) => void) => {
        // No-op in test environment
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
      // Claude SDK API (E7-3)
      claude: {
        send: (prompt: string) => ipcRenderer.invoke('claude:send', prompt),
        abort: () => ipcRenderer.invoke('claude:abort'),
        clear: () => ipcRenderer.invoke('claude:clear'),
        setMode: (mode: 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions') => ipcRenderer.invoke('claude:setMode', mode),
        getMode: () => ipcRenderer.invoke('claude:getMode') as Promise<'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions'>,
        onMessage: (callback: (message: unknown) => void) => {
          ipcRenderer.on('claude:message', (_event: unknown, msg: unknown) => callback(msg));
        },
        onComplete: (callback: () => void) => {
          ipcRenderer.on('claude:complete', () => callback());
        },
        onError: (callback: (error: string) => void) => {
          ipcRenderer.on('claude:error', (_event: unknown, err: unknown) => callback(err as string));
        },
      },
      // Agent launcher API (B-23)
      agent: {
        onLaunch: (callback: (event: unknown, command: string) => void) => {
          ipcRenderer.on('agent:launch', callback);
        },
      },
      // Diff viewer API (E8-2)
      diff: {
        onUpdate: (callback: (event: unknown, data: unknown) => void) => {
          ipcRenderer.on('diff:update', callback);
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
      // Claude SDK API (E7-3) - test stub
      claude: {
        send: (_prompt: string) => Promise.resolve(),
        abort: () => Promise.resolve(),
        clear: () => Promise.resolve(),
        setMode: (_mode: 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions') => Promise.resolve(),
        getMode: () => Promise.resolve('default' as const),
        onMessage: (_callback: (message: unknown) => void) => {
          // No-op in test environment
        },
        onComplete: (_callback: () => void) => {
          // No-op in test environment
        },
        onError: (_callback: (error: string) => void) => {
          // No-op in test environment
        },
      },
      // Agent launcher API (B-23) - test stub
      agent: {
        onLaunch: (_callback: (event: unknown, command: string) => void) => {
          // No-op in test environment
        },
      },
      // Diff viewer API (E8-2) - test stub
      diff: {
        onUpdate: (_callback: (event: unknown, data: unknown) => void) => {
          // No-op in test environment
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
