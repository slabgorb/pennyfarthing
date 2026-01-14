/**
 * Approval Modal Component (Story 22-3, 33-4)
 *
 * Displays a modal for approving/rejecting Bash commands.
 * Shows the command with syntax highlighting and safety indicators.
 * Supports three grant scopes: once, session, always (Story 33-4).
 *
 * Exports:
 * - showApprovalModal(command, toolId) - Show modal with command
 * - hideApprovalModal() - Hide modal
 * - isModalVisible() - Check if modal is visible
 * - isBashCommand(message) - Check if message is Bash tool_use
 * - shouldRequestApproval(message) - Check if approval needed
 * - handleApprove() - Handle approve button click (legacy)
 * - handleReject() - Handle reject button click
 * - handleAllowOnce() - Handle allow-once button click (33-4)
 * - handleAllowSession() - Handle allow-session button click (33-4)
 * - handleAlwaysAllow() - Handle always-allow button click
 * - highlightBashSyntax(command) - Syntax highlight command
 * - getCommandSafetyLevel(command) - Get safety classification
 * - getDisplayedCommand() - Get currently displayed command
 * - setResponseCallback(callback) - Set IPC response callback
 * - getKeyboardShortcuts() - Get keyboard shortcuts
 */

// Module state
let modalVisible = false;
let currentCommand = '';
let currentToolId = '';
let responseCallback = null;

// Settings store - dynamically loaded to support both Node.js (tests) and browser environments
let settingsStore = null;

// Try to load settings store
try {
  // This will work in Node.js test environment
  const ss = await import('../../../settings-store.js');
  settingsStore = ss;
} catch {
  // In browser environment, settingsStore will be set via setSettingsStore
  settingsStore = null;
}

/**
 * Show the approval modal with a command
 * @param {string} command - The Bash command to approve
 * @param {string} toolId - The tool_use_id
 */
export function showApprovalModal(command, toolId) {
  currentCommand = command;
  currentToolId = toolId;
  modalVisible = true;

  const modal = document.getElementById('approval-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // Update command display with syntax highlighting
    const commandDisplay = modal.querySelector('.command-display');
    if (commandDisplay) {
      commandDisplay.innerHTML = highlightBashSyntax(command);
    }

    // Update safety indicator
    const safetyIndicator = modal.querySelector('.safety-indicator');
    if (safetyIndicator) {
      const level = getCommandSafetyLevel(command);
      safetyIndicator.className = `safety-indicator safety-${level}`;
      safetyIndicator.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    }

    // Focus the modal for keyboard events
    modal.focus();
  }
}

/**
 * Hide the approval modal
 */
export function hideApprovalModal() {
  modalVisible = false;
  currentCommand = '';
  currentToolId = '';

  const modal = document.getElementById('approval-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Check if the modal is currently visible
 * @returns {boolean}
 */
export function isModalVisible() {
  return modalVisible;
}

/**
 * Check if a message is a Bash tool_use
 * @param {object} message - SDK message object
 * @returns {boolean}
 */
export function isBashCommand(message) {
  if (!message) return false;
  return message.type === 'tool_use' && message.tool_name === 'Bash';
}

/**
 * Set the settings store reference (for testing)
 * @param {object} store - Settings store with getBashApprovalGate and isAllowlisted
 */
export function setSettingsStore(store) {
  settingsStore = store;
}

/**
 * Check if a Bash command should request approval
 * Considers gate enabled status and allowlist
 * @param {object} message - SDK tool_use message
 * @returns {boolean}
 */
export function shouldRequestApproval(message) {
  if (!isBashCommand(message)) return false;

  // Check if settings store is available
  if (settingsStore) {
    // Gate must be enabled
    if (!settingsStore.getBashApprovalGate()) return false;

    // Check allowlist
    const command = message.input?.command || '';
    if (settingsStore.isAllowlisted(command)) return false;

    return true;
  }

  // No settings store available - gate is disabled by default
  return false;
}

/**
 * Get the currently displayed command
 * @returns {string}
 */
export function getDisplayedCommand() {
  return currentCommand;
}

/**
 * Highlight Bash syntax in a command string
 * @param {string} command - Command to highlight
 * @returns {string} HTML with syntax highlighting
 */
export function highlightBashSyntax(command) {
  if (!command) return '';

  // First, extract and preserve strings, paths, then apply highlighting
  const tokens = [];
  let tokenIndex = 0;

  // Replace double-quoted strings with placeholders
  let result = command.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    const placeholder = `__STRING_${tokenIndex}__`;
    tokens.push({ placeholder, type: 'string', value: match });
    tokenIndex++;
    return placeholder;
  });

  // Replace single-quoted strings with placeholders
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, (match) => {
    const placeholder = `__STRING_${tokenIndex}__`;
    tokens.push({ placeholder, type: 'string', value: match });
    tokenIndex++;
    return placeholder;
  });

  // Replace paths with placeholders (starts with / or ./ or ~/)
  result = result.replace(/((?:\/|\.\/|~\/)[^\s'"]+)/g, (match) => {
    const placeholder = `__PATH_${tokenIndex}__`;
    tokens.push({ placeholder, type: 'path', value: match });
    tokenIndex++;
    return placeholder;
  });

  // Now escape HTML for the remaining text
  result = escapeHtml(result);

  // Highlight keywords (if, then, else, fi, for, while, do, done, case, esac)
  const keywords = ['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'in', 'function'];
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'g');
    result = result.replace(regex, '<span class="syntax-keyword">$1</span>');
  });

  // Highlight operators (|, &&, ||, >, >>, <, ;)
  result = result.replace(/(\|{1,2}|&amp;&amp;|&gt;{1,2}|&lt;|;)/g, '<span class="syntax-operator">$1</span>');

  // Restore tokens with highlighting
  tokens.forEach(token => {
    const escapedValue = escapeHtml(token.value);
    const spanClass = token.type === 'string' ? 'syntax-string' : 'syntax-path';
    result = result.replace(token.placeholder, `<span class="${spanClass}">${escapedValue}</span>`);
  });

  return result;
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get the safety level of a command
 * @param {string} command - Command to analyze
 * @returns {'safe' | 'caution' | 'danger'}
 */
