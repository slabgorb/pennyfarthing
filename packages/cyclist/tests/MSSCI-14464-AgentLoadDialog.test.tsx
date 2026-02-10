/**
 * MSSCI-14464: Agent Load Analyzer — Story 82-3: AgentLoadDialog component
 *
 * Tests the dialog UI that displays ranked agent token data with
 * expandable rows, sidecar pruning, and integration into DebugPanel.
 *
 * Acceptance Criteria tested:
 * - AC5: AgentLoadDialog opens as a shadcn Dialog (not AlertDialog)
 * - AC6: Ranked table with all 10 agents sorted by totalTokens descending
 * - AC7: Each row shows agent name, formatted token count, progress bar
 * - AC8: Clicking row expands Collapsible with per-component breakdown
 * - AC9: Component names formatted using formatComponentName()
 * - AC10: Sidecar section with Clear buttons triggering ConfirmDialog (isDanger: true)
 * - AC11: After prune: shows tokensFreed feedback and auto-refreshes
 * - AC13: Total row at bottom shows totalAcrossAllAgents
 * - AC14: cachedAt timestamp displayed
 * - AC15: Loading state shows skeleton placeholders
 * - AC16: Error state shows error message with retry button
 * - AC17: Dialog opened from DebugPanel via "Analyze All Agents" button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// This import will fail — the component doesn't exist yet (RED state)
import { AgentLoadDialog } from '../src/public/components/AgentLoadDialog.js';
import type { AgentLoadData } from '../src/public/hooks/useAgentLoad.js';

// Mock the hook at module level
const mockRefresh = vi.fn();
const mockPruneSidecar = vi.fn();

const MOCK_DATA: AgentLoadData = {
  agents: [
    {
      agent: 'sm',
      totalTokens: 5200,
      tokenCounts: { agent_definition: 2000, persona: 1200, sidecars: 800, behavior_guide: 1200 },
      components: [
        { name: 'agent_definition', tokens: 2000, source: '.pennyfarthing/agents/sm.md' },
        { name: 'persona', tokens: 1200, source: null },
        { name: 'sidecars', tokens: 800, source: '.pennyfarthing/sidecars/sm/' },
        { name: 'behavior_guide', tokens: 1200, source: null },
      ],
    },
    {
      agent: 'dev',
      totalTokens: 4800,
      tokenCounts: { agent_definition: 1800, persona: 1000, sidecars: 900, behavior_guide: 1100 },
      components: [
        { name: 'agent_definition', tokens: 1800, source: '.pennyfarthing/agents/dev.md' },
        { name: 'persona', tokens: 1000, source: null },
        { name: 'sidecars', tokens: 900, source: '.pennyfarthing/sidecars/dev/' },
      ],
    },
    {
      agent: 'tea',
      totalTokens: 4600,
      tokenCounts: { agent_definition: 1700, persona: 1100, sidecars: 700, behavior_guide: 1100 },
      components: [],
    },
    { agent: 'reviewer', totalTokens: 4400, tokenCounts: {}, components: [] },
    { agent: 'architect', totalTokens: 4200, tokenCounts: {}, components: [] },
    { agent: 'pm', totalTokens: 3800, tokenCounts: {}, components: [] },
    { agent: 'tech-writer', totalTokens: 3600, tokenCounts: {}, components: [] },
    { agent: 'ux-designer', totalTokens: 3400, tokenCounts: {}, components: [] },
    { agent: 'devops', totalTokens: 3200, tokenCounts: {}, components: [] },
    { agent: 'orchestrator', totalTokens: 3000, tokenCounts: {}, components: [] },
  ],
  cachedAt: '2026-02-08T12:30:00.000Z',
  totalAcrossAllAgents: 40200,
};

vi.mock('../src/public/hooks/useAgentLoad.js', () => ({
  useAgentLoad: vi.fn(() => ({
    data: null as AgentLoadData | null,
    isLoading: false,
    error: null as Error | null,
    refresh: mockRefresh,
    pruneSidecar: mockPruneSidecar,
    pruneResult: null,
  })),
}));

// Import the mock so we can change return values per test
import { useAgentLoad } from '../src/public/hooks/useAgentLoad.js';
const mockUseAgentLoad = useAgentLoad as ReturnType<typeof vi.fn>;

describe('MSSCI-14464: AgentLoadDialog Component (Story 82-3)', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockPruneSidecar.mockReset();
    mockUseAgentLoad.mockReturnValue({
      data: MOCK_DATA,
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      pruneSidecar: mockPruneSidecar,
      pruneResult: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // AC5: Dialog renders as shadcn Dialog
  // ===========================================================================

  describe('AC5: Dialog opens as shadcn Dialog', () => {
    it('should render dialog content when isOpen is true', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);
      // Dialog should be visible with a title
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render dialog content when isOpen is false', () => {
      render(<AgentLoadDialog isOpen={false} onClose={vi.fn()} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should call refresh when dialog opens', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC6: Ranked table sorted by totalTokens descending
  // ===========================================================================

  describe('AC6: Ranked table with 10 agents sorted descending', () => {
    it('should display all 10 agents', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText('sm')).toBeInTheDocument();
      expect(screen.getByText('dev')).toBeInTheDocument();
      expect(screen.getByText('tea')).toBeInTheDocument();
      expect(screen.getByText('reviewer')).toBeInTheDocument();
      expect(screen.getByText('architect')).toBeInTheDocument();
      expect(screen.getByText('pm')).toBeInTheDocument();
      expect(screen.getByText('tech-writer')).toBeInTheDocument();
      expect(screen.getByText('ux-designer')).toBeInTheDocument();
      expect(screen.getByText('devops')).toBeInTheDocument();
      expect(screen.getByText('orchestrator')).toBeInTheDocument();
    });

    it('should sort agents by totalTokens in descending order', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      // Get all agent rows — they should be in descending token order
      const rows = screen.getAllByTestId(/^agent-row-/);
      expect(rows).toHaveLength(10);

      // First row should be 'sm' (5200 tokens), last should be 'orchestrator' (3000)
      expect(rows[0]).toHaveAttribute('data-testid', 'agent-row-sm');
      expect(rows[rows.length - 1]).toHaveAttribute('data-testid', 'agent-row-orchestrator');
    });
  });

  // ===========================================================================
  // AC7: Each row shows agent name, formatted tokens, progress bar
  // ===========================================================================

  describe('AC7: Agent row content', () => {
    it('should display formatted token count with toLocaleString', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      // 5200 should be displayed as "5,200"
      expect(screen.getByText('5,200')).toBeInTheDocument();
      // 4800 as "4,800"
      expect(screen.getByText('4,800')).toBeInTheDocument();
    });

    it('should display a progress bar for each agent', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars.length).toBeGreaterThanOrEqual(10);
    });
  });

  // ===========================================================================
  // AC8: Clicking row expands Collapsible with component breakdown
  // ===========================================================================

  describe('AC8: Expandable rows with component breakdown', () => {
    it('should not show component breakdown initially', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      // Component details should be hidden initially
      expect(screen.queryByText('Agent Definition')).not.toBeInTheDocument();
    });

    it('should show component breakdown when agent row is clicked', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      // Click the first agent row (sm)
      const smRow = screen.getByTestId('agent-row-sm');
      fireEvent.click(smRow);

      await waitFor(() => {
        // Component names should now be visible (formatted from snake_case)
        expect(screen.getByText('Agent Definition')).toBeInTheDocument();
      });
    });

    it('should collapse component breakdown when clicked again', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      const smRow = screen.getByTestId('agent-row-sm');

      // Open
      fireEvent.click(smRow);
      await waitFor(() => {
        expect(screen.getByText('Agent Definition')).toBeInTheDocument();
      });

      // Close
      fireEvent.click(smRow);
      await waitFor(() => {
        expect(screen.queryByText('Agent Definition')).not.toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // AC9: Component names formatted via formatComponentName
  // ===========================================================================

  describe('AC9: Component names formatted using formatComponentName()', () => {
    it('should format agent_definition as "Agent Definition"', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByTestId('agent-row-sm'));

      await waitFor(() => {
        expect(screen.getByText('Agent Definition')).toBeInTheDocument();
      });
    });

    it('should format behavior_guide as "Behavior Guide"', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByTestId('agent-row-sm'));

      await waitFor(() => {
        expect(screen.getByText('Behavior Guide')).toBeInTheDocument();
      });
    });

    it('should display token count next to each component name', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByTestId('agent-row-sm'));

      await waitFor(() => {
        // agent_definition = 2000 tokens → "2,000"
        expect(screen.getByText('2,000')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // AC10: Sidecar section with Clear buttons + ConfirmDialog
  // ===========================================================================

  describe('AC10: Sidecar Clear buttons with ConfirmDialog', () => {
    it('should show Clear buttons for sidecar files in expanded row', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByTestId('agent-row-sm'));

      await waitFor(() => {
        // Should have Clear buttons for patterns.md, gotchas.md, decisions.md
        const clearButtons = screen.getAllByRole('button', { name: /clear/i });
        expect(clearButtons.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('should show confirmation dialog when Clear is clicked', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByTestId('agent-row-sm'));

      await waitFor(() => {
        const clearButtons = screen.getAllByRole('button', { name: /clear/i });
        expect(clearButtons.length).toBeGreaterThanOrEqual(1);
      });

      // Click first Clear button
      const clearButtons = screen.getAllByRole('button', { name: /clear/i });
      fireEvent.click(clearButtons[0]);

      await waitFor(() => {
        // ConfirmDialog should appear with danger styling
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });
    });

    it('should call pruneSidecar when confirmation is accepted', async () => {
      mockPruneSidecar.mockResolvedValue(undefined);

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByTestId('agent-row-sm'));

      await waitFor(() => {
        const clearButtons = screen.getAllByRole('button', { name: /clear/i });
        expect(clearButtons.length).toBeGreaterThanOrEqual(1);
      });

      // Click Clear for patterns.md
      const clearButtons = screen.getAllByRole('button', { name: /clear/i });
      fireEvent.click(clearButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      // Confirm the dialog
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockPruneSidecar).toHaveBeenCalledWith('sm', expect.stringMatching(/\.md$/));
      });
    });
  });

  // ===========================================================================
  // AC11: After prune — tokensFreed feedback + auto-refresh
  // ===========================================================================

  describe('AC11: Post-prune feedback and auto-refresh', () => {
    it('should display tokensFreed feedback after successful prune', async () => {
      mockUseAgentLoad.mockReturnValue({
        data: MOCK_DATA,
        isLoading: false,
        error: null,
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: { success: true, tokensFreed: 250, agent: 'sm', file: 'patterns.md' },
      });

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/250/)).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // AC13: Total row removed — bars now use threshold colors instead
  // ===========================================================================

  describe('AC13: No total row (removed by design)', () => {
    it('should not display a total row', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
    });

    it('should still display all individual agent token counts', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText('5,200')).toBeInTheDocument();
      expect(screen.getByText('3,000')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC14: cachedAt timestamp displayed
  // ===========================================================================

  describe('AC14: cachedAt timestamp displayed', () => {
    it('should display the cachedAt timestamp', () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      // Should show some representation of the cached time
      expect(screen.getByTestId('cached-at')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC15: Loading state with skeletons
  // ===========================================================================

  describe('AC15: Loading state shows skeleton placeholders', () => {
    it('should show skeleton loaders when isLoading is true', () => {
      mockUseAgentLoad.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: null,
      });

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      const skeletons = screen.getAllByTestId(/skeleton/i);
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show agent data during loading', () => {
      mockUseAgentLoad.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: null,
      });

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.queryByTestId('agent-row-sm')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC16: Error state with retry button
  // ===========================================================================

  describe('AC16: Error state with retry button', () => {
    it('should display error message when hook has error', () => {
      mockUseAgentLoad.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to load agent data'),
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: null,
      });

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText(/failed to load agent data/i)).toBeInTheDocument();
    });

    it('should show a retry button in error state', () => {
      mockUseAgentLoad.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: null,
      });

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('should call refresh when retry button is clicked', () => {
      mockUseAgentLoad.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: null,
      });

      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('Edge cases', () => {
    it('should handle agent with null totalTokens gracefully', () => {
      const dataWithFailedAgent: AgentLoadData = {
        ...MOCK_DATA,
        agents: [
          ...MOCK_DATA.agents.slice(0, 9),
          { agent: 'orchestrator', totalTokens: null, error: 'Failed to load', tokenCounts: {}, components: [] } as any,
        ],
      };

      mockUseAgentLoad.mockReturnValue({
        data: dataWithFailedAgent,
        isLoading: false,
        error: null,
        refresh: mockRefresh,
        pruneSidecar: mockPruneSidecar,
        pruneResult: null,
      });

      // Should not throw
      expect(() => {
        render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);
      }).not.toThrow();
    });

    it('should handle empty components array in expanded row', async () => {
      render(<AgentLoadDialog isOpen={true} onClose={vi.fn()} />);

      // Click an agent with empty components (reviewer)
      const reviewerRow = screen.getByTestId('agent-row-reviewer');
      fireEvent.click(reviewerRow);

      // Should not crash, may show "no components" or just sidecar buttons
      await waitFor(() => {
        expect(reviewerRow).toBeInTheDocument();
      });
    });
  });
});
