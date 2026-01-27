/**
 * Message Queue Module (Story 17-1, MSSCI-12274)
 * Handles non-blocking message input during Claude processing.
 * Supports queued messages with attached images (base64 encoded).
 *
 * @typedef {import('./constants.js').QueuedMessage} QueuedMessage
 * @typedef {import('./constants.js').PastedImage} PastedImage
 */

import { MESSAGE_QUEUE_KEY, MAX_QUEUE_SIZE } from './constants.js';
import { settingsSync } from '../settings-sync.js';

/**
 * Normalize a message input to QueuedMessage format.
 * Handles both legacy string input and new object format.
 * @param {string|QueuedMessage} message - Message to normalize
 * @returns {QueuedMessage|null} Normalized message or null if invalid
 * @private
 */
function normalizeMessage(message) {
  if (!message) return null;

  // Handle string input (legacy format)
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (!trimmed) return null;
    return { text: trimmed, images: [] };
  }

  // Handle object input (new format)
  if (typeof message === 'object' && message.text !== undefined) {
    const trimmed = (message.text || '').trim();
    if (!trimmed) return null;
    return {
      text: trimmed,
      images: Array.isArray(message.images) ? message.images : [],
    };
  }

  return null;
}

/**
 * Migrate a stored queue item to QueuedMessage format.
 * @param {string|QueuedMessage} item - Queue item from storage
 * @returns {QueuedMessage} Migrated message
 * @private
 */
function migrateQueueItem(item) {
  // Already in new format
  if (typeof item === 'object' && item.text !== undefined) {
    return {
      text: item.text,
      images: Array.isArray(item.images) ? item.images : [],
    };
  }

  // Legacy string format
  if (typeof item === 'string') {
    return { text: item, images: [] };
  }

  // Fallback for any unexpected format
  return { text: String(item), images: [] };
}

// State
let messageQueue = [];
let onQueueChangeCallback = null;
let processingState = false;
let queuePaused = false; // Set by abort to prevent auto-advance
let bellModeEnabled = false; // MSSCI-12275: Bell mode state (injected by hook)

// Editor callbacks (set via init)
let clearEditorFn = null;
let submitFn = null;

/**
 * Initialize message queue with editor callbacks
 * @param {Object} callbacks - Editor callback functions
 * @param {Function} callbacks.clearEditor - Clear editor content
 * @param {Function} callbacks.submit - Submit editor content
 */
export function initMessageQueue({ clearEditor, submit }) {
  clearEditorFn = clearEditor;
  submitFn = submit;
  // Reset state flags on init (important for test isolation)
  processingState = false;
  queuePaused = false;
  bellModeEnabled = false;
  // Clear queue completely on init - fresh start each time
  // (Production use case: page reload restores queue via loadMessageQueue() call elsewhere,
  //  Test isolation: each test starts with empty queue)
  messageQueue = [];
  notifyQueueChange();
}

/**
 * Check if Claude is currently processing a response
 * @returns {boolean} True if processing
 */
export function isProcessing() {
  return processingState;
}

/**
 * Set the processing state
 * @param {boolean} value - New processing state
 */
export function setProcessing(value) {
  const oldValue = processingState;
  processingState = Boolean(value);
  console.log('[MessageQueue] setProcessing:', oldValue, '->', processingState, new Error().stack.split('\n')[2]);
}

/**
 * Pause queue processing (called on abort to prevent auto-advance)
 */
export function pauseQueue() {
  queuePaused = true;
  console.log('[MessageQueue] Queue paused');
}

/**
 * Resume queue processing (called on next user submit)
 */
export function resumeQueue() {
  queuePaused = false;
  console.log('[MessageQueue] Queue resumed');
}

/**
 * Check if queue is paused
 * @returns {boolean} True if queue is paused
 */
export function isQueuePaused() {
  return queuePaused;
}

/**
 * Set bell mode state (MSSCI-12275)
 * When enabled, queue auto-advance is disabled (hook handles injection)
 * @param {boolean} enabled - Whether bell mode is enabled
 */
export function setBellMode(enabled) {
  bellModeEnabled = enabled;
  console.log('[MessageQueue] Bell mode:', enabled ? 'enabled' : 'disabled');
}

/**
 * Check if bell mode is enabled
 * @returns {boolean} True if bell mode is enabled
 */
export function isBellModeEnabled() {
  return bellModeEnabled;
}

/**
 * Get a copy of the current message queue
 * @returns {QueuedMessage[]} Array of queued messages
 */
export function getMessageQueue() {
  return [...messageQueue];
}

/**
 * Get the current queue count
 * @returns {number} Number of messages in queue
 */
export function getQueueCount() {
  return messageQueue.length;
}

/**
 * Set callback for queue changes (for UI updates)
 * @param {Function|null} callback - Called with new count when queue changes
 */
export function setOnQueueChange(callback) {
  onQueueChangeCallback = callback;
}

