/**
 * MSSCI-14188: Split Progress Panel Tests
 *
 * Tests for splitting ProgressPanel into three independent Dockview panels:
 * - WorkflowPanel: BikeLane phase visualization
 * - ACPanel: Acceptance criteria checklist
 * - TodoPanel: Task list with progress
 *
 * Story: MSSCI-14188 - Split Progress panel into Workflow, AC, and Todo panels
 * Epic: epic-76 (Dockview Panel Migration)
 *
 * Acceptance Criteria:
 * - AC1: WorkflowPanel shows BikeLane phase visualization
 * - AC2: ACPanel shows acceptance criteria checklist with check/uncheck
 * - AC3: TodoPanel shows task list with progress bar
 * - AC4: All three panels independently positionable in Dockview
 * - AC5: Layout persistence handles migration from old Progress panel
 * - AC6: No functionality regression from current ProgressPanel
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';

// Extend expect with jest-dom matchers (ensure they're available in this test file)
expect.extend(matchers);

// ============================================================================
// New Panel IDs - Must match implementation
// ============================================================================

const NEW_PANEL_IDS = {
  WORKFLOW: 'workflow',
  AC: 'ac',
  TODO: 'todo',
} as const;

// Old panel ID being replaced
const OLD_PROGRESS_PANEL = 'progress';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock useStory hook
const mockStoryData = {
  story: {
    workflow: 'tdd',
    workflowPhases: [
      { name: 'setup', label: 'Setup', status: 'done' as const },
      { name: 'red', label: 'Red', status: 'current' as const },
      { name: 'green', label: 'Green', status: 'pending' as const },
      { name: 'refactor', label: 'Refactor', status: 'pending' as const },
    ],
    criteria: [
      { text: 'First criterion', completed: true },
      { text: 'Second criterion', completed: false },
      { text: 'Third criterion', completed: false },
    ],
  },
  isLoading: false,
  error: null,
};

vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => mockStoryData),
}));

vi.mock('../src/public/contexts/ClaudeContext', () => ({
  useClaudeContext: vi.fn(() => ({ send: vi.fn(), isConnected: true })),
}));

// Mock useTodos hook
const mockTodosData = {
  todos: [
    { id: '1', content: 'Write tests', status: 'completed' as const, activeForm: 'Writing tests' },
    { id: '2', content: 'Implement feature', status: 'in_progress' as const, activeForm: 'Implementing feature' },
    { id: '3', content: 'Review code', status: 'pending' as const, activeForm: 'Reviewing code' },
  ],
  isLoading: false,
  error: null,
};

vi.mock('../src/public/hooks/useTodos', () => ({
  useTodos: vi.fn(() => mockTodosData),
  TodoItem: {} as any,
}));

// Mock electron API for layout persistence
const mockElectronAPI = {
  layout: {
    get: vi.fn(() => Promise.resolve(null)),
    save: vi.fn(() => Promise.resolve({ success: true })),
    onUpdate: vi.fn(),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  delete (window as any).electronAPI;
});

// ============================================================================
// AC1: WorkflowPanel shows BikeLane phase visualization
// ============================================================================

describe('AC1: WorkflowPanel shows BikeLane phase visualization', () => {
  it('should export WorkflowPanel component', async () => {
    // This test will fail until WorkflowPanel.tsx exists
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    expect(WorkflowPanel).toBeDefined();
  });

  it('should render workflow type badge (TDD/BDD/Trivial)', async () => {
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    const badge = screen.getByText('TDD');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[data-workflow-type]')).toHaveAttribute('data-workflow-type', 'tdd');
  });

  it('should render phase steps with correct status icons', async () => {
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Done phase should show checkmark
    expect(screen.getByText('Setup').closest('.phase-step')).toHaveClass('done');
    // Current phase should show filled circle
    expect(screen.getByText('Red').closest('.phase-step')).toHaveClass('current');
    // Pending phases should show empty circle
    expect(screen.getByText('Green').closest('.phase-step')).toHaveClass('pending');
  });

  it('should show placeholder when no workflow active', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    vi.mocked(useStory).mockReturnValueOnce({
      story: null,
      isLoading: false,
      error: null,
    });

    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByText('No active workflow')).toBeInTheDocument();
  });

  it('should have data-testid for integration testing', async () => {
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByTestId('workflow-panel')).toBeInTheDocument();
  });
});

// ============================================================================
// AC2: ACPanel shows acceptance criteria checklist with check/uncheck
// ============================================================================

describe('AC2: ACPanel shows acceptance criteria checklist with check/uncheck', () => {
  it('should export ACPanel component', async () => {
    // This test will fail until ACPanel.tsx exists
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    expect(ACPanel).toBeDefined();
  });

  it('should render all acceptance criteria items', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    expect(screen.getByText('First criterion')).toBeInTheDocument();
    expect(screen.getByText('Second criterion')).toBeInTheDocument();
    expect(screen.getByText('Third criterion')).toBeInTheDocument();
  });

  it('should show completed criteria with checkmark icon', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    const completedItem = screen.getByText('First criterion').closest('.ac-item');
    expect(completedItem).toHaveClass('ac-done');
  });

  it('should render progress bar showing completion ratio', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    // 1 of 3 completed = "1/3"
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('should show placeholder when no acceptance criteria', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    vi.mocked(useStory).mockReturnValueOnce({
      story: { ...mockStoryData.story, criteria: [] },
      isLoading: false,
      error: null,
    });

    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    expect(screen.getByText('No acceptance criteria')).toBeInTheDocument();
  });
});

// ============================================================================
// AC3: TodoPanel shows task list with progress bar
// ============================================================================

describe('AC3: TodoPanel shows task list with progress bar', () => {
  it('should export TodoPanel component', async () => {
    // This test will fail until TodoPanel.tsx exists
    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');
    expect(TodoPanel).toBeDefined();
  });

  it('should render todos grouped by status (in_progress, pending, completed)', async () => {
    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');
    render(<TodoPanel />);

    // Check section headers
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it('should show activeForm for in_progress todos', async () => {
    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');
    render(<TodoPanel />);

    // In progress todo should show activeForm, not content
    expect(screen.getByText('Implementing feature')).toBeInTheDocument();
  });

  it('should render progress bar with correct completion ratio', async () => {
    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');
    render(<TodoPanel />);

    // 1 of 3 completed = "1/3"
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('should show placeholder when no todos', async () => {
    const { useTodos } = await import('../src/public/hooks/useTodos');
    vi.mocked(useTodos).mockReturnValueOnce({
      todos: [],
      isLoading: false,
      error: null,
    });

    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');
    render(<TodoPanel />);

    expect(screen.getByText('No active tasks')).toBeInTheDocument();
  });
});

// ============================================================================
// AC4: All three panels independently positionable in Dockview
// ============================================================================

describe('AC4: All three panels independently positionable in Dockview', () => {
  it('should add WORKFLOW, AC, TODO to PANEL_INVENTORY', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');

    expect(PANEL_INVENTORY.WORKFLOW).toBe('workflow');
    expect(PANEL_INVENTORY.AC).toBe('ac');
    expect(PANEL_INVENTORY.TODO).toBe('todo');
  });

  it('should have PROGRESS in PANEL_INVENTORY (re-added by MSSCI-14966)', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');

    expect((PANEL_INVENTORY as any).PROGRESS).toBe('progress');
  });

  it('should include new panels in RIGHT_SIDEBAR_PANELS', async () => {
    const { RIGHT_SIDEBAR_PANELS } = await import('../src/public/components/DockviewWorkspace');

    expect(RIGHT_SIDEBAR_PANELS).toContain('workflow');
    expect(RIGHT_SIDEBAR_PANELS).toContain('ac');
    expect(RIGHT_SIDEBAR_PANELS).toContain('todo');
    expect(RIGHT_SIDEBAR_PANELS).not.toContain('progress');
  });

  it('should register all three new panel components', async () => {
    const { registerPanelComponent, getDockviewApi } = await import('../src/public/components/DockviewWorkspace');
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');

    // Components should be registerable without error
    expect(() => registerPanelComponent('workflow', WorkflowPanel)).not.toThrow();
    expect(() => registerPanelComponent('ac', ACPanel)).not.toThrow();
    expect(() => registerPanelComponent('todo', TodoPanel)).not.toThrow();
  });
});

// ============================================================================
// AC5: Layout persistence handles migration from old Progress panel
// ============================================================================

describe('AC5: Layout persistence handles migration from old Progress panel', () => {
  it('should migrate old "progress" panel to three new panels', async () => {
    // Simulate old layout with "progress" panel
    const oldLayout = {
      panels: [
        { id: 'sprint', position: 'right' },
        { id: 'progress', position: 'right' },  // Old panel to migrate
        { id: 'git', position: 'right' },
      ],
    };

    mockElectronAPI.layout.get.mockResolvedValueOnce(oldLayout);

    const { migrateLayout } = await import('../src/public/components/DockviewWorkspace');
    const newLayout = migrateLayout(oldLayout);

    // Should replace 'progress' with three new panels
    const panelIds = newLayout.panels.map((p: any) => p.id);
    expect(panelIds).not.toContain('progress');
    expect(panelIds).toContain('workflow');
    expect(panelIds).toContain('ac');
    expect(panelIds).toContain('todo');
  });

  it('should preserve position of migrated panels in right sidebar', async () => {
    const oldLayout = {
      panels: [
        { id: 'sprint', position: 'right' },
        { id: 'progress', position: 'right' },
        { id: 'git', position: 'right' },
      ],
    };

    const { migrateLayout } = await import('../src/public/components/DockviewWorkspace');
    const newLayout = migrateLayout(oldLayout);

    // New panels should be in right sidebar where progress was
    const rightPanels = newLayout.panels.filter((p: any) => p.position === 'right');
    const rightIds = rightPanels.map((p: any) => p.id);

    expect(rightIds).toContain('workflow');
    expect(rightIds).toContain('ac');
    expect(rightIds).toContain('todo');
  });

  it('should not modify layouts that already have new panels', async () => {
    const newLayoutFormat = {
      panels: [
        { id: 'workflow', position: 'right' },
        { id: 'ac', position: 'right' },
        { id: 'todo', position: 'right' },
      ],
    };

    const { migrateLayout } = await import('../src/public/components/DockviewWorkspace');
    const result = migrateLayout(newLayoutFormat);

    expect(result.panels).toHaveLength(3);
    expect(result.panels.map((p: any) => p.id)).toEqual(['workflow', 'ac', 'todo']);
  });

  it('should handle null/undefined layout gracefully', async () => {
    const { migrateLayout } = await import('../src/public/components/DockviewWorkspace');

    expect(() => migrateLayout(null)).not.toThrow();
    expect(() => migrateLayout(undefined)).not.toThrow();
  });
});

// ============================================================================
// AC6: No functionality regression from current ProgressPanel
// ============================================================================

describe('AC6: No functionality regression from current ProgressPanel', () => {
  // Note: "ProgressPanel deleted" is verified by the "Panel index exports" test suite
  // which checks that ProgressPanel is NOT exported from the panels index.
  // This section focuses on verifying no functionality regression in the extracted panels.

  it('should preserve workflow badge formatting (TDD/BDD uppercase)', async () => {
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // TDD should be uppercase, not "Tdd"
    expect(screen.getByText('TDD')).toBeInTheDocument();
    expect(screen.queryByText('Tdd')).not.toBeInTheDocument();
  });

  it('should preserve phase arrow separators between steps', async () => {
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Should have arrow separators between phases
    const arrows = container.querySelectorAll('.phase-arrow');
    // 4 phases = 3 arrows between them
    expect(arrows.length).toBe(3);
  });

  it('should preserve todo status icons (○ pending, ● in_progress, ✓ completed)', async () => {
    const { TodoPanel } = await import('../src/public/components/panels/TodoPanel');
    const { container } = render(<TodoPanel />);

    // Check for status icons in the rendered content
    const pendingIcon = container.querySelector('.todo-pending .todo-status');
    const inProgressIcon = container.querySelector('.todo-in_progress .todo-status');
    const completedIcon = container.querySelector('.todo-completed .todo-status');

    expect(pendingIcon?.textContent).toBe('○');
    expect(inProgressIcon?.textContent).toBe('●');
    expect(completedIcon?.textContent).toBe('✓');
  });

  it('should preserve AC completion styling (ac-done class)', async () => {
    const { ACPanel } = await import('../src/public/components/panels/ACPanel');
    render(<ACPanel />);

    const completedItem = screen.getByText('First criterion').closest('.ac-item');
    expect(completedItem).toHaveClass('ac-done');

    const incompleteItem = screen.getByText('Second criterion').closest('.ac-item');
    expect(incompleteItem).not.toHaveClass('ac-done');
  });
});

// ============================================================================
// Panel Index Export Tests
// ============================================================================

describe('Panel index exports new panels', () => {
  it('should export WorkflowPanel from panels index', async () => {
    const panels = await import('../src/public/components/panels');
    expect(panels.WorkflowPanel).toBeDefined();
  });

  it('should export ACPanel from panels index', async () => {
    const panels = await import('../src/public/components/panels');
    expect(panels.ACPanel).toBeDefined();
  });

  it('should export TodoPanel from panels index', async () => {
    const panels = await import('../src/public/components/panels');
    expect(panels.TodoPanel).toBeDefined();
  });

  it('should export ProgressPanel from panels index (re-added by MSSCI-14966)', async () => {
    const panels = await import('../src/public/components/panels');
    expect((panels as any).ProgressPanel).toBeDefined();
  });
});
