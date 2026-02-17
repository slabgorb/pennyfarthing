/**
 * 86-11: TandemPanel Tests
 *
 * Tests for the TandemPanel component with real-time tandem observation display.
 * Story: 86-11 - Cyclist: Tandem dialogue panel
 * Epic: epic-86 (Agent Collaboration — Tandem to Teams)
 *
 * Acceptance Criteria:
 * - AC1: New TandemPanel component reads .session/{story-id}-tandem-{partner}.md format
 * - AC2: Displays consultation exchanges with agent portraits
 * - AC3: Shows real-time updates as new consultations happen
 * - AC4: Outcome badges: applied (green), deferred (yellow), rejected (red)
 * - AC5: Metrics summary: exchange count, token overhead, confidence distribution
 * - AC6: Panel registered in DockviewWorkspace.tsx (PANEL_INVENTORY, PANEL_TITLES, RIGHT_SIDEBAR_PANELS)
 * - AC7: Panel registered in App.tsx via registerPanelComponent()
 * - AC8: Panel hidden when no tandem activity (empty state handling)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { TandemPanel } from '../src/public/components/panels/TandemPanel';
import type {
  TandemObservation,
  TandemHeader,
  TandemMetrics,
  TandemMessage,
} from '../src/public/hooks/useTandemObservations';

// ============================================================================
// WebSocket Tracking
// ============================================================================

let tandemWs: any = null;

// ============================================================================
// Test Fixtures
// ============================================================================

const mockHeader: TandemHeader = {
  storyId: '86-11',
  observer: 'architect',
  character: 'The Man in Black',
  phase: 'red',
  startedAt: '2026-02-17T14:23:45.123Z',
  theme: 'princess-bride',
  slug: 'the-man-in-black',
};

const mockObservation = (overrides: Partial<TandemObservation> = {}): TandemObservation => ({
  timestamp: '2026-02-17T14:25:00.000Z',
  time: '14:25',
  trigger: {
    scope: 'file-watch',
    detail: 'UserService.ts modified',
  },
  content: 'The pattern suggests the service needs stronger type safety around null returns.',
  outcome: undefined,
  confidence: undefined,
  ...overrides,
});

const mockObservations: TandemObservation[] = [
  mockObservation({
    timestamp: '2026-02-17T14:25:00.000Z',
    time: '14:25',
    trigger: { scope: 'file-watch', detail: 'UserService.ts modified' },
    content: 'The pattern suggests the service needs stronger type safety around null returns.',
    outcome: 'applied',
    confidence: 0.85,
  }),
  mockObservation({
    timestamp: '2026-02-17T14:28:00.000Z',
    time: '14:28',
    trigger: { scope: 'tool-watch', detail: 'Bash: npm test' },
    content: 'Tests are covering happy path but missing edge cases for missing user IDs.',
    outcome: 'deferred',
    confidence: 0.6,
  }),
  mockObservation({
    timestamp: '2026-02-17T14:32:00.000Z',
    time: '14:32',
    trigger: { scope: 'context-watch', detail: 'AC coverage' },
    content: 'Suggest extracting validation into a shared helper — but this is out of scope for this story.',
    outcome: 'rejected',
    confidence: 0.4,
  }),
];

const mockMetrics: TandemMetrics = {
  exchangeCount: 3,
  tokenOverhead: 12.5,
  confidenceDistribution: {
    high: 1,
    medium: 1,
    low: 1,
  },
  outcomeBreakdown: {
    applied: 1,
    deferred: 1,
    rejected: 1,
  },
};

// ============================================================================
// Helpers
// ============================================================================

/** Get all observation cards rendered in the panel */
function getObservationCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-testid="tandem-observation"]'));
}

/** Get outcome badges from the panel */
function getOutcomeBadges(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-testid="outcome-badge"]'));
}

/** Get the metrics section */
function getMetricsSection(): HTMLElement | null {
  return document.querySelector('[data-testid="tandem-metrics"]');
}

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  tandemWs = null;

  // Intercept WebSocket to capture /ws/tandem connection
  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      if (url.includes('/ws/tandem')) {
        tandemWs = this;
      }
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// AC1: Reads .session/{story-id}-tandem-{partner}.md format
// ============================================================================