export function getCommandSafetyLevel(command) {
  if (!command) return 'safe';

  const cmd = command.toLowerCase();

  // Danger patterns - destructive or potentially malicious
  const dangerPatterns = [
    /rm\s+-rf\s+[\/~]/,      // rm -rf with root or home
    /rm\s+-rf\s+\*/,         // rm -rf *
    /sudo\s+rm/,             // sudo rm
    />\s*\/dev\/sd/,         // Write to disk device
    /mkfs/,                  // Format filesystem
    /dd\s+if=/,              // dd command
    /curl.*\|\s*bash/,       // curl pipe to bash
    /wget.*\|\s*bash/,       // wget pipe to bash
    /:\s*\(\)\s*\{.*\}/,     // Fork bomb pattern
  ];

  for (const pattern of dangerPatterns) {
    if (pattern.test(cmd)) return 'danger';
  }

  // Caution patterns - file modifications
  const cautionPatterns = [
    /^rm\s/,                 // rm (any)
    /^mv\s/,                 // mv (any)
    /^cp\s/,                 // cp (any)
    /^chmod\s/,              // chmod
    /^chown\s/,              // chown
    /^npm\s+(install|i)\b/,  // npm install
    /^yarn\s+add\b/,         // yarn add
    /^pnpm\s+(install|add)/,  // pnpm install/add
    /^pip\s+install/,        // pip install
    /^brew\s+install/,       // brew install
    />\s/,                   // Any redirect
    /^git\s+(push|reset|rebase|checkout)/,  // Git write operations
  ];

  for (const pattern of cautionPatterns) {
    if (pattern.test(cmd)) return 'caution';
  }

  // Safe - read-only operations
  return 'safe';
}

/**
 * Handle approve button click (legacy - approves without grant)
 */
export function handleApprove() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
    });
  }
  hideApprovalModal();
}

/**
 * Handle reject button click
 */
export function handleReject() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: false,
    });
  }
  hideApprovalModal();
}

/**
 * Handle allow-once button click
 * Grants permission for a single use, auto-revoked after use
 */
export function handleAllowOnce() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      grantScope: 'once',
    });
  }
  hideApprovalModal();
}

/**
 * Handle allow-session button click
 * Grants permission for the current session, cleared on exit
 */
export function handleAllowSession() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      grantScope: 'session',
    });
  }
  hideApprovalModal();
}

/**
 * Handle always-allow button click
 * Grants persistent permission, survives restart
 */
export function handleAlwaysAllow() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      grantScope: 'always',
    });
  }
  hideApprovalModal();
}

/**
 * Set the callback for IPC responses
 * @param {function} callback - Callback function(response)
 */
export function setResponseCallback(callback) {
  responseCallback = callback;
}

/**
 * Get keyboard shortcuts for the modal
 * @returns {object} Shortcuts map
 */
export function getKeyboardShortcuts() {
  return {
    allowOnce: 'Enter',   // Enter for quick single-use approval
    allowSession: 's',    // 's' for session
    alwaysAllow: 'a',     // 'a' for always
    reject: 'Escape',
  };
}

/**
 * Handle keyboard events on the modal
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
  if (!modalVisible) return;

  const shortcuts = getKeyboardShortcuts();

  if (event.key === shortcuts.allowOnce) {
    event.preventDefault();
    handleAllowOnce();
  } else if (event.key === shortcuts.reject) {
    event.preventDefault();
    handleReject();
  } else if (event.key.toLowerCase() === shortcuts.allowSession) {
    event.preventDefault();
    handleAllowSession();
  } else if (event.key.toLowerCase() === shortcuts.alwaysAllow) {
    event.preventDefault();
    handleAlwaysAllow();
  }
}

/**
 * Initialize the approval modal
 * Sets up event listeners for buttons and keyboard
 */
export function initApprovalModal() {
  const modal = document.getElementById('approval-modal');
  if (!modal) return;

  // Wire up buttons
  const approveBtn = modal.querySelector('.approve-btn, [data-action="approve"]');
  const rejectBtn = modal.querySelector('.reject-btn, [data-action="reject"]');
  const alwaysAllowBtn = modal.querySelector('.always-allow-btn, [data-action="always-allow"]');

  if (approveBtn) approveBtn.addEventListener('click', handleApprove);
  if (rejectBtn) rejectBtn.addEventListener('click', handleReject);
  if (alwaysAllowBtn) alwaysAllowBtn.addEventListener('click', handleAlwaysAllow);

  // Keyboard events
  modal.addEventListener('keydown', handleKeydown);

  // Subscribe to IPC approval requests if in Electron
  if (typeof window !== 'undefined' && window.electronAPI?.bash?.onApprovalRequest) {
    window.electronAPI.bash.onApprovalRequest((event, data) => {
      showApprovalModal(data.command, data.toolId);
    });

    // Set up response callback to send via IPC
    setResponseCallback((response) => {
      if (window.electronAPI?.bash?.sendApprovalResponse) {
        window.electronAPI.bash.sendApprovalResponse(response);
      }
    });
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApprovalModal);
  } else {
    initApprovalModal();
  }
}
