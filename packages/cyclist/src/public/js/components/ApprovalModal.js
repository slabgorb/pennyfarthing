/**
 * Approval Modal Component (Story 22-3, 33-4, 33-3)
 *
 * Displays a modal for approving/rejecting tool permissions.
 * Shows the tool name, context, and safety indicators.
 * Supports three grant scopes: once, session, always (Story 33-4).
 * Supports any tool type, not just Bash (Story 33-3).
 *
 * Exports:
 * - showApprovalModal(command, toolId) - Show modal with command (legacy Bash)
 * - showPermissionModal(toolName, toolId, context, reason?) - Show modal for any tool (33-3)
 * - hideApprovalModal() - Hide modal
 * - isModalVisible() - Check if modal is visible
 * - isBashCommand(message) - Check if message is Bash tool_use
 * - isToolUseMessage(message) - Check if message is any tool_use (33-3)
 * - shouldRequestApproval(message) - Check if approval needed
 * - handleApprove() - Handle approve button click (legacy)
 * - handleReject() - Handle reject button click
 * - handleAllowOnce() - Handle allow-once button click (33-4)
 * - handleAllowSession() - Handle allow-session button click (33-4)
 * - handleAlwaysAllow() - Handle always-allow button click
 * - highlightBashSyntax(command) - Syntax highlight command
 * - getCommandSafetyLevel(command) - Get safety classification for Bash
 * - getToolSafetyLevel(toolName, context) - Get safety classification for any tool (33-3)
 * - getDisplayedCommand() - Get currently displayed command
 * - getDisplayedToolName() - Get currently displayed tool name (33-3)
 * - getDisplayedReason() - Get currently displayed reason (33-3)
 * - getDisplayedContext() - Get currently displayed context (33-3)
 * - setResponseCallback(callback) - Set IPC response callback
 * - getKeyboardShortcuts() - Get keyboard shortcuts
 * - getPendingCount() - Get pending permission request count (33-3)
 * - updateStatusIndicator() - Update UI status indicator (33-3)
 */

// Module state
let modalVisible = false;
let currentCommand = '';
let currentToolId = '';
let currentToolName = '';
let currentReason = '';
let currentContext = {};
let pendingCount = 0;
let responseCallback = null;

// MSSCI-11947: State for AskUserQuestion form
let currentQuestions = [];
let selectedAnswers = {}; // { questionIndex: value or [values] }
let otherInputValues = {}; // { questionIndex: customText }
let otherInputVisible = {}; // { questionIndex: boolean }

// MSSCI-11947: State for ExitPlanMode form
let planFeedback = '';
let renderedFormHtml = '';

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
  currentToolName = '';
  currentReason = '';
  currentContext = {};
  // MSSCI-11947: Reset AskUserQuestion state
  currentQuestions = [];
  selectedAnswers = {};
  otherInputValues = {};
  otherInputVisible = {};
  // MSSCI-11947: Reset ExitPlanMode state
  planFeedback = '';
  renderedFormHtml = '';

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
 * Check if a message is any tool_use (Story 33-3)
 * @param {object} message - SDK message object
 * @returns {boolean}
 */
export function isToolUseMessage(message) {
  if (!message) return false;
  return message.type === 'tool_use' && typeof message.tool_name === 'string';
}

/**
 * Show the permission modal for any tool type (Story 33-3)
 * MSSCI-11947: Extended to handle AskUserQuestion and ExitPlanMode with custom forms
 * @param {string} toolName - The tool name (Bash, WebFetch, Edit, Write, etc.)
 * @param {string} toolId - The tool_use_id
 * @param {object} context - Tool-specific context (command, url, file_path, etc.)
 * @param {string} [reason] - Optional reason for the permission request
 */
