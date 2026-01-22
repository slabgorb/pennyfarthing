/**
 * MSSCI-12192: Gearshift Mode Status Bar Item
 *
 * Tests verify the gearshift status bar item displays current permission mode
 * (PLAN, MANUAL, ACCEPT, TURBO) and updates in real-time via WheelHub stats.
 *
 * Acceptance Criteria:
 * - AC1: Gearshift item displays current mode (PLAN/MANUAL/ACCEPT/TURBO)
 * - AC2: Item updates within 1 second of mode change
 * - AC3: Shows appropriate text when WheelHub disconnected
 * - AC4: Proper disposal on extension deactivation
 * - AC5: StatsData interface includes mode field
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock VS Code EventEmitter class
class MockEventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  fire = vi.fn((data?: T) => {
    this.listeners.forEach((listener) => listener(data as T));
  });
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  dispose = vi.fn();
}

// Mock StatusBarItem
class MockStatusBarItem {
  text = '';
  tooltip = '';
  color: any = undefined;
  backgroundColor: any = undefined;
  command: any = undefined;
  alignment: number;
  priority: number;
  name?: string;
  accessibilityInformation?: { label: string; role?: string };
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
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    })),
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
    activeTerminal: null,
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 }],
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    findFiles: vi.fn(async () => []),
    fs: {
      stat: vi.fn(async () => ({ type: 1 })),
      readFile: vi.fn(async () => new Uint8Array(0)),
    },
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ fsPath: uri })),
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
  StatusBarAlignment,
  ThemeColor: MockThemeColor,
  EventEmitter: MockEventEmitter,
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12192: Gearshift Mode Status Bar Item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStatusBarItems = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  // ===========================================================================
  // AC5: StatsData interface includes mode field
  // ===========================================================================
  describe('AC5: StatsData interface includes mode field', () => {
    it('should have mode field in StatsData type', async () => {
      // Import the StatsData interface from websocket-manager
      const module = await import('../src/server/websocket-manager');

      // TypeScript compilation will fail if mode is not in StatsData
      // This test documents the expected type shape
      const testStats: module.StatsData = {
        mode: 'manual',
        context: { usablePercent: 50 },
      };

      expect(testStats.mode).toBe('manual');
    });

    it('should accept all valid mode values in StatsData', async () => {
      const module = await import('../src/server/websocket-manager');

      const validModes = ['plan', 'manual', 'accept', 'turbo'] as const;

      for (const mode of validModes) {
        const stats: module.StatsData = { mode };
        expect(stats.mode).toBe(mode);
      }
    });

    it('should allow mode to be optional (undefined)', async () => {
      const module = await import('../src/server/websocket-manager');

      const statsWithoutMode: module.StatsData = {
        context: { usablePercent: 45 },
      };

      expect(statsWithoutMode.mode).toBeUndefined();
    });
  });

  // ===========================================================================
  // AC1: Gearshift item displays current mode (PLAN/MANUAL/ACCEPT/TURBO)
  // ===========================================================================
  describe('AC1: Gearshift item displays current mode', () => {
    it('should create gearshift status bar item', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      new module.StatusBarManager();

      // Should create a gearshift item with priority 99 (right of context at 100)
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem).toBeDefined();
    });

    it('should show gearshift item on creation', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      new module.StatusBarManager();

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.show).toHaveBeenCalled();
    });

    it('should display PLAN when mode is plan', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);
      statsCallback?.({ mode: 'plan' });

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('PLAN');
    });

    it('should display MANUAL when mode is manual', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);
      statsCallback?.({ mode: 'manual' });

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('MANUAL');
    });

    it('should display ACCEPT when mode is accept', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);
      statsCallback?.({ mode: 'accept' });

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('ACCEPT');
    });

    it('should display TURBO when mode is turbo', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);
      statsCallback?.({ mode: 'turbo' });

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('TURBO');
    });

    it('should have appropriate tooltip for each mode', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);
      statsCallback?.({ mode: 'turbo' });

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.tooltip).toMatch(/permission|mode|turbo/i);
    });

    it('should display mode in uppercase', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Test all modes are uppercase
      const modes = ['plan', 'manual', 'accept', 'turbo'];
      for (const mode of modes) {
        statsCallback?.({ mode });
        const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
        expect(gearshiftItem?.text).toBe(mode.toUpperCase());
      }
    });

    it('should show default text when no mode received yet', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      new module.StatusBarManager();

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      // Should show a sensible default (e.g., "--" or "MANUAL")
      expect(gearshiftItem?.text).toMatch(/--|MANUAL|mode/i);
    });
  });

  // ===========================================================================
  // AC2: Item updates within 1 second of mode change
  // ===========================================================================
  describe('AC2: Item updates within 1 second of mode change', () => {
    it('should update immediately when stats received', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Send mode update
      statsCallback?.({ mode: 'plan' });

      // Check immediately (no timer advancement)
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('PLAN');
    });

    it('should update when mode changes from manual to turbo', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      // Start with manual
      statsCallback?.({ mode: 'manual' });
      expect(gearshiftItem?.text).toBe('MANUAL');

      // Change to turbo
      statsCallback?.({ mode: 'turbo' });
      expect(gearshiftItem?.text).toBe('TURBO');
    });

    it('should update on every mode change', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      // Cycle through all modes
      const modes = ['plan', 'manual', 'accept', 'turbo'];
      for (const mode of modes) {
        statsCallback?.({ mode });
        expect(gearshiftItem?.text).toBe(mode.toUpperCase());
      }
    });

    it('should handle rapid mode changes', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      // Rapid changes
      statsCallback?.({ mode: 'plan' });
      statsCallback?.({ mode: 'manual' });
      statsCallback?.({ mode: 'accept' });
      statsCallback?.({ mode: 'turbo' });

      // Final state should be turbo
      expect(gearshiftItem?.text).toBe('TURBO');
    });

    it('should not require timer for updates (real-time via WebSocket)', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Without advancing any timers
      statsCallback?.({ mode: 'accept' });

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('ACCEPT');
    });
  });

  // ===========================================================================
  // AC3: Shows appropriate text when WheelHub disconnected
  // ===========================================================================
  describe('AC3: Shows appropriate text when WheelHub disconnected', () => {
    it('should show disconnected indicator for gearshift when disconnected', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      manager.setConnectionState('disconnected');

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      // Should show some indication it's disconnected (could be "--", "?", or similar)
      expect(gearshiftItem?.text).toMatch(/--|disconnected|\?|—/i);
    });

    it('should restore mode display when reconnected', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);

      // Set mode
      statsCallback?.({ mode: 'turbo' });
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('TURBO');

      // Disconnect
      manager.setConnectionState('disconnected');
      expect(gearshiftItem?.text).not.toBe('TURBO');

      // Reconnect and receive new stats
      manager.setConnectionState('connected');
      statsCallback?.({ mode: 'manual' });
      expect(gearshiftItem?.text).toBe('MANUAL');
    });

    it('should show connecting state for gearshift while connecting', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      new module.StatusBarManager();

      // Initially in connecting state
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      // Should show something indicating not yet connected
      expect(gearshiftItem?.text).toBeDefined();
    });

    it('should have appropriate tooltip when disconnected', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      manager.setConnectionState('disconnected');

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.tooltip).toMatch(/disconnect|unavailable|waiting/i);
    });
  });

  // ===========================================================================
  // AC4: Proper disposal on extension deactivation
  // ===========================================================================
  describe('AC4: Proper disposal on extension deactivation', () => {
    it('should dispose gearshift status bar item', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      manager.dispose();

      expect(gearshiftItem?.dispose).toHaveBeenCalled();
    });

    it('should not update gearshift item after dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);

      // Set initial mode
      statsCallback?.({ mode: 'manual' });
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('MANUAL');

      // Dispose
      manager.dispose();

      // Try to update
      statsCallback?.({ mode: 'turbo' });

      // Should NOT have updated to TURBO
      expect(gearshiftItem?.text).not.toBe('TURBO');
    });

    it('should handle dispose when stats callback fires after dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      manager.dispose();

      // Should not throw when callback fires after dispose
      expect(() => {
        statsCallback?.({ mode: 'turbo' });
      }).not.toThrow();
    });

    it('should be safe to call dispose multiple times', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      expect(() => {
        manager.dispose();
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Integration: Gearshift works alongside context meter
  // ===========================================================================
  describe('Integration: Gearshift and context meter coexist', () => {
    it('should create both context and gearshift items', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      new module.StatusBarManager();

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      expect(contextItem).toBeDefined();
      expect(gearshiftItem).toBeDefined();
    });

    it('should update both items from single stats message', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Send stats with both context and mode
      statsCallback?.({
        context: { usablePercent: 42, tokens: 50000 },
        mode: 'accept',
      });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      expect(contextItem?.text).toContain('42');
      expect(gearshiftItem?.text).toBe('ACCEPT');
    });

    it('should update mode without affecting context display', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      let statsCallback: ((data: any) => void) | undefined;
      const mockWsManager = {
        onStats: vi.fn((cb) => {
          statsCallback = cb;
          return vi.fn();
        }),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      // Set context first
      statsCallback?.({ context: { usablePercent: 55 } });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('55');

      // Now send mode-only update
      statsCallback?.({ mode: 'plan' });

      // Context should still show previous value
      expect(contextItem?.text).toContain('55');

      // Gearshift should be updated
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);
      expect(gearshiftItem?.text).toBe('PLAN');
    });

    it('should dispose both items together', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      const gearshiftItem = createdStatusBarItems.find((item) => item.priority === 99);

      manager.dispose();

      expect(contextItem?.dispose).toHaveBeenCalled();
      expect(gearshiftItem?.dispose).toHaveBeenCalled();
    });
  });
});
