/**
 * MessageView - Renders SDK messages from ClaudeService
 *
 * This is the main coordinator that ties together the message rendering modules.
 * The actual rendering logic has been extracted to:
 * - message-view/syntax-highlighter.js - Code highlighting
 * - message-view/markdown-parser.js - Markdown to HTML
 * - message-view/quick-actions.js - Action button detection and rendering
 * - message-view/message-renderers.js - SDK message to HTML
 */

import { addMessage as storeAddMessage, clearMessages as storeClearMessages } from '../message-store.js';

// Import from submodules
import {
  renderTextMessage,
  renderToolUseMessage,
  renderToolResultMessage,
  renderSystemMessage,
  renderResultMessage,
  renderErrorMessage,
  renderUserMessage,
  setVerboseMode as setRendererVerboseMode,
  getVerboseMode as getRendererVerboseMode,
} from './message-view/message-renderers.js';

// Re-export everything for backward compatibility
export * from './message-view/index.js';

// =============================================================================
// Constants
// =============================================================================

/** Container ID where MessageView mounts */
export const MESSAGE_VIEW_CONTAINER_ID = 'message-view';

/** Threshold in pixels for detecting user scroll-up */
export const SCROLL_THRESHOLD = 50;

/** Theme CSS classes for dark and light modes */
export const THEME_CLASSES = {
  dark: 'message-view-dark',
  light: 'message-view-light',
};

// =============================================================================
// State
// =============================================================================

/** Auto-scroll enabled state */
let autoScrollEnabled = true;

/** Track whether we've shown an init message this session */
let hasShownInitMessage = false;

/** Container element reference */
let containerElement = null;

/** Scroll handler reference for cleanup */
let scrollHandler = null;

// =============================================================================
// Verbose Mode (22-5)
// =============================================================================

/**
 * Set verbose mode state
 * When enabled, tool blocks are rendered expanded by default
 * @param {boolean} enabled - Whether verbose mode is enabled
 */
export function setVerboseMode(enabled) {
  setRendererVerboseMode(enabled);
}

/**
 * Get current verbose mode state
 * @returns {boolean}
 */
export function getVerboseMode() {
  return getRendererVerboseMode();
}

// =============================================================================
// Message Filtering
// =============================================================================

/**
 * Check if an assistant message has meaningful text content
 * @param {object} message
 * @returns {boolean}
 */
function hasTextContent(message) {
  const content = message.message?.content || message.content || [];
  // Check for text blocks with actual content (not just brackets or whitespace)
  return content.some((block) => {
    if (block.type !== 'text') return false;
    const text = block.text?.trim();
    // Filter out empty, very short (< 3 chars), or bracket-only content
    if (!text || text.length < 3) return false;
    if (/^[\[\]{}()\s]*$/.test(text)) return false;
    return true;
  });
}

/**
 * Determine if a message should be filtered (not displayed)
 * @param {Object} message - SDK message
 * @returns {boolean} true if message should be hidden
 */
function shouldFilterMessage(message) {
  // Filter out hook responses - these are internal to Claude CLI
  if (message.type === 'system' && message.subtype === 'hook_response') {
    return true;
  }

  // Filter out duplicate init messages - only show the first one per session
  if (message.type === 'system' && message.subtype === 'init') {
    if (hasShownInitMessage) {
      return true;
    }
    hasShownInitMessage = true;
  }

  // Filter out empty assistant messages
  if ((message.type === 'assistant' || message.type === 'message') && !hasTextContent(message)) {
    return true;
  }

  // Filter out content_block events (streaming internals)
  if (message.type === 'content_block_start' ||
      message.type === 'content_block_delta' ||
      message.type === 'content_block_stop') {
    return true;
  }

  // Filter out message_start/stop events
  if (message.type === 'message_start' || message.type === 'message_stop') {
    return true;
  }

  return false;
}

// =============================================================================
// Message Rendering
// =============================================================================

/**
 * Render any SDK message based on type
 * @param {Object} message - SDK message
 * @returns {string} HTML string or empty string for filtered messages
 */
export function renderMessage(message) {
  // Filter out messages we don't want to display
  if (shouldFilterMessage(message)) {
    return '';
  }

  switch (message.type) {
    case 'system':
      return renderSystemMessage(message);
    case 'assistant':
    case 'message':
      return renderTextMessage(message);
    case 'user':
      return renderUserMessage(message);
    case 'tool_use':
      return renderToolUseMessage(message);
    case 'tool_result':
      return renderToolResultMessage(message);
    case 'result':
      return renderResultMessage(message);
    case 'error':
      return renderErrorMessage(message);
    default:
      // Log unknown message types for debugging but don't display
      console.log('[MessageView] Unknown message type:', message.type, message);
      return '';
  }
}

// =============================================================================
// Thinking Indicator
// =============================================================================

/**
 * Show the thinking indicator (throbbing border on persona card) and enable stop button
 */
