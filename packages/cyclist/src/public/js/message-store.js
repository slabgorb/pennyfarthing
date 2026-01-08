/**
 * Message Store - State management for SDK messages
 *
 * Provides a simple pub/sub store for messages received from ClaudeService.
 * Used by MessageView to track and display messages.
 */

/** @type {import('../../../claude-service.js').SDKMessage[]} */
let messages = [];

/** @type {Set<(messages: import('../../../claude-service.js').SDKMessage[]) => void>} */
const subscribers = new Set();

/**
 * Get all messages in the store
 * @returns {import('../../../claude-service.js').SDKMessage[]}
 */
export function getMessages() {
  return [...messages];
}

/**
 * Add a message to the store
 * @param {import('../../../claude-service.js').SDKMessage} message
 */
export function addMessage(message) {
  messages = [...messages, message];
  notifySubscribers();
}

/**
 * Clear all messages from the store
 */
export function clearMessages() {
  messages = [];
  notifySubscribers();
}

/**
 * Subscribe to message updates
 * @param {(messages: import('../../../claude-service.js').SDKMessage[]) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToMessages(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Notify all subscribers of message changes
 */
function notifySubscribers() {
  const currentMessages = getMessages();
  for (const callback of subscribers) {
    callback(currentMessages);
  }
}
