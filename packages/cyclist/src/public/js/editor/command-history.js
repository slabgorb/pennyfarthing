/**
 * Command History Module (B-9.4)
 * Provides up/down arrow navigation through command history
 */

import { HISTORY_KEY, MAX_HISTORY } from './constants.js';
import { settingsSync } from '../settings-sync.js';

// State
let commandHistory = [];
let historyIndex = -1;
let savedCurrentInput = '';

// Editor callbacks (set via init)
let getContentFn = null;
let setContentFn = null;
let moveCursorFn = null;

/**
 * Initialize command history with editor callbacks
 * @param {Object} callbacks - Editor callback functions
 * @param {Function} callbacks.getContent - Get current editor content
 * @param {Function} callbacks.setContent - Set editor content
 * @param {Function} callbacks.moveCursorToEnd - Move cursor to end
 */
export function initCommandHistory({ getContent, setContent, moveCursorToEnd }) {
  getContentFn = getContent;
  setContentFn = setContent;
  moveCursorFn = moveCursorToEnd;
  loadHistory();
}

/**
 * Load command history from settings-sync
 */
export function loadHistory() {
  const stored = settingsSync.get(HISTORY_KEY);
  if (stored && Array.isArray(stored)) {
    commandHistory = stored;
  }
}

/**
 * Save command history to settings-sync (cross-tab broadcast)
 */
function saveHistory() {
  settingsSync.set(HISTORY_KEY, commandHistory);
}

/**
 * Add a command to history
 * @param {string} command - The command to add
 */
export function addToHistory(command) {
  if (!command.trim()) return;

  // Don't add duplicate of last command
  if (commandHistory.length > 0 && commandHistory[commandHistory.length - 1] === command) {
    return;
  }

  commandHistory.push(command);

  // Trim to max size
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory.shift();
  }

  saveHistory();
}

/**
 * Navigate to previous command in history (Up arrow)
 * @returns {boolean} True if navigation occurred
 */
export function navigateHistoryUp() {
  if (commandHistory.length === 0) return false;
  if (!getContentFn || !setContentFn) return false;

  // First time pressing up: save current input and start at end
  if (historyIndex === -1) {
    savedCurrentInput = getContentFn();
    historyIndex = commandHistory.length - 1;
  } else if (historyIndex > 0) {
    historyIndex--;
  } else {
    // Already at oldest command
    return false;
  }

  setContentFn(commandHistory[historyIndex]);
  if (moveCursorFn) moveCursorFn();
  return true;
}

/**
 * Navigate to next command in history (Down arrow)
 * @returns {boolean} True if navigation occurred
 */
export function navigateHistoryDown() {
  if (historyIndex === -1) return false;
  if (!setContentFn) return false;

  historyIndex++;

  if (historyIndex >= commandHistory.length) {
    // Back to current input
    historyIndex = -1;
    setContentFn(savedCurrentInput);
    savedCurrentInput = '';
  } else {
    setContentFn(commandHistory[historyIndex]);
  }

  if (moveCursorFn) moveCursorFn();
  return true;
}

/**
 * Reset history navigation state (call after submit)
 */
export function resetHistoryNavigation() {
  historyIndex = -1;
  savedCurrentInput = '';
}
