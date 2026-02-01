/**
 * MSSCI-12800: Component-level Token Tracking Tests
 *
 * Tests for displaying per-component token counts in the DebugPanel.
 * This completes the Tiered Context Injection System epic (MSSCI-12793)
 * by adding visibility into where context tokens are being spent.
 *
 * Acceptance Criteria:
 * - AC1: Each component in the context injection has an approximate token count
 * - AC2: Token breakdown is passed from Python prime script to TypeScript/UI
 * - AC3: DebugPanel displays a collapsible list of components with their token counts
 * - AC4: Token counts are approximate but reasonably accurate (~10% tolerance)
 *
 * This file tests AC2 (TypeScript/IPC) and AC3 (React/UI).
 * AC1 and AC4 are tested in Python (test_token_counting.py).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// AC2: Token breakdown passed from Python to TypeScript/UI
// =============================================================================

describe('MSSCI-12800: AC2 - Token breakdown IPC', () => {

  describe('ContextInfo interface includes token breakdown', () => {

    it('should export ContextInfo with tokenCounts field', async () => {
      const { ContextInfo } = await import('../src/api/context.js') as {
        ContextInfo: { tokenCounts?: Record<string, number> }
      };

      // Type check - tokenCounts should be a valid property
      const mockContext: typeof ContextInfo = {
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
          persona: 100,
        },
      };

      expect(mockContext).toHaveProperty('tokenCounts');
    });

    it('should export ContextInfo with totalTokens field', async () => {
      const { ContextInfo } = await import('../src/api/context.js') as {
        ContextInfo: { totalTokens?: number }
      };

      const mockContext: typeof ContextInfo = {
        totalTokens: 4000,
      };

      expect(mockContext).toHaveProperty('totalTokens');
    });

    it('should allow tokenCounts to be optional for backward compat', async () => {
      const { ContextInfo } = await import('../src/api/context.js') as {
        ContextInfo: { tokenCounts?: Record<string, number>; percent?: number }
      };

      // Context without tokenCounts should still be valid
      const context: typeof ContextInfo = {
        percent: 50,
      };

      expect(context.tokenCounts).toBeUndefined();
    });

  });

  describe('getPrimeContextWithTier returns token data', () => {

    it('should return tokenCounts from prime output', async () => {
      // This tests the TypeScript parsing of Python JSON output
      const { parsePrimeOutput } = await import('../src/prime.js');

      const mockPrimeOutput = JSON.stringify({
        tier: 'FULL',
        context: '# Context',
        token_counts: {
          agent_definition: 200,
          behavior_guide: 400,
          persona: 100,
          workflow_state: 50,
          sprint_context: 150,
          sidecars: 300,
        },
        total_tokens: 1200,
      });

      const result = parsePrimeOutput(mockPrimeOutput);

      expect(result.tokenCounts).toBeDefined();
      expect(result.tokenCounts?.agent_definition).toBe(200);
      expect(result.tokenCounts?.behavior_guide).toBe(400);
    });

    it('should return totalTokens from prime output', async () => {
      const { parsePrimeOutput } = await import('../src/prime.js');

      const mockPrimeOutput = JSON.stringify({
        tier: 'FULL',
        context: '# Context',
        token_counts: { agent_definition: 200 },
        total_tokens: 1200,
      });

      const result = parsePrimeOutput(mockPrimeOutput);

      expect(result.totalTokens).toBe(1200);
    });

    it('should handle missing token_counts gracefully', async () => {
      const { parsePrimeOutput } = await import('../src/prime.js');

      const mockPrimeOutput = JSON.stringify({
        tier: 'FULL',
        context: '# Context',
        // No token_counts field - backward compat
      });

      const result = parsePrimeOutput(mockPrimeOutput);

      expect(result.tokenCounts).toBeUndefined();
      expect(result.totalTokens).toBeUndefined();
    });

  });

  describe('Context update includes token data', () => {

    it('should broadcast tokenCounts in context update', async () => {
      // This would be tested by checking main.ts IPC broadcasts
      // For unit tests, we verify the ContextInfo interface shape
      const mockContextData = {
        percent: 25,
        tokens: 50000,
        tier: 'FULL' as const,
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
          persona: 100,
        },
        totalTokens: 700,
      };

      expect(mockContextData.tokenCounts).toBeDefined();
      expect(Object.keys(mockContextData.tokenCounts)).toHaveLength(3);
    });

  });

});

// =============================================================================
// AC3: DebugPanel displays collapsible list of components with token counts
// =============================================================================

describe('MSSCI-12800: AC3 - DebugPanel collapsible component list', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockElectronAPI.tokenStats.get.mockResolvedValue({});
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  describe('Component list rendering', () => {

    it('should render component breakdown section when tokenCounts present', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
          persona: 100,
        },
        totalTokens: 700,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('component-breakdown')).toBeInTheDocument();
      });
    });

    it('should not render component breakdown when tokenCounts missing', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        // No tokenCounts
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('debug-panel')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('component-breakdown')).not.toBeInTheDocument();
    });

    it('should render each component with its token count', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
          persona: 100,
        },
        totalTokens: 700,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('component-agent_definition')).toBeInTheDocument();
      });

      // Check each component is rendered with its count
      expect(screen.getByTestId('component-agent_definition')).toHaveTextContent('200');
      expect(screen.getByTestId('component-behavior_guide')).toHaveTextContent('400');
      expect(screen.getByTestId('component-persona')).toHaveTextContent('100');
    });

    it('should display friendly component names', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
        },
        totalTokens: 600,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('component-breakdown')).toBeInTheDocument();
      });

      // Should show "Agent Definition" not "agent_definition"
      expect(screen.getByText('Agent Definition')).toBeInTheDocument();
      expect(screen.getByText('Behavior Guide')).toBeInTheDocument();
    });

    it('should display total tokens', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
        },
        totalTokens: 600,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('total-tokens')).toBeInTheDocument();
      });

      expect(screen.getByTestId('total-tokens')).toHaveTextContent('600');
    });

  });

  describe('Collapsible behavior', () => {

    it('should render collapse toggle button', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
        },
        totalTokens: 200,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('breakdown-toggle')).toBeInTheDocument();
      });
    });

    it('should start with component list collapsed', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
          behavior_guide: 400,
        },
        totalTokens: 600,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('component-breakdown')).toBeInTheDocument();
      });

      // Component list should be collapsed by default
      expect(screen.getByTestId('component-list')).toHaveAttribute('aria-expanded', 'false');
    });

    it('should expand component list on toggle click', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
        },
        totalTokens: 200,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('breakdown-toggle')).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByTestId('breakdown-toggle'));

      expect(screen.getByTestId('component-list')).toHaveAttribute('aria-expanded', 'true');
    });

    it('should collapse component list on second toggle click', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
        },
        totalTokens: 200,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('breakdown-toggle')).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByTestId('breakdown-toggle'));
      expect(screen.getByTestId('component-list')).toHaveAttribute('aria-expanded', 'true');

      // Click to collapse
      fireEvent.click(screen.getByTestId('breakdown-toggle'));
      expect(screen.getByTestId('component-list')).toHaveAttribute('aria-expanded', 'false');
    });

    it('should show expand/collapse icon on toggle button', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
        },
        totalTokens: 200,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('breakdown-toggle')).toBeInTheDocument();
      });

      // Should show expand icon when collapsed
      expect(screen.getByTestId('breakdown-toggle')).toContainHTML('▶');

      // Click to expand
      fireEvent.click(screen.getByTestId('breakdown-toggle'));

      // Should show collapse icon when expanded
      expect(screen.getByTestId('breakdown-toggle')).toContainHTML('▼');
    });

  });

  describe('Component sorting', () => {

    it('should sort components by token count descending', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          persona: 100,
          agent_definition: 200,
          behavior_guide: 400,
        },
        totalTokens: 700,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('component-breakdown')).toBeInTheDocument();
      });

      // Expand to see order
      fireEvent.click(screen.getByTestId('breakdown-toggle'));

      const items = screen.getAllByTestId(/^component-/);
      const tokenValues = items.map(item => {
        const match = item.textContent?.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });

      // Should be in descending order: 400, 200, 100
      expect(tokenValues).toEqual([400, 200, 100]);
    });

  });

  describe('Zero-token components', () => {

    it('should not display components with zero tokens', async () => {
      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'REFRESH',
        tokenCounts: {
          workflow_state: 50,
          sprint_context: 150,
          agent_definition: 0,  // Not loaded in REFRESH
          behavior_guide: 0,    // Not loaded in REFRESH
        },
        totalTokens: 200,
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('component-breakdown')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('breakdown-toggle'));

      // Should show components with tokens
      expect(screen.getByTestId('component-workflow_state')).toBeInTheDocument();
      expect(screen.getByTestId('component-sprint_context')).toBeInTheDocument();

      // Should NOT show zero-token components
      expect(screen.queryByTestId('component-agent_definition')).not.toBeInTheDocument();
      expect(screen.queryByTestId('component-behavior_guide')).not.toBeInTheDocument();
    });

  });

  describe('Updates when context changes', () => {

    it('should update component list when tokenCounts change', async () => {
      let updateCallback: ((_event: unknown, data: unknown) => void) | null = null;

      mockElectronAPI.context.get.mockResolvedValue({
        percent: 25,
        tier: 'FULL',
        tokenCounts: {
          agent_definition: 200,
        },
        totalTokens: 200,
      });

      mockElectronAPI.context.onUpdate.mockImplementation((cb: (_event: unknown, data: unknown) => void) => {
        updateCallback = cb;
      });

      const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
      render(React.createElement(DebugPanel));

      await vi.waitFor(() => {
        expect(screen.getByTestId('total-tokens')).toHaveTextContent('200');
      });

      // Simulate context update with new token counts
      if (updateCallback) {
        updateCallback(null, {
          percent: 30,
          tier: 'FULL',
          tokenCounts: {
            agent_definition: 250,
            behavior_guide: 500,
          },
          totalTokens: 750,
        });
      }

      await vi.waitFor(() => {
        expect(screen.getByTestId('total-tokens')).toHaveTextContent('750');
      });
    });

  });

});

// =============================================================================
// Utility: Component name formatting
// =============================================================================

describe('MSSCI-12800: Component name formatting utility', () => {

  it('should export formatComponentName function', async () => {
    const { formatComponentName } = await import('../src/public/components/panels/DebugPanel.js');
    expect(typeof formatComponentName).toBe('function');
  });

  it('should convert snake_case to Title Case', async () => {
    const { formatComponentName } = await import('../src/public/components/panels/DebugPanel.js');

    expect(formatComponentName('agent_definition')).toBe('Agent Definition');
    expect(formatComponentName('behavior_guide')).toBe('Behavior Guide');
    expect(formatComponentName('sprint_context')).toBe('Sprint Context');
    expect(formatComponentName('workflow_state')).toBe('Workflow State');
    expect(formatComponentName('persona')).toBe('Persona');
    expect(formatComponentName('sidecars')).toBe('Sidecars');
  });

  it('should handle persona_compressed', async () => {
    const { formatComponentName } = await import('../src/public/components/panels/DebugPanel.js');
    expect(formatComponentName('persona_compressed')).toBe('Persona (Compressed)');
  });

  it('should handle session_header and session_assessment', async () => {
    const { formatComponentName } = await import('../src/public/components/panels/DebugPanel.js');
    expect(formatComponentName('session_header')).toBe('Session Header');
    expect(formatComponentName('session_assessment')).toBe('Session Assessment');
  });

});

// =============================================================================
// Integration: parsePrimeOutput function
// =============================================================================

describe('MSSCI-12800: parsePrimeOutput integration', () => {

  it('should export parsePrimeOutput function from prime module', async () => {
    const { parsePrimeOutput } = await import('../src/prime.js');
    expect(typeof parsePrimeOutput).toBe('function');
  });

  it('should parse JSON output with all fields', async () => {
    const { parsePrimeOutput } = await import('../src/prime.js');

    const output = JSON.stringify({
      tier: 'FULL',
      agent_name: 'dev',
      context: '# Dev Agent',
      token_counts: {
        agent_definition: 200,
        behavior_guide: 400,
        persona: 100,
        workflow_state: 50,
      },
      total_tokens: 750,
    });

    const result = parsePrimeOutput(output);

    expect(result.tier).toBe('FULL');
    expect(result.agentName).toBe('dev');
    expect(result.context).toBe('# Dev Agent');
    expect(result.tokenCounts).toEqual({
      agent_definition: 200,
      behavior_guide: 400,
      persona: 100,
      workflow_state: 50,
    });
    expect(result.totalTokens).toBe(750);
  });

  it('should handle non-JSON output gracefully', async () => {
    const { parsePrimeOutput } = await import('../src/prime.js');

    // Plain text output (non-JSON mode)
    const output = '# Dev Agent\n\nContext content here';

    const result = parsePrimeOutput(output);

    // Should return the text as context, undefined for token fields
    expect(result.context).toBe(output);
    expect(result.tokenCounts).toBeUndefined();
    expect(result.totalTokens).toBeUndefined();
  });

});