export function showPermissionModal(toolName, toolId, context, reason = '') {
  currentToolName = toolName;
  currentToolId = toolId;
  currentContext = context || {};
  currentReason = reason || '';
  modalVisible = true;

  // MSSCI-11947: Handle AskUserQuestion with custom form
  if (toolName === 'AskUserQuestion' && context?.questions) {
    currentQuestions = context.questions;
    selectedAnswers = {};
    otherInputValues = {};
    otherInputVisible = {};
    renderedFormHtml = renderAskUserQuestionForm(context.questions);
  }
  // MSSCI-11947: Handle ExitPlanMode with custom form
  else if (toolName === 'ExitPlanMode') {
    planFeedback = '';
    renderedFormHtml = renderExitPlanModeForm(context?.allowedPrompts || []);
  }

  // For backward compatibility, also set currentCommand for Bash
  if (toolName === 'Bash' && context?.command) {
    currentCommand = context.command;
  } else {
    currentCommand = formatContextForDisplay(toolName, context);
  }

  const modal = document.getElementById('approval-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // Update tool name display
    const toolNameEl = modal.querySelector('.tool-name');
    if (toolNameEl) {
      toolNameEl.textContent = toolName;
    }

    // Update reason display
    const reasonEl = modal.querySelector('.reason-display');
    if (reasonEl) {
      reasonEl.textContent = reason || '';
    }

    // Update context display
    const contextEl = modal.querySelector('.context-display');
    if (contextEl) {
      if (toolName === 'Bash' && context?.command) {
        contextEl.innerHTML = highlightBashSyntax(context.command);
      } else if (toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode') {
        // MSSCI-11947: Use custom rendered form HTML
        contextEl.innerHTML = renderedFormHtml;
      } else {
        contextEl.textContent = formatContextForDisplay(toolName, context);
      }
    }

    // Also update command-display for backward compatibility
    const commandDisplay = modal.querySelector('.command-display');
    if (commandDisplay) {
      if (toolName === 'Bash' && context?.command) {
        commandDisplay.innerHTML = highlightBashSyntax(context.command);
      } else if (toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode') {
        // MSSCI-11947: Use custom rendered form HTML
        commandDisplay.innerHTML = renderedFormHtml;
      } else {
        commandDisplay.textContent = formatContextForDisplay(toolName, context);
      }
    }

    // Update safety indicator
    const safetyIndicator = modal.querySelector('.safety-indicator');
    if (safetyIndicator) {
      const level = getToolSafetyLevel(toolName, context);
      safetyIndicator.className = `safety-indicator safety-${level}`;
      safetyIndicator.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    }

    // Focus the modal for keyboard events
    modal.focus();
  }
}

/**
 * Format context for display based on tool type
 * @param {string} toolName - Tool name
 * @param {object} context - Tool context
 * @returns {string}
 */
function formatContextForDisplay(toolName, context) {
  if (!context) return '';

  switch (toolName) {
    case 'Bash':
      return context.command || '';
    case 'WebFetch':
      return context.url || '';
    case 'Edit':
    case 'Write':
    case 'Read':
      return context.file_path || '';
    default:
      // For unknown tools, show JSON
      return JSON.stringify(context, null, 2);
  }
}

/**
 * Get the currently displayed tool name (Story 33-3)
 * @returns {string}
 */
export function getDisplayedToolName() {
  return currentToolName;
}

/**
 * Get the currently displayed reason (Story 33-3)
 * @returns {string}
 */
export function getDisplayedReason() {
  return currentReason;
}

/**
 * Get the currently displayed context (Story 33-3)
 * @returns {string}
 */
export function getDisplayedContext() {
  return formatContextForDisplay(currentToolName, currentContext);
}

/**
 * Get safety level for any tool type (Story 33-3)
 * @param {string} toolName - Tool name
 * @param {object} context - Tool context
 * @returns {'safe' | 'caution' | 'danger'}
 */
export function getToolSafetyLevel(toolName, context) {
  if (!toolName) return 'safe';

  switch (toolName) {
    case 'Bash':
      return getCommandSafetyLevel(context?.command || '');

    case 'WebFetch': {
      // Safe for known domains
      const url = context?.url || '';
      const safeDomains = [
        'github.com',
        'npmjs.com',
        'docs.python.org',
        'developer.mozilla.org',
        'stackoverflow.com',
        'api.github.com',
      ];
      try {
        const hostname = new URL(url).hostname;
        if (safeDomains.some(d => hostname.includes(d))) {
          return 'safe';
        }
      } catch {
        // Invalid URL
      }
      return 'caution';
    }

    case 'Edit':
    case 'Write':
      // File modifications are always caution
      return 'caution';

    case 'Read':
    case 'Glob':
    case 'Grep':
      // Read-only operations are safe
      return 'safe';

    default:
      // Unknown tools default to caution
      return 'caution';
  }
}

/**
 * Get pending permission request count (Story 33-3)
 * @returns {number}
 */
export function getPendingCount() {
  return pendingCount;
}

/**
 * Update the status indicator in the UI (Story 33-3)
 * @param {number} [count] - Optional count to set, otherwise uses internal state
 */