export function showThinking() {
  const personaSection = document.getElementById('persona-section');
  if (personaSection) {
    personaSection.classList.add('thinking');
  }
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.disabled = false;
  }
}

/**
 * Hide the thinking indicator and disable stop button
 */
export function hideThinking() {
  const personaSection = document.getElementById('persona-section');
  if (personaSection) {
    personaSection.classList.remove('thinking');
  }
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.disabled = true;
  }
}

// =============================================================================
// Scrolling
// =============================================================================

/**
 * Scroll the message container to the bottom
 * Uses requestAnimationFrame to ensure DOM has updated
 */
export function scrollToBottom() {
  if (containerElement) {
    requestAnimationFrame(() => {
      containerElement.scrollTop = containerElement.scrollHeight;
    });
  }
}

/**
 * Check if user has scrolled up from bottom
 * @returns {boolean}
 */
export function isUserScrolledUp() {
  if (!containerElement) return false;
  const { scrollTop, scrollHeight, clientHeight } = containerElement;
  return scrollHeight - scrollTop - clientHeight > SCROLL_THRESHOLD;
}

/**
 * Set auto-scroll enabled state
 * @param {boolean} enabled
 */
export function setAutoScroll(enabled) {
  autoScrollEnabled = enabled;
}

/**
 * Get auto-scroll enabled state
 * @returns {boolean}
 */
export function getAutoScroll() {
  return autoScrollEnabled;
}

// =============================================================================
// Streaming
// =============================================================================

/** Streaming state */
let streamingState = {
  isStreaming: false,
  currentText: '',
  messageId: null,
};

/**
 * Start a new streaming message
 * @param {string} [messageId] - Optional message ID for correlation
 */
export function startStreamingMessage(messageId = null) {
  streamingState = {
    isStreaming: true,
    currentText: '',
    messageId,
  };
}

/**
 * Update the current streaming message with new text
 * @param {string} text - Text to append or replace
 * @param {boolean} [append=true] - Whether to append or replace
 */
export function updateStreamingMessage(text, append = true) {
  if (append) {
    streamingState.currentText += text;
  } else {
    streamingState.currentText = text;
  }
}

/**
 * End the current streaming message
 */
export function endStreamingMessage() {
  streamingState = {
    isStreaming: false,
    currentText: '',
    messageId: null,
  };
}

/**
 * Get current streaming state
 * @returns {{ isStreaming: boolean, currentText: string, messageId: string | null }}
 */
export function getStreamingState() {
  return { ...streamingState };
}

// =============================================================================
// Theme
// =============================================================================

/**
 * Apply a theme to the message view
 * @param {'dark' | 'light'} theme
 */
export function applyTheme(theme) {
  if (!containerElement) return;

  // Remove existing theme classes
  containerElement.classList.remove(THEME_CLASSES.dark, THEME_CLASSES.light);

  // Apply new theme class
  if (theme === 'dark') {
    containerElement.classList.add(THEME_CLASSES.dark);
  } else {
    containerElement.classList.add(THEME_CLASSES.light);
  }
}

// =============================================================================
// Component Lifecycle
// =============================================================================

/**
 * MessageView component (placeholder for mounting)
 * In vanilla JS, this is the object representing the view
 */
export const MessageView = {
  mount: (containerId) => createMessageView(containerId),
  render: renderMessage,
};

/**
 * Create and mount the MessageView in the DOM
 * @param {string} containerId - ID of container element
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createMessageView(containerId = MESSAGE_VIEW_CONTAINER_ID) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container element #${containerId} not found`);
  }

  // Reset module state for fresh view
  autoScrollEnabled = true;

  containerElement = container;
  container.innerHTML = '';
  container.classList.add('message-view');

  // Set up scroll listener for auto-scroll detection
  scrollHandler = () => {
    if (isUserScrolledUp()) {
      setAutoScroll(false);
    } else {
      // Re-enable auto-scroll when user scrolls back to bottom
      setAutoScroll(true);
    }
  };
  container.addEventListener('scroll', scrollHandler);

  return {
    element: container,
    destroy: () => {
      // Remove event listener to prevent memory leak
      if (scrollHandler) {
        container.removeEventListener('scroll', scrollHandler);
        scrollHandler = null;
      }
      containerElement = null;
      container.innerHTML = '';
    },
  };
}

/**
 * Add a message to the view and store
 * @param {Object} message - SDK message
 */
export function addMessage(message) {
  storeAddMessage(message);

  if (containerElement) {
    const html = renderMessage(message);
    containerElement.insertAdjacentHTML('beforeend', html);

    if (autoScrollEnabled) {
      scrollToBottom();
    }
  }
}

/**
 * Clear all messages from view and store
 */
export function clearMessages() {
  storeClearMessages();
  hasShownInitMessage = false; // Reset so new session shows its init message

  if (containerElement) {
    containerElement.innerHTML = '';
  }
}
