/**
 * MSSCI-14507: TeamPanel Component Tests
 *
 * Tests for the TeamPanel component that visualizes native agent teams.
 * Story: MSSCI-14507 (86-12) - Cyclist: Native team panel
 * Epic: MSSCI-14509 (Agent Collaboration — Tandem to Teams)
 *
 * Acceptance Criteria:
 * - AC1: New TeamPanel dockview panel component created
 * - AC2: Shows team members with persona portraits
 * - AC3: Real-time status: idle, working, blocked
 * - AC4: Task list with completion progress and dependency visualization
 * - AC5: Message feed between agents
 * - AC6: Click agent to view their output
 * - AC7: Panel hidden when native teams not active
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import React from 'react';

import { TeamPanel } from '../src/public/components/panels/TeamPanel';
import { TeamRoster } from '../src/public/components/panels/TeamRoster';
import { TaskTracker } from '../src/public/components/panels/TaskTracker';
import { MessageFeed } from '../src/public/components/panels/MessageFeed';
import type { TeamMember, TaskListItem, TeamMessage } from '../src/public/hooks/useTeamMembers';

// ============================================================================
// Mock Setup
// ============================================================================

let teamWs: any = null;
let tasksWs: any = null;
let messagesWs: any = null;

async function sendTeamData(data: any) {
  await act(async () => {
    teamWs?.onmessage?.({ data: JSON.stringify(data) });
  });
}

async function sendTasksData(data: any) {
  await act(async () => {
    tasksWs?.onmessage?.({ data: JSON.stringify(data) });
  });
}

async function sendMessagesData(data: any) {
  await act(async () => {
    messagesWs?.onmessage?.({ data: JSON.stringify(data) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  teamWs = null;
  tasksWs = null;
  messagesWs = null;

  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      if (url.includes('/ws/team')) {
        teamWs = this;
      } else if (url.includes('/ws/tasks')) {
        tasksWs = this;
      } else if (url.includes('/ws/messages')) {
        messagesWs = this;
      }
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Test Fixtures
// ============================================================================

const mockMembers: TeamMember[] = [
  {
    name: 'architect',
    agentType: 'architect',
    status: 'working',
    portrait: { theme: 'princess-bride', slug: 'man-in-black' },
    currentTask: 'Design API schema',
    taskProgress: 0.6,
  },
  {
    name: 'researcher',
    agentType: 'explore',
    status: 'idle',
    portrait: { theme: 'princess-bride', slug: 'miracle-max' },
  },
  {
    name: 'tester',
    agentType: 'tea',
    status: 'blocked',
    portrait: { theme: 'princess-bride', slug: 'fezzik' },
    currentTask: 'Write integration tests',
  },
];

const mockTasks: TaskListItem[] = [
  {
    id: 'task-1',
    title: 'Design API schema',
    owner: 'architect',
    status: 'in_progress',
  },
  {
    id: 'task-2',
    title: 'Write integration tests',
    owner: 'tester',
    status: 'pending',
    blockedBy: ['task-1'],
  },
  {
    id: 'task-3',
    title: 'Implement core logic',
    status: 'completed',
    owner: 'dev',
  },
];

const mockMessages: TeamMessage[] = [
  {
    from: 'architect',
    to: 'dev',
    content: 'Schema draft ready for review',
    timestamp: '2026-02-17T10:30:00Z',
    type: 'message',
  },
  {
    from: 'dev',
    content: 'Starting implementation',
    timestamp: '2026-02-17T10:32:15Z',
    type: 'broadcast',
  },
  {
    from: 'lead',
    to: 'researcher',
    content: 'Task complete, wrapping up',
    timestamp: '2026-02-17T11:00:00Z',
    type: 'shutdown_request',
  },
];

const mockTeamInit = {
  type: 'init',
  team: {
    id: 'story-86-12-session',
    lead: 'dev',
    created: '2026-02-17T10:30:00Z',
    members: mockMembers,
  },
};

const mockTasksInit = {
  type: 'init',
  tasks: mockTasks,
};

const mockMessagesInit = {
  type: 'init',
  messages: mockMessages,
};

// ============================================================================
// AC1: New TeamPanel dockview panel component created
// ============================================================================

describe('AC1: TeamPanel dockview panel component created', () => {
  it('should render TeamPanel with data-testid', () => {
    render(<TeamPanel />);
    expect(screen.getByTestId('team-panel')).toBeInTheDocument();
  });

  it('should render TeamRoster sub-component', () => {
    render(<TeamPanel />);
    expect(screen.getByTestId('team-roster')).toBeInTheDocument();
  });

  it('should render TaskTracker sub-component', () => {
    render(<TeamPanel />);
    expect(screen.getByTestId('task-tracker')).toBeInTheDocument();
  });

  it('should render MessageFeed sub-component', () => {
    render(<TeamPanel />);
    expect(screen.getByTestId('message-feed')).toBeInTheDocument();
  });

  it('should show loading state while WebSocket connects', () => {
    render(<TeamPanel />);
    expect(screen.getByTestId('team-loading')).toBeInTheDocument();
  });

  it('should show error state when WebSocket fails', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());

    await act(async () => {
      teamWs?.onerror?.(new Error('Connection failed'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('team-error')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC2: Shows team members with persona portraits
// ============================================================================

describe('AC2: Shows team members with persona portraits', () => {
  it('should display each team member from WebSocket init', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const memberCards = screen.getAllByTestId('team-member');
      expect(memberCards).toHaveLength(3);
    });
  });

  it('should render portrait image for each member', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const portraits = screen.getAllByTestId('member-portrait');
      expect(portraits).toHaveLength(3);
    });
  });

  it('should use correct portrait URL from theme and slug', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const portraits = screen.getAllByTestId('member-portrait');
      const img = portraits[0].querySelector('img');
      expect(img).toHaveAttribute('src', '/portraits/princess-bride/medium/man-in-black.png');
    });
  });

  it('should show emoji fallback when portrait image fails', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const portraits = screen.getAllByTestId('member-portrait');
      const img = portraits[0].querySelector('img')!;
      fireEvent.error(img);
    });

    await waitFor(() => {
      expect(screen.getAllByText('🤖').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should display agent name for each member', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      expect(screen.getByText('architect')).toBeInTheDocument();
      expect(screen.getByText('researcher')).toBeInTheDocument();
      expect(screen.getByText('tester')).toBeInTheDocument();
    });
  });

  it('should display agent role/type for each member', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const roles = screen.getAllByTestId('member-role');
      expect(roles).toHaveLength(3);
    });
  });
});

// ============================================================================
// AC2 (TeamRoster unit tests)
// ============================================================================

describe('AC2: TeamRoster sub-component', () => {
  it('should render member cards for each member', () => {
    render(<TeamRoster members={mockMembers} />);
    const cards = screen.getAllByTestId('team-member');
    expect(cards).toHaveLength(3);
  });

  it('should display member name text', () => {
    render(<TeamRoster members={mockMembers} />);
    expect(screen.getByText('architect')).toBeInTheDocument();
  });

  it('should show portrait with correct theme/slug URL', () => {
    render(<TeamRoster members={mockMembers} />);
    const portraits = screen.getAllByTestId('member-portrait');
    const img = portraits[0].querySelector('img');
    expect(img).toHaveAttribute('src', '/portraits/princess-bride/medium/man-in-black.png');
  });

  it('should render empty state when no members', () => {
    render(<TeamRoster members={[]} />);
    expect(screen.getByTestId('roster-empty')).toBeInTheDocument();
  });
});

// ============================================================================
// AC3: Real-time status: idle, working, blocked
// ============================================================================

describe('AC3: Real-time status indicators', () => {
  it('should show "working" status badge for active member', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const badges = screen.getAllByTestId('member-status');
      const workingBadge = badges.find(b => b.textContent?.includes('working'));
      expect(workingBadge).toBeDefined();
    });
  });

  it('should show "idle" status badge for idle member', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const badges = screen.getAllByTestId('member-status');
      const idleBadge = badges.find(b => b.textContent?.includes('idle'));
      expect(idleBadge).toBeDefined();
    });
  });

  it('should show "blocked" status badge for blocked member', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const badges = screen.getAllByTestId('member-status');
      const blockedBadge = badges.find(b => b.textContent?.includes('blocked'));
      expect(blockedBadge).toBeDefined();
    });
  });

  it('should apply status-specific CSS class to badge', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const badges = screen.getAllByTestId('member-status');
      expect(badges[0]).toHaveAttribute('data-status', 'working');
      expect(badges[1]).toHaveAttribute('data-status', 'idle');
      expect(badges[2]).toHaveAttribute('data-status', 'blocked');
    });
  });

  it('should update status when member_update event arrives', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    // Simulate status update
    await sendTeamData({
      type: 'member_update',
      member: { name: 'researcher', agentType: 'explore', status: 'working' },
    });

    await waitFor(() => {
      const badges = screen.getAllByTestId('member-status');
      const researcherBadge = badges.find(b => b.getAttribute('data-status') === 'working' &&
        b.closest('[data-testid="team-member"]')?.textContent?.includes('researcher'));
      expect(researcherBadge).toBeDefined();
    });
  });

  it('should show current task for working/blocked members', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      expect(screen.getByText('Design API schema')).toBeInTheDocument();
      expect(screen.getByText('Write integration tests')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC3 (TeamRoster unit tests for status)
// ============================================================================

describe('AC3: TeamRoster status display', () => {
  it('should render status badges for each member', () => {
    render(<TeamRoster members={mockMembers} />);
    const badges = screen.getAllByTestId('member-status');
    expect(badges).toHaveLength(3);
  });

  it('should apply data-status attribute matching member status', () => {
    render(<TeamRoster members={mockMembers} />);
    const badges = screen.getAllByTestId('member-status');
    expect(badges[0]).toHaveAttribute('data-status', 'working');
    expect(badges[1]).toHaveAttribute('data-status', 'idle');
    expect(badges[2]).toHaveAttribute('data-status', 'blocked');
  });
});

// ============================================================================
// AC4: Task list with completion progress and dependency visualization
// ============================================================================

describe('AC4: Task list with progress and dependencies', () => {
  it('should display all tasks from WebSocket init', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await waitFor(() => {
      const tasks = screen.getAllByTestId('task-item');
      expect(tasks).toHaveLength(3);
    });
  });

  it('should show task title text', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await waitFor(() => {
      expect(screen.getByText('Design API schema')).toBeInTheDocument();
      expect(screen.getByText('Write integration tests')).toBeInTheDocument();
      expect(screen.getByText('Implement core logic')).toBeInTheDocument();
    });
  });

  it('should show task owner for assigned tasks', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await waitFor(() => {
      const owners = screen.getAllByTestId('task-owner');
      expect(owners.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('should show task status (pending, in_progress, completed)', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await waitFor(() => {
      const statuses = screen.getAllByTestId('task-status');
      const statusValues = statuses.map(s => s.getAttribute('data-status'));
      expect(statusValues).toContain('in_progress');
      expect(statusValues).toContain('pending');
      expect(statusValues).toContain('completed');
    });
  });

  it('should visualize blocked dependencies', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await waitFor(() => {
      // Task 2 is blocked by task 1
      const blockedIndicators = screen.getAllByTestId('task-blocked-indicator');
      expect(blockedIndicators.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should show completion progress count', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await waitFor(() => {
      // 1 of 3 tasks completed
      const progress = screen.getByTestId('task-progress-summary');
      expect(progress.textContent).toContain('1');
      expect(progress.textContent).toContain('3');
    });
  });

  it('should update when task_updated event arrives', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(tasksWs).not.toBeNull());
    await sendTasksData(mockTasksInit);

    await sendTasksData({
      type: 'task_updated',
      task: { id: 'task-2', title: 'Write integration tests', owner: 'tester', status: 'in_progress', blockedBy: [] },
    });

    await waitFor(() => {
      const statuses = screen.getAllByTestId('task-status');
      const inProgressCount = statuses.filter(s => s.getAttribute('data-status') === 'in_progress').length;
      expect(inProgressCount).toBe(2);
    });
  });
});

// ============================================================================
// AC4 (TaskTracker unit tests)
// ============================================================================

describe('AC4: TaskTracker sub-component', () => {
  it('should render task items for each task', () => {
    render(<TaskTracker tasks={mockTasks} />);
    const items = screen.getAllByTestId('task-item');
    expect(items).toHaveLength(3);
  });

  it('should display task title text', () => {
    render(<TaskTracker tasks={mockTasks} />);
    expect(screen.getByText('Design API schema')).toBeInTheDocument();
  });

  it('should show blocked indicator for tasks with blockedBy', () => {
    render(<TaskTracker tasks={mockTasks} />);
    const blocked = screen.getAllByTestId('task-blocked-indicator');
    expect(blocked.length).toBeGreaterThanOrEqual(1);
  });

  it('should show progress summary', () => {
    render(<TaskTracker tasks={mockTasks} />);
    const progress = screen.getByTestId('task-progress-summary');
    expect(progress).toBeInTheDocument();
  });

  it('should render empty state when no tasks', () => {
    render(<TaskTracker tasks={[]} />);
    expect(screen.getByTestId('tasks-empty')).toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Message feed between agents
// ============================================================================

describe('AC5: Message feed between agents', () => {
  it('should display all messages from WebSocket init', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(messagesWs).not.toBeNull());
    await sendMessagesData(mockMessagesInit);

    await waitFor(() => {
      const msgs = screen.getAllByTestId('team-message');
      expect(msgs).toHaveLength(3);
    });
  });

  it('should show sender name for each message', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(messagesWs).not.toBeNull());
    await sendMessagesData(mockMessagesInit);

    await waitFor(() => {
      const senders = screen.getAllByTestId('message-sender');
      expect(senders).toHaveLength(3);
      expect(senders[0].textContent).toBe('architect');
    });
  });

  it('should show message content text', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(messagesWs).not.toBeNull());
    await sendMessagesData(mockMessagesInit);

    await waitFor(() => {
      expect(screen.getByText('Schema draft ready for review')).toBeInTheDocument();
      expect(screen.getByText('Starting implementation')).toBeInTheDocument();
    });
  });

  it('should show timestamp for each message', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(messagesWs).not.toBeNull());
    await sendMessagesData(mockMessagesInit);

    await waitFor(() => {
      const timestamps = screen.getAllByTestId('message-timestamp');
      expect(timestamps).toHaveLength(3);
    });
  });

  it('should indicate message type (DM vs broadcast vs shutdown)', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(messagesWs).not.toBeNull());
    await sendMessagesData(mockMessagesInit);

    await waitFor(() => {
      const types = screen.getAllByTestId('message-type');
      const typeValues = types.map(t => t.getAttribute('data-type'));
      expect(typeValues).toContain('message');
      expect(typeValues).toContain('broadcast');
      expect(typeValues).toContain('shutdown_request');
    });
  });

  it('should append new messages when message event arrives', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(messagesWs).not.toBeNull());
    await sendMessagesData(mockMessagesInit);

    await sendMessagesData({
      type: 'message',
      msg: {
        from: 'tester',
        to: 'dev',
        content: 'Tests passing now',
        timestamp: '2026-02-17T11:05:00Z',
      },
    });

    await waitFor(() => {
      const msgs = screen.getAllByTestId('team-message');
      expect(msgs).toHaveLength(4);
    });
  });
});

// ============================================================================
// AC5 (MessageFeed unit tests)
// ============================================================================

describe('AC5: MessageFeed sub-component', () => {
  it('should render message items for each message', () => {
    render(<MessageFeed messages={mockMessages} />);
    const msgs = screen.getAllByTestId('team-message');
    expect(msgs).toHaveLength(3);
  });

  it('should display sender name', () => {
    render(<MessageFeed messages={mockMessages} />);
    const senders = screen.getAllByTestId('message-sender');
    expect(senders[0].textContent).toBe('architect');
  });

  it('should display message content', () => {
    render(<MessageFeed messages={mockMessages} />);
    expect(screen.getByText('Schema draft ready for review')).toBeInTheDocument();
  });

  it('should render empty state when no messages', () => {
    render(<MessageFeed messages={[]} />);
    expect(screen.getByTestId('messages-empty')).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Click agent to view their output
// ============================================================================

describe('AC6: Click agent to view output', () => {
  it('should have clickable member cards', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const members = screen.getAllByTestId('team-member');
      expect(members[0]).toHaveAttribute('role', 'button');
    });
  });

  it('should expand agent output view on member click', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const members = screen.getAllByTestId('team-member');
      fireEvent.click(members[0]);
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-output-view')).toBeInTheDocument();
    });
  });

  it('should show selected agent name in output view', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const members = screen.getAllByTestId('team-member');
      fireEvent.click(members[0]);
    });

    await waitFor(() => {
      const outputView = screen.getByTestId('agent-output-view');
      expect(outputView.textContent).toContain('architect');
    });
  });

  it('should close output view when clicking close button', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      const members = screen.getAllByTestId('team-member');
      fireEvent.click(members[0]);
    });

    await waitFor(() => {
      const closeBtn = screen.getByTestId('agent-output-close');
      fireEvent.click(closeBtn);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('agent-output-view')).not.toBeInTheDocument();
    });
  });

  it('should fire onMemberClick callback in TeamRoster', () => {
    const handleClick = vi.fn();
    render(<TeamRoster members={mockMembers} onMemberClick={handleClick} />);
    const members = screen.getAllByTestId('team-member');
    fireEvent.click(members[0]);
    expect(handleClick).toHaveBeenCalledWith(mockMembers[0]);
  });
});

// ============================================================================
// AC7: Panel hidden when native teams not active
// ============================================================================

describe('AC7: Panel hidden when no active team', () => {
  it('should show empty state when no team is active', () => {
    render(<TeamPanel />);
    expect(screen.getByTestId('team-empty-state')).toBeInTheDocument();
  });

  it('should display "No active team" message', () => {
    render(<TeamPanel />);
    expect(screen.getByText(/no active team/i)).toBeInTheDocument();
  });

  it('should hide empty state after team init arrives', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    await waitFor(() => {
      expect(screen.queryByTestId('team-empty-state')).not.toBeInTheDocument();
    });
  });

  it('should return to empty state after team_disbanded event', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData(mockTeamInit);

    // Team disbanded
    await sendTeamData({ type: 'disbanded' });

    await waitFor(() => {
      expect(screen.getByTestId('team-empty-state')).toBeInTheDocument();
    });
  });

  it('should show team name when team is active', async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());
    await sendTeamData({
      ...mockTeamInit,
      team: { ...mockTeamInit.team, name: 'story-86-12' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('team-name')).toBeInTheDocument();
      expect(screen.getByTestId('team-name').textContent).toContain('story-86-12');
    });
  });
});

// ============================================================================
// WebSocket reconnection
// ============================================================================

describe('WebSocket reconnection', () => {
  it('should attempt reconnection after WebSocket close', async () => {
    vi.useFakeTimers();
    render(<TeamPanel />);

    await waitFor(() => expect(teamWs).not.toBeNull());

    const firstWs = teamWs;
    teamWs = null;

    // Simulate close
    await act(async () => {
      firstWs?.onclose?.();
    });

    // Advance past reconnect timeout
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Should have created a new WebSocket
    expect(teamWs).not.toBeNull();

    vi.useRealTimers();
  });
});
