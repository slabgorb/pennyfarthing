/**
 * MSSCI-12238: Sprint Metrics Display
 *
 * Tests for VS Code sidebar sprint metrics display.
 * Verifies that the sidebar correctly displays:
 * - AC1: Remaining points from sprint YAML
 * - AC2: In-progress points (sum, not just count)
 * - AC3: Sprint end date with urgency indicator
 * - AC4: Updates when sprint YAML changes (via WheelHub)
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
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
  iconPath?: any;

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class MockThemeColor {
  constructor(public id: string) {}
}

const mockVscode = {
  ThemeColor: MockThemeColor,
  window: {
    createOutputChannel: vi.fn(() => mockOutputChannel),
    createStatusBarItem: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({
      dispose: vi.fn(),
      reveal: vi.fn(),
    })),
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
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
  RelativePattern: class {
    constructor(public base: any, public pattern: string) {}
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  chat: {
    createChatParticipant: vi.fn(() => ({
      dispose: vi.fn(),
      subCommands: [],
    })),
  },
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12238: Sprint Metrics Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Shows remaining points from sprint YAML (already working, verify)
  // ========================================================================
  describe('AC1: Shows remaining points', () => {
    it('should display remaining points in Sprint description', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
        inProgressPoints: 5, // NEW field
        endDate: '2026-02-02', // NEW field
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');

      expect(sprintItem).toBeDefined();
      // Remaining = 21 - 13 = 8
      expect(sprintItem.description).toBe('8/21 pts');
    });
  });

  // ========================================================================
  // AC2: Shows in-progress POINTS (not just count)
  // ========================================================================
  describe('AC2: Shows in-progress points', () => {
    it('should display in-progress points in child item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
        inProgressPoints: 5, // 2 stories worth 5 points total
        endDate: '2026-02-02',
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');
      const sprintChildren = await provider.getChildren(sprintItem);
      const inProgressItem = sprintChildren.find((item: any) =>
        item.label?.includes('In Progress')
      );

      expect(inProgressItem).toBeDefined();
      // Should show points AND count: "In Progress: 5 pts (2 stories)"
      expect(inProgressItem.label).toContain('5 pts');
      expect(inProgressItem.label).toContain('2 stories');
    });

    it('should show 0 pts when no in-progress stories', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 21,
        inProgressCount: 0,
        inProgressPoints: 0,
        endDate: '2026-02-02',
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');
      const sprintChildren = await provider.getChildren(sprintItem);
      const inProgressItem = sprintChildren.find((item: any) =>
        item.label?.includes('In Progress')
      );

      expect(inProgressItem).toBeDefined();
      expect(inProgressItem.label).toContain('0 pts');
    });

    it('should include inProgressPoints in SprintData interface', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // This should NOT throw - interface should accept inProgressPoints
      expect(() => {
        provider.updateSprint({
          totalPoints: 21,
          completedPoints: 13,
          inProgressCount: 2,
          inProgressPoints: 5,
          endDate: '2026-02-02',
        });
      }).not.toThrow();
    });
  });

  // ========================================================================
  // AC3: Shows sprint end date with urgency indicator
  // ========================================================================
  describe('AC3: Shows sprint end date', () => {
    it('should display end date in sprint children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
        inProgressPoints: 5,
        endDate: '2026-02-02',
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');
      const sprintChildren = await provider.getChildren(sprintItem);
      const endDateItem = sprintChildren.find(
        (item: any) =>
          item.label?.includes('Ends') || item.label?.includes('Feb')
      );

      expect(endDateItem).toBeDefined();
      expect(endDateItem.label).toContain('Feb 2'); // Human readable date
    });

    it('should show warning icon when sprint ends in < 3 days', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Calculate a date 2 days from now
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      const endDate = twoDaysFromNow.toISOString().split('T')[0];

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
        inProgressPoints: 5,
        endDate,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');
      const sprintChildren = await provider.getChildren(sprintItem);
      const endDateItem = sprintChildren.find(
        (item: any) =>
          item.label?.includes('Ends') || item.label?.includes('days')
      );

      expect(endDateItem).toBeDefined();
      // Should have warning color (yellow/orange)
      expect(endDateItem.iconPath?.color?.id).toMatch(/warning|yellow|orange/i);
    });

    it('should show critical icon when sprint ends in < 1 day', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Calculate a date later today
      const today = new Date();
      const endDate = today.toISOString().split('T')[0];

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
        inProgressPoints: 5,
        endDate,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');
      const sprintChildren = await provider.getChildren(sprintItem);
      const endDateItem = sprintChildren.find(
        (item: any) =>
          item.label?.includes('Ends') || item.label?.includes('Today')
      );

      expect(endDateItem).toBeDefined();
      // Should have error/critical color (red)
      expect(endDateItem.iconPath?.color?.id).toMatch(/error|red|critical/i);
    });

    it('should handle missing end date gracefully', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateSprint({
        totalPoints: 21,
        completedPoints: 13,
        inProgressCount: 2,
        inProgressPoints: 5,
        endDate: null,
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');
      const sprintChildren = await provider.getChildren(sprintItem);

      // Should still render sprint section without error
      expect(sprintItem).toBeDefined();
      expect(sprintChildren.length).toBeGreaterThan(0);
    });

    it('should include endDate in SprintData interface', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // This should NOT throw - interface should accept endDate
      expect(() => {
        provider.updateSprint({
          totalPoints: 21,
          completedPoints: 13,
          inProgressCount: 2,
          inProgressPoints: 5,
          endDate: '2026-02-02',
        });
      }).not.toThrow();
    });
  });

  // ========================================================================
  // AC4: Updates when sprint YAML changes (via WheelHub)
  // ========================================================================
  describe('AC4: Updates when sprint YAML changes', () => {
    it('should update sprint display when handleStatsUpdate receives new data', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      // Connect to WheelHub
      provider.connectToWheelHub(wsManager);

      // Broadcast initial sprint data
      wsManager.broadcastStats({
        sprint: {
          totalPoints: 21,
          completedPoints: 10,
          inProgressCount: 2,
          inProgressPoints: 5,
          endDate: '2026-02-02',
        },
      });

      let children = await provider.getChildren();
      let sprintItem = children.find((item: any) => item.label === 'Sprint');
      expect(sprintItem.description).toBe('11/21 pts'); // 21 - 10 = 11

      // Broadcast updated sprint data (simulating YAML change)
      wsManager.broadcastStats({
        sprint: {
          totalPoints: 21,
          completedPoints: 15, // More completed
          inProgressCount: 1,
          inProgressPoints: 3,
          endDate: '2026-02-02',
        },
      });

      children = await provider.getChildren();
      sprintItem = children.find((item: any) => item.label === 'Sprint');
      expect(sprintItem.description).toBe('6/21 pts'); // 21 - 15 = 6
    });

    it('should fire onDidChangeTreeData when sprint updates', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.connectToWheelHub(wsManager);
      mockListener.mockClear(); // Clear connection event

      // Broadcast sprint update
      wsManager.broadcastStats({
        sprint: {
          totalPoints: 21,
          completedPoints: 13,
          inProgressCount: 2,
          inProgressPoints: 5,
          endDate: '2026-02-02',
        },
      });

      expect(mockListener).toHaveBeenCalled();
    });

    it('should include inProgressPoints in StatsData.sprint', async () => {
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );

      const wsManager = new WebSocketManager();
      const receivedData: any[] = [];

      wsManager.onStats((data) => {
        receivedData.push(data);
      });

      // Broadcast with inProgressPoints
      wsManager.broadcastStats({
        sprint: {
          totalPoints: 21,
          completedPoints: 13,
          inProgressCount: 2,
          inProgressPoints: 5,
          endDate: '2026-02-02',
        },
      });

      expect(receivedData.length).toBe(1);
      expect(receivedData[0].sprint.inProgressPoints).toBe(5);
      expect(receivedData[0].sprint.endDate).toBe('2026-02-02');
    });
  });

  // ========================================================================
  // Integration: Full flow from WheelHub to display
  // ========================================================================
  describe('Integration: WheelHub to sidebar display', () => {
    it('should display all sprint metrics from WheelHub broadcast', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const { WebSocketManager } = await import(
        '../src/server/websocket-manager'
      );

      const provider = new sidebarModule.AgentStatusTreeDataProvider();
      const wsManager = new WebSocketManager();

      provider.connectToWheelHub(wsManager);

      // Broadcast complete sprint data
      wsManager.broadcastStats({
        sprint: {
          totalPoints: 154,
          completedPoints: 127,
          inProgressCount: 3,
          inProgressPoints: 6,
          endDate: '2026-02-02',
        },
      });

      const children = await provider.getChildren();
      const sprintItem = children.find((item: any) => item.label === 'Sprint');

      // Check main sprint item
      expect(sprintItem).toBeDefined();
      expect(sprintItem.description).toBe('27/154 pts'); // 154 - 127

      // Check children
      const sprintChildren = await provider.getChildren(sprintItem);

      // In Progress item
      const inProgressItem = sprintChildren.find((item: any) =>
        item.label?.includes('In Progress')
      );
      expect(inProgressItem).toBeDefined();
      expect(inProgressItem.label).toContain('6 pts');
      expect(inProgressItem.label).toContain('3 stories');

      // End date item
      const endDateItem = sprintChildren.find(
        (item: any) =>
          item.label?.includes('Ends') || item.label?.includes('Feb')
      );
      expect(endDateItem).toBeDefined();
    });
  });
});