describe('AC1: TandemPanel reads observation file format', () => {
  it('should render the panel container', async () => {
    render(<TandemPanel />);

    const panel = document.querySelector('.tandem-panel');
    expect(panel).not.toBeNull();
  });

  it('should connect to /ws/tandem WebSocket endpoint', async () => {
    render(<TandemPanel />);

    await waitFor(() => {
      expect(tandemWs).not.toBeNull();
    });
    expect(tandemWs.url).toContain('/ws/tandem');
  });

  it('should display observations from init message', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    // Simulate server sending init with observations
    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      const cards = getObservationCards();
      expect(cards.length).toBe(3);
    });
  });

  it('should display observer header with character name and phase', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(screen.getByText('The Man in Black')).toBeInTheDocument();
    });
    const phaseEl = screen.getByTestId('observer-phase');
    expect(phaseEl.textContent).toMatch(/red/i);
  });

  it('should parse trigger scope and detail for each observation', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: [mockObservations[0]],
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(screen.getByText(/file-watch/)).toBeInTheDocument();
      expect(screen.getByText(/UserService\.ts modified/)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC2: Displays consultation exchanges with agent portraits
// ============================================================================

describe('AC2: Displays exchanges with agent portraits', () => {
  it('should render agent portrait image using theme and slug', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      const portrait = document.querySelector('img[data-testid="observer-portrait"]') as HTMLImageElement;
      expect(portrait).not.toBeNull();
      expect(portrait.src).toContain('/portraits/princess-bride/medium/the-man-in-black.png');
    });
  });

  it('should display timestamp for each exchange', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(screen.getByText('14:25')).toBeInTheDocument();
      expect(screen.getByText('14:28')).toBeInTheDocument();
      expect(screen.getByText('14:32')).toBeInTheDocument();
    });
  });

  it('should display observation content text', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: [mockObservations[0]],
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(screen.getByText(/stronger type safety around null returns/)).toBeInTheDocument();
    });
  });

  it('should display observer role badge', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      const badge = document.querySelector('[data-testid="observer-role-badge"]');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toContain('architect');
    });
  });
});

// ============================================================================
// AC3: Real-time updates as new consultations happen
// ============================================================================

describe('AC3: Real-time updates', () => {
  it('should append new observation from WebSocket update', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    // Start with one observation
    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: [mockObservations[0]],
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(getObservationCards().length).toBe(1);
    });

    // New observation arrives via WebSocket
    const newObservation = mockObservation({
      timestamp: '2026-02-17T14:35:00.000Z',
      time: '14:35',
      trigger: { scope: 'file-watch', detail: 'test.spec.ts added' },
      content: 'New test file added — good coverage of edge cases.',
      outcome: 'applied',
      confidence: 0.9,
    });

    tandemWs.simulateMessage({
      type: 'observation',
      observation: newObservation,
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(getObservationCards().length).toBe(2);
    });

    expect(screen.getByText(/New test file added/)).toBeInTheDocument();
  });

  it('should handle rapid consecutive updates without data loss', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: [],
    } satisfies TandemMessage);

    // Fire 5 observations rapidly
    for (let i = 0; i < 5; i++) {
      tandemWs.simulateMessage({
        type: 'observation',
        observation: mockObservation({
          timestamp: `2026-02-17T14:${30 + i}:00.000Z`,
          time: `14:${30 + i}`,
          content: `Rapid observation ${i + 1}`,
        }),
      } satisfies TandemMessage);
    }

    await waitFor(() => {
      expect(getObservationCards().length).toBe(5);
    });
  });

  it('should update metrics when new metrics message arrives', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    // Metrics update
    tandemWs.simulateMessage({
      type: 'metrics',
      metrics: { ...mockMetrics, exchangeCount: 10, tokenOverhead: 18.2 },
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(screen.getByText(/10/)).toBeInTheDocument();
      expect(screen.getByText(/18\.2%/)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC4: Outcome badges (applied/deferred/rejected)
// ============================================================================

describe('AC4: Outcome badges', () => {
  async function renderWithObservations() {
    render(<TandemPanel />);
    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(getObservationCards().length).toBe(3);
    });
  }

  it('should show green badge for applied outcome', async () => {
    await renderWithObservations();

    const badges = getOutcomeBadges();
    const appliedBadge = badges.find(b => b.textContent?.toLowerCase().includes('applied'));
    expect(appliedBadge).toBeDefined();
    expect(appliedBadge!.classList.contains('outcome-applied') || appliedBadge!.dataset.outcome === 'applied').toBe(true);
  });

  it('should show yellow badge for deferred outcome', async () => {
    await renderWithObservations();

    const badges = getOutcomeBadges();
    const deferredBadge = badges.find(b => b.textContent?.toLowerCase().includes('deferred'));
    expect(deferredBadge).toBeDefined();
    expect(deferredBadge!.classList.contains('outcome-deferred') || deferredBadge!.dataset.outcome === 'deferred').toBe(true);
  });

  it('should show red badge for rejected outcome', async () => {
    await renderWithObservations();

    const badges = getOutcomeBadges();
    const rejectedBadge = badges.find(b => b.textContent?.toLowerCase().includes('rejected'));
    expect(rejectedBadge).toBeDefined();
    expect(rejectedBadge!.classList.contains('outcome-rejected') || rejectedBadge!.dataset.outcome === 'rejected').toBe(true);
  });

  it('should not show badge when outcome is undefined', async () => {
    render(<TandemPanel />);
    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: [mockObservation({ outcome: undefined })],
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(getObservationCards().length).toBe(1);
    });

    // Should have no outcome badge on this card
    const badges = getOutcomeBadges();
    expect(badges.length).toBe(0);
  });
});

