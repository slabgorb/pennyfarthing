/**
 * MSSCI-12237: Story Status Tree View - WheelHub Only
 *
 * These tests verify the acceptance criteria for removing file watchers from
 * the VS Code extension sidebar and relying exclusively on WheelHub for story data.
 *
 * Written in RED phase - tests should fail until Dev implements the changes.
 *
 * Acceptance Criteria:
 * - AC1: Sidebar displays story title from WheelHub (not file watchers)
 * - AC2: "No active story" shown when no .session/*-session.md exists
 * - AC3: Story updates within 500ms of session file change (via WheelHub)
 * - AC4: No file watcher code remains in VS Code extension for session files
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
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

const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  workspaceState: { get: vi.fn(), update: vi.fn() },
  globalState: { get: vi.fn(), update: vi.fn() },
  extensionPath: '/mock/extension/path',
  extensionUri: { fsPath: '/mock/extension/path' },
};

const mockWorkspaceFolder = {
  uri: { fsPath: '/mock/workspace' },
  name: 'mock-workspace',
  index: 0,
};

const mockOutputChannel = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
  show: vi.fn(),
};

const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

class MockTreeItem {
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  collapsibleState?: number;
  command?: { command: string; arguments?: any[] };
  iconPath?: any;
  accessibilityInformation?: { label: string };
  itemType?: string;

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class MockChatParticipant {
  id: string;
  displayName?: string;
  iconPath?: any;
  subCommands: Array<{ name: string; description: string }> = [];
  dispose = vi.fn();
  constructor(id: string, handler: any) {
    this.id = id;
  }
}

const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

class MockThemeColor {
  constructor(public id: string) {}
}

const mockVscode = {
  StatusBarAlignment,
  ThemeColor: MockThemeColor,
  chat: {
    createChatParticipant: vi.fn(
      (id: string, handler: any) => new MockChatParticipant(id, handler)
    ),
  },
  window: {
    createOutputChannel: vi.fn(() => mockOutputChannel),
    createStatusBarItem: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: '',
      tooltip: '',
      color: undefined,
      backgroundColor: undefined,
    })),
    activeTerminal: { sendText: vi.fn(), show: vi.fn() },
    terminals: [{ sendText: vi.fn(), show: vi.fn() }],
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({
      dispose: vi.fn(),
      reveal: vi.fn(),
      onDidExpandElement: vi.fn(),
      onDidCollapseElement: vi.fn(),
    })),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
  },
  workspace: {
    workspaceFolders: [mockWorkspaceFolder],
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    findFiles: vi.fn().mockResolvedValue([]),
    fs: {
      readFile: vi.fn().mockResolvedValue(new Uint8Array()),
      stat: vi.fn().mockRejectedValue(new Error('File not found')),
    },
  },
  RelativePattern: class {
    constructor(public base: any, public pattern: string) {}
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
  },
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState,
  EventEmitter: MockEventEmitter,
  ThemeIcon: class {
    constructor(public id: string, public color?: any) {}
  },
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12237: Story Status Tree View - WheelHub Only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC4: No file watcher code remains in VS Code extension for session files
  // ========================================================================
  describe('AC4: No file watcher code remains for session files', () => {
    it('should NOT have startFileWatchers method', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // startFileWatchers should NOT exist - story data comes from WheelHub only
      expect(provider.startFileWatchers).toBeUndefined();
    });

    it('should NOT have stopFileWatchers method', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // stopFileWatchers should NOT exist
      expect(provider.stopFileWatchers).toBeUndefined();
    });

    it('should NOT have sessionWatcher property', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No session watcher property
      expect((provider as any).sessionWatcher).toBeUndefined();
    });

    it('should NOT have parseSessionFile method', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // parseSessionFile should NOT exist - parsing done by Cyclist
      expect((provider as any).parseSessionFile).toBeUndefined();
    });

    it('should NOT have initialFileParse method', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // initialFileParse should NOT exist
      expect((provider as any).initialFileParse).toBeUndefined();
    });

    it('should NOT call startFileWatchers in extension.ts', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      // Verify startFileWatchers was NOT called
      // (The mock would track if any method with that name was called)
      const sidebarCalls = mockVscode.window.registerTreeDataProvider.mock.calls;
      expect(sidebarCalls.length).toBeGreaterThan(0);

      // The provider instance should not have startFileWatchers called
      // We can verify by checking that createFileSystemWatcher was not called
      // for session files pattern (*.session.md or *-session.md)
      // Note: .session/agents/* watcher for agent portraits is allowed per AC4
      const watcherCalls = mockVscode.workspace.createFileSystemWatcher.mock.calls;
      const sessionWatcherCall = watcherCalls.find((call: any[]) =>
        call[0]?.pattern?.includes('-session.md') ||
        call[0]?.pattern?.includes('*-session.md')
      );

      expect(sessionWatcherCall).toBeUndefined();
    });

    it('sidebar.ts should not contain "sessionWatcher" in source', async () => {
      // Read the actual source file and verify no session watcher code
      const sidebarPath = join(__dirname, '..', 'src', 'providers', 'sidebar.ts');

      if (existsSync(sidebarPath)) {
        const source = readFileSync(sidebarPath, 'utf-8');

        // These patterns should NOT be in the file after AC4 changes
        expect(source).not.toContain('sessionWatcher');
        expect(source).not.toContain('parseSessionFile');
        expect(source).not.toContain('initialFileParse');
        expect(source).not.toContain('.session/*-session.md');
      }
    });

    it('sidebar.ts should not contain file watcher imports for session', async () => {
      const sidebarPath = join(__dirname, '..', 'src', 'providers', 'sidebar.ts');

      if (existsSync(sidebarPath)) {
        const source = readFileSync(sidebarPath, 'utf-8');

        // Should not have file watcher specific to session files
        // (Config watcher for theme may still exist, but not session watcher)
        const sessionWatcherPattern = /createFileSystemWatcher.*\.session/;
        expect(source).not.toMatch(sessionWatcherPattern);
      }
    });
  });

  // ========================================================================
  // AC1: Sidebar displays story title from WheelHub
  // ========================================================================
  describe('AC1: Sidebar displays story title from WheelHub', () => {
    it('should have connectToWheelHub method for receiving story updates', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      expect(typeof provider.connectToWheelHub).toBe('function');
    });

    it('should update story when WheelHub broadcasts story data', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      // Connect provider to manager
      provider.connectToWheelHub(wsManager);

      // Simulate story broadcast from WheelHub
      wsManager.broadcastStats({
        story: {
          id: 'MSSCI-12237',
          title: 'Story Status Tree View',
          phase: 'test',
          branch: 'feat/58-1-story-status-tree-view',
          points: 2,
        },
      });

      // Verify story was received and tree updated
      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12237' || item.label?.includes('MSSCI-12237')
      );

      expect(storyItem).toBeDefined();
    });

    it('should display story title in tooltip', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: '58-1',
        title: 'Story Status Tree View',
        phase: 'test',
        branch: 'feat/58-1',
        points: 2,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === '58-1' || item.contextValue === 'story'
      );

      expect(storyItem?.tooltip).toContain('Story Status Tree View');
    });

    it('should subscribe to story listener in WebSocketManager', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      // Connect provider
      provider.connectToWheelHub(wsManager);

      // The provider should now receive story updates via the manager
      // Verify by checking if onStats callback was registered
      expect(wsManager['statsListeners'].size).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // AC2: "No active story" shown when no session file exists
  // ========================================================================
  describe('AC2: "No active story" shown when no session file exists', () => {
    it('should show "No active story" when story is null', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No story set - should show empty state
      const children = await provider.getChildren();
      const emptyStoryItem = children.find((item: any) =>
        item.label?.includes('No active story')
      );

      expect(emptyStoryItem).toBeDefined();
    });

    it('should show "No active story" after receiving null story from WheelHub', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      // First set a story
      provider.updateStory({
        id: 'TEST-001',
        title: 'Test Story',
        phase: 'dev',
        branch: 'test',
        points: 3,
      });

      // Verify story is shown
      let children = await provider.getChildren();
      let storyItem = children.find((item: any) => item.label === 'TEST-001');
      expect(storyItem).toBeDefined();

      // Now clear the story (simulating session file deletion)
      provider.updateStory(null as any);

      // Verify empty state is shown
      children = await provider.getChildren();
      const emptyItem = children.find((item: any) =>
        item.label?.includes('No active story')
      );
      expect(emptyItem).toBeDefined();
    });

    it('should clear story when WheelHub broadcasts null story data', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      provider.connectToWheelHub(wsManager);

      // Set initial story
      wsManager.broadcastStats({
        story: {
          id: 'TEST-001',
          title: 'Initial Story',
          phase: 'dev',
          branch: 'test',
          points: 3,
        },
      });

      // Now broadcast null story (session deleted)
      wsManager.broadcastStats({
        story: null,
      });

      const children = await provider.getChildren();
      const emptyItem = children.find((item: any) =>
        item.label?.includes('No active story')
      );
      expect(emptyItem).toBeDefined();
    });
  });

  // ========================================================================
  // Integration: WheelHub-only data flow
  // ========================================================================
  describe('Integration: WheelHub-only data flow', () => {
    it('should receive story updates exclusively through connectToWheelHub', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // The only way to get story data should be:
      // 1. Direct updateStory call (for backwards compatibility)
      // 2. connectToWheelHub subscription

      // Verify connectToWheelHub exists
      expect(typeof provider.connectToWheelHub).toBe('function');

      // Verify no file-based methods exist
      expect(provider.startFileWatchers).toBeUndefined();
      expect((provider as any).parseSessionFile).toBeUndefined();
    });

    it('should handle rapid story updates from WheelHub without issues', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      provider.connectToWheelHub(wsManager);

      // Rapid updates (simulating debounced file changes)
      for (let i = 0; i < 10; i++) {
        wsManager.broadcastStats({
          story: {
            id: `RAPID-${i}`,
            title: `Rapid Update ${i}`,
            phase: 'dev',
            branch: 'test',
            points: 3,
          },
        });
      }

      // Should have the last story
      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label?.includes('RAPID-9') || item.label === 'RAPID-9'
      );

      expect(storyItem).toBeDefined();
    });

    it('should fire onDidChangeTreeData when story updates via WheelHub', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.connectToWheelHub(wsManager);

      // Reset mock to ignore connection events
      mockListener.mockClear();

      // Broadcast story update
      wsManager.broadcastStats({
        story: {
          id: 'TEST-001',
          title: 'Test',
          phase: 'dev',
          branch: 'test',
          points: 2,
        },
      });

      expect(mockListener).toHaveBeenCalled();
    });
  });
});
