/**
 * MSSCI-12190: WheelHub Connection Infrastructure - StatusBarManager
 *
 * Tests verify the StatusBarManager that orchestrates status bar items
 * and manages WheelHub connection state for the VS Code extension.
 *
 * Acceptance Criteria:
 * - AC1: StatusBarManager class created and registered on activation
 * - AC2: Subscribes to WebSocketManager.onStats() for real-time updates
 * - AC3: Shows "Connecting..." state when WheelHub is starting
 * - AC4: Handles WheelHub unavailability gracefully (no crashes)
 * - AC5: Implements retry logic (2 second intervals) on disconnection
 * - AC6: Properly disposes resources on deactivation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

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

// Mock RelativePattern
class MockRelativePattern {
  constructor(public base: string, public pattern: string) {}
}

// Mock FileSystemWatcher
class MockFileSystemWatcher {
  onDidChange = vi.fn(() => ({ dispose: vi.fn() }));
  onDidCreate = vi.fn(() => ({ dispose: vi.fn() }));
  onDidDelete = vi.fn(() => ({ dispose: vi.fn() }));
  dispose = vi.fn();
}

const mockOutputChannel = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
  show: vi.fn(),
};

const mockWorkspaceFolder = {
  uri: { fsPath: '/mock/workspace' },
  name: 'mock-workspace',
  index: 0,
};

// Track created status bar items
let createdStatusBarItems: MockStatusBarItem[] = [];

const mockVscode = {
  window: {
    createStatusBarItem: vi.fn((alignment: number, priority: number) => {
      const item = new MockStatusBarItem(alignment, priority);
      createdStatusBarItems.push(item);
      return item;
    }),
    createOutputChannel: vi.fn(() => mockOutputChannel),
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
    workspaceFolders: [mockWorkspaceFolder],
    createFileSystemWatcher: vi.fn(() => new MockFileSystemWatcher()),
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
  RelativePattern: MockRelativePattern,
  StatusBarAlignment,
  ThemeColor: MockThemeColor,
  EventEmitter: MockEventEmitter,
};

vi.mock('vscode', () => mockVscode);

// Mock WheelHubAdapter to avoid complex file I/O
class MockWheelHubAdapter {
  constructor(basePath: string, outputChannel: any) {}
  start = vi.fn(async () => {});
  stop = vi.fn(async () => {});
  getPort = vi.fn(() => 8000);
  getWebSocketManager = vi.fn(() => ({
    onStats: vi.fn(() => ({ dispose: vi.fn() })),
  }));
}

vi.mock('../src/server/wheelhub-adapter', () => {
  return {
    WheelHubAdapter: MockWheelHubAdapter,
  };
});

const EXTENSION_ROOT = join(__dirname, '..');

describe('MSSCI-12190: StatusBarManager - WheelHub Connection Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStatusBarItems = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  describe('AC1: StatusBarManager class created and registered on activation', () => {
    it('should have statusbar/status-bar-manager.ts file', async () => {
      const realExistsSync = (await vi.importActual<typeof import('fs')>('fs')).existsSync;
      const managerPath = join(EXTENSION_ROOT, 'src', 'statusbar', 'status-bar-manager.ts');
      expect(realExistsSync(managerPath)).toBe(true);
    });

    it('should export StatusBarManager class', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      expect(module.StatusBarManager).toBeDefined();
    });

    it('should have statusbar/index.ts barrel export', async () => {
      const realExistsSync = (await vi.importActual<typeof import('fs')>('fs')).existsSync;
      const indexPath = join(EXTENSION_ROOT, 'src', 'statusbar', 'index.ts');
      expect(realExistsSync(indexPath)).toBe(true);
    });

    it('should export StatusBarManager from barrel', async () => {
      const module = await import('../src/statusbar');
      expect(module.StatusBarManager).toBeDefined();
    });

    it('should implement vscode.Disposable interface', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();
      expect(typeof manager.dispose).toBe('function');
    });

    it('should create status bar items with correct alignment and priority', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      // Should create items on the left side
      expect(mockVscode.window.createStatusBarItem).toHaveBeenCalledWith(
        StatusBarAlignment.Left,
        expect.any(Number)
      );
    });

    it('should create context status bar item', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      // Should have a context item with specific priority for ordering
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem).toBeDefined();
    });

    it('should show status bar items after creation', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      // At least one item should be shown
      expect(createdStatusBarItems.some((item) => item.show.mock.calls.length > 0)).toBe(true);
    });
  });

  describe('AC2: Subscribes to WebSocketManager.onStats() for real-time updates', () => {
    it('should accept WebSocketManager in constructor', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      // Create a mock WebSocketManager
      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onMessages: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      expect(manager).toBeDefined();
    });

    it('should subscribe to onStats when WebSocketManager provided', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onMessages: vi.fn(() => vi.fn()),
      };

      new module.StatusBarManager(mockWsManager as any);

      expect(mockWsManager.onStats).toHaveBeenCalled();
    });

    it('should update context display when stats received', async () => {
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

      // Simulate stats update
      statsCallback?.({ context: { usablePercent: 45 } });

      // Should update the context status bar item
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('45');
    });

    it('should format context as "CONTEXT: Xk (Y%)"', async () => {
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

      // Simulate stats with context data (54k tokens = 54000, 31%)
      statsCallback?.({ context: { usablePercent: 31, tokens: 54000 } });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toMatch(/CONTEXT.*54k.*31%|CONTEXT.*31%/);
    });

    it('should apply green color for context < 60%', async () => {
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
      statsCallback?.({ context: { usablePercent: 45 } });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      // Should have green/safe color (implementation may use ThemeColor or hex)
      expect(
        contextItem?.color instanceof MockThemeColor ||
          contextItem?.color === undefined || // default is fine for green
          contextItem?.backgroundColor === undefined
      ).toBe(true);
    });

    it('should apply yellow color for context 60-80%', async () => {
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
      statsCallback?.({ context: { usablePercent: 70 } });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      // Should have warning color
      expect(contextItem?.backgroundColor).toBeDefined();
    });

    it('should apply red color for context > 80%', async () => {
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
      statsCallback?.({ context: { usablePercent: 85 } });

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      // Should have error/danger color
      expect(contextItem?.backgroundColor).toBeDefined();
    });
  });

  describe('AC3: Shows "Connecting..." state when WheelHub is starting', () => {
    it('should show "Connecting..." text initially', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      // Check that context item shows connecting state
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('Connecting');
    });

    it('should have appropriate tooltip explaining connecting state', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.tooltip).toMatch(/connect|WheelHub|waiting/i);
    });

    it('should transition from Connecting to actual values on first stats', async () => {
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

      // Initially connecting
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toContain('Connecting');

      // After stats received
      statsCallback?.({ context: { usablePercent: 50 } });
      expect(contextItem?.text).not.toContain('Connecting');
    });
  });

  describe('AC4: Handles WheelHub unavailability gracefully (no crashes)', () => {
    it('should work without WebSocketManager (standalone mode)', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      // Should not throw when created without WebSocketManager
      expect(() => {
        new module.StatusBarManager();
      }).not.toThrow();
    });

    it('should handle null/undefined stats data gracefully', async () => {
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

      // Should not throw with null/undefined data
      expect(() => {
        statsCallback?.(null);
        statsCallback?.(undefined);
        statsCallback?.({});
      }).not.toThrow();
    });

    it('should handle missing context field in stats', async () => {
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

      // Should not throw with stats missing context
      expect(() => {
        statsCallback?.({ agent: 'dev', phase: 'green' });
      }).not.toThrow();
    });

    it('should handle malformed context data', async () => {
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

      // Should not throw with malformed data
      expect(() => {
        statsCallback?.({ context: 'not an object' });
        statsCallback?.({ context: { usablePercent: 'not a number' } });
        statsCallback?.({ context: { usablePercent: -50 } });
        statsCallback?.({ context: { usablePercent: 150 } });
      }).not.toThrow();
    });

    it('should show disconnected state if WheelHub stops responding', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const mockWsManager = {
        onStats: vi.fn(() => vi.fn()),
        onMessages: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);

      // Simulate disconnection notification
      manager.setConnectionState('disconnected');

      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toMatch(/disconnect|offline|unavailable/i);
    });
  });

  describe('AC5: Implements retry logic (2 second intervals) on disconnection', () => {
    it('should have setConnectionState method', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      expect(typeof manager.setConnectionState).toBe('function');
    });

    it('should accept connection states: connected, disconnected, connecting', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      // Should not throw for valid states
      expect(() => {
        manager.setConnectionState('connected');
        manager.setConnectionState('disconnected');
        manager.setConnectionState('connecting');
      }).not.toThrow();
    });

    it('should start retry timer on disconnection', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      manager.setConnectionState('disconnected');

      // Advance timers by 2 seconds
      vi.advanceTimersByTime(2000);

      // Should attempt reconnection (state changes to connecting)
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      expect(contextItem?.text).toMatch(/connect|retry/i);
    });

    it('should use 2 second interval for retries', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      const retryCallback = vi.fn();
      manager.onRetry(retryCallback);

      manager.setConnectionState('disconnected');

      // Should not retry before 2 seconds
      vi.advanceTimersByTime(1999);
      expect(retryCallback).not.toHaveBeenCalled();

      // Should retry at 2 seconds
      vi.advanceTimersByTime(1);
      expect(retryCallback).toHaveBeenCalledTimes(1);

      // Should retry again at 4 seconds
      vi.advanceTimersByTime(2000);
      expect(retryCallback).toHaveBeenCalledTimes(2);
    });

    it('should stop retry timer when connected', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      const retryCallback = vi.fn();
      manager.onRetry(retryCallback);

      manager.setConnectionState('disconnected');

      // Trigger one retry
      vi.advanceTimersByTime(2000);
      expect(retryCallback).toHaveBeenCalledTimes(1);

      // Now connect
      manager.setConnectionState('connected');

      // Advance more time - no more retries
      vi.advanceTimersByTime(10000);
      expect(retryCallback).toHaveBeenCalledTimes(1);
    });

    it('should clear retry timer on dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      const retryCallback = vi.fn();
      manager.onRetry(retryCallback);

      manager.setConnectionState('disconnected');
      manager.dispose();

      // Advance time - no retries should happen
      vi.advanceTimersByTime(10000);
      expect(retryCallback).not.toHaveBeenCalled();
    });
  });

  describe('AC6: Properly disposes resources on deactivation', () => {
    it('should dispose all status bar items', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      manager.dispose();

      // All created items should be disposed
      expect(createdStatusBarItems.every((item) => item.dispose.mock.calls.length > 0)).toBe(true);
    });

    it('should unsubscribe from WebSocketManager on dispose', async () => {
      const module = await import('../src/statusbar/status-bar-manager');

      const unsubscribe = vi.fn();
      const mockWsManager = {
        onStats: vi.fn(() => unsubscribe),
        onMessages: vi.fn(() => vi.fn()),
      };

      const manager = new module.StatusBarManager(mockWsManager as any);
      manager.dispose();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should be safe to call dispose multiple times', async () => {
      const module = await import('../src/statusbar/status-bar-manager');
      const manager = new module.StatusBarManager();

      // Should not throw on multiple dispose calls
      expect(() => {
        manager.dispose();
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });

    it('should not update status bar items after dispose', async () => {
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

      // Get initial text
      const contextItem = createdStatusBarItems.find((item) => item.priority === 100);
      const textBeforeDispose = contextItem?.text;

      manager.dispose();

      // Try to update after dispose
      statsCallback?.({ context: { usablePercent: 99 } });

      // Text should not have changed (or should remain disposed state)
      // This verifies we don't crash and don't update disposed items
      expect(contextItem?.text).not.toContain('99');
    });
  });

  describe('Extension integration', { timeout: 10000 }, () => {
    it('should be imported and instantiated in extension.ts', async () => {
      // This test verifies the extension integrates StatusBarManager
      // Will fail until Dev wires it up in extension.ts
      const extensionModule = await import('../src/extension');

      // Extension should export or use StatusBarManager
      // Check that activate function creates the manager
      const mockContext = {
        subscriptions: [] as any[],
        extensionPath: '/mock/path',
        extensionUri: { fsPath: '/mock/path' },
        workspaceState: { get: vi.fn(), update: vi.fn() },
        globalState: { get: vi.fn(), update: vi.fn() },
      };

      // Activate should create status bar items
      const activatePromise = extensionModule.activate(mockContext as any);
      vi.useRealTimers();
      await activatePromise;
      vi.useFakeTimers();

      // Status bar items should have been created
      expect(createdStatusBarItems.length).toBeGreaterThan(0);
    });

    it('should register StatusBarManager as disposable', async () => {
      const extensionModule = await import('../src/extension');

      const mockContext = {
        subscriptions: [] as any[],
        extensionPath: '/mock/path',
        extensionUri: { fsPath: '/mock/path' },
        workspaceState: { get: vi.fn(), update: vi.fn() },
        globalState: { get: vi.fn(), update: vi.fn() },
      };

      await extensionModule.activate(mockContext as any);

      // Should have added a disposable for the StatusBarManager
      const statusBarDisposable = mockContext.subscriptions.find(
        (sub: any) => sub._isStatusBarManager || sub.constructor?.name === 'StatusBarManager'
      );
      expect(statusBarDisposable).toBeDefined();
    });
  });
});
