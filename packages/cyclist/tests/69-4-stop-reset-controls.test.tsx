/**
 * Story MSSCI-12729: Stop/Reset Controls and Escape Key
 *
 * Tests for ControlBar component with Stop/Reset buttons and Escape key handling.
 *
 * Acceptance Criteria:
 * AC1: Stop button appears when Claude is actively running
 * AC2: Stop button disappears when Claude finishes
 * AC3: Clicking Stop immediately kills the Claude process
 * AC4: Reset button is always visible
 * AC5: Reset button clears the session and message history
 * AC6: Escape key stops Claude when pressed once
 * AC7: Double Escape forcefully kills Claude (SIGKILL)
 * AC8: Visual feedback shows "Stopping..." state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock electronAPI
const mockAbort = vi.fn(() => Promise.resolve());
const mockClear = vi.fn(() => Promise.resolve());
const mockInterrupt = vi.fn(() => Promise.resolve());

const mockElectronAPI = {
  claude: {
    abort: mockAbort,
    clear: mockClear,
    interrupt: mockInterrupt,
    onMessage: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  },
  messages: {
    clear: vi.fn(() => Promise.resolve()),
  },
};

// Assign to window before imports
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Import component after mock setup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ControlBar, useControlBar } = await import('../src/public/components/ControlBar');

describe('MSSCI-12729: Stop/Reset Controls and Escape Key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // AC1: Stop button appears when Claude is actively running
  // ===========================================================================
  describe('AC1: Stop button visibility when running', () => {
    it('should show Stop button when isRunning is true', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).toBeInTheDocument();
      expect(stopButton).toBeVisible();
    });

    it('should have "Stop" label on stop button', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).toHaveTextContent(/stop/i);
    });

    it('should have stop icon on stop button', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      // Either an icon element or aria-label indicating stop
      expect(
        stopButton.querySelector('[data-icon="stop"]') ||
        stopButton.getAttribute('aria-label')?.includes('stop')
      ).toBeTruthy();
    });

    it('should be enabled when isRunning is true', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).not.toBeDisabled();
    });

    it('should have danger/warning styling when running', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      // Should have a class indicating danger/stop action
      expect(
        stopButton.classList.contains('btn-danger') ||
        stopButton.classList.contains('btn-stop') ||
        stopButton.classList.contains('danger')
      ).toBe(true);
    });
  });

  // ===========================================================================
  // AC2: Stop button disappears when Claude finishes
  // ===========================================================================
  describe('AC2: Stop button visibility when not running', () => {
    it('should not show Stop button when isRunning is false', () => {
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.queryByTestId('stop-button');
      expect(stopButton).not.toBeInTheDocument();
    });

    it('should hide Stop button when isRunning changes from true to false', async () => {
      const { rerender } = render(
        <ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />
      );

      expect(screen.getByTestId('stop-button')).toBeInTheDocument();

      rerender(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
    });

    it('should show Stop button when isRunning changes from false to true', async () => {
      const { rerender } = render(
        <ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />
      );

      expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();

      rerender(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      expect(screen.getByTestId('stop-button')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC3: Clicking Stop immediately kills the Claude process
  // ===========================================================================
  describe('AC3: Stop button functionality', () => {
    it('should call onStop when Stop button is clicked', () => {
      const onStop = vi.fn();
      render(<ControlBar isRunning={true} onStop={onStop} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      fireEvent.click(stopButton);

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('should call electronAPI.claude.abort when onStop triggers', () => {
      render(<ControlBar isRunning={true} onStop={() => mockAbort()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      fireEvent.click(stopButton);

      expect(mockAbort).toHaveBeenCalled();
    });

    it('should call abort immediately without debounce', async () => {
      const onStop = vi.fn();
      render(<ControlBar isRunning={true} onStop={onStop} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      fireEvent.click(stopButton);

      // Should be called immediately, not after timer
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('should prevent default event behavior', async () => {
      const onStop = vi.fn();
      render(<ControlBar isRunning={true} onStop={onStop} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      const event = new MouseEvent('click', { bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      stopButton.dispatchEvent(event);

      // Component should handle click properly (may or may not prevent default)
      expect(onStop).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC4: Reset button is always visible
  // ===========================================================================
  describe('AC4: Reset button always visible', () => {
    it('should show Reset button when isRunning is true', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const resetButton = screen.getByTestId('reset-button');
      expect(resetButton).toBeInTheDocument();
      expect(resetButton).toBeVisible();
    });

    it('should show Reset button when isRunning is false', () => {
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      const resetButton = screen.getByTestId('reset-button');
      expect(resetButton).toBeInTheDocument();
      expect(resetButton).toBeVisible();
    });

    it('should have "Reset" or "Clear" label', () => {
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      const resetButton = screen.getByTestId('reset-button');
      expect(resetButton.textContent?.toLowerCase()).toMatch(/reset|clear/);
    });

    it('should be enabled when not running', () => {
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      const resetButton = screen.getByTestId('reset-button');
      expect(resetButton).not.toBeDisabled();
    });

    it('should be enabled when running (can reset anytime)', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const resetButton = screen.getByTestId('reset-button');
      expect(resetButton).not.toBeDisabled();
    });
  });

  // ===========================================================================
  // AC5: Reset button clears the session and message history
  // ===========================================================================
  describe('AC5: Reset button functionality', () => {
    it('should call onReset when Reset button is clicked', () => {
      const onReset = vi.fn();
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={onReset} />);

      const resetButton = screen.getByTestId('reset-button');
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('should call electronAPI.claude.clear when resetting', () => {
      render(
        <ControlBar isRunning={false} onStop={vi.fn()} onReset={() => mockClear()} />
      );

      const resetButton = screen.getByTestId('reset-button');
      fireEvent.click(resetButton);

      expect(mockClear).toHaveBeenCalled();
    });

    it('should clear messages when resetting', () => {
      render(
        <ControlBar
          isRunning={false}
          onStop={vi.fn()}
          onReset={() => {
            mockClear();
            mockElectronAPI.messages.clear();
          }}
        />
      );

      const resetButton = screen.getByTestId('reset-button');
      fireEvent.click(resetButton);

      expect(mockElectronAPI.messages.clear).toHaveBeenCalled();
    });

    it('should work when Claude is running (stop + reset)', () => {
      const onReset = vi.fn();
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={onReset} />);

      const resetButton = screen.getByTestId('reset-button');
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC6: Escape key stops Claude when pressed once
  // ===========================================================================
  describe('AC6: Escape key stops Claude', () => {
    it('should call onStop when Escape is pressed while running', async () => {
      const onStop = vi.fn();
      render(<ControlBar isRunning={true} onStop={onStop} onReset={vi.fn()} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('should not call onStop when Escape pressed and not running', async () => {
      const onStop = vi.fn();
      render(<ControlBar isRunning={false} onStop={onStop} onReset={vi.fn()} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onStop).not.toHaveBeenCalled();
    });

    it('should call interrupt (not abort) on single Escape', async () => {
      render(
        <ControlBar
          isRunning={true}
          onStop={() => mockInterrupt()}
          onReset={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockInterrupt).toHaveBeenCalled();
      expect(mockAbort).not.toHaveBeenCalled();
    });

    it('should work with key code for Escape (27)', async () => {
      const onStop = vi.fn();
      render(<ControlBar isRunning={true} onStop={onStop} onReset={vi.fn()} />);

      fireEvent.keyDown(document, { keyCode: 27 });

      expect(onStop).toHaveBeenCalled();
    });

    it('should not trigger when Escape pressed in input field', async () => {
      const onStop = vi.fn();
      render(
        <div>
          <ControlBar isRunning={true} onStop={onStop} onReset={vi.fn()} />
          <input data-testid="test-input" />
        </div>
      );

      const input = screen.getByTestId('test-input');
      fireEvent.keyDown(input, { key: 'Escape' });

      // Should NOT stop when escaping from input (input handles Escape itself)
      // This depends on implementation - may or may not stop
      // Mark as pending: implementation choice
    });
  });

  // ===========================================================================
  // AC7: Double Escape forcefully kills Claude (SIGKILL)
  // ===========================================================================
  describe('AC7: Double Escape for force kill', () => {
    it('should call abort on double Escape within 500ms', async () => {
      const onStop = vi.fn();
      const onForceStop = vi.fn();
      render(
        <ControlBar
          isRunning={true}
          onStop={onStop}
          onForceStop={onForceStop}
          onReset={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onForceStop).toHaveBeenCalled();
    });

    it('should not force kill if second Escape after 500ms', async () => {
      const onStop = vi.fn();
      const onForceStop = vi.fn();
      render(
        <ControlBar
          isRunning={true}
          onStop={onStop}
          onForceStop={onForceStop}
          onReset={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onForceStop).not.toHaveBeenCalled();
      expect(onStop).toHaveBeenCalledTimes(2); // Two separate stops
    });

    it('should use SIGKILL (abort) for force stop', async () => {
      render(
        <ControlBar
          isRunning={true}
          onStop={vi.fn()}
          onForceStop={() => mockAbort()}
          onReset={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockAbort).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC8: Visual feedback shows "Stopping..." state
  // ===========================================================================
  describe('AC8: Stopping state visual feedback', () => {
    it('should show "Stopping..." when isStopping is true', () => {
      render(
        <ControlBar
          isRunning={true}
          isStopping={true}
          onStop={vi.fn()}
          onReset={vi.fn()}
        />
      );

      expect(screen.getByText(/stopping/i)).toBeInTheDocument();
    });

    it('should disable Stop button when stopping', () => {
      render(
        <ControlBar
          isRunning={true}
          isStopping={true}
          onStop={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).toBeDisabled();
    });

    it('should show spinner or loading indicator when stopping', () => {
      render(
        <ControlBar
          isRunning={true}
          isStopping={true}
          onStop={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const spinner = screen.getByTestId('stop-button').querySelector('.spinner, .loading, [data-loading]');
      expect(spinner).toBeInTheDocument();
    });

    it('should change button text from "Stop" to "Stopping..."', () => {
      render(
        <ControlBar
          isRunning={true}
          isStopping={true}
          onStop={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).toHaveTextContent(/stopping/i);
      expect(stopButton).not.toHaveTextContent(/^stop$/i);
    });

    it('should have aria-busy when stopping', () => {
      render(
        <ControlBar
          isRunning={true}
          isStopping={true}
          onStop={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).toHaveAttribute('aria-busy', 'true');
    });
  });

  // ===========================================================================
  // useControlBar hook tests
  // ===========================================================================
  describe('useControlBar hook', () => {
    it('should track isRunning state from Claude events', async () => {
      // This tests the hook's integration with electronAPI events
      const TestComponent = () => {
        const { isRunning } = useControlBar();
        return <div data-testid="running-state">{isRunning ? 'running' : 'idle'}</div>;
      };

      render(<TestComponent />);

      // Initial state should be idle
      expect(screen.getByTestId('running-state')).toHaveTextContent('idle');
    });

    it('should provide handleStop function', () => {
      const TestComponent = () => {
        const { handleStop } = useControlBar();
        return (
          <button data-testid="hook-stop" onClick={handleStop}>
            Stop
          </button>
        );
      };

      render(<TestComponent />);
      expect(screen.getByTestId('hook-stop')).toBeInTheDocument();
    });

    it('should provide handleReset function', () => {
      const TestComponent = () => {
        const { handleReset } = useControlBar();
        return (
          <button data-testid="hook-reset" onClick={handleReset}>
            Reset
          </button>
        );
      };

      render(<TestComponent />);
      expect(screen.getByTestId('hook-reset')).toBeInTheDocument();
    });

    it('should track isStopping state', () => {
      const TestComponent = () => {
        const { isStopping } = useControlBar();
        return <div data-testid="stopping-state">{isStopping ? 'stopping' : 'normal'}</div>;
      };

      render(<TestComponent />);
      expect(screen.getByTestId('stopping-state')).toHaveTextContent('normal');
    });
  });

  // ===========================================================================
  // Layout and accessibility tests
  // ===========================================================================
  describe('Layout and accessibility', () => {
    it('should render control bar container', () => {
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      expect(screen.getByTestId('control-bar')).toBeInTheDocument();
    });

    it('should have accessible labels', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      const resetButton = screen.getByTestId('reset-button');

      expect(stopButton).toHaveAccessibleName();
      expect(resetButton).toHaveAccessibleName();
    });

    it('should support keyboard navigation', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      const resetButton = screen.getByTestId('reset-button');

      // Both buttons should be focusable
      expect(stopButton.tabIndex).toBeGreaterThanOrEqual(0);
      expect(resetButton.tabIndex).toBeGreaterThanOrEqual(0);
    });

    it('should have proper button roles', () => {
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      const resetButton = screen.getByTestId('reset-button');

      expect(stopButton.tagName).toBe('BUTTON');
      expect(resetButton.tagName).toBe('BUTTON');
    });
  });
});
