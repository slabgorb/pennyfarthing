"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.electronAPI = void 0;
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
function createDataAPI(ipcRenderer, getChannel, updateChannel) {
    if (ipcRenderer) {
        return {
            get: () => ipcRenderer.invoke(getChannel),
            onUpdate: (callback) => {
                // Multiple modules can subscribe to the same channel
                // On page refresh, old listeners are garbage collected
                ipcRenderer.on(updateChannel, callback);
            },
        };
    }
    else {
        // Test environment - return no-op functions
        return {
            get: () => Promise.resolve(null),
            onUpdate: (_callback) => {
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
function createElectronAPI() {
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
                send: (prompt) => ipcRenderer.invoke('claude:send', prompt),
                abort: () => ipcRenderer.invoke('claude:abort'),
                clear: () => ipcRenderer.invoke('claude:clear'),
                setMode: (mode) => ipcRenderer.invoke('claude:setMode', mode),
                getMode: () => ipcRenderer.invoke('claude:getMode'),
                onMessage: (callback) => {
                    ipcRenderer.on('claude:message', (_event, msg) => callback(msg));
                },
                onComplete: (callback) => {
                    ipcRenderer.on('claude:complete', () => callback());
                },
                onError: (callback) => {
                    ipcRenderer.on('claude:error', (_event, err) => callback(err));
                },
            },
            // Agent launcher API (B-23)
            agent: {
                onLaunch: (callback) => {
                    ipcRenderer.on('agent:launch', callback);
                },
            },
            // Diff viewer API (E8-2)
            diff: {
                onUpdate: (callback) => {
                    ipcRenderer.on('diff:update', callback);
                },
            },
            // File browser API (E8-3)
            fileBrowser: {
                listDirectory: (path) => ipcRenderer.invoke('file-browser:list-directory', path),
                openFile: (path) => ipcRenderer.invoke('file-browser:open-file', path),
                onFileOpened: (callback) => {
                    ipcRenderer.on('file-browser:file-opened', callback);
                },
            },
        };
    }
    else {
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
                send: (_prompt) => Promise.resolve(),
                abort: () => Promise.resolve(),
                clear: () => Promise.resolve(),
                setMode: (_mode) => Promise.resolve(),
                getMode: () => Promise.resolve('default'),
                onMessage: (_callback) => {
                    // No-op in test environment
                },
                onComplete: (_callback) => {
                    // No-op in test environment
                },
                onError: (_callback) => {
                    // No-op in test environment
                },
            },
            // Agent launcher API (B-23) - test stub
            agent: {
                onLaunch: (_callback) => {
                    // No-op in test environment
                },
            },
            // Diff viewer API (E8-2) - test stub
            diff: {
                onUpdate: (_callback) => {
                    // No-op in test environment
                },
            },
            // File browser API (E8-3) - test stub
            fileBrowser: {
                listDirectory: (_path) => Promise.resolve({ path: '', entries: [] }),
                openFile: (_path) => Promise.resolve(),
                onFileOpened: (_callback) => {
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
exports.electronAPI = createElectronAPI();
// In Electron, expose via contextBridge
if (isElectron) {
    const { contextBridge } = require('electron');
    contextBridge.exposeInMainWorld('electronAPI', exports.electronAPI);
}
// Default export for test compatibility
exports.default = exports.electronAPI;
//# sourceMappingURL=preload.js.map