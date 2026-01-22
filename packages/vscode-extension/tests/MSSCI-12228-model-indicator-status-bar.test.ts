/**
 * MSSCI-12228: Model Indicator Status Bar Item
 *
 * Tests verify the StatusBarManager displays active Claude model in status bar.
 *
 * Acceptance Criteria:
 * - AC1: ModelItem displays in status bar (priority 98, right of gearshift)
 * - AC2: Format: "MODEL: OPUS 4-5" (or "SONNET 4", "HAIKU 4-5", etc.)
 * - AC3: Updates when model data received from stats
 * - AC4: Shows "--" when model unknown or disconnected
 * - AC5: Properly disposed on cleanup
 *
 * These tests are written to FAIL until Dev implements the model indicator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('MSSCI-12228: Model Indicator Status Bar Item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStatusBarItems = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('AC1: ModelItem displays in status bar (priority 98, right of gearshift)', () => {
    it('should create a model status bar item', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Should create 3 status bar items: context (100), gearshift (99), model (98)
      expect(createdStatusBarItems.length).toBe(3);
    });

    it('should create model item with priority 98', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Find item with priority 98 (model indicator)
      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem).toBeDefined();
    });

    it('should show model item on creation', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.show).toHaveBeenCalled();
    });

    it('should create model item with Left alignment', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.alignment).toBe(StatusBarAlignment.Left);
    });
  });

  describe('AC2: Format: "MODEL: OPUS 4-5" (or "SONNET 4", "HAIKU 4-5", etc.)', () => {
    it('should format claude-opus-4-5-20251101 as "MODEL: OPUS 4-5"', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Send model data via stats
      statsCallback?.({ model: 'claude-opus-4-5-20251101' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toBe('MODEL: OPUS 4-5');
    });

    it('should format claude-sonnet-4-20250514 as "MODEL: SONNET 4"', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      statsCallback?.({ model: 'claude-sonnet-4-20250514' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toBe('MODEL: SONNET 4');
    });

    it('should format claude-haiku-4-5-20251101 as "MODEL: HAIKU 4-5"', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      statsCallback?.({ model: 'claude-haiku-4-5-20251101' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toBe('MODEL: HAIKU 4-5');
    });

    it('should uppercase the model name', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      statsCallback?.({ model: 'claude-opus-4-5-20251101' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      // Should be uppercase
      expect(modelItem?.text).toMatch(/MODEL: [A-Z0-9- ]+$/);
    });
  });

  describe('AC3: Updates when model data received from stats', () => {
    it('should update model display when stats received with model', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);

      // First update
      statsCallback?.({ model: 'claude-opus-4-5-20251101' });
      expect(modelItem?.text).toContain('OPUS');

      // Second update - different model
      statsCallback?.({ model: 'claude-sonnet-4-20250514' });
      expect(modelItem?.text).toContain('SONNET');
    });

    it('should set tooltip with model information', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      statsCallback?.({ model: 'claude-opus-4-5-20251101' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.tooltip).toBeDefined();
      expect(modelItem?.tooltip.length).toBeGreaterThan(0);
    });

    it('should handle stats without model field gracefully', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Send stats without model
      expect(() => {
        statsCallback?.({ context: { usablePercent: 50 } });
      }).not.toThrow();
    });
  });

  describe('AC4: Shows "--" when model unknown or disconnected', () => {
    it('should show "--" initially when connecting', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      // Initial state should show placeholder
      expect(modelItem?.text).toContain('--');
    });

    it('should show "--" when no model data received yet', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Send stats without model
      statsCallback?.({ context: { usablePercent: 50 } });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toContain('--');
    });

    it('should show appropriate state when disconnected', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);

      // Set disconnected state
      manager.setConnectionState('disconnected');

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toContain('--');
    });

    it('should handle empty string model gracefully', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      statsCallback?.({ model: '' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toContain('--');
    });

    it('should handle "—" (em dash) model gracefully', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Cyclist uses em dash for unknown
      statsCallback?.({ model: '—' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      expect(modelItem?.text).toContain('--');
    });
  });

  describe('AC5: Properly disposed on cleanup', () => {
    it('should dispose model item on manager dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);

      manager.dispose();

      expect(modelItem?.dispose).toHaveBeenCalled();
    });

    it('should not update model display after dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);

      manager.dispose();

      // Send model after dispose
      statsCallback?.({ model: 'claude-opus-4-5-20251101' });

      // Should not show OPUS - was disposed
      expect(modelItem?.text).not.toContain('OPUS');
    });

    it('should dispose all three status bar items', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onContext: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      manager.dispose();

      // All items should be disposed
      for (const item of createdStatusBarItems) {
        expect(item.dispose).toHaveBeenCalled();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle model with unexpected format', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onContext: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Unexpected format - should handle gracefully
      statsCallback?.({ model: 'some-random-model' });

      const modelItem = createdStatusBarItems.find((item) => item.priority === 98);
      // Should display something, not crash
      expect(modelItem?.text).toBeDefined();
    });

    it('should work without WebSocketManager', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      // Create without wsManager
      expect(() => {
        new module.StatusBarManager();
      }).not.toThrow();

      // Should still create 3 items
      expect(createdStatusBarItems.length).toBe(3);
    });
  });
});
