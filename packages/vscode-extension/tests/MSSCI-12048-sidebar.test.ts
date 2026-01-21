/**
 * MSSCI-12048: VS Code Sidebar Agent Status
 *
 * BDD-style tests implementing Gherkin scenarios from features/MSSCI-12048-sidebar.feature
 * Tests are written to FAIL until Dev implements the sidebar provider.
 *
 * Acceptance Criteria:
 * - AC1: Sidebar panel appears in VS Code activity bar when extension active
 * - AC2: Agent section shows current agent name and persona character
 * - AC3: Sprint section shows points remaining and in-progress story count
 * - AC4: Story section shows active story ID, title, phase, and branch
 * - AC5: Quick actions provide commands to switch agent and view backlog
 * - AC6: Data updates in real-time via WheelHub WebSocket
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

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

// TreeItemCollapsibleState enum mock
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

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// Mock ChatParticipant for extension activation
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

const mockVscode = {
  chat: {
    createChatParticipant: vi.fn(
      (id: string, handler: any) => new MockChatParticipant(id, handler)
    ),
  },
  window: {
    createOutputChannel: vi.fn(() => mockOutputChannel),
    activeTerminal: { sendText: vi.fn(), show: vi.fn() },
    terminals: [{ sendText: vi.fn(), show: vi.fn() }],
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({
      dispose: vi.fn(),
      reveal: vi.fn(),
      onDidExpandElement: vi.fn(),
      onDidCollapseElement: vi.fn(),
    })),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [mockWorkspaceFolder],
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
  ThemeColor: class {
    constructor(public id: string) {}
  },
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

// Mock WebSocket for real-time updates
class MockWebSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
}

describe('MSSCI-12048: VS Code Sidebar Agent Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.subscriptions = [];
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Sidebar panel appears in VS Code activity bar when extension active
  // ========================================================================
  describe('AC1: Sidebar panel appears in activity bar', () => {
    it('should have providers/sidebar.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const sidebarPath = join(__dirname, '..', 'src', 'providers', 'sidebar.ts');
      expect(existsSync(sidebarPath)).toBe(true);
    });

    it('should export AgentStatusTreeDataProvider class', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      expect(sidebarModule.AgentStatusTreeDataProvider).toBeDefined();
    });

    it('should implement TreeDataProvider interface', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      expect(typeof provider.getTreeItem).toBe('function');
      expect(typeof provider.getChildren).toBe('function');
      expect(provider.onDidChangeTreeData).toBeDefined();
    });

    it('should register tree view with id "pennyfarthing.agentStatus"', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.window.registerTreeDataProvider).toHaveBeenCalledWith(
        'pennyfarthing.agentStatus',
        expect.any(Object)
      );
    });

    it('should show empty state message when no agent active', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No data set - should return empty state
      const children = await provider.getChildren();
      const emptyItem = children.find((item: any) =>
        item.label?.includes('No agent active')
      );
      expect(emptyItem).toBeDefined();
    });
  });

  // ========================================================================
  // AC2: Agent section shows current agent name and persona character
  // ========================================================================
  describe('AC2: Agent section shows persona information', () => {
    it('should display agent tree item with character name as label', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({
        character: 'Tyrion Lannister',
        theme: 'game-of-thrones',
        role: 'dev',
      });

      const children = await provider.getChildren();
      const agentItem = children.find((item: any) =>
        item.label?.includes('Agent')
      );

      expect(agentItem).toBeDefined();
      expect(agentItem.label).toContain('Tyrion Lannister');
    });

    it('should display role as description in uppercase', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({
        character: 'Tyrion Lannister',
        theme: 'game-of-thrones',
        role: 'dev',
      });

      const children = await provider.getChildren();
      const agentItem = children.find((item: any) =>
        item.label?.includes('Agent')
      );

      expect(agentItem.description).toBe('DEV');
    });

    it('should set contextValue to "agent" for context menu targeting', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({
        character: 'Tyrion Lannister',
        theme: 'game-of-thrones',
        role: 'dev',
      });

      const children = await provider.getChildren();
      const agentItem = children.find((item: any) =>
        item.label?.includes('Agent')
      );

      expect(agentItem.contextValue).toBe('agent');
    });

    it('should show context percentage as child item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      provider.updateContext({ usablePercent: 45 });

      const agentItem = (await provider.getChildren()).find((item: any) =>
        item.label?.includes('Agent')
      );
      const agentChildren = await provider.getChildren(agentItem);
      const contextItem = agentChildren.find((item: any) =>
        item.label?.includes('Context')
      );

      expect(contextItem).toBeDefined();
      expect(contextItem.label).toContain('45%');
    });

    it('should use green indicator for context < 50%', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      provider.updateContext({ usablePercent: 45 });

      const agentItem = (await provider.getChildren()).find((item: any) =>
        item.label?.includes('Agent')
      );
      const agentChildren = await provider.getChildren(agentItem);
      const contextItem = agentChildren.find((item: any) =>
        item.label?.includes('Context')
      );

      // Icon should indicate safe level (green color via ThemeColor)
      expect(contextItem.iconPath).toBeDefined();
      expect(contextItem.iconPath.id).toBe('circle-filled');
      expect(contextItem.iconPath.color.id).toBe('charts.green');
    });

    it('should use yellow indicator for context 50-69%', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      provider.updateContext({ usablePercent: 55 });

      const agentItem = (await provider.getChildren()).find((item: any) =>
        item.label?.includes('Agent')
      );
      const agentChildren = await provider.getChildren(agentItem);
      const contextItem = agentChildren.find((item: any) =>
        item.label?.includes('Context')
      );

      expect(contextItem.iconPath.color.id).toBe('charts.yellow');
    });

    it('should use orange indicator for context 70-84%', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      provider.updateContext({ usablePercent: 72 });

      const agentItem = (await provider.getChildren()).find((item: any) =>
        item.label?.includes('Agent')
      );
      const agentChildren = await provider.getChildren(agentItem);
      const contextItem = agentChildren.find((item: any) =>
        item.label?.includes('Context')
      );

      expect(contextItem.iconPath.color.id).toBe('charts.orange');
    });

    it('should use red indicator for context >= 85%', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      provider.updateContext({ usablePercent: 87 });

      const agentItem = (await provider.getChildren()).find((item: any) =>
        item.label?.includes('Agent')
      );
      const agentChildren = await provider.getChildren(agentItem);
      const contextItem = agentChildren.find((item: any) =>
        item.label?.includes('Context')
      );

      expect(contextItem.iconPath.color.id).toBe('charts.red');
    });
  });

  // ========================================================================
  // AC3: Sprint section shows points remaining and in-progress story count
  // ========================================================================
  describe('AC3: Sprint section shows points and in-progress count', () => {
    it('should display Sprint tree item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) =>
        item.label === 'Sprint'
      );

      expect(sprintItem).toBeDefined();
    });

    it('should show remaining/total points as description', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) =>
        item.label === 'Sprint'
      );

      expect(sprintItem.description).toBe('8/21 pts');
    });

    it('should set contextValue to "sprint"', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) =>
        item.label === 'Sprint'
      );

      expect(sprintItem.contextValue).toBe('sprint');
    });

    it('should show in-progress count as child item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) =>
        item.label === 'Sprint'
      );
      const sprintChildren = await provider.getChildren(sprintItem);
      const inProgressItem = sprintChildren.find((item: any) =>
        item.label?.includes('In Progress')
      );

      expect(inProgressItem).toBeDefined();
      expect(inProgressItem.label).toContain('2 stories');
    });

    it('should show "No active sprint" when no sprint data', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No sprint data set
      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) =>
        item.label?.includes('No active sprint') || item.label === 'Sprint'
      );

      // Either no sprint item, or it shows empty message
      if (sprintItem && sprintItem.label === 'Sprint') {
        const sprintChildren = await provider.getChildren(sprintItem);
        expect(sprintChildren[0]?.label).toContain('No active sprint');
      }
    });
  });

  // ========================================================================
  // AC4: Story section shows active story ID, title, phase, and branch
  // ========================================================================
  describe('AC4: Story section shows active story details', () => {
    it('should display story ID as tree item label', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: 'MSSCI-12048',
        title: 'Sidebar panel with agent status',
        phase: 'bdd',
        branch: 'feat/MSSCI-12048-vscode-sidebar',
        points: 3,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12048'
      );

      expect(storyItem).toBeDefined();
    });

    it('should show phase and points as description', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: 'MSSCI-12048',
        title: 'Sidebar panel with agent status',
        phase: 'bdd',
        branch: 'feat/MSSCI-12048-vscode-sidebar',
        points: 3,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12048'
      );

      expect(storyItem.description).toBe('bdd • 3 pts');
    });

    it('should include title in tooltip', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: 'MSSCI-12048',
        title: 'Sidebar panel with agent status',
        phase: 'bdd',
        branch: 'feat/MSSCI-12048-vscode-sidebar',
        points: 3,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12048'
      );

      expect(storyItem.tooltip).toContain('Sidebar panel with agent status');
    });

    it('should set contextValue to "story"', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: 'MSSCI-12048',
        title: 'Sidebar panel with agent status',
        phase: 'bdd',
        branch: 'feat/MSSCI-12048-vscode-sidebar',
        points: 3,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12048'
      );

      expect(storyItem.contextValue).toBe('story');
    });

    it('should have command to open Jira on click', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: 'MSSCI-12048',
        title: 'Sidebar panel with agent status',
        phase: 'bdd',
        branch: 'feat/MSSCI-12048-vscode-sidebar',
        points: 3,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12048'
      );

      expect(storyItem.command).toEqual({
        command: 'pennyfarthing.openJira',
        arguments: ['MSSCI-12048'],
        title: 'Open in Jira',
      });
    });

    it('should show empty state when no active story', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No story data set
      const children = await provider.getChildren();
      const emptyStoryItem = children.find((item: any) =>
        item.label?.includes('No active story')
      );

      expect(emptyStoryItem).toBeDefined();
    });
  });

  // ========================================================================
  // AC5: Quick actions provide commands to switch agent and view backlog
  // ========================================================================
  describe('AC5: Quick actions section', () => {
    it('should display Quick Actions section', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const actionsItem = children.find((item: any) =>
        item.label === 'Quick Actions'
      );

      expect(actionsItem).toBeDefined();
    });

    it('should include Switch Agent action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const actionsItem = children.find((item: any) =>
        item.label === 'Quick Actions'
      );
      const actionChildren = await provider.getChildren(actionsItem);
      const switchItem = actionChildren.find((item: any) =>
        item.label === 'Switch Agent'
      );

      expect(switchItem).toBeDefined();
      expect(switchItem.command?.command).toBe('pennyfarthing.switchAgent');
    });

    it('should include View Backlog action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const actionsItem = children.find((item: any) =>
        item.label === 'Quick Actions'
      );
      const actionChildren = await provider.getChildren(actionsItem);
      const backlogItem = actionChildren.find((item: any) =>
        item.label === 'View Backlog'
      );

      expect(backlogItem).toBeDefined();
      expect(backlogItem.command?.command).toBe('pennyfarthing.viewBacklog');
    });

    it('should include Start Work action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const actionsItem = children.find((item: any) =>
        item.label === 'Quick Actions'
      );
      const actionChildren = await provider.getChildren(actionsItem);
      const startItem = actionChildren.find((item: any) =>
        item.label === 'Start Work'
      );

      expect(startItem).toBeDefined();
      expect(startItem.command?.command).toBe('pennyfarthing.startWork');
    });

    it('should include Refresh action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const actionsItem = children.find((item: any) =>
        item.label === 'Quick Actions'
      );
      const actionChildren = await provider.getChildren(actionsItem);
      const refreshItem = actionChildren.find((item: any) =>
        item.label === 'Refresh'
      );

      expect(refreshItem).toBeDefined();
      expect(refreshItem.command?.command).toBe('pennyfarthing.refresh');
    });

    it('should register switchAgent command showing quick pick', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'pennyfarthing.switchAgent',
        expect.any(Function)
      );
    });

    it('should register viewBacklog command', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'pennyfarthing.viewBacklog',
        expect.any(Function)
      );
    });

    it('should register refresh command', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'pennyfarthing.refresh',
        expect.any(Function)
      );
    });

    it('should register openJira command', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'pennyfarthing.openJira',
        expect.any(Function)
      );
    });
  });

  // ========================================================================
  // AC6: Data updates in real-time via WheelHub WebSocket
  // ========================================================================
  describe('AC6: Real-time updates via WebSocket', () => {
    it('should fire onDidChangeTreeData when persona updates', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.updatePersona({
        character: 'Tyrion Lannister',
        role: 'dev',
        theme: 'game-of-thrones',
      });

      expect(mockListener).toHaveBeenCalled();
    });

    it('should fire onDidChangeTreeData when context updates', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.updateContext({ usablePercent: 55 });

      expect(mockListener).toHaveBeenCalled();
    });

    it('should fire onDidChangeTreeData when story updates', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.updateStory({
        id: 'MSSCI-12048',
        phase: 'impl',
        title: 'Test',
        branch: 'test',
        points: 3,
      });

      expect(mockListener).toHaveBeenCalled();
    });

    it('should fire onDidChangeTreeData when sprint updates', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 15,
        inProgressCount: 1,
      });

      expect(mockListener).toHaveBeenCalled();
    });

    it('should connect to WheelHub /ws/stats channel', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Provider should have method to connect to WheelHub
      expect(typeof provider.connectToWheelHub).toBe('function');
    });

    it('should receive stats updates when connected to WebSocketManager', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      // Connect provider to manager
      provider.connectToWheelHub(wsManager);

      // Simulate stats broadcast
      wsManager.broadcastStats({
        persona: { character: 'Tyrion Lannister', role: 'dev', theme: 'game-of-thrones' },
        context: { usablePercent: 45 },
      });

      // Verify data was received
      const children = await provider.getChildren();
      const agentItem = children.find((item: any) => item.label?.includes('Agent'));
      expect(agentItem).toBeDefined();
      expect(agentItem.label).toContain('Tyrion Lannister');
    });

    it('should cleanup subscription on dispose', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import('../src/server/websocket-manager');

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      // Connect provider to manager
      provider.connectToWheelHub(wsManager);

      // Dispose provider
      provider.dispose();

      // Broadcast should not cause errors after dispose
      expect(() => {
        wsManager.broadcastStats({
          persona: { character: 'Test', role: 'dev', theme: 'test' },
        });
      }).not.toThrow();
    });

    it('should handle WebSocket disconnection gracefully', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.handleDisconnect();

      const children = await provider.getChildren();
      const connectingItem = children.find((item: any) =>
        item.label?.includes('Connecting')
      );

      expect(connectingItem).toBeDefined();
    });

    it('should attempt reconnection on disconnect', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const reconnectSpy = vi.spyOn(provider, 'attemptReconnect');
      provider.handleDisconnect();

      expect(reconnectSpy).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Accessibility tests
  // ========================================================================
  describe('Accessibility', () => {
    it('should provide accessible label for agent item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updatePersona({
        character: 'Tyrion Lannister',
        role: 'dev',
        theme: 'game-of-thrones',
      });
      provider.updateContext({ usablePercent: 45 });

      const children = await provider.getChildren();
      const agentItem = children.find((item: any) =>
        item.label?.includes('Agent')
      );

      expect(agentItem.accessibilityInformation?.label).toContain(
        'Agent Tyrion Lannister'
      );
      expect(agentItem.accessibilityInformation?.label).toContain(
        'Developer'
      );
      expect(agentItem.accessibilityInformation?.label).toContain(
        '45 percent'
      );
    });

    it('should provide accessible label for sprint item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) =>
        item.label === 'Sprint'
      );

      expect(sprintItem.accessibilityInformation?.label).toContain(
        '8 of 21 points remaining'
      );
      expect(sprintItem.accessibilityInformation?.label).toContain(
        '2 stories in progress'
      );
    });

    it('should provide accessible label for story item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateStory({
        id: 'MSSCI-12048',
        title: 'Sidebar panel with agent status',
        phase: 'bdd',
        branch: 'feat/MSSCI-12048-vscode-sidebar',
        points: 3,
      });

      const children = await provider.getChildren();
      const storyItem = children.find((item: any) =>
        item.label === 'MSSCI-12048'
      );

      expect(storyItem.accessibilityInformation?.label).toContain(
        'Story MSSCI-12048'
      );
      expect(storyItem.accessibilityInformation?.label).toContain(
        'Sidebar panel with agent status'
      );
      expect(storyItem.accessibilityInformation?.label).toContain(
        'phase BDD'
      );
      expect(storyItem.accessibilityInformation?.label).toContain(
        '3 points'
      );
    });
  });
});
