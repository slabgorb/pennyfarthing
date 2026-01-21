/**
 * MSSCI-12051: Cyclist Adapter for VS Code Webview
 *
 * Adapts Cyclist components from Electron IPC to VS Code postMessage API.
 * Translates window.electronAPI calls to vscode.postMessage.
 */

// Acquire VS Code API
const vscode = acquireVsCodeApi();

// State management (persisted across webview reloads)
let state = vscode.getState() || {
  stats: null,
  story: null,
  theme: 'dark',
};

/**
 * Save state to VS Code webview state
 */
function saveState() {
  vscode.setState(state);
}

/**
 * Send message to extension host
 */
function sendMessage(type, data = {}) {
  vscode.postMessage({ type, ...data });
}

/**
 * Request initial state from extension
 */
function requestInitialState() {
  sendMessage('requestInitialState');
}

/**
 * Execute VS Code command
 */
function executeCommand(command, ...args) {
  sendMessage('executeCommand', { command, args });
}

/**
 * Update stats display
 */
function updateStats(data) {
  if (!data) return;

  state.stats = data;
  saveState();

  // Update context meter
  if (data.context) {
    const contextBar = document.getElementById('context-bar');
    const contextLabel = document.getElementById('context-label');
    if (contextBar && contextLabel) {
      const percent = data.context.usablePercent || 0;
      contextBar.style.width = `${percent}%`;
      contextLabel.textContent = `${percent}%`;

      // Update level class
      contextBar.className = 'context-bar';
      if (percent >= 85) {
        contextBar.classList.add('level-danger');
      } else if (percent >= 70) {
        contextBar.classList.add('level-warning');
      } else {
        contextBar.classList.add('level-safe');
      }
    }
  }

  // Update persona
  if (data.persona) {
    const nameEl = document.getElementById('character-name');
    const roleEl = document.getElementById('character-role');
    if (nameEl) {
      nameEl.textContent = data.persona.character || '--';
    }
    if (roleEl) {
      roleEl.textContent = data.persona.role?.toUpperCase() || '--';
    }
  }
}

/**
 * Update story display
 */
function updateStory(data) {
  if (!data) return;

  state.story = data;
  saveState();

  const idEl = document.getElementById('story-id');
  const phaseEl = document.getElementById('story-phase');
  const titleEl = document.getElementById('story-title');
  const branchEl = document.getElementById('story-branch');

  if (idEl) idEl.textContent = data.id || '--';
  if (phaseEl) phaseEl.textContent = data.phase?.toUpperCase() || '--';
  if (titleEl) titleEl.textContent = data.title || 'No active story';
  if (branchEl) branchEl.textContent = data.branch || '--';
}

/**
 * Update theme
 */
function updateTheme(theme) {
  state.theme = theme;
  saveState();

  document.body.className = theme === 'light' ? 'vscode-light' : 'vscode-dark';
}

/**
 * Update connection status
 */
function updateConnectionStatus(status) {
  const statusEl = document.getElementById('connection-status');
  if (!statusEl) return;

  const indicator = statusEl.querySelector('.status-indicator');
  const text = statusEl.querySelector('.status-text');

  switch (status) {
    case 'connected':
      statusEl.classList.add('hidden');
      break;
    case 'reconnecting':
      statusEl.classList.remove('hidden');
      if (indicator) indicator.className = 'status-indicator reconnecting';
      if (text) text.textContent = 'Reconnecting...';
      break;
    case 'disconnected':
      statusEl.classList.remove('hidden');
      if (indicator) indicator.className = 'status-indicator disconnected';
      if (text) text.textContent = 'Disconnected';
      break;
  }
}

/**
 * Handle messages from extension host
 */
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'stats':
      updateStats(message.data);
      break;

    case 'story':
      updateStory(message.data);
      break;

    case 'themeChange':
      updateTheme(message.theme);
      break;

    case 'connectionStatus':
      updateConnectionStatus(message.status);
      break;

    case 'initialState':
      if (message.stats) updateStats(message.stats);
      if (message.story) updateStory(message.story);
      break;
  }
});

/**
 * Expose adapter API for Cyclist components
 * Mimics window.electronAPI interface
 */
window.cyclistAdapter = {
  send: sendMessage,
  executeCommand,
  getState: () => state,
};

// For compatibility with Cyclist components expecting electronAPI
window.electronAPI = {
  send: (channel, data) => {
    sendMessage(channel, data);
  },
  on: (channel, callback) => {
    // Register listener that maps to message events
    const handler = (event) => {
      if (event.data.type === channel) {
        callback(event.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  },
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Apply persisted state
  if (state.stats) updateStats(state.stats);
  if (state.story) updateStory(state.story);
  if (state.theme) updateTheme(state.theme);

  // Request fresh state from extension
  requestInitialState();
});

// Also request state immediately in case DOM is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  requestInitialState();
}
