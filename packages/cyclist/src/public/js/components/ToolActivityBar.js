/**
 * ToolActivityBar - Prominent sticky component showing tool execution status
 *
 * Story 22-1: Tool Activity Bar Component
 * Displays currently executing tools with name, parameter, and elapsed time.
 *
 * Usage:
 *   - In Electron: Automatically subscribes to IPC messages
 *   - In Web: Call handleMessage() to inject messages manually
 */

/** Tool icons for common tools */
export const TOOL_ICONS = {
  Task: '🚀',
  Bash: '⚡',
  Read: '📖',
  Write: '✏️',
  Edit: '✏️',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  WebSearch: '🔎',
  TodoWrite: '📋',
  AskUserQuestion: '❓',
  default: '🔧',
};

/** Maximum length for displayed parameters */
const MAX_PARAM_LENGTH = 50;

/** Delay before hiding bar after last tool completes (ms) */
const HIDE_DELAY_MS = 300;

/** Active tool timers: Map<toolId, { startTime: number }> */
const activeTools = new Map();

/** Reference to the activity bar element */
let activityBarElement = null;

/** Timeout for hiding the bar */
let hideTimeout = null;

/** Aborting state flag */
let abortingState = false;

/** Delay before hiding bar after abort (ms) - longer to show feedback */
const ABORT_HIDE_DELAY_MS = 1000;

/**
 * Get the basename from a file path
 * @param {string} filepath
 * @returns {string}
 */
function basename(filepath) {
  if (!filepath) return '';
  return filepath.split('/').pop() || filepath;
}

/**
 * Truncate a string with ellipsis
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Get icon for a tool
 * @param {string} toolName - The tool name
 * @returns {string} The icon for the tool
 */
export function getToolIcon(toolName) {
  return TOOL_ICONS[toolName] || TOOL_ICONS.default;
}

/**
 * Extract the primary parameter from a tool_use message for display
 * @param {object} message - The tool_use message
 * @returns {string} The primary parameter to display
 */
export function extractPrimaryParam(message) {
  const input = message.input || {};
  let param = '';

  // Priority order for parameter extraction
  if (input.command) {
    // For Bash: show the command
    param = input.command;
  } else if (input.file_path) {
    // For Read/Write/Edit: show filename
    param = basename(input.file_path);
  } else if (input.pattern) {
    // For Glob/Grep: show pattern
    param = input.pattern;
  } else if (input.description) {
    // For Task: show description
    param = input.description;
  } else if (input.query) {
    // For WebSearch: show query
    param = input.query;
  } else if (input.url) {
    // For WebFetch: show hostname
    try {
      param = new URL(input.url).hostname;
    } catch {
      param = input.url;
    }
  }

  return truncate(param, MAX_PARAM_LENGTH);
}

/**
 * Format elapsed time in milliseconds as "X.Xs"
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time string
 */
