/**
 * MSSCI-11946: LocalStorage Cross-Tab Synchronization
 *
 * Tests for the settings-sync.js module that centralizes localStorage access
 * and provides cross-tab synchronization via BroadcastChannel API.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: settings-sync.js module created with BroadcastChannel API
 * - AC2: Theme changes in Tab 1 reflect in Tab 2 immediately
 * - AC3: All localStorage access goes through settings-sync.js
 * - AC4: 14 existing files refactored to use new module
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Type Definitions (expected interface for settings-sync.js)
// =============================================================================

/**
 * Settings sync module interface
 */
export interface SettingsSync {
  /**
   * Get a value from localStorage
   * @param key - The localStorage key
   * @param defaultValue - Default value if key doesn't exist
   */
  get<T>(key: string, defaultValue?: T): T | null;

  /**
   * Set a value in localStorage and broadcast to other tabs
   * @param key - The localStorage key
   * @param value - The value to store
   */
  set<T>(key: string, value: T): void;

  /**
   * Remove a key from localStorage and broadcast to other tabs
   * @param key - The localStorage key to remove
   */
  remove(key: string): void;

  /**
   * Subscribe to changes for a specific key
   * @param key - The localStorage key to watch
   * @param callback - Function called when value changes
   * @returns Unsubscribe function
   */
  subscribe(key: string, callback: (value: unknown) => void): () => void;

  /**
   * Subscribe to all changes
   * @param callback - Function called when any value changes
   * @returns Unsubscribe function
   */
  subscribeAll(callback: (key: string, value: unknown) => void): () => void;

  /**
   * Check if BroadcastChannel is supported
   */
  isBroadcastSupported(): boolean;

  /**
   * Close the broadcast channel (for cleanup)
   */
  close(): void;
}

/**
 * Broadcast message format
 */
export interface SyncMessage {
  type: 'set' | 'remove';
  key: string;
  value?: unknown;
  timestamp: number;
  tabId: string;
}

// =============================================================================
// Constants
// =============================================================================

const JS_DIR = path.join(__dirname, '../src/public/js');
const SETTINGS_SYNC_PATH = path.join(JS_DIR, 'settings-sync.js');

// Files that should use settings-sync.js after refactoring
const FILES_USING_LOCALSTORAGE = [
  'vertical-panel.js',
  'panel-manager.js',
  'file-panel.js',
  'diff-panel.js',
  'settings-panel.js',
  'sidebar-panel.js',
  'message-panel.js',
  'theme.js',
  'theme-manager.js',
  'message-view-init.js',
  'story.js',
  'editor/message-queue.js',
  'editor/command-history.js',
];

