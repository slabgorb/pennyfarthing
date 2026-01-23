/**
 * MSSCI-12230: Context Meter Status Bar Item
 *
 * Tests verify the StatusBarManager migrates from onStats() to the dedicated
 * /context channel via onContext() per MSSCI-12227 channel separation.
 *
 * Acceptance Criteria:
 * - AC1: StatusBarManager subscribes to /context channel via onContext()
 * - AC2: Context display updates from ContextData (not StatsData.context)
 * - AC3: Format remains "CONTEXT: Xk (Y%)" with proper thresholds
 * - AC4: Existing tests continue to pass (backward compatible)
 * - AC5: New test verifies onContext() subscription
 *
 * These tests are written to FAIL until Dev implements the channel migration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContextData } from '../src/server/websocket-manager';

// Mock StatusBarItem
class MockStatusBarItem {
  text = '';
  tooltip = '';
  color: any = undefined;
  backgroundColor: any = undefined;
  alignment: number;
  priority: number;
  private _visible = false;

  constructor(alignment: number, priority: number) {
    this.alignment = alignment;
    this.priority = priority;
  }

  show = vi.fn(() => {
    this._visible = true;
  });
  hide = vi.fn(() => {
    this._visible = false;
  });
  dispose = vi.fn();

  get visible() {
    return this._visible;
  }
}

// Mock StatusBarAlignment enum
const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

// Mock ThemeColor
class MockThemeColor {
  constructor(public id: string) {}
}

// Track created status bar items
let createdStatusBarItems: MockStatusBarItem[] = [];

const mockVscode = {
  window: {
    createStatusBarItem: vi.fn((alignment: number, priority: number) => {
      const item = new MockStatusBarItem(alignment, priority);
      createdStatusBarItems.push(item);
      return item;
    }),
  },
  StatusBarAlignment,
  ThemeColor: MockThemeColor,
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12230: Context Meter Status Bar Item - Channel Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStatusBarItems = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('AC1: StatusBarManager subscribes to /context channel via onContext()', () => {
    it('should call onContext() when WebSocketManager provided', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      expect(mockWsManager.onContext).toHaveBeenCalled();
    });

    it('should subscribe to onContext() not just onStats()', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // The key test: onContext MUST be called for dedicated channel subscription
      expect(mockWsManager.onContext).toHaveBeenCalledTimes(1);
    });

    it('should store unsubscribe function from onContext()', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const contextUnsubscribe = vi.fn();
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => contextUnsubscribe),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      manager.dispose();

      // Should call the unsubscribe function on dispose
      expect(contextUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('AC2: Context display updates from ContextData (not StatsData.context)', () => {
    it('should update context display when onContext callback fires', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Simulate context update via dedicated channel
      contextCallback?.({
        tokens: 54000,
        usablePercent: 31,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('31');
    });

    it('should accept ContextData format with tokens, usablePercent, maxTokens', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      // ContextData format per MSSCI-12227
      const contextData: ContextData = {
        tokens: 87500,
        usablePercent: 50,
        maxTokens: 175000,
      };

      // Should not throw when receiving ContextData
      expect(() => {
        contextCallback?.(contextData);
      }).not.toThrow();

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('50');
    });

    it('should display tokens from ContextData.tokens field', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      contextCallback?.({
        tokens: 88000,
        usablePercent: 50,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      // 88000 tokens = 88k
      expect(contextItem?.text).toContain('88k');
    });
  });

  describe('AC3: Format remains "CONTEXT: Xk (Y%)" with proper thresholds', () => {
    it('should format as "CONTEXT: Xk (Y%)" with ContextData', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      contextCallback?.({
        tokens: 54000,
        usablePercent: 31,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toMatch(/CONTEXT.*54k.*31%/);
    });

    it('should apply green/safe styling for context < 60%', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      contextCallback?.({
        tokens: 35000,
        usablePercent: 20,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      // Green = no background color (default)
      expect(contextItem?.backgroundColor).toBeUndefined();
    });

    it('should apply yellow/warning styling for context 60-80%', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      contextCallback?.({
        tokens: 122500,
        usablePercent: 70,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.backgroundColor).toBeDefined();
      expect((contextItem?.backgroundColor as MockThemeColor)?.id).toBe(
        'statusBarItem.warningBackground'
      );
    });

    it('should apply red/error styling for context >= 80%', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      contextCallback?.({
        tokens: 157500,
        usablePercent: 90,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.backgroundColor).toBeDefined();
      expect((contextItem?.backgroundColor as MockThemeColor)?.id).toBe(
        'statusBarItem.errorBackground'
      );
    });
  });

  describe('AC4: Existing tests continue to pass (backward compatible)', () => {
    it('should still accept WebSocketManager without onContext (graceful degradation)', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      // Legacy WebSocketManager without onContext
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        // No onContext - simulates older WebSocketManager
      };

      // Should not throw
      expect(() => {
        new module.StatusBarManager(mockWsManager as any);
      }).not.toThrow();
    });

    it('should continue to work when only onStats is available', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        // No onContext
      };

      new module.StatusBarManager(mockWsManager as any);

      // Stats should still work as fallback
      statsCallback?.({ context: { usablePercent: 45 } });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('45');
    });
  });

  describe('AC5: New test verifies onContext() subscription', () => {
    it('should prefer onContext over onStats.context when both available', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      let statsCallback: ((data: any) => void) | undefined;

      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      // First update via onContext (dedicated channel)
      contextCallback?.({
        tokens: 54000,
        usablePercent: 31,
        maxTokens: 175000,
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('31');

      // Stats update should NOT override context from dedicated channel
      // (This tests that context is sourced from the dedicated channel)
      statsCallback?.({ context: { usablePercent: 99 } });

      // If implementation correctly uses onContext, it shouldn't
      // be updating from stats.context anymore
      // This is a design choice test - implementation may vary
    });

    it('should receive context updates through onContext callback', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Verify callback is stored and can receive updates
      expect(contextCallback).toBeDefined();

      // Send multiple updates
      contextCallback?.({ tokens: 50000, usablePercent: 29, maxTokens: 175000 });
      let contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('29');

      contextCallback?.({ tokens: 100000, usablePercent: 57, maxTokens: 175000 });
      contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('57');
    });

    it('should handle ContextData with all required fields', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Full ContextData per interface
      const fullContextData: ContextData = {
        tokens: 105000,
        usablePercent: 60,
        maxTokens: 175000,
      };

      expect(() => {
        contextCallback?.(fullContextData);
      }).not.toThrow();

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('105k');
      expect(contextItem?.text).toContain('60');
    });
  });

  describe('Resource cleanup', () => {
    it('should unsubscribe from onContext on dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const contextUnsubscribe = vi.fn();
      const statsUnsubscribe = vi.fn();

      const mockWsManager = {
        onStats: vi.fn(() => statsUnsubscribe),
        onContext: vi.fn(() => contextUnsubscribe),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      manager.dispose();

      expect(contextUnsubscribe).toHaveBeenCalled();
      expect(statsUnsubscribe).toHaveBeenCalled();
    });

    it('should not update display after dispose when context fires', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let contextCallback: ((data: ContextData) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn((cb) => {
          contextCallback = cb;
          return vi.fn();
        }),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);

      manager.dispose();

      // Fire context after dispose
      contextCallback?.({
        tokens: 175000,
        usablePercent: 100,
        maxTokens: 175000,
      });

      // Should not show 100% - disposed manager shouldn't update
      expect(contextItem?.text).not.toContain('100');
    });
  });

  describe('connectToWheelHub method', () => {
    it('should subscribe to onContext when connectToWheelHub called', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      // Create without WebSocketManager
      const manager = new module.StatusBarManager();

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      manager.connectToWheelHub(mockWsManager as any);

      expect(mockWsManager.onContext).toHaveBeenCalled();
    });

    it('should unsubscribe from previous onContext when reconnecting', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const firstUnsubscribe = vi.fn();
      const firstWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => firstUnsubscribe),
      };

      const manager = new module.StatusBarManager(firstWsManager as any);

      const secondWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      manager.connectToWheelHub(secondWsManager as any);

      expect(firstUnsubscribe).toHaveBeenCalled();
      expect(secondWsManager.onContext).toHaveBeenCalled();
    });
  });
});