export function formatElapsedTime(ms) {
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

/**
 * Start a timer for a tool
 * @param {string} toolId - The tool ID
 */
export function startTimer(toolId) {
  activeTools.set(toolId, {
    startTime: Date.now(),
  });
}

/**
 * Stop a timer for a tool
 * @param {string} toolId - The tool ID
 */
export function stopTimer(toolId) {
  activeTools.delete(toolId);
}

/**
 * Get elapsed time for a tool in milliseconds
 * @param {string} toolId - The tool ID
 * @returns {number} Elapsed time in ms, or 0 if not active
 */
export function getElapsedTime(toolId) {
  const tool = activeTools.get(toolId);
  if (!tool) return 0;
  return Date.now() - tool.startTime;
}

/**
 * Check if a tool is currently active
 * @param {string} toolId - The tool ID
 * @returns {boolean}
 */
export function isToolActive(toolId) {
  return activeTools.has(toolId);
}

/**
 * Show the activity bar
 */
export function showActivityBar() {
  // Guard for Node.js test environment
  if (typeof document === 'undefined') return;

  if (!activityBarElement) {
    activityBarElement = document.getElementById('tool-activity-bar');
  }
  if (activityBarElement) {
    // Cancel any pending hide
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    activityBarElement.classList.remove('hidden');
    activityBarElement.removeAttribute('hidden');
    activityBarElement.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Hide the activity bar
 */
export function hideActivityBar() {
  // Guard for Node.js test environment
  if (typeof document === 'undefined') return;

  if (!activityBarElement) {
    activityBarElement = document.getElementById('tool-activity-bar');
  }
  if (activityBarElement) {
    activityBarElement.classList.add('hidden');
    activityBarElement.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Check if the activity bar is visible
 * @returns {boolean}
 */
export function isBarVisible() {
  // Guard for Node.js test environment
  if (typeof document === 'undefined') return false;

  if (!activityBarElement) {
    activityBarElement = document.getElementById('tool-activity-bar');
  }
  if (!activityBarElement) return false;

  return !activityBarElement.classList.contains('hidden') &&
         activityBarElement.getAttribute('aria-hidden') !== 'true';
}

/**
 * Update the activity bar display with current tool info
 * @param {string} toolName - Tool name
 * @param {string} param - Primary parameter
 * @param {string} toolId - Tool ID for elapsed time
 */
function updateDisplay(toolName, param, toolId) {
  // Guard for Node.js test environment
  if (typeof document === 'undefined') return;

  if (!activityBarElement) {
    activityBarElement = document.getElementById('tool-activity-bar');
  }
  if (!activityBarElement) return;

  const iconEl = activityBarElement.querySelector('.tool-icon');
  const nameEl = activityBarElement.querySelector('.tool-name');
  const paramEl = activityBarElement.querySelector('.tool-param');
  const timeEl = activityBarElement.querySelector('.elapsed-time');

  if (iconEl) iconEl.textContent = getToolIcon(toolName);
  if (nameEl) nameEl.textContent = toolName;
  if (paramEl) paramEl.textContent = param;
  if (timeEl) timeEl.textContent = formatElapsedTime(getElapsedTime(toolId));
}

/** Timer update interval ID */
let timerIntervalId = null;

/**
 * Start the timer display update loop
 */
function startTimerUpdateLoop() {
  if (timerIntervalId) return; // Already running

  timerIntervalId = setInterval(() => {
    // Update elapsed time for all active tools
    // For now, just update display with the most recent tool
    if (activeTools.size > 0) {
      const [toolId, _tool] = [...activeTools.entries()].pop();
      const timeEl = activityBarElement?.querySelector('.elapsed-time');
      if (timeEl) {
        timeEl.textContent = formatElapsedTime(getElapsedTime(toolId));
      }
    }
  }, 100);
}

/**
 * Stop the timer display update loop
 */
function stopTimerUpdateLoop() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

/**
 * Handle a tool_use message
 * @param {object} message - The tool_use message
 */
export function handleToolUse(message) {
  const { tool_name, tool_id, input } = message;

  // Start tracking this tool
  startTimer(tool_id);

  // Extract and show the primary parameter
  const param = extractPrimaryParam(message);

  // Show the bar and update display
  showActivityBar();
  updateDisplay(tool_name, param, tool_id);

  // Start update loop if not running
  startTimerUpdateLoop();
}

/**
 * Handle a tool_result message
 * @param {object} message - The tool_result message
 */
export function handleToolResult(message) {
  const { tool_id } = message;

  // Stop tracking this tool
  stopTimer(tool_id);

  // If no more active tools, schedule hide
  if (activeTools.size === 0) {
    stopTimerUpdateLoop();

    // Hide after brief delay for fade-out effect
    hideTimeout = setTimeout(() => {
      hideActivityBar();
      hideTimeout = null;
    }, HIDE_DELAY_MS);
  }
}

/**
 * Handle a generic message (dispatches to appropriate handler)
 * @param {object} message - The SDK message
 */
export function handleMessage(message) {
  if (message.type === 'tool_use') {
    handleToolUse(message);
  } else if (message.type === 'tool_result') {
    handleToolResult(message);
  }
}

/**
 * Check if running in Electron environment
 * @returns {boolean}
 */
export function isElectronEnvironment() {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

/**
 * Check if currently in aborting state
 * @returns {boolean}
 */
export function isAborting() {
  return abortingState;
}

/**
 * Stop all active tools and clear tracking
 */
function stopAllTools() {
  // Stop all tool timers
  activeTools.clear();
  stopTimerUpdateLoop();
}

/**
 * Reset the aborting state
 */
function resetAbortingState() {
  abortingState = false;

  // Guard for Node.js test environment
  if (typeof document === 'undefined') return;

  if (!activityBarElement) {
    activityBarElement = document.getElementById('tool-activity-bar');
  }
  if (activityBarElement) {
    activityBarElement.classList.remove('aborting');
  }
}

/**
 * Handle abort - called when user aborts running operations
 * Stops all tools, shows visual feedback, and hides bar after delay
 */
export function handleAbort() {
  // Guard for Node.js test environment
  if (typeof document === 'undefined') return;

  // Stop all active tools
  stopAllTools();

  // Set aborting state
  abortingState = true;

  // Get element reference
  if (!activityBarElement) {
    activityBarElement = document.getElementById('tool-activity-bar');
  }
  if (!activityBarElement) return;

  // Add aborting class for visual feedback
  activityBarElement.classList.add('aborting');

  // Update display to show aborting
  const nameEl = activityBarElement.querySelector('.tool-name');
  if (nameEl) nameEl.textContent = 'Aborting...';

  const paramEl = activityBarElement.querySelector('.tool-param');
  if (paramEl) paramEl.textContent = '';

  // Cancel any existing hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // Schedule hide after longer delay to show feedback
  hideTimeout = setTimeout(() => {
    hideActivityBar();
    resetAbortingState();
    hideTimeout = null;
  }, ABORT_HIDE_DELAY_MS);
}

/**
 * Subscribe to IPC messages in Electron mode
 */
export function subscribeToMessages() {
  if (isElectronEnvironment() && window.electronAPI?.claude?.onMessage) {
    window.electronAPI.claude.onMessage((message) => {
      // Check if message contains tool_use in content
      if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
        for (const item of message.message.content) {
          if (item.type === 'tool_use') {
            handleToolUse({
              type: 'tool_use',
              tool_name: item.name,
              tool_id: item.id,
              input: item.input || {},
            });
          }
        }
      }
      // Check for tool_result in user message
      if (message.type === 'user' && Array.isArray(message.message?.content)) {
        for (const item of message.message.content) {
          if (item.type === 'tool_result') {
            handleToolResult({
              type: 'tool_result',
              tool_id: item.tool_use_id,
              output: item.content || '',
            });
          }
        }
      }
    });
  }
}

/**
 * Initialize the Tool Activity Bar component
 */
export function initToolActivityBar() {
  // Guard for Node.js test environment
  if (typeof document === 'undefined') return;

  // Get element reference
  activityBarElement = document.getElementById('tool-activity-bar');

  // Ensure hidden by default
  if (activityBarElement) {
    hideActivityBar();
  }

  // In Electron mode, subscribe to IPC messages
  if (isElectronEnvironment()) {
    subscribeToMessages();
  }
}

// Auto-initialize when DOM is ready (if not imported as module)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToolActivityBar);
  } else {
    // DOM already ready, but don't auto-init in test environment
    if (!globalThis.process?.env?.NODE_ENV?.includes('test')) {
      initToolActivityBar();
    }
  }
}