/**
 * Notify listeners of queue change
 * @private
 */
function notifyQueueChange() {
  if (onQueueChangeCallback) {
    onQueueChangeCallback(messageQueue.length);
  }
}

/**
 * Save message queue to settings-sync (cross-tab broadcast)
 * Also syncs to bell queue file when bell mode is enabled (MSSCI-12275)
 */
export function saveMessageQueue() {
  settingsSync.set(MESSAGE_QUEUE_KEY, messageQueue);
  // Sync to file for bell mode hook (fire and forget)
  syncQueueToFile();
}

/**
 * Sync message queue to .pennyfarthing/bell-queue.json for PostToolUse hook
 * Only writes when bell mode is enabled (MSSCI-12275)
 * @private
 */
async function syncQueueToFile() {
  try {
    const response = await fetch('/api/bell-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageQueue),
    });
    if (!response.ok) {
      console.warn('[MessageQueue] Failed to sync bell queue:', response.status);
    }
  } catch (err) {
    // Ignore errors - bell mode sync is best-effort
    console.debug('[MessageQueue] Bell queue sync error:', err);
  }
}

/**
 * Load message queue from settings-sync.
 * Automatically migrates legacy string[] format to QueuedMessage[].
 */
export function loadMessageQueue() {
  const stored = settingsSync.get(MESSAGE_QUEUE_KEY);
  if (stored && Array.isArray(stored)) {
    // Migrate each item to QueuedMessage format
    messageQueue = stored.map(migrateQueueItem);
  } else {
    // Clear any stale in-memory queue if no stored data
    messageQueue = [];
  }
  notifyQueueChange();
}

/**
 * Add a message to the queue
 * @param {string|QueuedMessage} message - Message to queue (string or object with text/images)
 * @returns {boolean} True if message was queued, false if rejected
 */
export function queueMessage(message) {
  // Normalize to QueuedMessage format
  const normalized = normalizeMessage(message);

  // Reject invalid messages (null, empty, whitespace-only)
  if (!normalized) {
    return false;
  }

  // Enforce max queue size
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    return false;
  }

  messageQueue.push(normalized);
  saveMessageQueue();
  notifyQueueChange();
  return true;
}

/**
 * Remove and return the first message from the queue (FIFO)
 * @returns {QueuedMessage|null} The dequeued message, or null if queue is empty
 */
export function dequeueMessage() {
  if (messageQueue.length === 0) {
    return null;
  }

  const message = messageQueue.shift();
  saveMessageQueue();
  notifyQueueChange();
  return message;
}

/**
 * Clear all messages from the queue
 */
export function clearMessageQueue() {
  messageQueue = [];
  saveMessageQueue();
  notifyQueueChange();
}

/**
 * Remove a specific message from the queue by index
 * @param {number} index - Index of message to remove
 * @returns {boolean} True if message was removed
 */
export function removeFromQueue(index) {
  if (index < 0 || index >= messageQueue.length) {
    return false;
  }
  messageQueue.splice(index, 1);
  saveMessageQueue();
  notifyQueueChange();
  return true;
}

/**
 * Process the next message in the queue (if any)
 * This is called when Claude finishes processing and is ready for more input
 */
export function processNextInQueue() {
  if (messageQueue.length === 0) return;
  if (processingState) return;
  if (queuePaused) {
    console.log('[MessageQueue] Queue paused, skipping auto-advance');
    return;
  }
  // MSSCI-12275: When bell mode is enabled, the hook handles injection
  // Don't auto-advance here to avoid duplicate submissions
  if (bellModeEnabled) {
    console.log('[MessageQueue] Bell mode enabled, hook will handle queue');
    return;
  }

  const nextMessage = dequeueMessage();
  if (nextMessage) {
    // Submit directly with text and images - no need to insert into editor
    // The text is passed to submitFn which handles display in message view
    if (submitFn) submitFn(nextMessage.text, nextMessage.images);
  }
}

/**
 * Inject a queued message immediately (abort current + send)
 * @param {number} index - Index of message to inject
 * @returns {Promise<boolean>} True if message was injected
 */
