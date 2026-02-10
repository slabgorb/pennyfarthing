/**
 * MSSCI-14209: Sprint panel story metadata indicators (context, jira, status)
 *
 * Tests for enhanced metadata display in the Sprint Panel:
 * - Epic context existence indicator (sprint/context/context-epic-{N}.md)
 * - Story Jira ticket clickable links
 * - Story status badges (done/todo/blocked/in_progress)
 * - Story context file existence indicator
 * - Cyclist design system styling
 *
 * Story: MSSCI-14209
 * Epic: MSSCI-14186 (Dockview Panel Migration)
 * Points: 3
 *
 * Acceptance Criteria:
 * - AC1: Epic rows show context existence indicator
 * - AC2: Story rows show Jira ticket as clickable link
 * - AC3: Story status badges are visually distinct (done/todo/blocked/in_progress)
 * - AC4: Context file existence shown for stories
 * - AC5: Consistent styling with Cyclist design system
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Test Data Types (extended with metadata fields)
// =============================================================================

interface MockStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  jiraKey: string | null;
  hasContext?: boolean; // NEW: story context file exists
}

interface MockEpic {
  id: string;
  title: string;
  jiraKey: string | null;
  stories: MockStory[];
  hasContext?: boolean; // NEW: epic context file exists
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
    name: string;
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
      id: 'MSSCI-14209',
      title: 'Sprint panel metadata indicators',
      points: 3,
      status: 'in_progress',
      jiraKey: 'MSSCI-14209',
      hasContext: true,
    },
    nextStory: {
      id: 'MSSCI-14188',
      title: 'Split Progress panel',
      points: 5,
      status: 'backlog',
      jiraKey: 'MSSCI-14188',
      hasContext: false,
    },
    epics: [
      {
        id: 'epic-76',
        title: 'Dockview Panel Migration',
        jiraKey: 'MSSCI-14186',
        hasContext: true, // context-epic-76.md exists
        stories: [
          {
            id: 'MSSCI-14187',
            title: 'Tab overflow bug',
            points: 3,
            status: 'done',
            jiraKey: 'MSSCI-14187',
            hasContext: true,
          },
          {
            id: 'MSSCI-14209',
            title: 'Sprint panel metadata',
            points: 3,
            status: 'in_progress',
            jiraKey: 'MSSCI-14209',
            hasContext: true,
          },
          {
            id: 'MSSCI-14188',
            title: 'Split Progress panel',
            points: 5,
            status: 'backlog',
            jiraKey: 'MSSCI-14188',
            hasContext: false,
          },
          {
            id: 'MSSCI-14191',
            title: 'Bell mode bug',
            points: 2,
            status: 'blocked',
            jiraKey: 'MSSCI-14191',
            hasContext: false,
          },
        ],
      },
      {
        id: 'epic-74',
        title: 'Tool Use Visualization',
        jiraKey: 'MSSCI-13394',
        hasContext: true, // context-epic-74.md exists
        stories: [
          {
            id: 'MSSCI-13395',
            title: 'Tool intent summarizer',
            points: 3,
            status: 'done',
            jiraKey: 'MSSCI-13395',
            hasContext: true,
          },
        ],
      },
      {
        id: 'epic-77',
        title: 'Future Epic (no context)',
        jiraKey: 'MSSCI-14300',
        hasContext: false, // No context file yet
        stories: [],
      },
    ],
    futureEpics: [
      {
        id: 'epic-78',
        title: 'Future Initiative',
        description: 'Upcoming work',
        estimatedPoints: 21,
        status: 'ready',
      },
    ],
    sprint: {
      number: 2606,
      name: 'TO Sprint 2606',
      done: 40,
      remaining: 10,
      inProgress: 3,
      endDate: '2026-02-15',
    },
    ...overrides,
  };
}

// =============================================================================
// Mock Setup
// =============================================================================

let mockSprintDataOverride: MockSprintData | null = null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.onopen?.();
      if (this.onmessage && url.includes('/ws/sprint')) {
        const sprintData = mockSprintDataOverride || createMockSprintData();
        this.onmessage({
          data: JSON.stringify({ type: 'init', ...sprintData }),
        });
      }
    }, 0);
  }

  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const mockElectronAPI = {
  sprint: {
    archiveEpic: vi.fn(() => Promise.resolve({ success: true })),
    promoteEpic: vi.fn(() => Promise.resolve({ success: true })),
  },
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  MockWebSocket.instances = [];
  mockSprintDataOverride = null;
  (window as any).electronAPI = mockElectronAPI;
  (global as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  delete (window as any).electronAPI;
  delete (global as any).WebSocket;
  mockSprintDataOverride = null;
});

// =============================================================================
// AC1: Epic rows show context existence indicator
// =============================================================================

describe('AC1: Epic context existence indicator', () => {
  it('should display context indicator on epic header when hasContext is true', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-76')).toBeInTheDocument();
    });

    // Epic with context should show indicator
    const epicWithContext = screen.getByTestId('epic-group-epic-76');
    const contextIndicator = within(epicWithContext).getByTestId('epic-context-indicator-epic-76');
    expect(contextIndicator).toBeInTheDocument();
    expect(contextIndicator).toHaveAttribute('data-has-context', 'true');
  });

  it('should display "no context" indicator when hasContext is false', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-77')).toBeInTheDocument();
    });

    // Epic without context should show different indicator
    const epicWithoutContext = screen.getByTestId('epic-group-epic-77');
    const contextIndicator = within(epicWithoutContext).getByTestId('epic-context-indicator-epic-77');
    expect(contextIndicator).toBeInTheDocument();
    expect(contextIndicator).toHaveAttribute('data-has-context', 'false');
  });

  it('should show "Ready" badge when epic has context and is archivable', async () => {
    // Set up a completed epic with context
    mockSprintDataOverride = createMockSprintData({
      epics: [
        {
          id: 'epic-74',
          title: 'Tool Use Visualization',
          jiraKey: 'MSSCI-13394',
          hasContext: true,
          stories: [
            {
              id: 'MSSCI-13395',
              title: 'Tool intent summarizer',
              points: 3,
              status: 'done',
              jiraKey: 'MSSCI-13395',
              hasContext: true,
            },
          ],
        },
      ],
    });

    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-74')).toBeInTheDocument();
    });

    // Completed epic with context should show "Ready" badge
    const epic = screen.getByTestId('epic-group-epic-74');
    expect(within(epic).getByTestId('epic-ready-badge-epic-74')).toBeInTheDocument();
  });

  it('should have accessible tooltip explaining context indicator', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-context-indicator-epic-76')).toBeInTheDocument();
    });

    const indicator = screen.getByTestId('epic-context-indicator-epic-76');
    expect(indicator).toHaveAttribute('title', expect.stringMatching(/context/i));
  });
});

// =============================================================================
// AC2: Story rows show Jira ticket as clickable link
// =============================================================================

describe('AC2: Story Jira ticket clickable link', () => {
  it('should render Jira key as a link element', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-MSSCI-14187')).toBeInTheDocument();
    });

    const storyItem = screen.getByTestId('story-item-MSSCI-14187');
    const jiraLink = within(storyItem).getByTestId('story-jira-link-MSSCI-14187');

    expect(jiraLink).toBeInTheDocument();
    expect(jiraLink.tagName.toLowerCase()).toBe('a');
    expect(jiraLink).toHaveAttribute('href', expect.stringContaining('MSSCI-14187'));
  });

  it('should open Jira ticket in external browser when clicked', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-jira-link-MSSCI-14187')).toBeInTheDocument();
    });

    const jiraLink = screen.getByTestId('story-jira-link-MSSCI-14187');
    fireEvent.click(jiraLink);

    await waitFor(() => {
      expect(mockElectronAPI.shell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining('MSSCI-14187')
      );
    });
  });

  it('should format Jira link correctly (https://1898andco.atlassian.net/browse/XXX)', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-jira-link-MSSCI-14187')).toBeInTheDocument();
    });

    const jiraLink = screen.getByTestId('story-jira-link-MSSCI-14187');
    expect(jiraLink).toHaveAttribute(
      'href',
      'https://1898andco.atlassian.net/browse/MSSCI-14187'
    );
  });

  it('should not render link when jiraKey is null', async () => {
    mockSprintDataOverride = createMockSprintData({
      epics: [
        {
          id: 'epic-76',
          title: 'Test Epic',
          jiraKey: null,
          hasContext: true,
          stories: [
            {
              id: 'LOCAL-001',
              title: 'Local only story',
              points: 2,
              status: 'backlog',
              jiraKey: null,
              hasContext: false,
            },
          ],
        },
      ],
    });

    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-LOCAL-001')).toBeInTheDocument();
    });

    const storyItem = screen.getByTestId('story-item-LOCAL-001');
    expect(within(storyItem).queryByTestId('story-jira-link-LOCAL-001')).not.toBeInTheDocument();
  });

  it('should display Jira key text in the link', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-jira-link-MSSCI-14187')).toBeInTheDocument();
    });

    const jiraLink = screen.getByTestId('story-jira-link-MSSCI-14187');
    expect(jiraLink).toHaveTextContent('MSSCI-14187');
  });
});

// =============================================================================
// AC3: Story status badges are visually distinct (done/todo/blocked/in_progress)
// =============================================================================

describe('AC3: Story status badges', () => {
  it('should render status badge for each story', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14187')).toBeInTheDocument();
    });

    expect(screen.getByTestId('story-status-badge-MSSCI-14209')).toBeInTheDocument();
    expect(screen.getByTestId('story-status-badge-MSSCI-14188')).toBeInTheDocument();
    expect(screen.getByTestId('story-status-badge-MSSCI-14191')).toBeInTheDocument();
  });

  it('should display done badge with Lucide Check icon', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14187')).toBeInTheDocument();
    });

    const doneBadge = screen.getByTestId('story-status-badge-MSSCI-14187');
    expect(doneBadge).toHaveAttribute('data-status', 'done');
    expect(doneBadge.querySelector('svg')).toBeTruthy();
    expect(doneBadge).toHaveClass('status-done');
  });

  it('should display in_progress badge with Lucide Loader icon', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14209')).toBeInTheDocument();
    });

    const inProgressBadge = screen.getByTestId('story-status-badge-MSSCI-14209');
    expect(inProgressBadge).toHaveAttribute('data-status', 'in_progress');
    expect(inProgressBadge.querySelector('svg')).toBeTruthy();
    expect(inProgressBadge).toHaveClass('status-in-progress');
  });

  it('should display backlog/todo badge with Lucide Circle icon', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14188')).toBeInTheDocument();
    });

    const backlogBadge = screen.getByTestId('story-status-badge-MSSCI-14188');
    expect(backlogBadge).toHaveAttribute('data-status', 'backlog');
    expect(backlogBadge.querySelector('svg')).toBeTruthy();
    expect(backlogBadge).toHaveClass('status-backlog');
  });

  it('should display blocked badge with Lucide AlertTriangle icon', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14191')).toBeInTheDocument();
    });

    const blockedBadge = screen.getByTestId('story-status-badge-MSSCI-14191');
    expect(blockedBadge).toHaveAttribute('data-status', 'blocked');
    expect(blockedBadge.querySelector('svg')).toBeTruthy();
    expect(blockedBadge).toHaveClass('status-blocked');
  });

  it('should have accessible label on status badges', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14187')).toBeInTheDocument();
    });

    const doneBadge = screen.getByTestId('story-status-badge-MSSCI-14187');
    expect(doneBadge).toHaveAttribute('aria-label', 'Status: done');

    const blockedBadge = screen.getByTestId('story-status-badge-MSSCI-14191');
    expect(blockedBadge).toHaveAttribute('aria-label', 'Status: blocked');
  });
});

// =============================================================================
// AC4: Context file existence shown for stories
// =============================================================================

describe('AC4: Story context file existence indicator', () => {
  it('should display context indicator when story hasContext is true', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-MSSCI-14187')).toBeInTheDocument();
    });

    const storyWithContext = screen.getByTestId('story-item-MSSCI-14187');
    const contextIndicator = within(storyWithContext).getByTestId(
      'story-context-indicator-MSSCI-14187'
    );
    expect(contextIndicator).toBeInTheDocument();
    expect(contextIndicator).toHaveAttribute('data-has-context', 'true');
  });

  it('should display "no context" indicator when story hasContext is false', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-MSSCI-14188')).toBeInTheDocument();
    });

    const storyWithoutContext = screen.getByTestId('story-item-MSSCI-14188');
    const contextIndicator = within(storyWithoutContext).getByTestId(
      'story-context-indicator-MSSCI-14188'
    );
    expect(contextIndicator).toBeInTheDocument();
    expect(contextIndicator).toHaveAttribute('data-has-context', 'false');
  });

  it('should visually distinguish stories missing context', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-MSSCI-14188')).toBeInTheDocument();
    });

    const storyWithoutContext = screen.getByTestId('story-item-MSSCI-14188');
    expect(storyWithoutContext).toHaveClass('missing-context');
  });

  it('should have accessible tooltip explaining context indicator', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-context-indicator-MSSCI-14187')).toBeInTheDocument();
    });

    const indicatorWithContext = screen.getByTestId('story-context-indicator-MSSCI-14187');
    expect(indicatorWithContext).toHaveAttribute('title', expect.stringMatching(/context/i));

    const indicatorWithoutContext = screen.getByTestId('story-context-indicator-MSSCI-14188');
    expect(indicatorWithoutContext).toHaveAttribute('title', expect.stringMatching(/no context/i));
  });
});

// =============================================================================
// AC5: Consistent styling with Cyclist design system
// =============================================================================

describe('AC5: Cyclist design system styling', () => {
  it('should use Cyclist color tokens for status badges', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14187')).toBeInTheDocument();
    });

    // Status badges should have Cyclist-prefixed CSS classes
    const doneBadge = screen.getByTestId('story-status-badge-MSSCI-14187');
    expect(doneBadge.className).toMatch(/cyclist-|status-/);
  });

  it('should style context indicators consistently with panel theme', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-context-indicator-epic-76')).toBeInTheDocument();
    });

    const contextIndicator = screen.getByTestId('epic-context-indicator-epic-76');
    expect(contextIndicator.className).toMatch(/context-indicator|cyclist-/);
  });

  it('should style Jira links with appropriate colors', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-jira-link-MSSCI-14187')).toBeInTheDocument();
    });

    const jiraLink = screen.getByTestId('story-jira-link-MSSCI-14187');
    expect(jiraLink.className).toMatch(/jira-link|cyclist-link/);
  });

  it('should apply blocked status styling with warning color', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-item-MSSCI-14191')).toBeInTheDocument();
    });

    const blockedStory = screen.getByTestId('story-item-MSSCI-14191');
    expect(blockedStory).toHaveClass('story-blocked');
  });

  it('should maintain consistent spacing and alignment', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree-view')).toBeInTheDocument();
    });

    // All story items should have consistent structure
    const storyItems = screen.getAllByTestId(/^story-item-/);
    expect(storyItems.length).toBeGreaterThan(0);

    storyItems.forEach((item) => {
      // Each story should have the metadata elements in consistent order
      const statusBadge = item.querySelector('[data-testid^="story-status-badge-"]');
      const contextIndicator = item.querySelector('[data-testid^="story-context-indicator-"]');

      expect(statusBadge).toBeInTheDocument();
      expect(contextIndicator).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Integration: Metadata rendering in tree view
// =============================================================================

describe('Integration: Metadata in epic tree view', () => {
  it('should render all metadata elements for stories in epic group', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-76')).toBeInTheDocument();
    });

    const epic = screen.getByTestId('epic-group-epic-76');

    // Check epic has context indicator
    expect(within(epic).getByTestId('epic-context-indicator-epic-76')).toBeInTheDocument();

    // Check first story has all metadata
    const story = within(epic).getByTestId('story-item-MSSCI-14187');
    expect(within(story).getByTestId('story-jira-link-MSSCI-14187')).toBeInTheDocument();
    expect(within(story).getByTestId('story-status-badge-MSSCI-14187')).toBeInTheDocument();
    expect(within(story).getByTestId('story-context-indicator-MSSCI-14187')).toBeInTheDocument();
  });

  it('should update metadata when WebSocket sends updated data', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14209')).toBeInTheDocument();
    });

    // Initially in_progress
    expect(screen.getByTestId('story-status-badge-MSSCI-14209')).toHaveAttribute(
      'data-status',
      'in_progress'
    );

    // Simulate story completion via WebSocket
    const updatedData = createMockSprintData();
    updatedData.epics[0].stories[1].status = 'done';

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.simulateMessage({ type: 'update', ...updatedData });

    await waitFor(() => {
      expect(screen.getByTestId('story-status-badge-MSSCI-14209')).toHaveAttribute(
        'data-status',
        'done'
      );
    });
  });

  it('should handle mixed context states within same epic', async () => {
    const { EnhancedSprintPanel } = await import(
      '../src/public/components/panels/SprintPanel'
    );
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('epic-group-epic-76')).toBeInTheDocument();
    });

    // Story with context
    const storyWithContext = screen.getByTestId('story-context-indicator-MSSCI-14187');
    expect(storyWithContext).toHaveAttribute('data-has-context', 'true');

    // Story without context (in same epic)
    const storyWithoutContext = screen.getByTestId('story-context-indicator-MSSCI-14188');
    expect(storyWithoutContext).toHaveAttribute('data-has-context', 'false');
  });
});
