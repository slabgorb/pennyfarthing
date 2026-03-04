/**
 * MSSCI-14189: Enhanced Sprint Panel with story management and epic actions
 *
 * Tests for the enhanced Sprint Panel component that provides:
 * - Current story / "Next up" section
 * - Epic tree view with collapsible groups
 * - Progress bars per epic
 * - Archive/Promote actions
 * - Real-time updates
 *
 * Story: MSSCI-14189
 * Epic: MSSCI-14186 (Dockview Panel Migration)
 * Points: 8
 *
 * Acceptance Criteria:
 * - AC1: Current story section shows active story or "Next up" indicator
 * - AC2: Stories grouped by epic in collapsible tree view
 * - AC3: Epic progress bars show done/total points
 * - AC4: Archive button appears on fully completed epics
 * - AC5: Archive action triggers archive_epic.py and refreshes view
 * - AC6: Future initiatives section shows promotable epics
 * - AC7: Promote button triggers promote-epic.sh and refreshes view
 * - AC8: All actions have loading states and error handling
 * - AC9: Panel updates in real-time via WebSocket or polling
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Test Data Types
// =============================================================================

interface MockStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled';
  jiraKey: string | null;
}

interface MockEpic {
  id: string;
  title: string;
  jiraKey: string | null;
  stories: MockStory[];
  hasContext: boolean;
  progress: { done: number; total: number; cancelled: number; percentage: number };
  isCompleted: boolean;
}

interface MockFutureEpic {
  id: string;
  title: string;
  description: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
}

interface MockSprintData {
  currentStory: MockStory | null;
  nextStory: MockStory | null;
  epics: MockEpic[];
  futureEpics: MockFutureEpic[];
  sprint: {
    number: number;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockSprintData(overrides: Partial<MockSprintData> = {}): MockSprintData {
  return {
    currentStory: {
      id: 'MSSCI-14189',
      title: 'Enhanced Sprint Panel',
      points: 8,
      status: 'in_progress',
      jiraKey: 'MSSCI-14189',
    },
    nextStory: {
      id: 'MSSCI-14190',
      title: 'Next Priority Story',
      points: 3,
      status: 'backlog',
      jiraKey: 'MSSCI-14190',
    },
    epics: [
      {
        id: 'epic-76',
        title: 'Dockview Panel Migration',
        jiraKey: 'MSSCI-14186',
        hasContext: true,
        progress: { done: 3, total: 16, cancelled: 0, percentage: 19 },
        isCompleted: false,
        stories: [
          { id: 'MSSCI-14187', title: 'Tab overflow bug', points: 3, status: 'done', jiraKey: 'MSSCI-14187' },
          { id: 'MSSCI-14189', title: 'Enhanced Sprint Panel', points: 8, status: 'in_progress', jiraKey: 'MSSCI-14189' },
          { id: 'MSSCI-14190', title: 'Future story', points: 5, status: 'backlog', jiraKey: 'MSSCI-14190' },
        ],
      },
      {
        id: 'epic-75',
        title: 'Completed Epic',
        jiraKey: 'MSSCI-14100',
        hasContext: false,
        progress: { done: 8, total: 8, cancelled: 0, percentage: 100 },
        isCompleted: true,
        stories: [
          { id: 'MSSCI-14101', title: 'Done story 1', points: 3, status: 'done', jiraKey: 'MSSCI-14101' },
          { id: 'MSSCI-14102', title: 'Done story 2', points: 5, status: 'done', jiraKey: 'MSSCI-14102' },
        ],
      },
    ],
    futureEpics: [
      {
        id: 'epic-77',
        title: 'Future Initiative 1',
        description: 'Upcoming work for next sprint',
        estimatedPoints: 21,
        status: 'ready',
      },
      {
        id: 'epic-78',
        title: 'Blocked Initiative',
        description: 'Waiting on dependencies',
        estimatedPoints: 13,
        status: 'blocked',
      },
    ],
    sprint: {
      number: 2604,
      done: 24,
      remaining: 18,
      inProgress: 8,
      endDate: '2026-02-16',
    },
    ...overrides,
  };
}

// =============================================================================
// Mock Setup
// =============================================================================

// Shared state for MockWebSocket to read initial data
let mockSprintDataOverride: MockSprintData | null = null;

// Mock WebSocket for real-time updates
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1; // OPEN

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.onopen?.();

      // Send initial data from override or default
      if (this.onmessage && url.includes('/ws/sprint')) {
        const sprintData = mockSprintDataOverride || createMockSprintData();
        this.onmessage({
          data: JSON.stringify({
            type: 'init',
            ...sprintData
          })
        });
      }
    }, 0);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Test helper to simulate server message
  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// Mock fetch for REST API actions (Electron API removed in Story 141-12)
const mockFetch = vi.fn(() => Promise.resolve({ ok: true } as Response));

beforeEach(() => {
  vi.clearAllMocks();
  MockWebSocket.instances = [];
  mockSprintDataOverride = null; // Reset data override
  global.fetch = mockFetch;
  (global as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (global as any).WebSocket;
  mockSprintDataOverride = null;
});

// =============================================================================
// AC1: Current story section shows active story or "Next up" indicator
// =============================================================================

describe('AC1: Current story section', () => {
  it('should export EnhancedSprintPanel component', async () => {
    // This test verifies the component exists
    const module = await import('../src/public/components/panels/SprintPanel');
    expect(module.EnhancedSprintPanel).toBeDefined();
    expect(typeof module.EnhancedSprintPanel).toBe('function');
  });

  it('should display current story when one is in progress', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('current-story-section')).toBeInTheDocument();
    });

    const currentSection = screen.getByTestId('current-story-section');
    expect(within(currentSection).getByText('MSSCI-14189')).toBeInTheDocument();
    expect(within(currentSection).getByText('Enhanced Sprint Panel')).toBeInTheDocument();
    expect(within(currentSection).getByText(/in_progress/i)).toBeInTheDocument();
  });

  it('should display "Next up" indicator when no story is in progress', async () => {
    // Set custom data for this test
    mockSprintDataOverride = createMockSprintData({ currentStory: null });

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('next-up-section')).toBeInTheDocument();
    });

    expect(screen.getByText(/next up/i)).toBeInTheDocument();
    // Scope to the next-up-section since the same ID may appear in epic stories
    const nextUpSection = screen.getByTestId('next-up-section');
    expect(within(nextUpSection).getByText('MSSCI-14190')).toBeInTheDocument();
  });

  it('should display empty state when no stories available', async () => {
    // Set custom data for this test
    mockSprintDataOverride = createMockSprintData({ currentStory: null, nextStory: null });

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('no-stories-section')).toBeInTheDocument();
    });

    expect(screen.getByText(/no active story/i)).toBeInTheDocument();
  });

  it('should show story points in current story section', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('current-story-points')).toBeInTheDocument();
    });

    const currentSection = screen.getByTestId('current-story-section');
    expect(within(currentSection).getByText(/8 pts/i)).toBeInTheDocument();
  });
});

// =============================================================================
// AC2: Stories grouped by epic in collapsible tree view
// =============================================================================

describe('AC2: Epic tree view', () => {
  it('should render epics as collapsible groups', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree-view')).toBeInTheDocument();
    });

    // Check epic headers exist
    expect(screen.getByTestId('epic-group-epic-76')).toBeInTheDocument();
    expect(screen.getByTestId('epic-group-epic-75')).toBeInTheDocument();
  });

  it('should show epic title and Jira key in group header', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByText('Dockview Panel Migration')).toBeInTheDocument();
    });

    expect(screen.getByText('MSSCI-14186')).toBeInTheDocument();
  });

  it('should collapse and expand epic groups on click', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-toggle-epic-76')).toBeInTheDocument();
    });

    const toggleButton = screen.getByTestId('epic-toggle-epic-76');

    // Initially expanded - stories visible
    expect(screen.getByText('Tab overflow bug')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(toggleButton);

    // Stories should be hidden
    expect(screen.queryByText('Tab overflow bug')).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(toggleButton);

    // Stories visible again
    await waitFor(() => {
      expect(screen.getByText('Tab overflow bug')).toBeInTheDocument();
    });
  });

  it('should show story status indicators within epic groups', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-MSSCI-14187')).toBeInTheDocument();
    });

    // Check status badges
    const doneStory = screen.getByTestId('story-item-MSSCI-14187');
    expect(doneStory).toHaveAttribute('data-status', 'done');

    const inProgressStory = screen.getByTestId('story-item-MSSCI-14189');
    expect(inProgressStory).toHaveAttribute('data-status', 'in_progress');
  });

  it('should display story points next to each story', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-points-MSSCI-14187')).toBeInTheDocument();
    });

    expect(screen.getByTestId('story-points-MSSCI-14187')).toHaveTextContent('3');
    expect(screen.getByTestId('story-points-MSSCI-14189')).toHaveTextContent('8');
  });
});

// =============================================================================
// AC3: Epic progress bars show done/total points
// =============================================================================

describe('AC3: Epic progress bars', () => {
  it('should render progress bar for each epic', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-progress-epic-76')).toBeInTheDocument();
    });

    expect(screen.getByTestId('epic-progress-epic-75')).toBeInTheDocument();
  });

  it('should calculate progress correctly (done/total)', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-progress-epic-76')).toBeInTheDocument();
    });

    // Epic-76: 3 done / 16 total = 18.75%
    const progress76 = screen.getByTestId('epic-progress-epic-76');
    expect(progress76).toHaveAttribute('data-done', '3');
    expect(progress76).toHaveAttribute('data-total', '16');

    // Epic-75: 8 done / 8 total = 100%
    const progress75 = screen.getByTestId('epic-progress-epic-75');
    expect(progress75).toHaveAttribute('data-done', '8');
    expect(progress75).toHaveAttribute('data-total', '8');
  });

  it('should display progress label (e.g., "3/16 pts")', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-progress-label-epic-76')).toBeInTheDocument();
    });

    expect(screen.getByTestId('epic-progress-label-epic-76')).toHaveTextContent('3/16 pts');
    expect(screen.getByTestId('epic-progress-label-epic-75')).toHaveTextContent('8/8 pts');
  });

  it('should style completed epics differently', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-75')).toBeInTheDocument();
    });

    // Completed epic should have special class
    const completedEpic = screen.getByTestId('epic-group-epic-75');
    expect(completedEpic).toHaveClass('epic-completed');
  });
});

// =============================================================================
// AC4: Archive button appears on fully completed epics
// =============================================================================

describe('AC4: Archive button for completed epics', () => {
  it('should show archive button only on fully completed epics', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    // Incomplete epic should NOT have archive button
    expect(screen.queryByTestId('archive-button-epic-76')).not.toBeInTheDocument();
  });

  it('should not show archive button when epic has stories in progress', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-76')).toBeInTheDocument();
    });

    // Epic-76 has in_progress stories - no archive button
    expect(screen.queryByTestId('archive-button-epic-76')).not.toBeInTheDocument();
  });

  it('should have accessible label on archive button', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    const archiveButton = screen.getByTestId('archive-button-epic-75');
    expect(archiveButton).toHaveAttribute('aria-label', 'Archive epic-75');
  });
});

// =============================================================================
// AC5: Archive action triggers archive_epic.py and refreshes view
// =============================================================================

describe('AC5: Archive action', () => {
  it('should call archiveEpic IPC when archive button clicked', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    const archiveButton = screen.getByTestId('archive-button-epic-75');
    fireEvent.click(archiveButton);

    // Confirm the archive action
    await waitFor(() => {
      expect(screen.getByTestId('confirm-archive-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-archive-yes'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sprint/archive-epic/epic-75', { method: 'POST' });
    });
  });

  it('should refresh view after successful archive', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    const archiveButton = screen.getByTestId('archive-button-epic-75');
    fireEvent.click(archiveButton);

    // Confirm the archive action
    await waitFor(() => {
      expect(screen.getByTestId('confirm-archive-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-archive-yes'));

    // Wait for archive to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sprint/archive-epic/epic-75', { method: 'POST' });
    });

    // Simulate WebSocket update with epic-75 removed
    const updatedData = createMockSprintData({
      epics: [createMockSprintData().epics[0]], // Only epic-76 remains
    });

    act(() => {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateMessage({ type: 'update', ...updatedData });
    });

    await waitFor(() => {
      // Archived epic should be removed from view
      expect(screen.queryByTestId('epic-group-epic-75')).not.toBeInTheDocument();
    });
  });

  it('should show confirmation dialog before archiving', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    const archiveButton = screen.getByTestId('archive-button-epic-75');
    fireEvent.click(archiveButton);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-archive-dialog')).toBeInTheDocument();
    });

    expect(screen.getByText(/archive this epic/i)).toBeInTheDocument();
  });
});

// =============================================================================
// AC6: Future initiatives section shows promotable epics
// =============================================================================

describe('AC6: Future initiatives section', () => {
  it('should render future initiatives section', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('future-initiatives-section')).toBeInTheDocument();
    });
  });

  it('should display promotable epics from future.yaml', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('future-epic-epic-77')).toBeInTheDocument();
    });

    expect(screen.getByText('Future Initiative 1')).toBeInTheDocument();
    expect(screen.getByText(/21 pts/i)).toBeInTheDocument();
  });

  it('should show status badge on future epics (ready, blocked, planning)', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('future-epic-status-epic-77')).toBeInTheDocument();
    });

    expect(screen.getByTestId('future-epic-status-epic-77')).toHaveTextContent('ready');
    expect(screen.getByTestId('future-epic-status-epic-78')).toHaveTextContent('blocked');
  });

  it('should show promote button only on ready epics', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('promote-button-epic-77')).toBeInTheDocument();
    });

    // Blocked epic should NOT have promote button
    expect(screen.queryByTestId('promote-button-epic-78')).not.toBeInTheDocument();
  });
});

// =============================================================================
// AC7: Promote button triggers promote-epic.sh and refreshes view
// =============================================================================

describe('AC7: Promote action', () => {
  it('should call promoteEpic IPC when promote button clicked', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('promote-button-epic-77')).toBeInTheDocument();
    });

    const promoteButton = screen.getByTestId('promote-button-epic-77');
    fireEvent.click(promoteButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sprint/promote-epic/epic-77', { method: 'POST' });
    });
  });

  it('should refresh both sprint and future sections after promote', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('promote-button-epic-77')).toBeInTheDocument();
    });

    const promoteButton = screen.getByTestId('promote-button-epic-77');
    fireEvent.click(promoteButton);

    // Wait for promote to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sprint/promote-epic/epic-77', { method: 'POST' });
    });

    // Simulate WebSocket update with promoted epic in sprint and removed from future
    const promotedEpic: MockEpic = {
      id: 'epic-77',
      title: 'Future Initiative 1',
      jiraKey: null,
      hasContext: false,
      progress: { done: 0, total: 0, cancelled: 0, percentage: 0 },
      isCompleted: false,
      stories: [],
    };

    const updatedData = createMockSprintData({
      epics: [...createMockSprintData().epics, promotedEpic],
      futureEpics: [createMockSprintData().futureEpics[1]], // Only blocked epic remains
    });

    act(() => {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateMessage({ type: 'update', ...updatedData });
    });

    await waitFor(() => {
      // Promoted epic should appear in sprint section
      expect(screen.getByTestId('epic-group-epic-77')).toBeInTheDocument();
      // And be removed from future section
      expect(screen.queryByTestId('future-epic-epic-77')).not.toBeInTheDocument();
    });
  });

  it('should have accessible label on promote button', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('promote-button-epic-77')).toBeInTheDocument();
    });

    const promoteButton = screen.getByTestId('promote-button-epic-77');
    expect(promoteButton).toHaveAttribute('aria-label', 'Promote epic-77 to current sprint');
  });
});

// =============================================================================
// AC8: All actions have loading states and error handling
// =============================================================================

describe('AC8: Loading states and error handling', () => {
  it('should show loading state on initial load', async () => {
    // Delay the response to see loading state
    // Loading state is driven by WebSocket, not fetch — this test just checks initial render

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    expect(screen.getByTestId('sprint-panel-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('sprint-panel-loading')).not.toBeInTheDocument();
    });
  });

  it('should show loading indicator on archive button during action', async () => {
    mockFetch.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true } as Response), 100))
    );

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    const archiveButton = screen.getByTestId('archive-button-epic-75');

    // Confirm the dialog first
    fireEvent.click(archiveButton);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-archive-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-archive-yes'));

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByTestId('archive-loading-epic-75')).toBeInTheDocument();
    });

    // Button should be disabled
    expect(archiveButton).toBeDisabled();
  });

  it('should show error message when archive fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Archive failed'));

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-button-epic-75')).toBeInTheDocument();
    });

    // Trigger archive with confirmation
    fireEvent.click(screen.getByTestId('archive-button-epic-75'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-archive-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-archive-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('error-toast')).toBeInTheDocument();
    });

    expect(screen.getByText(/archive failed/i)).toBeInTheDocument();
  });

  it('should show error message when promote fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Promote failed'));

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('promote-button-epic-77')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('promote-button-epic-77'));

    await waitFor(() => {
      expect(screen.getByTestId('error-toast')).toBeInTheDocument();
    });

    expect(screen.getByText(/promote failed/i)).toBeInTheDocument();
  });

  it('should clear error message on retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Promote failed'))
      .mockResolvedValueOnce({ ok: true } as Response);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('promote-button-epic-77')).toBeInTheDocument();
    });

    // First attempt fails
    fireEvent.click(screen.getByTestId('promote-button-epic-77'));
    await waitFor(() => {
      expect(screen.getByTestId('error-toast')).toBeInTheDocument();
    });

    // Retry succeeds
    fireEvent.click(screen.getByTestId('promote-button-epic-77'));
    await waitFor(() => {
      expect(screen.queryByTestId('error-toast')).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// AC9: Panel updates in real-time via WebSocket or polling
// =============================================================================

describe('AC9: Real-time updates', () => {
  it('should connect to WebSocket on mount', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    // Should connect to /ws/sprint endpoint
    expect(MockWebSocket.instances[0].url).toContain('/ws/sprint');
  });

  it('should update view when WebSocket receives sprint update', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('current-story-section')).toBeInTheDocument();
    });

    // Simulate WebSocket message with new current story
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'update',
        currentStory: {
          id: 'MSSCI-14200',
          title: 'New Current Story',
          points: 5,
          status: 'in_progress',
          jiraKey: 'MSSCI-14200',
        },
      });
    });

    await waitFor(() => {
      const currentSection = screen.getByTestId('current-story-section');
      expect(within(currentSection).getByText('MSSCI-14200')).toBeInTheDocument();
      expect(within(currentSection).getByText('New Current Story')).toBeInTheDocument();
    });
  });

  it('should update epic progress when story status changes', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-progress-label-epic-76')).toHaveTextContent('3/16 pts');
    });

    // Simulate story completion
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'update',
        epics: [
          {
            ...createMockSprintData().epics[0],
            progress: { done: 11, total: 16, cancelled: 0, percentage: 69 },
            stories: createMockSprintData().epics[0].stories.map((s) =>
              s.id === 'MSSCI-14189' ? { ...s, status: 'done' as const } : s
            ),
          },
          createMockSprintData().epics[1],
        ],
      });
    });

    await waitFor(() => {
      // Now 11/16 pts done (3 + 8)
      expect(screen.getByTestId('epic-progress-label-epic-76')).toHaveTextContent('11/16 pts');
    });
  });

  it('should reconnect WebSocket on disconnect', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    });

    const initialCount = MockWebSocket.instances.length;
    const lastInstance = MockWebSocket.instances[initialCount - 1];

    // Simulate disconnect
    act(() => {
      lastInstance.close();
    });

    // Should attempt reconnect (one more instance created)
    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBeGreaterThan(initialCount);
      },
      { timeout: 3000 }
    );
  });

  it('should clean up WebSocket on unmount', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    const { unmount } = render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws = MockWebSocket.instances[0];
    unmount();

    expect(ws.readyState).toBe(3); // CLOSED
  });
});

// =============================================================================
// Integration: Component structure and accessibility
// =============================================================================

describe('Integration: Component structure', () => {
  it('should have proper section hierarchy', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('enhanced-sprint-panel')).toBeInTheDocument();
    });

    // Wait for data to load and sections to render
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /current story/i })).toBeInTheDocument();
    });

    // Check main sections exist in order
    const panel = screen.getByTestId('enhanced-sprint-panel');
    const sections = panel.querySelectorAll('section');

    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections[0]).toHaveAttribute('data-section', 'current-story');
    expect(sections[1]).toHaveAttribute('data-section', 'epics');

    // Find the "future" section - it may be at index 2 or 3 depending on completed-epics
    const futureSection = Array.from(sections).find(s => s.getAttribute('data-section') === 'future');
    expect(futureSection).toBeTruthy();
    expect(futureSection).toHaveAttribute('data-section', 'future');
  });

  it('should have accessible section headings', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /current story/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /current epics/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /future initiatives/i })).toBeInTheDocument();
  });

  it('should support keyboard navigation for collapsible epics', async () => {
    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-toggle-epic-76')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('epic-toggle-epic-76');
    toggle.focus();

    // Should respond to Enter key
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(screen.queryByText('Tab overflow bug')).not.toBeInTheDocument();

    // Should respond to Space key
    fireEvent.keyDown(toggle, { key: ' ' });
    await waitFor(() => {
      expect(screen.getByText('Tab overflow bug')).toBeInTheDocument();
    });
  });
});
