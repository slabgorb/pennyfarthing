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
            // Usage Stats API (23-1)
            usageStats: createDataAPI(ipcRenderer, 'usageStats:get', 'usageStats:update'),
            // Claude SDK API (E7-3, 28-1: images support)
            claude: {
                send: (prompt, images) => ipcRenderer.invoke('claude:send', prompt, images || []),
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
                openInEditor: (path, lineNumber) => ipcRenderer.invoke('file-browser:open-in-editor', path, lineNumber),
                onFileOpened: (callback) => {
                    ipcRenderer.on('file-browser:file-opened', callback);
                },
            },
            // Command API (23-3)
            command: {
                execute: (command) => ipcRenderer.invoke('command:execute', command),
                onResult: (callback) => {
                    ipcRenderer.on('command:result', (_event, result) => callback(result));
                },
                onError: (callback) => {
                    ipcRenderer.on('command:error', (_event, error) => callback(error));
                },
            },
            // Bash approval API (22-3, 33-4)
            bash: {
                onApprovalRequest: (callback) => {
                    ipcRenderer.on('bash:approval-request', callback);
                },
                sendApprovalResponse: (response) => ipcRenderer.invoke('bash:approval-response', response),
            },
            // Dangerous path approval API (22-4, 33-4)
            path: {
                onApprovalRequest: (callback) => {
                    ipcRenderer.on('path:approval-request', callback);
                },
                sendApprovalResponse: (response) => ipcRenderer.invoke('path:approval-response', response),
            },
            // Settings API (22-3, 22-4, 22-5, 24-1)
            settings: {
                getBashApprovalGate: () => ipcRenderer.invoke('settings:getBashApprovalGate'),
                setBashApprovalGate: (enabled) => ipcRenderer.invoke('settings:setBashApprovalGate', enabled),
                getDangerousPathGate: () => ipcRenderer.invoke('settings:getDangerousPathGate'),
                setDangerousPathGate: (enabled) => ipcRenderer.invoke('settings:setDangerousPathGate', enabled),
                getVerboseMode: () => ipcRenderer.invoke('settings:getVerboseMode'),
                setVerboseMode: (enabled) => ipcRenderer.invoke('settings:setVerboseMode', enabled),
                onVerboseModeChange: (callback) => {
                    ipcRenderer.on('settings:verboseModeUpdate', callback);
                },
                // 24-1: Settings panel infrastructure
                get: () => ipcRenderer.invoke('settings:get'),
                save: (settings) => ipcRenderer.invoke('settings:save', settings),
                openWindow: () => ipcRenderer.invoke('settings:openWindow'),
                onChanged: (callback) => {
                    ipcRenderer.on('settings:changed', (_event, settings) => callback(settings));
                },
                // 24-2: Pennyfarthing settings section
                getAvailableThemes: () => ipcRenderer.invoke('settings:getAvailableThemes'),
                // 24-5: Theme browser with metadata
                getThemeMetadata: () => ipcRenderer.invoke('settings:getThemeMetadata'),
            },
            // Audit Log API (22-6)
            auditLog: {
                getEntries: (toolType) => ipcRenderer.invoke('auditLog:getEntries', toolType),
                getTypes: () => ipcRenderer.invoke('auditLog:getTypes'),
                export: (format, toolType) => ipcRenderer.invoke('auditLog:export', format, toolType),
                getStats: () => ipcRenderer.invoke('auditLog:getStats'),
                clear: () => ipcRenderer.invoke('auditLog:clear'),
                onEntry: (callback) => {
                    ipcRenderer.on('auditLog:entry', (_event, entry) => callback(entry));
                },
                onShow: (callback) => {
                    ipcRenderer.on('tools:showAuditLog', () => callback());
                },
            },
            // Theme API (24-9)
            theme: {
                onShowQuickSwitcher: (callback) => {
                    ipcRenderer.on('theme:showQuickSwitcher', () => callback());
                },
            },
            // Tools API (tool panel toggle)
            tools: {
                onTogglePanel: (callback) => {
                    ipcRenderer.on('tools:toggleToolPanel', () => callback());
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
            // Usage Stats API (23-1) - test stub
            usageStats: createDataAPI(null, 'usageStats:get', 'usageStats:update'),
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
                openInEditor: (_path, _lineNumber) => Promise.resolve(true),
                onFileOpened: (_callback) => {
                    // No-op in test environment
                },
            },
            // Command API (23-3) - test stub
            command: {
                execute: (_command) => Promise.resolve(),
                onResult: (_callback) => {
                    // No-op in test environment
                },
                onError: (_callback) => {
                    // No-op in test environment
                },
            },
            // Bash approval API (22-3, 33-4) - test stub
            bash: {
                onApprovalRequest: (_callback) => {
                    // No-op in test environment
                },
                sendApprovalResponse: (_response) => Promise.resolve(),
            },
            // Dangerous path approval API (22-4, 33-4) - test stub
            path: {
                onApprovalRequest: (_callback) => {
                    // No-op in test environment
                },
                sendApprovalResponse: (_response) => Promise.resolve(),
            },
            // Settings API (22-3, 22-4, 22-5, 24-1) - test stub
            settings: {
                getBashApprovalGate: () => Promise.resolve(false),
                setBashApprovalGate: (_enabled) => Promise.resolve(),
                getDangerousPathGate: () => Promise.resolve(true),
                setDangerousPathGate: (_enabled) => Promise.resolve(),
                getVerboseMode: () => Promise.resolve(false),
                setVerboseMode: (_enabled) => Promise.resolve(false),
                onVerboseModeChange: (_callback) => {
                    // No-op in test environment
                },
                // 24-1: Settings panel infrastructure - test stub
                get: () => Promise.resolve({
                    workflow: { auto_handoff: false, handoff_confirm: true },
                    display: { show_flow: true, show_ocean: false, sidebar_width: 300 },
                    notifications: { phase_change: true, sound: false },
                    pennyfarthing: { theme: 'alice-in-wonderland' },
                }),
                save: (_settings) => Promise.resolve({
                    workflow: { auto_handoff: false, handoff_confirm: true },
                    display: { show_flow: true, show_ocean: false, sidebar_width: 300 },
                    notifications: { phase_change: true, sound: false },
                    pennyfarthing: { theme: 'alice-in-wonderland' },
                }),
                openWindow: () => Promise.resolve(),
                onChanged: (_callback) => {
                    // No-op in test environment
                },
                // 24-2: Pennyfarthing settings section - test stub
                getAvailableThemes: () => Promise.resolve(['alice-in-wonderland', 'a-team', 'star-trek']),
                // 24-5: Theme browser with metadata - test stub
                getThemeMetadata: () => Promise.resolve([
                    { id: 'alice-in-wonderland', name: 'Alice in Wonderland', description: 'Characters from Wonderland', source: 'Lewis Carroll', tier: 'S', category: 'Literature', agentCount: 10 },
                    { id: 'a-team', name: 'A-Team', description: 'The A-Team crew', source: 'TV Series', tier: 'A', category: 'TV Series', agentCount: 10 },
                    { id: 'star-trek', name: 'Star Trek', description: 'Star Trek characters', source: 'TV Series', tier: 'A', category: 'TV Series', agentCount: 10 },
                ]),
            },
            // Audit Log API (22-6) - test stub
            auditLog: {
                getEntries: (_toolType) => Promise.resolve([]),
                getTypes: () => Promise.resolve([]),
                export: (_format, _toolType) => Promise.resolve(''),
                getStats: () => Promise.resolve({ total: 0, byType: {}, successCount: 0, errorCount: 0 }),
                clear: () => Promise.resolve(true),
                onEntry: (_callback) => {
                    // No-op in test environment
                },
                onShow: (_callback) => {
                    // No-op in test environment
                },
            },
            // Theme API (24-9) - test stub
            theme: {
                onShowQuickSwitcher: (_callback) => {
                    // No-op in test environment
                },
            },
            // Tools API - test stub
            tools: {
                onTogglePanel: (_callback) => {
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