// ============================================================================
// AC5: Metrics summary
// ============================================================================

describe('AC5: Metrics summary', () => {
  it('should display exchange count', async () => {
    render(<TandemPanel />);
    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    tandemWs.simulateMessage({
      type: 'metrics',
      metrics: mockMetrics,
    } satisfies TandemMessage);

    await waitFor(() => {
      const metricsSection = getMetricsSection();
      expect(metricsSection).not.toBeNull();
      expect(metricsSection!.textContent).toContain('3');
    });
  });

  it('should display token overhead percentage', async () => {
    render(<TandemPanel />);
    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    tandemWs.simulateMessage({
      type: 'metrics',
      metrics: mockMetrics,
    } satisfies TandemMessage);

    await waitFor(() => {
      const metricsSection = getMetricsSection();
      expect(metricsSection).not.toBeNull();
      expect(metricsSection!.textContent).toContain('12.5%');
    });
  });

  it('should display confidence distribution', async () => {
    render(<TandemPanel />);
    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    tandemWs.simulateMessage({
      type: 'metrics',
      metrics: mockMetrics,
    } satisfies TandemMessage);

    await waitFor(() => {
      const metricsSection = getMetricsSection();
      expect(metricsSection).not.toBeNull();
      // Should show high/medium/low counts
      expect(metricsSection!.textContent).toMatch(/high/i);
      expect(metricsSection!.textContent).toMatch(/medium/i);
      expect(metricsSection!.textContent).toMatch(/low/i);
    });
  });

  it('should update metrics when new observations arrive', async () => {
    render(<TandemPanel />);
    await waitFor(() => expect(tandemWs).not.toBeNull());

    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    tandemWs.simulateMessage({
      type: 'metrics',
      metrics: mockMetrics,
    } satisfies TandemMessage);

    await waitFor(() => {
      const metricsSection = getMetricsSection();
      expect(metricsSection!.textContent).toContain('3');
    });

    // Updated metrics
    tandemWs.simulateMessage({
      type: 'metrics',
      metrics: { ...mockMetrics, exchangeCount: 7, tokenOverhead: 22.1 },
    } satisfies TandemMessage);

    await waitFor(() => {
      const metricsSection = getMetricsSection();
      expect(metricsSection!.textContent).toContain('7');
      expect(metricsSection!.textContent).toContain('22.1%');
    });
  });
});

// ============================================================================
// AC6: Panel registration in DockviewWorkspace
// ============================================================================

describe('AC6: Panel registration in DockviewWorkspace', () => {
  it('should have TANDEM in PANEL_INVENTORY', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');
    expect((PANEL_INVENTORY as Record<string, string>).TANDEM).toBeDefined();
    expect((PANEL_INVENTORY as Record<string, string>).TANDEM).toBe('tandem');
  });

  it('should include tandem in RIGHT_SIDEBAR_PANELS', async () => {
    const { RIGHT_SIDEBAR_PANELS } = await import('../src/public/components/DockviewWorkspace');
    expect((RIGHT_SIDEBAR_PANELS as readonly string[])).toContain('tandem');
  });
});

// ============================================================================
// AC7: Panel exported from panels/index.ts
// ============================================================================

describe('AC7: Panel export and barrel', () => {
  it('should export TandemPanel from panels/index.ts', async () => {
    const panels = await import('../src/public/components/panels/index');
    expect((panels as Record<string, unknown>).TandemPanel).toBeDefined();
  });
});

// ============================================================================
// AC8: Empty state when no tandem activity
// ============================================================================

describe('AC8: Empty state handling', () => {
  it('should show empty state when no observations and no header', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    // Init with empty data — no tandem activity
    tandemWs.simulateMessage({
      type: 'init',
      header: undefined,
      observations: [],
    });

    await waitFor(() => {
      const emptyState = document.querySelector('[data-testid="tandem-empty-state"]');
      expect(emptyState).not.toBeNull();
    });
  });

  it('should hide empty state when observations arrive', async () => {
    render(<TandemPanel />);

    await waitFor(() => expect(tandemWs).not.toBeNull());

    // Start empty
    tandemWs.simulateMessage({
      type: 'init',
      header: undefined,
      observations: [],
    });

    await waitFor(() => {
      expect(document.querySelector('[data-testid="tandem-empty-state"]')).not.toBeNull();
    });

    // Now observations arrive
    tandemWs.simulateMessage({
      type: 'init',
      header: mockHeader,
      observations: mockObservations,
    } satisfies TandemMessage);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="tandem-empty-state"]')).toBeNull();
      expect(getObservationCards().length).toBe(3);
    });
  });

  it('should show loading state initially before WebSocket connects', () => {
    render(<TandemPanel />);

    // Before WebSocket connects, should show loading or empty — not observations
    const cards = getObservationCards();
    expect(cards.length).toBe(0);
  });
});
