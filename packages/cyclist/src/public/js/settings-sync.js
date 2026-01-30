/**
 * settings-sync.js - Centralized localStorage access with cross-tab synchronization
 *
 * This module provides:
 * 1. Centralized localStorage access (get/set/remove)
 * 2. Cross-tab synchronization via BroadcastChannel API
 * 3. Subscribe mechanism for reactive updates
 *
 * @module settings-sync
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * BroadcastChannel name for cross-tab sync
 */
export const CHANNEL_NAME = 'cyclist-settings-sync';

/**
 * All known localStorage keys used by Cyclist
 */
export const STORAGE_KEYS = {
  // Theme keys
  THEME: 'cyclist-theme',
  COLOR_THEME: 'cyclist-color-theme',
  CUSTOM_THEMES: 'cyclist-custom-themes',

  // Panel keys
  PANEL_MANAGER: 'cyclist-panel-manager',
  FILE_PANEL: 'cyclist-file-panel',
  DIFF_PANEL: 'cyclist-diff-panel',
  SETTINGS_PANEL: 'cyclist-settings-panel',
  SIDEBAR_PANEL: 'cyclist-sidebar-panel',
  MESSAGE_PANEL: 'cyclist-message-panel',

  // UI state keys
  AC_COLLAPSED: 'cyclist-ac-collapsed',

  // Editor keys
  MESSAGE_QUEUE: 'cyclist-message-queue',
  COMMAND_HISTORY: 'cyclist-command-history',
  EDITOR_MODE: 'cyclist-editor-mode',
};

// =============================================================================
// Implementation
// =============================================================================

/**
 * Generate a unique tab ID
 */
function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a settings sync instance
 * @returns {import('./settings-sync.js').SettingsSync}
 */
export function createSettingsSync() {
  const tabId = generateTabId();
  const subscribers = new Map(); // key -> Set<callback>
  const allSubscribers = new Set(); // Set<(key, value) => void>
  let channel = null;
  let lastValues = new Map(); // Track last values for change detection

  // Initialize BroadcastChannel if available
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const message = event.data;

        // Ignore messages from self
        if (message.tabId === tabId) {
          return;
        }

        // Handle the message
        try {
          if (message.type === 'set') {
            notifySubscribers(message.key, message.value);
          } else if (message.type === 'remove') {
            notifySubscribers(message.key, null);
          }
        } catch (err) {
          console.warn('[settings-sync] Error handling broadcast message:', err);
        }
      };
    } catch (err) {
      console.warn('[settings-sync] Failed to create BroadcastChannel:', err);
    }
  }

  /**
   * Notify all subscribers for a key
   */
  function notifySubscribers(key, value) {
    // Key-specific subscribers
    const keySubscribers = subscribers.get(key);
    if (keySubscribers) {
      for (const callback of keySubscribers) {
        try {
          callback(value);
        } catch (err) {
          console.warn(`[settings-sync] Subscriber error for key "${key}":`, err);
        }
      }
    }

    // All-key subscribers
    for (const callback of allSubscribers) {
      try {
        callback(key, value);
      } catch (err) {
        console.warn('[settings-sync] subscribeAll callback error:', err);
      }
    }
  }

  /**
   * Broadcast a change to other tabs
   */
  function broadcast(type, key, value) {
    if (!channel) return;

    try {
      channel.postMessage({
        type,
        key,
        value,
        timestamp: Date.now(),
        tabId,
      });
    } catch (err) {
      console.warn('[settings-sync] Failed to broadcast:', err);
    }
  }

  return {
    /**
     * Get a value from localStorage
     * @template T
     * @param {string} key - The localStorage key
     * @param {T} [defaultValue] - Default value if key doesn't exist
     * @returns {T | null}
     */
    get(key, defaultValue = null) {
      try {
        const stored = localStorage.getItem(key);
        if (stored === null) {
          return defaultValue;
        }
        return JSON.parse(stored);
      } catch (err) {
        console.warn(`[settings-sync] Failed to get key "${key}":`, err);
        return defaultValue;
      }
    },

    /**
     * Set a value in localStorage and broadcast to other tabs
     * @template T
     * @param {string} key - The localStorage key
     * @param {T} value - The value to store
     */
    set(key, value) {
      // Check if value changed (skip broadcast if same)
      const serialized = JSON.stringify(value);
      const lastValue = lastValues.get(key);

      if (lastValue === serialized) {
        return; // Value unchanged, skip
      }

      lastValues.set(key, serialized);

      // Store in localStorage
      try {
        localStorage.setItem(key, serialized);
      } catch (err) {
        console.warn(`[settings-sync] Failed to set key "${key}":`, err);
        // Continue to notify local subscribers even if localStorage fails
      }

      // Notify local subscribers
      notifySubscribers(key, value);

      // Broadcast to other tabs
      broadcast('set', key, value);
    },

    /**
     * Remove a key from localStorage and broadcast to other tabs
     * @param {string} key - The localStorage key to remove
     */
    remove(key) {
      lastValues.delete(key);

      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn(`[settings-sync] Failed to remove key "${key}":`, err);
      }

      // Notify local subscribers with null
      notifySubscribers(key, null);

      // Broadcast to other tabs
      broadcast('remove', key, null);
    },

    /**
     * Subscribe to changes for a specific key
     * @param {string} key - The localStorage key to watch
     * @param {(value: unknown) => void} callback - Function called when value changes
     * @returns {() => void} Unsubscribe function
     */
    subscribe(key, callback) {
      if (!subscribers.has(key)) {
        subscribers.set(key, new Set());
      }
      subscribers.get(key).add(callback);

      // Return unsubscribe function
      return () => {
        const keySubscribers = subscribers.get(key);
        if (keySubscribers) {
          keySubscribers.delete(callback);
          if (keySubscribers.size === 0) {
            subscribers.delete(key);
          }
        }
      };
    },

    /**
     * Subscribe to all changes
     * @param {(key: string, value: unknown) => void} callback - Function called when any value changes
     * @returns {() => void} Unsubscribe function
     */
    subscribeAll(callback) {
      allSubscribers.add(callback);

      return () => {
        allSubscribers.delete(callback);
      };
    },

    /**
     * Check if BroadcastChannel is supported
     * @returns {boolean}
     */
    isBroadcastSupported() {
      return channel !== null;
    },

    /**
     * Close the broadcast channel (for cleanup)
     */
    close() {
      if (channel) {
        channel.close();
        channel = null;
      }
      subscribers.clear();
      allSubscribers.clear();
      lastValues.clear();
    },
  };
}

// =============================================================================
// Default Singleton Instance
// =============================================================================

/**
 * Default settings sync instance for the current tab
 */
export const settingsSync = createSettingsSync();
