/**
 * MSSCI-14966: ProgressPanel (at-a-glance story dashboard)
 *
 * Tests for a unified progress panel combining story context, workflow phase,
 * AC completion, todo status, git changes, and context window usage.
 *
 * Story: MSSCI-14966 / 103-11 - ProgressPanel
 * Epic: 103 - BikeRack TUI
 *
 * Acceptance Criteria:
 * - AC1: ProgressPanel component renders in BikeRack/Cyclist dockview layout
 * - AC2: Subscribes to WebSocket channels: /ws/story, /ws/todos, /ws/git, /ws/sprint, /ws/context
 * - AC3: Shows story context (title, points, status, Jira key)
 * - AC4: Shows workflow phase diagram with current phase highlighted
 * - AC5: Shows AC completion status
 * - AC6: Shows todo/task status
 * - AC7: Shows git changes summary
 * - AC8: Shows context window usage indicator
 * - AC9: Replaces separate WorkflowPanel, ACPanel, and TodoPanel views
 * - AC10: Tests pass (vitest for Cyclist package)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';

expect.extend(matchers);

// ============================================================================
// Mock Data
// ============================================================================

const mockStoryData = {
  story: {
    id: '103-11',
    title: 'ProgressPanel (at-a-glance story dashboard)',
    status: 'in_progress',
    phase: 'red',
    workflow: 'tdd',
    points: 5,
    epic: '103 - BikeRack TUI',
    criteria: [
      { text: 'ProgressPanel renders in layout', completed: true },
      { text: 'Shows story context', completed: true },
      { text: 'Shows workflow phase', completed: false },
      { text: 'Shows AC completion', completed: false },
      { text: 'Shows todo status', completed: false },
    ],
    workflowPhases: [
      { name: 'setup', agent: 'sm', label: 'Setup', status: 'done' as const },
      { name: 'red', agent: 'tea', label: 'Red', status: 'current' as const },
      { name: 'green', agent: 'dev', label: 'Green', status: 'pending' as const },
      { name: 'review', agent: 'reviewer', label: 'Review', status: 'pending' as const },
    ],
    workflowType: 'phased',
  },
  isLoading: false,
  error: null,
  availableWorkflows: null,
};

const mockSprintData = {
  data: {
    currentStory: {
      id: '103-11',
      title: 'ProgressPanel (at-a-glance story dashboard)',
      points: 5,
      status: 'in_progress' as const,
      jiraKey: 'MSSCI-14966',
      epic: '103 - BikeRack TUI',
    },
    nextStory: null,
    epics: [],
    futureEpics: [],
    sprint: { number: 2606, name: 'Sprint 2606', done: 104, remaining: 128, inProgress: 5, endDate: '2026-02-28' },
  },
  isLoading: false,
  error: null,
};

const mockTodosData = {
  todos: [
    { id: '1', content: 'Write failing tests', activeForm: 'Writing failing tests', status: 'completed' as const },
    { id: '2', content: 'Implement ProgressPanel', activeForm: 'Implementing ProgressPanel', status: 'in_progress' as const },
    { id: '3', content: 'Wire up panel registration', activeForm: 'Wiring up registration', status: 'pending' as const },
  ],
  isLoading: false,
  error: null,
};

const mockGitData = {
  gitStatus: {
    branch: 'feat/103-11-progress-panel',
    ahead: 2,
    behind: 0,
    modified: 4,
    untracked: 1,
    isDirty: true,
  },
  repos: [
    {
      name: 'pennyfarthing',
      path: '/Users/test/pennyfarthing',
      branch: 'feat/103-11-progress-panel',
      ahead: 2,
      behind: 0,
      staged: 0,
      modified: 4,
      untracked: 1,
      isDirty: true,
      files: [
        { status: ' M', path: 'src/panel.tsx' },
        { status: ' M', path: 'src/index.ts' },
        { status: ' M', path: 'src/registry.ts' },
        { status: ' M', path: 'tests/panel.test.tsx' },
        { status: '??', path: 'src/new-file.ts' },
      ],
    },
  ],
  isLoading: false,
  error: null,
};

const mockContextData = {
  percent: 42,
  used: 84000,
  total: 200000,
};

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => mockStoryData),
}));

vi.mock('../src/public/hooks/useSprint', () => ({
  useSprint: vi.fn(() => mockSprintData),
}));

vi.mock('../src/public/hooks/useTodos', () => ({
  useTodos: vi.fn(() => mockTodosData),
}));

vi.mock('../src/public/hooks/useGitStatus', () => ({
  useGitStatus: vi.fn(() => mockGitData),
}));

// Mock useStatsStrip for context window data
vi.mock('../src/public/hooks/useStatsStrip', () => ({
  useStatsStrip: vi.fn(() => ({
    context: mockContextData,
    stats: null,
    projectInfo: null,
    isLoading: false,
    error: null,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// AC1: ProgressPanel component renders in BikeRack/Cyclist dockview layout
// ============================================================================

describe('AC1: ProgressPanel renders in dockview layout', () => {
  it('should export ProgressPanel component from panels index', async () => {
    const panels = await import('../src/public/components/panels');
    expect((panels as any).ProgressPanel).toBeDefined();
    expect(typeof (panels as any).ProgressPanel).toBe('function');
  });

  it('should render with data-testid="progress-panel"', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-panel')).toBeInTheDocument();
  });

  it('should be registered in PANEL_REGISTRY for BikeRack standalone mode', async () => {
    const { PANEL_REGISTRY } = await import('../../bikerack/src/StandalonePanel');
    expect(PANEL_REGISTRY).toHaveProperty('progress');
  });

  it('should be registered in PANEL_INVENTORY for dockview', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');
    expect((PANEL_INVENTORY as any).PROGRESS).toBe('progress');
  });
});

// ============================================================================
// AC2: Subscribes to WebSocket channels
// ============================================================================

describe('AC2: Subscribes to required WebSocket channels', () => {
  it('should call useStory hook (subscribes to /ws/story)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { useStory } = await import('../src/public/hooks/useStory');

    render(<ProgressPanel />);
    expect(useStory).toHaveBeenCalled();
  });

  it('should call useTodos hook (subscribes to /ws/todos)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { useTodos } = await import('../src/public/hooks/useTodos');

    render(<ProgressPanel />);
    expect(useTodos).toHaveBeenCalled();
  });

  it('should call useGitStatus hook (subscribes to /ws/git)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { useGitStatus } = await import('../src/public/hooks/useGitStatus');

    render(<ProgressPanel />);
    expect(useGitStatus).toHaveBeenCalled();
  });

  it('should call useSprint hook (subscribes to /ws/sprint)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { useSprint } = await import('../src/public/hooks/useSprint');

    render(<ProgressPanel />);
    expect(useSprint).toHaveBeenCalled();
  });

  it('should call useStatsStrip hook (subscribes to /ws/context)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { useStatsStrip } = await import('../src/public/hooks/useStatsStrip');

    render(<ProgressPanel />);
    expect(useStatsStrip).toHaveBeenCalled();
  });
});

// ============================================================================
// AC3: Shows story context (title, points, status, Jira key)
// ============================================================================

describe('AC3: Shows story context', () => {
  it('should display story ID', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText('103-11')).toBeInTheDocument();
  });

  it('should display story title', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText(/ProgressPanel.*at-a-glance/)).toBeInTheDocument();
  });

  it('should display story points', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    // Validate story points format in panel text (getByText(/5/) removed — collides with AC count "2/5")
    const panel = screen.getByTestId('progress-panel');
    expect(panel.textContent).toMatch(/5\s*pt/i);
  });

  it('should display Jira key from sprint data', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText('MSSCI-14966')).toBeInTheDocument();
  });

  it('should display story status', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const panel = screen.getByTestId('progress-panel');
    expect(panel.textContent).toMatch(/in.progress/i);
  });

  it('should display epic name', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText(/103.*BikeRack/)).toBeInTheDocument();
  });

  it('should have a story-header section with data-testid', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-story-header')).toBeInTheDocument();
  });
});

// ============================================================================
// AC4: Shows workflow phase diagram with current phase highlighted
// ============================================================================

describe('AC4: Shows workflow phase diagram', () => {
  it('should display workflow type badge (TDD)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText('TDD')).toBeInTheDocument();
  });

  it('should render all workflow phases', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('should highlight current phase (Red) differently from done/pending', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { container } = render(<ProgressPanel />);

    // Current phase should have 'current' class
    const currentStep = screen.getByText('Red').closest('.phase-step');
    expect(currentStep).toHaveClass('current');

    // Done phase should have 'done' class
    const doneStep = screen.getByText('Setup').closest('.phase-step');
    expect(doneStep).toHaveClass('done');

    // Pending phase should have 'pending' class
    const pendingStep = screen.getByText('Green').closest('.phase-step');
    expect(pendingStep).toHaveClass('pending');
  });

  it('should have a workflow-row section with data-testid', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-workflow-row')).toBeInTheDocument();
  });

  it('should not render workflow section when no workflow phases', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    vi.mocked(useStory).mockReturnValueOnce({
      story: { ...mockStoryData.story, workflowPhases: null, workflow: null },
      isLoading: false,
      error: null,
      availableWorkflows: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.queryByTestId('progress-workflow-row')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Shows AC completion status
// ============================================================================

describe('AC5: Shows AC completion status', () => {
  it('should display AC progress count (done/total)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    // 2 of 5 criteria completed
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('should render an AC progress bar', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { container } = render(<ProgressPanel />);

    const acRow = screen.getByTestId('progress-ac-row');
    const progressBar = acRow.querySelector('.progress-bar');
    expect(progressBar).toBeInTheDocument();
    // 2/5 = 40%
    expect(progressBar).toHaveStyle({ width: '40%' });
  });

  it('should have an ac-row section with data-testid', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-ac-row')).toBeInTheDocument();
  });

  it('should not render AC section when no criteria', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    vi.mocked(useStory).mockReturnValueOnce({
      story: { ...mockStoryData.story, criteria: null },
      isLoading: false,
      error: null,
      availableWorkflows: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.queryByTestId('progress-ac-row')).not.toBeInTheDocument();
  });

  it('should not render AC section when criteria is empty array', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    vi.mocked(useStory).mockReturnValueOnce({
      story: { ...mockStoryData.story, criteria: [] },
      isLoading: false,
      error: null,
      availableWorkflows: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.queryByTestId('progress-ac-row')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Shows todo/task status
// ============================================================================

describe('AC6: Shows todo/task status', () => {
  it('should display todo progress count (done/total)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    // 1 of 3 todos completed
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('should render a todo progress bar', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    const todoRow = screen.getByTestId('progress-todo-row');
    const progressBar = todoRow.querySelector('.progress-bar');
    expect(progressBar).toBeInTheDocument();
  });

  it('should show the active (in_progress) task', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    const todoRow = screen.getByTestId('progress-todo-row');
    // Should show the activeForm of the in_progress todo
    expect(within(todoRow).getByText(/Implementing ProgressPanel/)).toBeInTheDocument();
  });

  it('should have a todo-row section with data-testid', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-todo-row')).toBeInTheDocument();
  });

  it('should not render todo section when no todos', async () => {
    const { useTodos } = await import('../src/public/hooks/useTodos');
    vi.mocked(useTodos).mockReturnValueOnce({
      todos: [],
      isLoading: false,
      error: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.queryByTestId('progress-todo-row')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC7: Shows git changes summary
// ============================================================================

describe('AC7: Shows git changes summary', () => {
  it('should display branch name', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByText(/feat\/103-11-progress-panel/)).toBeInTheDocument();
  });

  it('should display modified file count', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const gitRow = screen.getByTestId('progress-git-row');
    // 4 modified files — could be "4M" or similar compact format
    expect(gitRow.textContent).toMatch(/4M/);
  });

  it('should display untracked file count', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const gitRow = screen.getByTestId('progress-git-row');
    // 1 untracked — "1U"
    expect(gitRow.textContent).toMatch(/1U/);
  });

  it('should display ahead/behind counts', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const gitRow = screen.getByTestId('progress-git-row');
    // ahead 2, behind 0 — "↑2 ↓0" or similar
    expect(gitRow.textContent).toMatch(/↑\s*2/);
    expect(gitRow.textContent).toMatch(/↓\s*0/);
  });

  it('should have a git-row section with data-testid', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-git-row')).toBeInTheDocument();
  });
});

// ============================================================================
// AC8: Shows context window usage indicator
// ============================================================================

describe('AC8: Shows context window usage indicator', () => {
  it('should display context percentage', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const panel = screen.getByTestId('progress-panel');
    expect(panel.textContent).toMatch(/42%/);
  });

  it('should have a context usage section with data-testid', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    expect(screen.getByTestId('progress-context-row')).toBeInTheDocument();
  });

  it('should render context as a progress bar or visual indicator', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const contextRow = screen.getByTestId('progress-context-row');
    const progressBar = contextRow.querySelector('.progress-bar');
    expect(progressBar).toBeInTheDocument();
  });

  it('should have accessible aria attributes on context indicator', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);
    const contextRow = screen.getByTestId('progress-context-row');
    const progressElement = contextRow.querySelector('[role="progressbar"]');
    expect(progressElement).toBeInTheDocument();
    expect(progressElement).toHaveAttribute('aria-valuenow', '42');
  });
});

// ============================================================================
// AC9: Combines data from separate panels into unified view
// ============================================================================

describe('AC9: Unified view replaces need for separate panels', () => {
  it('should render all 5 data sections in a single panel', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    // All sections present
    expect(screen.getByTestId('progress-story-header')).toBeInTheDocument();
    expect(screen.getByTestId('progress-workflow-row')).toBeInTheDocument();
    expect(screen.getByTestId('progress-ac-row')).toBeInTheDocument();
    expect(screen.getByTestId('progress-todo-row')).toBeInTheDocument();
    expect(screen.getByTestId('progress-git-row')).toBeInTheDocument();
  });

  it('should render sections in correct order (story → workflow → AC → todo → git)', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    const { container } = render(<ProgressPanel />);

    const sections = container.querySelectorAll('[data-testid^="progress-"]');
    const order = Array.from(sections).map(s => s.getAttribute('data-testid'));

    const storyIdx = order.indexOf('progress-story-header');
    const workflowIdx = order.indexOf('progress-workflow-row');
    const acIdx = order.indexOf('progress-ac-row');
    const todoIdx = order.indexOf('progress-todo-row');
    const gitIdx = order.indexOf('progress-git-row');

    expect(storyIdx).toBeLessThan(workflowIdx);
    expect(workflowIdx).toBeLessThan(acIdx);
    expect(acIdx).toBeLessThan(todoIdx);
    expect(todoIdx).toBeLessThan(gitIdx);
  });
});

// ============================================================================
// Loading State
// ============================================================================

describe('Loading state', () => {
  it('should render skeleton loading state when hooks are loading', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    const { useSprint } = await import('../src/public/hooks/useSprint');
    vi.mocked(useStory).mockReturnValueOnce({
      story: null,
      isLoading: true,
      error: null,
      availableWorkflows: null,
    });
    vi.mocked(useSprint).mockReturnValueOnce({
      data: null,
      isLoading: true,
      error: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    const panel = screen.getByTestId('progress-panel');
    expect(panel).toHaveClass('loading');
  });
});

// ============================================================================
// Empty State
// ============================================================================

describe('Empty state', () => {
  it('should show "No active story" when no story data', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    const { useSprint } = await import('../src/public/hooks/useSprint');
    vi.mocked(useStory).mockReturnValueOnce({
      story: null,
      isLoading: false,
      error: null,
      availableWorkflows: null,
    });
    vi.mocked(useSprint).mockReturnValueOnce({
      data: { ...mockSprintData.data, currentStory: null },
      isLoading: false,
      error: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    expect(screen.getByText(/No active story/)).toBeInTheDocument();
  });

  it('should show hint text in empty state', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    const { useSprint } = await import('../src/public/hooks/useSprint');
    vi.mocked(useStory).mockReturnValueOnce({
      story: null,
      isLoading: false,
      error: null,
      availableWorkflows: null,
    });
    vi.mocked(useSprint).mockReturnValueOnce({
      data: { ...mockSprintData.data, currentStory: null },
      isLoading: false,
      error: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    expect(screen.getByText(/sprint/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Partial State (sections collapse when data missing)
// ============================================================================

describe('Partial state', () => {
  it('should render without AC/todo sections when those data are empty', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    const { useTodos } = await import('../src/public/hooks/useTodos');
    vi.mocked(useStory).mockReturnValueOnce({
      story: { ...mockStoryData.story, criteria: [] },
      isLoading: false,
      error: null,
      availableWorkflows: null,
    });
    vi.mocked(useTodos).mockReturnValueOnce({
      todos: [],
      isLoading: false,
      error: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    // Story header and git should still render
    expect(screen.getByTestId('progress-story-header')).toBeInTheDocument();
    expect(screen.getByTestId('progress-git-row')).toBeInTheDocument();

    // AC and todo sections should be absent
    expect(screen.queryByTestId('progress-ac-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('progress-todo-row')).not.toBeInTheDocument();
  });
});

// ============================================================================
// Error State
// ============================================================================

describe('Error state', () => {
  it('should display error message when a hook errors', async () => {
    const { useStory } = await import('../src/public/hooks/useStory');
    vi.mocked(useStory).mockReturnValueOnce({
      story: null,
      isLoading: false,
      error: new Error('WebSocket connection failed'),
      availableWorkflows: null,
    });

    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    expect(screen.getByText(/WebSocket connection failed/)).toBeInTheDocument();
  });
});

// ============================================================================
// Accessibility
// ============================================================================

describe('Accessibility', () => {
  it('should have aria-labels on progress bars', async () => {
    const { ProgressPanel } = await import('../src/public/components/panels/ProgressPanel');
    render(<ProgressPanel />);

    // AC progress should have accessible label
    const acRow = screen.getByTestId('progress-ac-row');
    const acProgress = acRow.querySelector('[role="progressbar"]');
    expect(acProgress).toBeInTheDocument();
    expect(acProgress).toHaveAttribute('aria-valuenow');
    expect(acProgress).toHaveAttribute('aria-valuemin', '0');
    expect(acProgress).toHaveAttribute('aria-valuemax');
  });
});
