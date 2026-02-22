/**
 * 120-6: Sprint panel provenance indicator — display layer tests
 *
 * Tests for the Sprint Panel provenance rendering that shows which sprint
 * is active when a non-default sprint is focus-switched via the registry.
 *
 * Story: MSSCI-15411
 * Phase: RED (tests should fail — provenance rendering not yet implemented)
 *
 * Acceptance Criteria covered:
 * - AC1: TUI loads selected sprint (provenance data flows to UI)
 * - AC2: Provenance indicator shows active sprint identity (badge + name)
 * - AC3: Default fallback — no provenance shown for default sprint
 * - AC4: Switching focus updates the TUI (WebSocket update triggers re-render)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Types — mirrors the SprintRegistry shape from the session spec
// =============================================================================

interface SprintRegistry {
  name: string;
  type: string;
  description: string;
  file: string;
  isDefault: boolean;
}

interface MockSprintDataWithRegistry {
  currentStory: { id: string; title: string; points: number; status: string; jiraKey: string } | null;
  nextStory: { id: string; title: string; points: number; status: string; jiraKey: string } | null;
  epics: Array<{
    id: string;
    title: string;
    jiraKey: string | null;
    stories: Array<{ id: string; title: string; points: number; status: string; jiraKey: string }>;
  }>;
  futureEpics: Array<{
    id: string;
    title: string;
    description: string;
    estimatedPoints: number;
    status: string;
  }>;
  sprint: {
    number: number;
    name: string;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
  registry?: SprintRegistry;
}

// =============================================================================
// Fixtures
// =============================================================================

function createSprintDataWithRegistry(registry?: SprintRegistry): MockSprintDataWithRegistry {
  return {
    currentStory: {
      id: '120-6',
      title: 'Sprint panel active sprint preference',
      points: 5,
      status: 'in_progress',
      jiraKey: 'MSSCI-15411',
    },
    nextStory: null,
    epics: [
      {
        id: 'epic-120',
        title: 'Installation, agents and workflows',
        jiraKey: 'MSSCI-15400',
        stories: [
          { id: '120-6', title: 'Sprint panel active sprint preference', points: 5, status: 'in_progress', jiraKey: 'MSSCI-15411' },
        ],
      },
    ],
    futureEpics: [],
    sprint: {
      number: 2608,
      name: 'TO Sprint 2608',
      done: 89,
      remaining: 30,
      inProgress: 5,
      endDate: '2026-03-06',
    },
    ...(registry !== undefined ? { registry } : {}),
  };
}

const SPIKE_REGISTRY: SprintRegistry = {
  name: 'ocsf-rs1',
  type: 'spike',
  description: 'OCSF log source research spike',
  file: 'sprint/spikes/ocsf-rs1.yaml',
  isDefault: false,
};

const RESEARCH_REGISTRY: SprintRegistry = {
  name: 'auth-deep-dive',
  type: 'research',
  description: 'Authentication patterns research',
  file: 'sprint/research/auth-deep-dive.yaml',
  isDefault: false,
};

const DEFAULT_REGISTRY: SprintRegistry = {
  name: 'default',
  type: 'project',
  description: 'Default sprint',
  file: 'sprint/current-sprint.yaml',
  isDefault: true,
};

// =============================================================================
// Mock WebSocket
// =============================================================================

let wsInitData: MockSprintDataWithRegistry | null = null;

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
        const data = wsInitData || createSprintDataWithRegistry();
        this.onmessage({ data: JSON.stringify({ type: 'init', ...data }) });
      }
    }, 0);
  }

  send(_data: string) {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  MockWebSocket.instances = [];
  wsInitData = null;
  (global as any).WebSocket = MockWebSocket;
  (window as any).electronAPI = {
    sprint: {
      archiveEpic: vi.fn(() => Promise.resolve({ success: true })),
      promoteEpic: vi.fn(() => Promise.resolve({ success: true })),
    },
  };
});

afterEach(() => {
  delete (window as any).electronAPI;
  delete (global as any).WebSocket;
  wsInitData = null;
});

// =============================================================================
// AC2: Provenance indicator shows active sprint identity
// =============================================================================

describe('AC2: Provenance indicator for non-default sprint', () => {
  it('should render provenance section when registry is present and not default', async () => {
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });
  });

  it('should display sprint type as a badge', async () => {
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });

    const provenance = screen.getByTestId('sprint-provenance');
    const badge = within(provenance).getByTestId('sprint-type-badge');
    expect(badge).toHaveTextContent('spike');
  });

  it('should display sprint name as text', async () => {
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });

    const provenance = screen.getByTestId('sprint-provenance');
    expect(within(provenance).getByTestId('sprint-name')).toHaveTextContent('ocsf-rs1');
  });

  it('should render different sprint types correctly', async () => {
    wsInitData = createSprintDataWithRegistry(RESEARCH_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });

    const provenance = screen.getByTestId('sprint-provenance');
    expect(within(provenance).getByTestId('sprint-type-badge')).toHaveTextContent('research');
    expect(within(provenance).getByTestId('sprint-name')).toHaveTextContent('auth-deep-dive');
  });
});

// =============================================================================
// AC3: Default fallback — no provenance indicator
// =============================================================================

describe('AC3: No provenance for default sprint', () => {
  it('should NOT render provenance when registry is absent', async () => {
    wsInitData = createSprintDataWithRegistry(); // no registry

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    // Wait for component to finish loading
    await waitFor(() => {
      expect(screen.getByTestId('enhanced-sprint-panel')).toBeInTheDocument();
    });
    // Ensure data loaded (current story visible)
    await waitFor(() => {
      expect(screen.getByTestId('current-story-section')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sprint-provenance')).not.toBeInTheDocument();
  });

  it('should NOT render provenance when registry.isDefault is true', async () => {
    wsInitData = createSprintDataWithRegistry(DEFAULT_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('enhanced-sprint-panel')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-story-section')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sprint-provenance')).not.toBeInTheDocument();
  });
});

// =============================================================================
// AC4: Switching focus updates the TUI
// =============================================================================

describe('AC4: Sprint switch updates provenance', () => {
  it('should update provenance when WS sends new registry data', async () => {
    // Start with no registry (default sprint)
    wsInitData = createSprintDataWithRegistry();

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('current-story-section')).toBeInTheDocument();
    });

    // No provenance initially
    expect(screen.queryByTestId('sprint-provenance')).not.toBeInTheDocument();

    // Simulate config change — WS sends update with registry
    act(() => {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateMessage({
        type: 'update',
        ...createSprintDataWithRegistry(SPIKE_REGISTRY),
      });
    });

    // Provenance should now appear
    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });

    const provenance = screen.getByTestId('sprint-provenance');
    expect(within(provenance).getByTestId('sprint-type-badge')).toHaveTextContent('spike');
    expect(within(provenance).getByTestId('sprint-name')).toHaveTextContent('ocsf-rs1');
  });

  it('should remove provenance when switching back to default', async () => {
    // Start with non-default sprint
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });

    // Simulate switch back to default
    act(() => {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateMessage({
        type: 'update',
        ...createSprintDataWithRegistry(), // no registry = default
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('sprint-provenance')).not.toBeInTheDocument();
    });
  });

  it('should update provenance when switching between non-default sprints', async () => {
    // Start with spike sprint
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      const provenance = screen.getByTestId('sprint-provenance');
      expect(within(provenance).getByTestId('sprint-type-badge')).toHaveTextContent('spike');
    });

    // Switch to research sprint
    act(() => {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateMessage({
        type: 'update',
        ...createSprintDataWithRegistry(RESEARCH_REGISTRY),
      });
    });

    await waitFor(() => {
      const provenance = screen.getByTestId('sprint-provenance');
      expect(within(provenance).getByTestId('sprint-type-badge')).toHaveTextContent('research');
      expect(within(provenance).getByTestId('sprint-name')).toHaveTextContent('auth-deep-dive');
    });
  });
});

// =============================================================================
// AC1: Data flows through — SprintData includes registry
// =============================================================================

describe('AC1: SprintData registry field flows to component', () => {
  it('should accept registry in SprintData without error', async () => {
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');

    // Should not throw during render
    expect(() => {
      render(<EnhancedSprintPanel />);
    }).not.toThrow();

    // Should still render the panel
    await waitFor(() => {
      expect(screen.getByTestId('enhanced-sprint-panel')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Layout: Provenance placement matches visual spec
// =============================================================================

describe('Provenance layout matches visual spec', () => {
  it('should render provenance with flex row layout', async () => {
    wsInitData = createSprintDataWithRegistry(SPIKE_REGISTRY);

    const { EnhancedSprintPanel } = await import('../src/public/components/panels/SprintPanel');
    render(<EnhancedSprintPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('sprint-provenance')).toBeInTheDocument();
    });

    // Provenance should be within the panel header area, using flex layout
    const provenance = screen.getByTestId('sprint-provenance');
    expect(provenance).toBeInTheDocument();

    // Badge and name should be siblings within the provenance container
    const badge = within(provenance).getByTestId('sprint-type-badge');
    const name = within(provenance).getByTestId('sprint-name');
    expect(badge.parentElement).toBe(name.parentElement);
  });
});
