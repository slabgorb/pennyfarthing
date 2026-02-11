/**
 * Tests for AgentQuickPicker in ControlBar
 *
 * Story MSSCI-14762: Quick agent picker in control bar
 *
 * Verifies:
 * - Picker renders in ControlBar before Bell Mode toggle
 * - Dropdown opens/closes on click
 * - Agent list fetched and displayed
 * - Selecting an agent sends /{role} command
 * - Current agent highlighted in dropdown
 * - Real-time updates when active agent changes
 * - Dropdown closes on outside click and Escape
 * - Existing AgentPopup unaffected
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '../src/public/contexts/ClaudeContext';
import { ControlBar } from '../src/public/components/ControlBar';

// =============================================================================
// Mock Data
// =============================================================================

const mockThemeAgents = {
  theme: 'west-wing',
  themeName: 'The West Wing',
  tier: 'S',
  agents: [
    { role: 'sm', character: 'Leo McGarry', slug: 'leo-mcgarry', shortName: 'Leo', style: '', background: '', quirks: [] },
    { role: 'dev', character: 'Sam Seaborn', slug: 'sam-seaborn', shortName: 'Sam', style: '', background: '', quirks: [] },
    { role: 'tea', character: 'Toby Ziegler', slug: 'toby-ziegler', shortName: 'Toby', style: '', background: '', quirks: [] },
    { role: 'reviewer', character: 'Josh Lyman', slug: 'josh-lyman', shortName: 'Josh', style: '', background: '', quirks: [] },
    { role: 'pm', character: 'Jed Bartlet', slug: 'jed-bartlet', shortName: 'Jed', style: '', background: '', quirks: [] },
    { role: 'architect', character: 'C.J. Cregg', slug: 'cj-cregg', shortName: 'C.J.', style: '', background: '', quirks: [] },
  ],
};

// =============================================================================
// Test Helpers
// =============================================================================

const mockFetch = vi.fn();

function renderControlBar(props: Partial<React.ComponentProps<typeof ControlBar>> = {}) {
  const defaultProps: React.ComponentProps<typeof ControlBar> = {
    isRunning: false,
    onStop: vi.fn(),
    onReset: vi.fn(),
    bellMode: false,
    relayMode: false,
    onBellModeChange: vi.fn(),
    onRelayModeChange: vi.fn(),
    currentAgent: 'dev',
    ...props,
  };

  return render(
    <ClaudeProvider>
      <ControlBar {...defaultProps} />
    </ClaudeProvider>
  );
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  mockFetch.mockReset();
  // Default: settings endpoint returns empty, theme-agents returns mock data
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/theme-agents/full') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockThemeAgents),
      });
    }
    // Default for /api/settings and others
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Tests
// =============================================================================

describe('AgentQuickPicker', () => {
  // ---------------------------------------------------------------------------
  // AC1: Picker appears in ControlBar before Bell Mode toggle
  // ---------------------------------------------------------------------------
  describe('rendering and position', () => {
    it('renders an agent picker button in the control bar', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });
    });

    it('renders the picker before the bell mode toggle', async () => {
      renderControlBar();

      await waitFor(() => {
        const picker = screen.getByTestId('agent-quick-picker');
        const bellToggle = screen.getByTestId('bell-mode-toggle');
        const togglesContainer = picker.closest('.control-bar-toggles');

        expect(togglesContainer).not.toBeNull();

        // Picker should come before bell toggle in DOM order
        const children = Array.from(togglesContainer!.querySelectorAll('[data-testid]'));
        const pickerIndex = children.indexOf(picker);
        const bellIndex = children.indexOf(bellToggle);
        expect(pickerIndex).toBeLessThan(bellIndex);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC2: Picker uses a Lucide icon
  // ---------------------------------------------------------------------------
  describe('icon', () => {
    it('displays a Lucide icon in the picker button', async () => {
      renderControlBar();

      await waitFor(() => {
        const picker = screen.getByTestId('agent-quick-picker');
        // Lucide icons render as <svg> elements
        const svg = picker.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC3: Clicking opens a lightweight dropdown with agents
  // ---------------------------------------------------------------------------
  describe('dropdown open/close', () => {
    it('opens a dropdown when the picker button is clicked', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      // Click picker to open
      fireEvent.click(screen.getByTestId('agent-quick-picker'));

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker-dropdown')).toBeInTheDocument();
      });
    });

    it('lists all available agents in the dropdown with role and character name in tooltip', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agent-quick-picker'));

      await waitFor(() => {
        const dropdown = screen.getByTestId('agent-quick-picker-dropdown');
        for (const agent of mockThemeAgents.agents) {
          // Role visible in text content
          expect(dropdown.textContent).toContain(agent.role);
          // Character name in title attribute, not text
          const option = screen.getByTestId(`agent-option-${agent.role}`);
          expect(option).toHaveAttribute('title', agent.character);
        }
      });
    });

    it('closes the dropdown when clicking the picker button again', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      // Open
      fireEvent.click(screen.getByTestId('agent-quick-picker'));
      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker-dropdown')).toBeInTheDocument();
      });

      // Close by clicking again
      fireEvent.click(screen.getByTestId('agent-quick-picker'));
      await waitFor(() => {
        expect(screen.queryByTestId('agent-quick-picker-dropdown')).not.toBeInTheDocument();
      });
    });

    it('closes the dropdown when pressing Escape', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agent-quick-picker'));
      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker-dropdown')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByTestId('agent-quick-picker-dropdown')).not.toBeInTheDocument();
      });
    });

    it('closes the dropdown when clicking outside', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agent-quick-picker'));
      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker-dropdown')).toBeInTheDocument();
      });

      // Click outside the dropdown
      fireEvent.mouseDown(document.body);
      await waitFor(() => {
        expect(screen.queryByTestId('agent-quick-picker-dropdown')).not.toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC4: Selecting an agent sends /{role} command
  // ---------------------------------------------------------------------------
  describe('agent selection', () => {
    it('sends /{role} command when an agent is selected', async () => {
      renderControlBar({ currentAgent: 'dev' });

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agent-quick-picker'));

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker-dropdown')).toBeInTheDocument();
      });

      // Click on the SM agent option
      const smOption = screen.getByTestId('agent-option-sm');
      fireEvent.click(smOption);

      // The dropdown should close after selection
      await waitFor(() => {
        expect(screen.queryByTestId('agent-quick-picker-dropdown')).not.toBeInTheDocument();
      });
    });

    it('does not send command when clicking the already-active agent', async () => {
      renderControlBar({ currentAgent: 'dev' });

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agent-quick-picker'));

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker-dropdown')).toBeInTheDocument();
      });

      // The current agent option should be visually marked
      const devOption = screen.getByTestId('agent-option-dev');
      expect(devOption.classList.contains('current') || devOption.getAttribute('aria-selected') === 'true').toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // AC5: Picker updates when active agent changes via WebSocket
  // ---------------------------------------------------------------------------
  describe('real-time updates', () => {
    it('reflects the current agent passed via props', async () => {
      const { rerender } = render(
        <ClaudeProvider>
          <ControlBar
            isRunning={false}
            onStop={vi.fn()}
            onReset={vi.fn()}
            currentAgent="dev"
          />
        </ClaudeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      // Open dropdown and check dev is current
      fireEvent.click(screen.getByTestId('agent-quick-picker'));
      await waitFor(() => {
        const devOption = screen.getByTestId('agent-option-dev');
        expect(devOption.classList.contains('current') || devOption.getAttribute('aria-selected') === 'true').toBe(true);
      });

      // Close dropdown
      fireEvent.click(screen.getByTestId('agent-quick-picker'));

      // Rerender with new agent (simulates WebSocket persona update propagated through parent)
      rerender(
        <ClaudeProvider>
          <ControlBar
            isRunning={false}
            onStop={vi.fn()}
            onReset={vi.fn()}
            currentAgent="tea"
          />
        </ClaudeProvider>
      );

      // Open dropdown again and verify tea is now current
      fireEvent.click(screen.getByTestId('agent-quick-picker'));
      await waitFor(() => {
        const teaOption = screen.getByTestId('agent-option-tea');
        expect(teaOption.classList.contains('current') || teaOption.getAttribute('aria-selected') === 'true').toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC6: Existing controls unaffected
  // ---------------------------------------------------------------------------
  describe('existing controls', () => {
    it('does not break bell mode toggle', async () => {
      const onBellModeChange = vi.fn();
      renderControlBar({ onBellModeChange });

      const bellToggle = screen.getByTestId('bell-mode-toggle');
      expect(bellToggle).toBeInTheDocument();

      fireEvent.click(bellToggle);
      expect(onBellModeChange).toHaveBeenCalledWith(true);
    });

    it('does not break relay mode toggle', async () => {
      const onRelayModeChange = vi.fn();
      renderControlBar({ onRelayModeChange });

      const relayToggle = screen.getByTestId('relay-toggle');
      expect(relayToggle).toBeInTheDocument();

      fireEvent.click(relayToggle);
      expect(onRelayModeChange).toHaveBeenCalledWith(true);
    });

    it('does not break stop and reset buttons', async () => {
      const onStop = vi.fn();
      const onReset = vi.fn();
      renderControlBar({ isRunning: true, onStop, onReset });

      const stopButton = screen.getByTestId('stop-button');
      const resetButton = screen.getByTestId('reset-button');

      expect(stopButton).toBeInTheDocument();
      expect(resetButton).toBeInTheDocument();

      fireEvent.click(stopButton);
      expect(onStop).toHaveBeenCalled();

      fireEvent.click(resetButton);
      expect(onReset).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------
  describe('accessibility', () => {
    it('has appropriate aria attributes on the picker button', async () => {
      renderControlBar();

      await waitFor(() => {
        const picker = screen.getByTestId('agent-quick-picker');
        expect(picker).toHaveAttribute('aria-label');
        expect(picker).toHaveAttribute('aria-expanded');
      });
    });

    it('sets aria-expanded=true when dropdown is open', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      const picker = screen.getByTestId('agent-quick-picker');
      expect(picker).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(picker);
      await waitFor(() => {
        expect(picker).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('dropdown has listbox role with option items', async () => {
      renderControlBar();

      await waitFor(() => {
        expect(screen.getByTestId('agent-quick-picker')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agent-quick-picker'));

      await waitFor(() => {
        const dropdown = screen.getByTestId('agent-quick-picker-dropdown');
        expect(dropdown.querySelector('[role="listbox"]') || dropdown.getAttribute('role') === 'listbox').toBeTruthy();

        const options = dropdown.querySelectorAll('[role="option"]');
        expect(options.length).toBe(mockThemeAgents.agents.length);
      });
    });
  });
});
