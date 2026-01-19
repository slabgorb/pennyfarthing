/**
 * Ghost Text Suggestions Module
 *
 * Provides context-aware placeholder suggestions in the editor that can be
 * accepted with Tab or Space. Reads recent user messages from the DOM to
 * generate relevant follow-up prompts.
 */

import { DEFAULT_GHOST_TEXT } from './constants.js';

// =============================================================================
// State
// =============================================================================

/** Current ghost text being displayed */
let currentGhostText = '';

/** Whether ghost text is currently visible */
let ghostTextVisible = false;

/** Reference to the editor instance */
let editorRef = null;

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
 * Check if ghost text is currently visible
 * @returns {boolean}
 */
export function isGhostTextVisible() {
  return ghostTextVisible;
}

/**
 * Get the current ghost text
 * @returns {string}
 */
export function getCurrentGhostText() {
  return currentGhostText;
}

/**
 * Read recent user messages from the DOM
 * @returns {string[]} Array of recent user message texts (newest first)
 */
function getRecentUserMessages() {
  const messageElements = document.querySelectorAll('.message-user');
  const messages = [];

  // Get the last N messages (they're in DOM order, so slice from end)
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

  // Detect common patterns
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
 * Generate ghost text based on conversation context
 * @returns {string}
 */
function generateGhostText() {
  const recentMessages = getRecentUserMessages();

  // Analyze what the user has been asking about
  const context = analyzeMessageContext(recentMessages);

  if (context) {
    return context.action;
  }

  // Check if there's any conversation at all
  if (recentMessages.length > 0) {
    // There's conversation but no clear pattern - suggest continuation
    return 'Continue with...';
  }

  // No messages yet - use default
  return DEFAULT_GHOST_TEXT;
}

/**
 * Show ghost text in the editor
 */
export function showGhostText() {
  if (!editorRef || ghostTextVisible) {
    return;
  }

  // Only show when editor is empty
  const content = editorRef.getText();
  if (content.trim().length > 0) {
    return;
  }

  currentGhostText = generateGhostText();
  ghostTextVisible = true;

  // Insert ghost text with special class
  editorRef.commands.setContent(`<p class="ghost-text">${currentGhostText}</p>`);
}

/**
 * Accept the ghost text (convert to real text)
 * @returns {boolean} True if ghost text was accepted
 */
export function acceptGhostText() {
  if (!editorRef || !ghostTextVisible || !currentGhostText) {
    return false;
  }

  // Replace with actual text (no ghost class)
  editorRef.commands.setContent(`<p>${currentGhostText}</p>`);

  // Move cursor to end
  editorRef.commands.focus('end');

  ghostTextVisible = false;
  currentGhostText = '';

  return true;
}

/**
 * Clear the ghost text (user started typing something else)
 */
export function clearGhostText() {
  if (!editorRef || !ghostTextVisible) {
    return;
  }

  editorRef.commands.clearContent();
  ghostTextVisible = false;
  currentGhostText = '';
}

/**
 * Handle key events for ghost text
 * Call this from editor's handleKeyDown
 * @param {KeyboardEvent} event
 * @returns {boolean} True if event was handled
 */
export function handleGhostTextKey(event) {
  if (!ghostTextVisible) {
    return false;
  }

  // Tab or Space - accept ghost text
  if (event.key === 'Tab' || event.key === ' ') {
    event.preventDefault();
    acceptGhostText();
    return true;
  }

  // Escape - clear ghost text
  if (event.key === 'Escape') {
    event.preventDefault();
    clearGhostText();
    return true;
  }

  // Any other printable key - clear and let user type
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    clearGhostText();
    // Return false to let the key be processed normally
    return false;
  }

  return false;
}

/**
 * Reset suggestions state (for testing)
 */
export function resetSuggestions() {
  currentGhostText = '';
  ghostTextVisible = false;
}
