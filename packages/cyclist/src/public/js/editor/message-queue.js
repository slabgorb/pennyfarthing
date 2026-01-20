/**
 * Message Queue Module (Story 17-1)
 * Handles non-blocking message input during Claude processing
 */

import { MESSAGE_QUEUE_KEY, MAX_QUEUE_SIZE } from './constants.js';
import { settingsSync } from '../settings-sync.js';

// State
let messageQueue = [];
let onQueueChangeCallback = null;
let processingState = false;

// Editor callbacks (set via init)
let clearEditorFn = null;
let insertContentFn = null;
let submitFn = null;

/**
 * Initialize message queue with editor callbacks
 * @param {Object} callbacks - Editor callback functions
 * @param {Function} callbacks.clearEditor - Clear editor content
 * @param {Function} callbacks.insertContent - Insert content into editor
 * @param {Function} callbacks.submit - Submit editor content
 */
export function initMessageQueue({ clearEditor, insertContent, submit }) {
  clearEditorFn = clearEditor;
  insertContentFn = insertContent;
  submitFn = submit;
  loadMessageQueue();
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
  processingState = Boolean(value);
}

/**
 * Get a copy of the current message queue
 * @returns {string[]} Array of queued messages
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
 */
export function saveMessageQueue() {
  settingsSync.set(MESSAGE_QUEUE_KEY, messageQueue);
}

/**
 * Load message queue from settings-sync
 */
export function loadMessageQueue() {
  const stored = settingsSync.get(MESSAGE_QUEUE_KEY);
  if (stored && Array.isArray(stored)) {
    messageQueue = stored;
    notifyQueueChange();
  }
}

/**
 * Add a message to the queue
 * @param {string} message - Message to queue
 * @returns {boolean} True if message was queued, false if rejected
 */
export function queueMessage(message) {
  // Reject empty or whitespace-only messages
  if (!message || !message.trim()) {
    return false;
  }

  // Enforce max queue size
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    return false;
  }

  messageQueue.push(message);
  saveMessageQueue();
  notifyQueueChange();
  return true;
}

/**
 * Remove and return the first message from the queue (FIFO)
 * @returns {string|null} The dequeued message, or null if queue is empty
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

  const nextMessage = dequeueMessage();
  if (nextMessage) {
    // Clear editor and insert the queued message
    if (clearEditorFn) clearEditorFn();
    if (insertContentFn) insertContentFn(nextMessage);
    // Submit it
    if (submitFn) submitFn();
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

  // Inject and submit
  if (clearEditorFn) clearEditorFn();
  if (insertContentFn) insertContentFn(message);
  if (submitFn) submitFn();

  return true;
}
