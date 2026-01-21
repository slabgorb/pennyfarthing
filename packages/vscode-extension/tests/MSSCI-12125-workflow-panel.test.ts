/**
 * MSSCI-12125: Workflow panel with status/progress
 *
 * BDD-style tests for sidebar Workflow section with direct file watching.
 * Tests are written to FAIL until Dev implements the feature.
 *
 * Acceptance Criteria:
 * - AC1: Sidebar displays "Workflow" section when a workflow is active
 * - AC2: Shows workflow name and type (phased/stepped) with appropriate icon
 * - AC3: Displays current step/phase number with visual progress indicator
 * - AC4: Shows completed steps count vs total steps (e.g., "3/7 steps")
 * - AC5: Progress percentage displayed (completion %)
 * - AC6: Quick action: "Resume" to continue paused workflow
 * - AC7: Quick action: "Abandon" to cancel current workflow
 * - AC8: Quick action: "View Details" to show full workflow state
 * - AC9: Updates in real-time when workflow state changes (via file watcher)
 * - AC10: Gracefully handles missing/no workflow state (hides section)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock skill-parser module BEFORE vscode to ensure import order
const mockSkills: unknown[] = [];
const mockSkillsByCategory = new Map<string, unknown[]>();

vi.mock('../src/commands/skill-parser', () => ({
  parseSkillRegistry: vi.fn(() => mockSkills),
  groupSkillsByCategory: vi.fn(() => mockSkillsByCategory),
}));

// Mock context for extension activation
const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  workspaceState: { get: vi.fn(), update: vi.fn() },
  globalState: { get: vi.fn().mockReturnValue(true), update: vi.fn() },
  extensionPath: '/mock/extension/path',
  extensionUri: { fsPath: '/mock/extension/path' },
};

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

// TreeItemCollapsibleState enum mock
const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

class MockTreeItem {
  label: string;
  description?: string;
  tooltip?: string | { value: string; isTrusted?: boolean };
  contextValue?: string;
  collapsibleState?: number;
  command?: { command: string; arguments?: unknown[]; title: string };
  iconPath?: { id: string; color?: { id: string } };
  accessibilityInformation?: { label: string };

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// Mock FileSystemWatcher
const mockFileSystemWatcher = {
  onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
  onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
  dispose: vi.fn(),
};

const mockVscode = {
  window: {
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn(), show: vi.fn() })),
    activeTerminal: { sendText: vi.fn(), show: vi.fn() },
    terminals: [{ sendText: vi.fn(), show: vi.fn() }],
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({
      dispose: vi.fn(),
      reveal: vi.fn(),
    })),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock-workspace', index: 0 }],
    createFileSystemWatcher: vi.fn(() => mockFileSystemWatcher),
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
    joinPath: vi.fn((base: { fsPath: string }, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join('/'),
      scheme: 'file',
    })),
  },
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState,
  EventEmitter: MockEventEmitter,
  ThemeIcon: class {
    constructor(public id: string, public color?: { id: string }) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  RelativePattern: class {
    constructor(public base: unknown, public pattern: string) {}
  },
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

// Mock workflow data for testing
const mockWorkflowState = {
  name: 'architecture',
  type: 'stepped' as const,
  mode: 'create' as const,
  started: '2026-01-21T10:00:00.000Z',
  lastUpdated: '2026-01-21T10:30:00.000Z',
  currentStep: 3,
  stepsCompleted: [1, 2],
  totalSteps: 7,
  status: 'in_progress' as const,
};

const mockPhasedWorkflowState = {
  name: 'tdd',
  type: 'phased' as const,
  started: '2026-01-21T10:00:00.000Z',
  lastUpdated: '2026-01-21T10:30:00.000Z',
  currentStep: 2,
  stepsCompleted: [1],
  totalSteps: 5,
  status: 'in_progress' as const,
  phaseName: 'red',
};

describe('MSSCI-12125: Workflow panel with status/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Sidebar displays "Workflow" section when a workflow is active
  // ========================================================================
  describe('AC1: Workflow section visibility', () => {
    it('should include Workflow section in root children when workflow is active', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Update with workflow data
      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem).toBeDefined();
    });

    it('should NOT show Workflow section when no workflow is active', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No updateWorkflow called - no active workflow
      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem).toBeUndefined();
    });

    it('should have Workflow section expanded by default', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem?.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
    });

    it('should set itemType to "workflow" for routing', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect((workflowItem as any).itemType).toBe('workflow');
    });
  });

  // ========================================================================
  // AC2: Shows workflow name and type (phased/stepped) with appropriate icon
  // ========================================================================
  describe('AC2: Workflow name and type display', () => {
    it('should display workflow name in description', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem?.description).toContain('architecture');
    });

    it('should show workflow type (stepped) as child item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const typeItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Type')
      );

      expect(typeItem).toBeDefined();
      expect(typeItem?.label).toContain('stepped');
    });

    it('should show workflow type (phased) for phased workflows', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockPhasedWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const typeItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Type')
      );

      expect(typeItem?.label).toContain('phased');
    });

    it('should use appropriate icon for stepped workflow', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      // Stepped workflows use list-ordered icon
      expect(workflowItem?.iconPath?.id).toBe('list-ordered');
    });

    it('should use appropriate icon for phased workflow', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockPhasedWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      // Phased workflows use git-compare icon (circular flow)
      expect(workflowItem?.iconPath?.id).toBe('git-compare');
    });
  });

  // ========================================================================
  // AC3: Displays current step/phase number with visual progress indicator
  // ========================================================================
  describe('AC3: Current step/phase display', () => {
    it('should show current step for stepped workflows', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const currentItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Current')
      );

      expect(currentItem).toBeDefined();
      expect(currentItem?.label).toContain('Step 3');
    });

    it('should show current phase for phased workflows', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockPhasedWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const currentItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Phase')
      );

      expect(currentItem).toBeDefined();
      expect(currentItem?.label).toContain('red');
    });

    it('should use sync~spin icon for in-progress workflow', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const currentItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Current') || (item.label as string).includes('Step')
      );

      expect(currentItem?.iconPath?.id).toBe('sync~spin');
    });
  });

  // ========================================================================
  // AC4: Shows completed steps count vs total steps (e.g., "3/7 steps")
  // ========================================================================
  describe('AC4: Progress count display', () => {
    it('should show completed/total steps in progress child item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const progressItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Progress')
      );

      expect(progressItem).toBeDefined();
      expect(progressItem?.label).toMatch(/2\/7\s+steps/); // 2 completed of 7 total
    });

    it('should format progress correctly for phased workflows', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockPhasedWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const progressItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Progress')
      );

      expect(progressItem?.label).toMatch(/1\/5\s+phases/); // 1 completed of 5 total
    });
  });

  // ========================================================================
  // AC5: Progress percentage displayed (completion %)
  // ========================================================================
  describe('AC5: Progress percentage', () => {
    it('should display completion percentage', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const progressItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Progress')
      );

      // 2/7 = 28.57% → should show as 28% or 29%
      expect(progressItem?.description).toMatch(/\d+%/);
    });

    it('should calculate percentage correctly', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // 2 of 7 steps = 28.57%
      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const progressItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Progress')
      );

      // Should be ~29% (rounded)
      expect(progressItem?.description).toMatch(/2[89]%/);
    });

    it('should show 0% for no completed steps', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow({
        ...mockWorkflowState,
        stepsCompleted: [],
        currentStep: 1,
      });

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const progressItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Progress')
      );

      expect(progressItem?.description).toMatch(/0%/);
    });
  });

  // ========================================================================
  // AC6: Quick action: "Resume" to continue paused workflow
  // ========================================================================
  describe('AC6: Resume action', () => {
    it('should show Resume action in workflow children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const resumeItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Resume')
      );

      expect(resumeItem).toBeDefined();
    });

    it('should have command to invoke resume on Resume action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const resumeItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Resume')
      );

      expect(resumeItem?.command).toBeDefined();
      expect(resumeItem?.command?.command).toBe('pennyfarthing.resumeWorkflow');
    });

    it('should use play icon for Resume action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const resumeItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Resume')
      );

      expect(resumeItem?.iconPath?.id).toBe('play');
    });
  });

  // ========================================================================
  // AC7: Quick action: "Abandon" to cancel current workflow
  // ========================================================================
  describe('AC7: Abandon action', () => {
    it('should show Abandon action in workflow children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const abandonItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Abandon')
      );

      expect(abandonItem).toBeDefined();
    });

    it('should have command to invoke abandon on Abandon action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const abandonItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Abandon')
      );

      expect(abandonItem?.command).toBeDefined();
      expect(abandonItem?.command?.command).toBe('pennyfarthing.abandonWorkflow');
    });

    it('should use close icon for Abandon action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const abandonItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Abandon')
      );

      expect(abandonItem?.iconPath?.id).toBe('close');
    });
  });

  // ========================================================================
  // AC8: Quick action: "View Details" to show full workflow state
  // ========================================================================
  describe('AC8: View Details action', () => {
    it('should show View Details action in workflow children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const detailsItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Details')
      );

      expect(detailsItem).toBeDefined();
    });

    it('should have command to show workflow details', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const detailsItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Details')
      );

      expect(detailsItem?.command).toBeDefined();
      expect(detailsItem?.command?.command).toBe('pennyfarthing.viewWorkflowDetails');
    });

    it('should use info icon for View Details action', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const detailsItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Details')
      );

      expect(detailsItem?.iconPath?.id).toBe('info');
    });
  });

  // ========================================================================
  // AC9: Updates in real-time when workflow state changes (via file watcher)
  // ========================================================================
  describe('AC9: Real-time updates via file watcher', () => {
    it('should fire onDidChangeTreeData when workflow is updated', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const mockListener = vi.fn();
      provider.onDidChangeTreeData(mockListener);

      provider.updateWorkflow(mockWorkflowState);

      expect(mockListener).toHaveBeenCalled();
    });

    it('should update tree when workflow data changes', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Initial state
      provider.updateWorkflow(mockWorkflowState);
      let children = await provider.getChildren();
      let workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );
      expect(workflowItem?.description).toContain('architecture');

      // Update to different workflow
      provider.updateWorkflow({
        ...mockWorkflowState,
        name: 'prd',
        currentStep: 5,
      });

      children = await provider.getChildren();
      workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );
      expect(workflowItem?.description).toContain('prd');
    });

    it('should have updateWorkflow method on provider', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      expect(typeof provider.updateWorkflow).toBe('function');
    });

    it('should clear workflow when updateWorkflow called with null', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Set workflow
      provider.updateWorkflow(mockWorkflowState);
      let children = await provider.getChildren();
      let workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );
      expect(workflowItem).toBeDefined();

      // Clear workflow
      provider.updateWorkflow(null);

      children = await provider.getChildren();
      workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );
      expect(workflowItem).toBeUndefined();
    });
  });

  // ========================================================================
  // AC10: Gracefully handles missing/no workflow state (hides section)
  // ========================================================================
  describe('AC10: Graceful handling of missing workflow state', () => {
    it('should not show Workflow section when workflow is null', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // No workflow set
      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem).toBeUndefined();
    });

    it('should not show Workflow section when workflow is undefined', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(undefined as any);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem).toBeUndefined();
    });

    it('should hide Workflow section after workflow is cleared', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Set then clear
      provider.updateWorkflow(mockWorkflowState);
      provider.updateWorkflow(null);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem).toBeUndefined();
    });

    it('should not crash when getChildren called on workflow with no data', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Create a mock workflow item without data
      const mockWorkflowItem = new MockTreeItem('Workflow', TreeItemCollapsibleState.Expanded);
      (mockWorkflowItem as any).itemType = 'workflow';

      // Should return empty array, not throw
      const workflowChildren = await provider.getChildren(mockWorkflowItem as any);
      expect(workflowChildren).toEqual([]);
    });
  });

  // ========================================================================
  // Integration tests - TreeDataProvider routing
  // ========================================================================
  describe('TreeDataProvider routing for workflow items', () => {
    it('should route workflow itemType to getWorkflowChildren', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      // Should return workflow detail items
      const workflowChildren = await provider.getChildren(workflowItem);
      expect(workflowChildren.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Sidebar ordering tests
  // ========================================================================
  describe('Section ordering in sidebar', () => {
    it('should show Workflow section after Story section', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Set up data
      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });
      provider.updateStory({ id: 'TEST-1', title: 'Test', phase: 'red', branch: 'test', points: 3 });
      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const labels = children.map((item: MockTreeItem) => item.label);

      const storyIndex = labels.findIndex((l: string) => l === 'TEST-1');
      const workflowIndex = labels.findIndex((l: string) => l === 'Workflow');

      // Workflow should come after Story
      expect(workflowIndex).toBeGreaterThan(storyIndex);
    });

    it('should show Workflow section before Quick Actions', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const labels = children.map((item: MockTreeItem) => item.label);

      const workflowIndex = labels.findIndex((l: string) => l === 'Workflow');
      const actionsIndex = labels.findIndex((l: string) => l === 'Quick Actions');

      // Workflow should come before Quick Actions
      expect(workflowIndex).toBeLessThan(actionsIndex);
    });
  });

  // ========================================================================
  // Accessibility tests
  // ========================================================================
  describe('Accessibility', () => {
    it('should have accessible label on Workflow section', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      expect(workflowItem?.accessibilityInformation?.label).toContain('architecture');
      expect(workflowItem?.accessibilityInformation?.label).toContain('stepped');
    });

    it('should have accessible label on progress item', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      provider.updateWorkflow(mockWorkflowState);

      const children = await provider.getChildren();
      const workflowItem = children.find(
        (item: MockTreeItem) => item.label === 'Workflow'
      );

      const workflowChildren = await provider.getChildren(workflowItem);
      const progressItem = workflowChildren.find(
        (item: MockTreeItem) => (item.label as string).includes('Progress')
      );

      expect(progressItem?.accessibilityInformation?.label).toMatch(/\d+.*steps.*completed/i);
    });
  });
});