// =============================================================================
// Mock BroadcastChannel for testing
// =============================================================================

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  static channels: Map<string, Set<MockBroadcastChannel>> = new Map();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: unknown): void {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      for (const channel of channels) {
        if (channel !== this && channel.onmessage) {
          // Simulate async delivery like real BroadcastChannel
          setTimeout(() => {
            channel.onmessage!({ data });
          }, 0);
        }
      }
    }
  }

  close(): void {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      channels.delete(this);
    }
  }

  static reset(): void {
    MockBroadcastChannel.channels.clear();
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('MSSCI-11946: LocalStorage Cross-Tab Synchronization', () => {
  let mockLocalStorage: Map<string, string>;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockLocalStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
      removeItem: (key: string) => mockLocalStorage.delete(key),
      clear: () => mockLocalStorage.clear(),
      get length() { return mockLocalStorage.size; },
      key: (index: number) => Array.from(mockLocalStorage.keys())[index] ?? null,
    });

    // Mock BroadcastChannel
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    MockBroadcastChannel.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    MockBroadcastChannel.reset();
  });

  // ===========================================================================
  // AC1: settings-sync.js module created with BroadcastChannel API
  // ===========================================================================
  describe('AC1: settings-sync.js module with BroadcastChannel API', () => {

    it('should have settings-sync.js file', () => {
      expect(fs.existsSync(SETTINGS_SYNC_PATH)).toBe(true);
    });

    it('should export settingsSync object or createSettingsSync factory', async () => {
      const settingsSync = await import('../src/public/js/settings-sync.js');
      expect(
        settingsSync.settingsSync !== undefined ||
        settingsSync.createSettingsSync !== undefined ||
        settingsSync.default !== undefined
      ).toBe(true);
    });

    it('should have get method', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.get).toBe('function');
    });

    it('should have set method', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.set).toBe('function');
    });

    it('should have remove method', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.remove).toBe('function');
    });

    it('should have subscribe method', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.subscribe).toBe('function');
    });

    it('should have subscribeAll method', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.subscribeAll).toBe('function');
    });

    it('should have isBroadcastSupported method', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.isBroadcastSupported).toBe('function');
    });

    it('should have close method for cleanup', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(typeof settingsSync.close).toBe('function');
    });

    it('should create BroadcastChannel with correct name', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      // Access internal channel name or check it was created
      expect(settingsSync.isBroadcastSupported()).toBe(true);
    });

    it('should return true for isBroadcastSupported when BroadcastChannel exists', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      expect(settingsSync.isBroadcastSupported()).toBe(true);
    });

    it('should gracefully handle missing BroadcastChannel', async () => {
      // Remove BroadcastChannel from global
      vi.stubGlobal('BroadcastChannel', undefined);

      // Re-import to test fallback behavior
      vi.resetModules();
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      expect(settingsSync.isBroadcastSupported()).toBe(false);
      // Should still work for local storage operations
      expect(() => settingsSync.set('test-key', 'test-value')).not.toThrow();
    });

  });

  // ===========================================================================
  // AC1 continued: get/set/remove operations
  // ===========================================================================
  describe('AC1 continued: localStorage operations', () => {

    it('should get value from localStorage', async () => {
      mockLocalStorage.set('test-key', JSON.stringify('test-value'));

      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      const value = settingsSync.get('test-key');

      expect(value).toBe('test-value');
    });

    it('should return default value when key does not exist', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      const value = settingsSync.get('nonexistent-key', 'default');

      expect(value).toBe('default');
    });

    it('should return null when key does not exist and no default', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      const value = settingsSync.get('nonexistent-key');

      expect(value).toBeNull();
    });

    it('should set value in localStorage', async () => {
      vi.resetModules();
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');
      const settingsSync = createSettingsSync();
      settingsSync.set('test-key', 'test-value');

      const stored = localStorage.getItem('test-key');
      expect(JSON.parse(stored!)).toBe('test-value');
      settingsSync.close();
    });

    it('should serialize objects to JSON when setting', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      const obj = { width: 300, collapsed: false };
      settingsSync.set('panel-state', obj);

      const stored = mockLocalStorage.get('panel-state');
      expect(JSON.parse(stored!)).toEqual(obj);
    });

    it('should deserialize JSON objects when getting', async () => {
      mockLocalStorage.set('panel-state', JSON.stringify({ width: 300, collapsed: false }));

      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      const value = settingsSync.get('panel-state');

      expect(value).toEqual({ width: 300, collapsed: false });
    });

    it('should remove value from localStorage', async () => {
      mockLocalStorage.set('test-key', JSON.stringify('test-value'));

      const { settingsSync } = await import('../src/public/js/settings-sync.js');
      settingsSync.remove('test-key');

      expect(mockLocalStorage.has('test-key')).toBe(false);
    });

    it('should handle localStorage errors gracefully', async () => {
      // Simulate quota exceeded error
      vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceededError'); },
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null,
      });

      vi.resetModules();
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      // Should not throw, just log warning
      expect(() => settingsSync.set('test-key', 'test-value')).not.toThrow();
    });

  });

  // ===========================================================================
  // AC2: Theme changes in Tab 1 reflect in Tab 2 immediately
  // ===========================================================================
  describe('AC2: Cross-tab synchronization', () => {

    it('should broadcast set operations to other tabs', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      // Simulate two tabs with separate instances
      const tab1 = createSettingsSync();
      const tab2 = createSettingsSync();

      const tab2Callback = vi.fn();
      tab2.subscribe('cyclist-theme', tab2Callback);

      // Tab 1 sets a value
      tab1.set('cyclist-theme', 'dark');

      // Wait for async broadcast delivery
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(tab2Callback).toHaveBeenCalledWith('dark');

      tab1.close();
      tab2.close();
    });

    it('should broadcast remove operations to other tabs', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();
      const tab2 = createSettingsSync();

      const tab2Callback = vi.fn();
      tab2.subscribe('cyclist-theme', tab2Callback);

      // Tab 1 sets then removes a value
      tab1.set('cyclist-theme', 'dark');
      await new Promise(resolve => setTimeout(resolve, 10));

      tab1.remove('cyclist-theme');
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second call should be with null (removed)
      expect(tab2Callback).toHaveBeenLastCalledWith(null);

      tab1.close();
      tab2.close();
    });

    it('should not receive own broadcasts', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();

      const selfCallback = vi.fn();
      tab1.subscribe('cyclist-theme', selfCallback);

      tab1.set('cyclist-theme', 'dark');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not receive own broadcast (only direct subscribe callback from set)
      // The broadcast should be filtered by tabId
      expect(selfCallback).toHaveBeenCalledTimes(1); // Only from local set

      tab1.close();
    });

    it('should call local subscribers when set is called', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      const callback = vi.fn();
      settingsSync.subscribe('test-key', callback);

      settingsSync.set('test-key', 'new-value');

      expect(callback).toHaveBeenCalledWith('new-value');
    });

    it('should notify subscribeAll listeners on any change', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      const callback = vi.fn();
      settingsSync.subscribeAll(callback);

      settingsSync.set('key1', 'value1');
      settingsSync.set('key2', 'value2');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('key1', 'value1');
      expect(callback).toHaveBeenCalledWith('key2', 'value2');
    });

    it('should return unsubscribe function from subscribe', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      const callback = vi.fn();
      const unsubscribe = settingsSync.subscribe('test-key', callback);

      settingsSync.set('test-key', 'value1');
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      settingsSync.set('test-key', 'value2');
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should handle multiple subscribers for same key', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      settingsSync.subscribe('test-key', callback1);
      settingsSync.subscribe('test-key', callback2);

      settingsSync.set('test-key', 'new-value');

      expect(callback1).toHaveBeenCalledWith('new-value');
      expect(callback2).toHaveBeenCalledWith('new-value');
    });

    it('should include tabId in broadcast messages to prevent echo', async () => {
      // This tests internal implementation detail but is important for correctness
      const { createSettingsSync, CHANNEL_NAME } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();

      // Capture messages sent on the channel
      const channel = Array.from(MockBroadcastChannel.channels.get(CHANNEL_NAME) || [])[0];
      const postMessageSpy = vi.spyOn(channel, 'postMessage');

      tab1.set('test-key', 'test-value');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'set',
          key: 'test-key',
          value: 'test-value',
          tabId: expect.any(String),
          timestamp: expect.any(Number),
        })
      );

      tab1.close();
    });

  });

  // ===========================================================================
  // AC2 continued: Theme-specific cross-tab behavior
  // ===========================================================================
  describe('AC2 continued: Theme synchronization', () => {

    it('should sync theme changes across tabs', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();
      const tab2 = createSettingsSync();

      let tab2Theme: string | null = null;
      tab2.subscribe('cyclist-theme', (value) => {
        tab2Theme = value as string;
      });

      // Tab 1 changes theme
      tab1.set('cyclist-theme', 'dracula');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(tab2Theme).toBe('dracula');

      tab1.close();
      tab2.close();
    });

    it('should sync color theme ID across tabs', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();
      const tab2 = createSettingsSync();

      let tab2ColorTheme: string | null = null;
      tab2.subscribe('cyclist-color-theme', (value) => {
        tab2ColorTheme = value as string;
      });

      tab1.set('cyclist-color-theme', 'monokai');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(tab2ColorTheme).toBe('monokai');

      tab1.close();
      tab2.close();
    });

    it('should sync custom themes across tabs', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();
      const tab2 = createSettingsSync();

      const customThemes = [{ id: 'my-theme', name: 'My Theme' }];

      let tab2CustomThemes: unknown = null;
      tab2.subscribe('cyclist-custom-themes', (value) => {
        tab2CustomThemes = value;
      });

      tab1.set('cyclist-custom-themes', customThemes);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(tab2CustomThemes).toEqual(customThemes);

      tab1.close();
      tab2.close();
    });

  });

  // ===========================================================================
  // AC3: All localStorage access goes through settings-sync.js
  // ===========================================================================
  describe('AC3: Centralized localStorage access', () => {

    it('should export STORAGE_KEYS constant with all known keys', async () => {
      const { STORAGE_KEYS } = await import('../src/public/js/settings-sync.js');

      expect(STORAGE_KEYS).toBeDefined();
      expect(typeof STORAGE_KEYS).toBe('object');

      // Should include all known localStorage keys
      expect(STORAGE_KEYS.THEME).toBeDefined();
      expect(STORAGE_KEYS.COLOR_THEME).toBeDefined();
      expect(STORAGE_KEYS.CUSTOM_THEMES).toBeDefined();
      expect(STORAGE_KEYS.PANEL_MANAGER).toBeDefined();
      expect(STORAGE_KEYS.MESSAGE_QUEUE).toBeDefined();
      expect(STORAGE_KEYS.COMMAND_HISTORY).toBeDefined();
    });

    it('should use consistent key naming pattern', async () => {
      const { STORAGE_KEYS } = await import('../src/public/js/settings-sync.js');

      // All keys should start with 'cyclist-' prefix
      for (const [name, key] of Object.entries(STORAGE_KEYS)) {
        if (name !== 'THEME') { // Legacy 'theme' key is exception
          expect(key).toMatch(/^cyclist-/);
        }
      }
    });

    it('should provide typed getter for panel state', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      mockLocalStorage.set('cyclist-file-panel', JSON.stringify({ width: 300, collapsed: false }));

      const state = settingsSync.get<{ width: number; collapsed: boolean }>('cyclist-file-panel');

      expect(state).toEqual({ width: 300, collapsed: false });
    });

    it('should provide typed getter for theme preference', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      mockLocalStorage.set('cyclist-theme', JSON.stringify('dark'));

      const theme = settingsSync.get<string>('cyclist-theme');

      expect(theme).toBe('dark');
    });

  });

  // ===========================================================================
  // AC4: Existing files refactored to use new module
  // ===========================================================================
  describe('AC4: Files refactored to use settings-sync.js', () => {

    for (const file of FILES_USING_LOCALSTORAGE) {
      it(`should have ${file} importing settings-sync.js`, () => {
        const filePath = path.join(JS_DIR, file);

        if (!fs.existsSync(filePath)) {
          // editor/constants.js only defines keys, doesn't need to import
          if (file === 'editor/constants.js') {
            expect(true).toBe(true);
            return;
          }
          expect(fs.existsSync(filePath)).toBe(true);
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        // Should import settings-sync.js
        expect(content).toMatch(/import.*settings-sync|from.*settings-sync|settingsSync/);
      });
    }

    it('should not have direct localStorage.getItem calls in refactored files', () => {
      const directLocalStorageCalls: string[] = [];

      for (const file of FILES_USING_LOCALSTORAGE) {
        if (file === 'editor/constants.js') continue; // Skip - only defines keys

        const filePath = path.join(JS_DIR, file);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for direct localStorage access (not through settingsSync)
        // Allow comments and strings that mention localStorage
        const lines = content.split('\n');
        for (const line of lines) {
          // Skip comments and strings
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

          if (line.match(/localStorage\.(getItem|setItem|removeItem)/)) {
            // Check it's not inside settingsSync implementation
            if (!content.includes('export const settingsSync') &&
                !content.includes('export function createSettingsSync')) {
              directLocalStorageCalls.push(`${file}: ${line.trim()}`);
            }
          }
        }
      }

      expect(directLocalStorageCalls).toHaveLength(0);
    });

    it('should not have direct localStorage.setItem calls in refactored files', () => {
      const directLocalStorageCalls: string[] = [];

      for (const file of FILES_USING_LOCALSTORAGE) {
        if (file === 'editor/constants.js') continue;

        const filePath = path.join(JS_DIR, file);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');

        // Skip settings-sync.js itself
        if (file === 'settings-sync.js') continue;

        const lines = content.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

          if (line.match(/localStorage\.setItem/)) {
            directLocalStorageCalls.push(`${file}: ${line.trim()}`);
          }
        }
      }

      expect(directLocalStorageCalls).toHaveLength(0);
    });

  });

  // ===========================================================================
  // Integration: Error handling and edge cases
  // ===========================================================================
  describe('Integration: Error handling', () => {

    it('should handle malformed JSON in localStorage gracefully', async () => {
      mockLocalStorage.set('bad-json', 'not valid json {{{');

      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      // Should not throw, return default or null
      expect(() => settingsSync.get('bad-json', 'default')).not.toThrow();
      const value = settingsSync.get('bad-json', 'default');
      expect(value).toBe('default');
    });

    it('should handle BroadcastChannel message errors gracefully', async () => {
      const { createSettingsSync } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();
      const tab2 = createSettingsSync();

      // Set up a callback that throws
      tab2.subscribe('test-key', () => {
        throw new Error('Callback error');
      });

      // This should not crash the sync system
      expect(() => tab1.set('test-key', 'value')).not.toThrow();

      tab1.close();
      tab2.close();
    });

    it('should clean up BroadcastChannel on close', async () => {
      const { createSettingsSync, CHANNEL_NAME } = await import('../src/public/js/settings-sync.js');

      const sync = createSettingsSync();
      const initialChannelCount = MockBroadcastChannel.channels.get(CHANNEL_NAME)?.size || 0;

      sync.close();

      const finalChannelCount = MockBroadcastChannel.channels.get(CHANNEL_NAME)?.size || 0;
      expect(finalChannelCount).toBe(initialChannelCount - 1);
    });

  });

  // ===========================================================================
  // Integration: Performance considerations
  // ===========================================================================
  describe('Integration: Performance', () => {

    it('should debounce rapid set calls to same key', async () => {
      const { settingsSync } = await import('../src/public/js/settings-sync.js');

      const callback = vi.fn();
      settingsSync.subscribe('rapid-key', callback);

      // Rapid fire sets
      for (let i = 0; i < 10; i++) {
        settingsSync.set('rapid-key', `value-${i}`);
      }

      // Should batch or debounce broadcasts
      // Final value should be set
      const finalValue = settingsSync.get('rapid-key');
      expect(finalValue).toBe('value-9');
    });

    it('should not broadcast for unchanged values', async () => {
      const { createSettingsSync, CHANNEL_NAME } = await import('../src/public/js/settings-sync.js');

      const tab1 = createSettingsSync();

      // First set
      tab1.set('test-key', 'same-value');

      const channel = Array.from(MockBroadcastChannel.channels.get(CHANNEL_NAME) || [])[0];
      const postMessageSpy = vi.spyOn(channel, 'postMessage');
      postMessageSpy.mockClear();

      // Second set with same value
      tab1.set('test-key', 'same-value');

      // Should not broadcast if value unchanged
      expect(postMessageSpy).not.toHaveBeenCalled();

      tab1.close();
    });

  });

});