export function updateStatusIndicator(count) {
  if (typeof count === 'number') {
    pendingCount = count;
  }

  const statusEl = document.querySelector('.permission-status, #permission-status');
  if (statusEl) {
    const badge = statusEl.querySelector('.permission-badge, .permission-count');
    if (badge) {
      badge.textContent = pendingCount.toString();
    }

    if (pendingCount > 0) {
      statusEl.classList.remove('hidden');
      statusEl.classList.add('pulse');
    } else {
      statusEl.classList.add('hidden');
      statusEl.classList.remove('pulse');
    }
  }
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

// =============================================================================
// MSSCI-11947: AskUserQuestion Form Functions (AC2)
// =============================================================================

/**
 * Render the AskUserQuestion form with radio/checkbox options
 * MSSCI-11947: AC2 - Render question options
 * @param {Array} questions - Array of question objects
 * @returns {string} HTML string for the form
 */
export function renderAskUserQuestionForm(questions) {
  if (!questions || questions.length === 0) {
    return '<p>No questions to display</p>';
  }

  let html = '<div class="ask-user-question-form">';

  questions.forEach((q, qIndex) => {
    const inputType = q.multiSelect ? 'checkbox' : 'radio';
    const inputName = `question-${qIndex}`;

    html += `<div class="question-group" data-question-index="${qIndex}">`;
    html += `<div class="question-header">${escapeHtml(q.header || '')}</div>`;
    html += `<div class="question-text">${escapeHtml(q.question)}</div>`;
    html += '<div class="question-options">';

    // Render each option
    q.options.forEach((opt, optIndex) => {
      const optionId = `q${qIndex}-opt${optIndex}`;
      html += `<label class="option-label" for="${optionId}">`;
      html += `<input type="${inputType}" id="${optionId}" name="${inputName}" value="${escapeHtml(opt.label)}" data-question="${qIndex}" data-option="${optIndex}" />`;
      html += `<span class="option-text">${escapeHtml(opt.label)}</span>`;
      if (opt.description) {
        html += `<span class="option-description">${escapeHtml(opt.description)}</span>`;
      }
      html += '</label>';
    });

    // Add "Other" option
    const otherId = `q${qIndex}-other`;
    html += `<label class="option-label other-option" for="${otherId}">`;
    html += `<input type="${inputType}" id="${otherId}" name="${inputName}" value="__OTHER__" data-question="${qIndex}" data-other="true" />`;
    html += '<span class="option-text">Other</span>';
    html += '</label>';

    // Other text input (hidden by default)
    html += `<div class="other-input-container" id="other-input-${qIndex}" style="display: none;">`;
    html += `<input type="text" class="other-input" data-question="${qIndex}" placeholder="Enter your answer..." />`;
    html += '</div>';

    html += '</div>'; // .question-options
    html += '</div>'; // .question-group
  });

  html += '</div>'; // .ask-user-question-form
  return html;
}

/**
 * Get the collected answers from the AskUserQuestion form
 * MSSCI-11947: AC2 - Collect user selections
 * @returns {object} Answers object keyed by question index
 */
export function getAskUserQuestionAnswers() {
  const answers = {};

  currentQuestions.forEach((q, qIndex) => {
    const key = String(qIndex);

    // Check if "Other" was selected
    if (otherInputVisible[qIndex] && otherInputValues[qIndex]) {
      answers[key] = otherInputValues[qIndex];
    } else if (selectedAnswers[qIndex] !== undefined) {
      answers[key] = selectedAnswers[qIndex];
    }
  });

  return answers;
}

/**
 * Get the currently rendered form HTML
 * MSSCI-11947: AC2 - For testing form output
 * @returns {string}
 */
export function getRenderedFormHtml() {
  return renderedFormHtml;
}

/**
 * Select an option for a question
 * MSSCI-11947: AC2 - Programmatic option selection
 * @param {number} questionIndex - The question index
 * @param {string} value - The option value to select
 */
export function selectOption(questionIndex, value) {
  const question = currentQuestions[questionIndex];
  if (!question) return;

  if (question.multiSelect) {
    // For multi-select, toggle the value in the array
    if (!selectedAnswers[questionIndex]) {
      selectedAnswers[questionIndex] = [];
    }
    const arr = selectedAnswers[questionIndex];
    const idx = arr.indexOf(value);
    if (idx === -1) {
      arr.push(value);
    }
  } else {
    // For single-select, just set the value
    selectedAnswers[questionIndex] = value;
  }

  // Hide "Other" input if a regular option is selected
  otherInputVisible[questionIndex] = false;
}

/**
 * Select the "Other" option for a question
 * MSSCI-11947: AC2 - Handle "Other" selection
 * @param {number} questionIndex - The question index
 */
export function selectOtherOption(questionIndex) {
  otherInputVisible[questionIndex] = true;
  // Clear any regular selection for single-select
  const question = currentQuestions[questionIndex];
  if (question && !question.multiSelect) {
    delete selectedAnswers[questionIndex];
  }
}

/**
 * Check if the "Other" input is visible for a question
 * MSSCI-11947: AC2 - Check "Other" visibility state
 * @param {number} questionIndex - The question index
 * @returns {boolean}
 */
export function isOtherInputVisible(questionIndex) {
  return !!otherInputVisible[questionIndex];
}

/**
 * Set the "Other" custom input value
 * MSSCI-11947: AC2 - Set custom text
 * @param {number} questionIndex - The question index
 * @param {string} value - The custom text value
 */
export function setOtherInput(questionIndex, value) {
  otherInputValues[questionIndex] = value;
}

/**
 * Handle submission of AskUserQuestion form
 * MSSCI-11947: AC2 - Submit with data
 */
export function handleSubmitAskUserQuestion() {
  const answers = getAskUserQuestionAnswers();

  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      grantScope: 'once', // AskUserQuestion responses are always one-time
      data: { answers },
    });
  }
  hideApprovalModal();
}