export async function injectMessage(index) {
  if (index < 0 || index >= messageQueue.length) {
    return false;
  }

  // Get the message before removing
  const message = messageQueue[index];
  if (!message) return false;

  // Remove from queue
  messageQueue.splice(index, 1);
  saveMessageQueue();
  notifyQueueChange();

  // Abort Claude if processing
  if (processingState && window.electronAPI?.claude?.abort) {
    console.log('[MessageQueue] Aborting Claude for injection');
    await window.electronAPI.claude.abort();
    // Brief delay to let abort complete
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Reset processing state
  processingState = false;

  // Clear any existing editor content, then submit directly
  if (clearEditorFn) clearEditorFn();
  if (submitFn) submitFn(message.text, message.images);

  return true;
}

// =============================================================================
// Bell Mode WebSocket (MSSCI-12275)
// Listens for bell-consumed events from the hook and dequeues + displays
// =============================================================================

let bellSocket = null;

/**
 * Initialize the bell mode WebSocket listener
 * Called automatically on module load (browser only)
 */
function initBellWebSocket() {
  // Guard against non-browser environments (tests, SSR, happy-dom)
  if (typeof window === 'undefined') {
    return;
  }
  const host = window.location?.host;
  if (!host || host === '' || host === 'localhost') {
    return;
  }

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${host}/ws/bell`;
    bellSocket = new WebSocket(wsUrl);

  bellSocket.onopen = () => {
    console.log('[Bell] WebSocket connected');
  };

  bellSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'bell-consumed') {
        handleBellConsumed(data.text);
      }
    } catch (err) {
      console.error('[Bell] Failed to parse message:', err);
    }
  };

  bellSocket.onclose = () => {
    console.log('[Bell] WebSocket closed, reconnecting...');
    setTimeout(initBellWebSocket, 2000);
  };

  bellSocket.onerror = (err) => {
    console.error('[Bell] WebSocket error:', err);
  };
  } catch (err) {
    // Silently ignore WebSocket errors in test environments
    console.debug('[Bell] WebSocket init failed (likely test env):', err.message);
  }
}

/**
 * Handle a bell-consumed event from the hook
 * Dequeues the first message and displays it in the message view
 * @param {string} text - The message text that was injected
 */
function handleBellConsumed(text) {
  console.log('[Bell] Message consumed by hook:', text);

  // Dequeue the first message from our local queue
  const message = dequeueMessage();

  if (message) {
    // Display the injected message in the message view as a user message
    displayInjectedMessage(message.text);
  }
}

/**
 * Display an injected bell message in the message view
 * Uses the message store to properly integrate with MessageView
 * @param {string} text - The message text to display
 */
async function displayInjectedMessage(text) {
  try {
    // Dynamically import to avoid circular dependencies
    const { addMessage } = await import('../message-store.js');

    // Add as a bell-injected message type that MessageView will render
    addMessage({
      type: 'bell-injected',
      content: text,
      timestamp: Date.now(),
    });

    console.log('[Bell] Added injected message to store');
  } catch (err) {
    console.error('[Bell] Failed to add message to store:', err);
  }
}

// =============================================================================
// MSSCI-12450: Turn Complete Queue Functions
// =============================================================================

/**
 * Send all queued messages at once (bell mode OFF behavior)
 * Called when Claude's turn completes and bell mode is disabled.
 * Sends all queued messages in FIFO order, then clears the queue.
 */
export function sendAllQueuedMessages() {
  if (queuePaused) {
    console.log('[MessageQueue] Queue paused, skipping sendAllQueuedMessages');
    return;
  }
  if (processingState) {
    console.log('[MessageQueue] Still processing, skipping sendAllQueuedMessages');
    return;
  }
  if (messageQueue.length === 0) {
    return;
  }

  // Send all messages in FIFO order
  const messagesToSend = [...messageQueue];
  for (const msg of messagesToSend) {
    if (submitFn) {
      submitFn(msg.text, msg.images);
    }
  }

  // Clear the queue
  messageQueue = [];
  saveMessageQueue();
  notifyQueueChange();
}

/**
 * Flush remaining messages in queue (bell mode ON cleanup)
 * Called when Claude's turn completes and bell mode is enabled.
 * Any messages not consumed by the PostToolUse hook are sent immediately.
 */
export function flushRemainingQueue() {
  if (queuePaused) {
    console.log('[MessageQueue] Queue paused, skipping flushRemainingQueue');
    return;
  }
  if (processingState) {
    console.log('[MessageQueue] Still processing, skipping flushRemainingQueue');
    return;
  }
  if (messageQueue.length === 0) {
    return;
  }

  // Send all remaining messages
  const messagesToSend = [...messageQueue];
  for (const msg of messagesToSend) {
    if (submitFn) {
      submitFn(msg.text, msg.images);
    }
  }

  // Clear the queue
  messageQueue = [];
  saveMessageQueue();
  notifyQueueChange();
}

/**
 * Handle turn complete - coordinator for queue processing
 * Checks bell mode state and calls the appropriate function:
 * - Bell mode OFF: sendAllQueuedMessages()
 * - Bell mode ON: flushRemainingQueue()
 */
export function handleTurnComplete() {
  if (queuePaused) {
    console.log('[MessageQueue] Queue paused, skipping handleTurnComplete');
    return;
  }
  if (processingState) {
    console.log('[MessageQueue] Still processing, skipping handleTurnComplete');
    return;
  }

  if (bellModeEnabled) {
    flushRemainingQueue();
  } else {
    sendAllQueuedMessages();
  }
}

// Initialize bell WebSocket on module load
initBellWebSocket();
