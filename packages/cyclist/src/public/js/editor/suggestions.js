/**
 * Suggestion Pill Module
 *
 * Shows a clickable suggestion pill above the editor when empty.
 * Click to accept the suggestion into the editor.
 */


// =============================================================================
// State
// =============================================================================

/** Current suggestion text */
let currentSuggestion = '';

/** Whether suggestion pill is visible */
let suggestionVisible = false;

/** Reference to the editor instance */
let editorRef = null;

/** The popup element */
let popupElement = null;

/** How many recent messages to consider */
const RECENT_MESSAGE_COUNT = 5;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Initialize the suggestions module with editor reference
 * @param {object} editor - TipTap editor instance
 */
export function initSuggestions(editor) {
  editorRef = editor;
}

/**
 * Check if suggestion pill is currently visible
 * @returns {boolean}
 */
export function isGhostTextVisible() {
  return suggestionVisible;
}

/**
 * Get the current suggestion text
 * @returns {string}
 */
export function getCurrentGhostText() {
  return currentSuggestion;
}

/**
 * Read recent user messages from the DOM
 * @returns {string[]} Array of recent user message texts (newest first)
 */
function getRecentUserMessages() {
  const messageElements = document.querySelectorAll('.message-user');
  const messages = [];

  const startIndex = Math.max(0, messageElements.length - RECENT_MESSAGE_COUNT);
  for (let i = messageElements.length - 1; i >= startIndex; i--) {
    const text = messageElements[i].textContent?.trim();
    if (text) {
      messages.push(text);
    }
  }

  return messages;
}

/**
 * Analyze messages to detect context/topics
 * @param {string[]} messages - Recent user messages
 * @returns {{topic: string, action: string} | null}
 */
function analyzeMessageContext(messages) {
  if (messages.length === 0) {
    return null;
  }

  const combined = messages.join(' ').toLowerCase();

  const patterns = [
    { match: /test|spec|jest|vitest|mocha/, topic: 'testing', action: 'Continue with tests...' },
    { match: /bug|fix|error|issue|broken/, topic: 'debugging', action: 'What else needs fixing?' },
    { match: /refactor|clean|improve|optimize/, topic: 'refactoring', action: 'What else should we refactor?' },
    { match: /explain|understand|how does|what is/, topic: 'learning', action: 'What else would you like explained?' },
    { match: /add|create|implement|build|new/, topic: 'building', action: 'What should we add next?' },
    { match: /review|check|verify|validate/, topic: 'review', action: 'Anything else to review?' },
    { match: /deploy|release|publish|ship/, topic: 'deployment', action: 'What else for deployment?' },
    { match: /document|readme|docs|comment/, topic: 'docs', action: 'What else needs documentation?' },
  ];

  for (const { match, topic, action } of patterns) {
    if (match.test(combined)) {
      return { topic, action };
    }
  }

  return null;
}

/**
 * Generate suggestion based on conversation context
 * @returns {string|null} Suggestion text, or null if no meaningful suggestion
 */
function generateSuggestion() {
  const recentMessages = getRecentUserMessages();
  const context = analyzeMessageContext(recentMessages);

  if (context) {
    return context.action;
  }

  // No meaningful suggestion - don't show generic placeholder
  return null;
}

/**
 * Get or create the suggestion popup element
 * @returns {HTMLElement|null}
 */
function getPopupElement() {
  if (popupElement) return popupElement;
  if (typeof document === 'undefined') return null;

  popupElement = document.createElement('div');
  popupElement.id = 'suggestion-popup';
  popupElement.className = 'completion-popup suggestion-popup';
  popupElement.style.display = 'none';

  const editorWrapper = document.getElementById('editor-wrapper');
  if (editorWrapper) {
    editorWrapper.appendChild(popupElement);
  }

  return popupElement;
}

/**
 * Show suggestion pill above the editor
 */
export function showGhostText() {
  if (!editorRef || suggestionVisible) {
    return;
  }

  // Only show when editor is empty
  const content = editorRef.getText();
  if (content.trim().length > 0) {
    return;
  }

  currentSuggestion = generateSuggestion();

  // Don't show if no meaningful suggestion
  if (!currentSuggestion) {
    return;
  }

  suggestionVisible = true;

  const popup = getPopupElement();
  if (!popup) return;

  popup.innerHTML = `<div class="completion-item selected">
    <span class="completion-name">${currentSuggestion}</span>
  </div>`;
  popup.style.display = 'block';

  // Add click handler
  popup.querySelector('.completion-item').addEventListener('click', () => {
    acceptGhostText();
  });
}

/**
 * Accept the suggestion (insert into editor)
 * @returns {boolean} True if suggestion was accepted
 */
export function acceptGhostText() {
  if (!editorRef || !suggestionVisible || !currentSuggestion) {
    return false;
  }

  editorRef.commands.setContent(`<p>${currentSuggestion}</p>`);
  editorRef.commands.focus('end');

  clearGhostText();
  return true;
}

/**
 * Clear/hide the suggestion pill
 */
export function clearGhostText() {
  suggestionVisible = false;
  currentSuggestion = '';

  const popup = getPopupElement();
  if (popup) {
    popup.style.display = 'none';
  }
}

/**
 * Handle key events for suggestion pill
 * @param {KeyboardEvent} event
 * @returns {boolean} True if event was handled
 */
export function handleGhostTextKey(event) {
  if (!suggestionVisible) {
    return false;
  }

  // Escape - hide suggestion
  if (event.key === 'Escape') {
    event.preventDefault();
    clearGhostText();
    return true;
  }

  // Any printable key - hide suggestion and let user type
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    clearGhostText();
    return false;
  }

  return false;
}

/**
 * Reset suggestions state (for testing)
 */
export function resetSuggestions() {
  currentSuggestion = '';
  suggestionVisible = false;
}