// =============================================================================
// MSSCI-11947: ExitPlanMode Form Functions (AC3)
// =============================================================================

/**
 * Render the ExitPlanMode form with approval/rejection buttons
 * MSSCI-11947: AC3 - Render plan approval form
 * @param {Array} allowedPrompts - Array of {tool, prompt} objects
 * @returns {string} HTML string for the form
 */
export function renderExitPlanModeForm(allowedPrompts) {
  let html = '<div class="exit-plan-mode-form">';

  // Show plan file path if available
  if (currentContext?.planFilePath) {
    html += `<div class="plan-file-path">Plan file: ${escapeHtml(currentContext.planFilePath)}</div>`;
  }

  // Show requested permissions if any
  if (allowedPrompts && allowedPrompts.length > 0) {
    html += '<div class="requested-permissions">';
    html += '<h4>Requested Permissions:</h4>';
    html += '<ul>';
    allowedPrompts.forEach(p => {
      html += `<li><strong>${escapeHtml(p.tool)}:</strong> ${escapeHtml(p.prompt)}</li>`;
    });
    html += '</ul>';
    html += '</div>';
  }

  // Feedback textarea
  html += '<div class="feedback-section">';
  html += '<label for="plan-feedback">Feedback (optional):</label>';
  html += '<textarea id="plan-feedback" class="plan-feedback" placeholder="Add feedback for the agent..."></textarea>';
  html += '</div>';

  // Approve/Reject buttons
  html += '<div class="plan-buttons">';
  html += '<button type="button" class="approve-plan-btn" data-action="approve-plan">Approve Plan</button>';
  html += '<button type="button" class="reject-plan-btn" data-action="reject-plan">Reject Plan</button>';
  html += '</div>';

  html += '</div>'; // .exit-plan-mode-form
  return html;
}

/**
 * Get the ExitPlanMode response
 * MSSCI-11947: AC3 - Get plan response with feedback
 * @returns {object} Response object with approved and feedback
 */
export function getExitPlanModeResponse() {
  return {
    approved: false, // Will be set by approve/reject handlers
    feedback: planFeedback || '',
  };
}

/**
 * Check if the Approve Plan button exists
 * MSSCI-11947: AC3 - For testing
 * @returns {boolean}
 */
export function hasApprovePlanButton() {
  return renderedFormHtml.includes('approve-plan-btn') || renderedFormHtml.includes('Approve Plan');
}

/**
 * Check if the Reject Plan button exists
 * MSSCI-11947: AC3 - For testing
 * @returns {boolean}
 */
export function hasRejectPlanButton() {
  return renderedFormHtml.includes('reject-plan-btn') || renderedFormHtml.includes('Reject Plan');
}

/**
 * Set the plan feedback text
 * MSSCI-11947: AC3 - Set feedback value
 * @param {string} text - The feedback text
 */
export function setPlanFeedback(text) {
  planFeedback = text;
}

/**
 * Handle plan approval
 * MSSCI-11947: AC3 - Approve with feedback
 */
export function handleApprovePlan() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      data: {
        approved: true,
        feedback: planFeedback || '',
      },
    });
  }
  hideApprovalModal();
}

/**
 * Handle plan rejection
 * MSSCI-11947: AC3 - Reject with feedback
 */
export function handleRejectPlan() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: false,
      data: {
        approved: false,
        feedback: planFeedback || '',
      },
    });
  }
  hideApprovalModal();
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
