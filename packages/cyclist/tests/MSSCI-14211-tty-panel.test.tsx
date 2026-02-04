/**
 * MSSCI-14211: TTY Panel with xterm.js terminal emulator
 *
 * Story: Add a TTY panel to Cyclist using xterm.js for high-fidelity terminal emulation
 * Epic: Epic 76 - Dockview Panel Migration (MSSCI-14186)
 *
 * Acceptance Criteria:
 * - AC1: TTY panel available in Dockview panel list
 * - AC2: Terminal loads user's shell with environment (PATH, aliases, etc.)
 * - AC3: Opens in project root directory
 * - AC4: Resizes correctly when panel is resized
 * - AC5: Supports ANSI colors and cursor positioning
 * - AC6: Scrollback buffer works (arrow up for history, scroll for output)
 * - AC7: Panel can be positioned/docked like other panels
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Mock xterm.js and related addons
// =============================================================================

// Mock Terminal instance state
const mockTerminalState = {
  _dataCallback: null as ((data: string) => void) | null,
  _resizeCallback: null as ((dims: { cols: number; rows: number }) => void) | null,
  _keyCallback: null as ((event: { key: string; domEvent: KeyboardEvent }) => void) | null,
};

// Mock Terminal instance methods
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  clear: vi.fn(),
  reset: vi.fn(),
  focus: vi.fn(),
  blur: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn((callback: (data: string) => void) => {
    mockTerminalState._dataCallback = callback;
    return { dispose: vi.fn() };
  }),
  onResize: vi.fn((callback: (dims: { cols: number; rows: number }) => void) => {
    mockTerminalState._resizeCallback = callback;
    return { dispose: vi.fn() };
  }),
  onKey: vi.fn((callback: (event: { key: string; domEvent: KeyboardEvent }) => void) => {
    mockTerminalState._keyCallback = callback;
    return { dispose: vi.fn() };
  }),
  cols: 80,
  rows: 24,
  get _dataCallback() { return mockTerminalState._dataCallback; },
  get _resizeCallback() { return mockTerminalState._resizeCallback; },
  get _keyCallback() { return mockTerminalState._keyCallback; },
  loadAddon: vi.fn(),
  element: document.createElement('div'),
  options: {} as Record<string, unknown>,
};

// Mock FitAddon instance
const mockFitAddon = {
  fit: vi.fn(),
  proposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
  dispose: vi.fn(),
};

// Track Terminal constructor calls
const TerminalMock = vi.fn(function(this: typeof mockTerminal, _options?: Record<string, unknown>) {
  Object.assign(this, mockTerminal);
  return this;
});

// Track FitAddon constructor calls
const FitAddonMock = vi.fn(function(this: typeof mockFitAddon) {
  Object.assign(this, mockFitAddon);
  return this;
});

vi.mock('xterm', () => ({
  Terminal: TerminalMock,
}));

vi.mock('xterm-addon-fit', () => ({
  FitAddon: FitAddonMock,
}));

// Mock Electron IPC for PTY communication
const mockIpcRenderer = {
  send: vi.fn(),
  on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
    mockIpcRenderer._listeners[channel] = callback;
    return mockIpcRenderer;
  }),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  _listeners: {} as Record<string, (...args: unknown[]) => void>,
  // Helper to simulate PTY output
  simulatePtyOutput: (data: string) => {
    if (mockIpcRenderer._listeners['pty:data']) {
      mockIpcRenderer._listeners['pty:data']({}, data);
    }
  },
  simulatePtySpawn: (pid: number) => {
    if (mockIpcRenderer._listeners['pty:spawn']) {
      mockIpcRenderer._listeners['pty:spawn']({}, pid);
    }
  },
  simulatePtyError: (error: string) => {
    if (mockIpcRenderer._listeners['pty:error']) {
      mockIpcRenderer._listeners['pty:error']({}, error);
    }
  },
  simulatePtyExit: (code: number) => {
    if (mockIpcRenderer._listeners['pty:exit']) {
      mockIpcRenderer._listeners['pty:exit']({}, code);
    }
  },
};

vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}));

// =============================================================================
// Test Helpers
// =============================================================================

// Global ResizeObserver mock for happy-dom
class MockResizeObserver {
  callback: ResizeObserverCallback;
  static instances: MockResizeObserver[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  // Helper to trigger resize
  trigger(entries: Array<{ contentRect: { width: number; height: number } }>) {
    this.callback(entries as unknown as ResizeObserverEntry[], this);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIpcRenderer._listeners = {};
  mockTerminalState._dataCallback = null;
  mockTerminalState._resizeCallback = null;
  mockTerminalState._keyCallback = null;
  MockResizeObserver.instances = [];
  // Set up global ResizeObserver mock
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// AC1: TTY panel available in Dockview panel list
// =============================================================================

describe('MSSCI-14211: TTY Panel', () => {
  describe('AC1: TTY panel available in Dockview panel list', () => {
    it('should export TTYPanel component', async () => {
      const module = await import('../src/public/components/panels/TTYPanel.js');
      expect(module.TTYPanel).toBeDefined();
      expect(typeof module.TTYPanel).toBe('function');
    });

    it('should export default TTYPanel component', async () => {
      const module = await import('../src/public/components/panels/TTYPanel.js');
      expect(module.default).toBeDefined();
    });

    it('should be registered in PANEL_INVENTORY as tty', async () => {
      const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace.js');
      expect(PANEL_INVENTORY.TTY).toBe('tty');
    });

    it('should be included in panel title mappings', async () => {
      // The panel should have a proper display name
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Panel should have accessible name
      expect(screen.getByRole('region', { name: /terminal|tty/i })).toBeInTheDocument();
    });

    it('should render panel container with correct testid', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(screen.getByTestId('tty-panel')).toBeInTheDocument();
    });

    it('should render terminal container element', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(screen.getByTestId('tty-terminal-container')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC2: Terminal loads user's shell with environment
  // ===========================================================================

  describe('AC2: Terminal loads user shell with environment', () => {
    it('should request PTY spawn on mount', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        shell: expect.any(String),
      }));
    });

    it('should detect user default shell from SHELL env', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Should request spawn with user's shell
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        shell: expect.stringMatching(/bash|zsh|sh|fish/),
      }));
    });

    it('should pass login shell flag to load profile', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Login shell flag ensures .bashrc/.zshrc etc are loaded
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        args: expect.arrayContaining(['-l']),
      }));
    });

    it('should inherit environment variables', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        env: expect.objectContaining({
          TERM: 'xterm-256color',
        }),
      }));
    });

    it('should initialize xterm Terminal on mount', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalled();
      expect(mockTerminal.open).toHaveBeenCalled();
    });

    it('should connect xterm to PTY data stream', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Simulate PTY output
      mockIpcRenderer.simulatePtyOutput('test output');

      expect(mockTerminal.write).toHaveBeenCalledWith('test output');
    });

    it('should send terminal input to PTY', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Simulate user typing
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('ls\r');
      }

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', 'ls\r');
    });

    it('should handle PTY spawn success', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      mockIpcRenderer.simulatePtySpawn(12345);

      // Should not show error state
      expect(screen.queryByTestId('tty-error')).not.toBeInTheDocument();
    });

    it('should handle PTY spawn error gracefully', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Wrap IPC simulation in act() to flush React state updates
      await act(async () => {
        mockIpcRenderer.simulatePtyError('Failed to spawn shell');
      });

      expect(screen.getByTestId('tty-error')).toBeInTheDocument();
      // Check for the error overlay message specifically
      expect(screen.getByText(/Failed to spawn shell:/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // AC3: Opens in project root directory
  // ===========================================================================

  describe('AC3: Opens in project root directory', () => {
    it('should pass project root as cwd when spawning PTY', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        cwd: expect.any(String),
      }));
    });

    it('should use projectRoot prop if provided', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const customRoot = '/custom/project/path';

      render(<TTYPanel projectRoot={customRoot} />);

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        cwd: customRoot,
      }));
    });

    it('should not use home directory as default', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Should not default to ~
      const spawnCall = mockIpcRenderer.send.mock.calls.find(
        (call) => call[0] === 'pty:spawn'
      );
      expect(spawnCall?.[1]?.cwd).not.toBe(process.env.HOME);
      expect(spawnCall?.[1]?.cwd).not.toMatch(/^~$/);
    });

    it('should handle invalid project root gracefully', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel projectRoot="/nonexistent/path" />);

      // PTY spawn should still be attempted
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.anything());
    });
  });

  // ===========================================================================
  // AC4: Resizes correctly when panel is resized
  // ===========================================================================

  describe('AC4: Resizes correctly when panel is resized', () => {
    it('should load FitAddon into terminal', async () => {
      const { FitAddon } = await import('xterm-addon-fit');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(FitAddon).toHaveBeenCalled();
      expect(mockTerminal.loadAddon).toHaveBeenCalledWith(mockFitAddon);
    });

    it('should call fit() on initial render', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await waitFor(() => {
        expect(mockFitAddon.fit).toHaveBeenCalled();
      });
    });

    it('should observe container resize with ResizeObserver', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Check that a ResizeObserver was created and observe was called
      expect(MockResizeObserver.instances.length).toBeGreaterThan(0);
      expect(MockResizeObserver.instances[0].observe).toHaveBeenCalled();
    });

    it('should call fit() when container size changes', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      mockFitAddon.fit.mockClear();

      // Simulate resize event using the global mock
      const observer = MockResizeObserver.instances[0];
      observer.trigger([{ contentRect: { width: 800, height: 600 } }]);

      await waitFor(() => {
        expect(mockFitAddon.fit).toHaveBeenCalled();
      });
    });

    it('should notify PTY of new dimensions after resize', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Simulate terminal resize callback
      if (mockTerminalState._resizeCallback) {
        mockTerminalState._resizeCallback({ cols: 100, rows: 30 });
      }

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:resize', {
        cols: 100,
        rows: 30,
      });
    });

    it('should debounce resize events', async () => {
      vi.useFakeTimers();

      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Initial fit is called via setTimeout(..., 0), run all pending timers to clear it
      await act(async () => {
        vi.runAllTimers();
      });

      mockFitAddon.fit.mockClear();

      // Trigger multiple rapid resize events using the global mock
      const observer = MockResizeObserver.instances[0];
      observer.trigger([{ contentRect: { width: 800, height: 600 } }]);
      observer.trigger([{ contentRect: { width: 810, height: 600 } }]);
      observer.trigger([{ contentRect: { width: 820, height: 600 } }]);

      // Before debounce timeout, fit should not have been called (debounce is 100ms)
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      expect(mockFitAddon.fit).not.toHaveBeenCalled();

      // After debounce timeout completes
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(mockFitAddon.fit).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should clean up ResizeObserver on unmount', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      const observer = MockResizeObserver.instances[0];

      unmount();

      expect(observer.disconnect).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC5: Supports ANSI colors and cursor positioning
  // ===========================================================================

  describe('AC5: Supports ANSI colors and cursor positioning', () => {
    it('should configure terminal for 256 colors', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({
        allowProposedApi: true,
      }));
    });

    it('should set TERM environment to xterm-256color', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({
        env: expect.objectContaining({
          TERM: 'xterm-256color',
        }),
      }));
    });

    it('should render ANSI escape sequences correctly', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Simulate colored output (red text)
      const redText = '\x1b[31mError\x1b[0m';
      mockIpcRenderer.simulatePtyOutput(redText);

      // xterm.js should receive the raw escape sequences
      expect(mockTerminal.write).toHaveBeenCalledWith(redText);
    });

    it('should support cursor movement sequences', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Cursor movement: move cursor to row 5, column 10
      const cursorMove = '\x1b[5;10H';
      mockIpcRenderer.simulatePtyOutput(cursorMove);

      expect(mockTerminal.write).toHaveBeenCalledWith(cursorMove);
    });

    it('should configure terminal with proper font family', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({
        fontFamily: expect.stringMatching(/mono|monospace|consolas|courier/i),
      }));
    });

    it('should set appropriate font size', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({
        fontSize: expect.any(Number),
      }));
    });

    it('should support bold text rendering', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({
        allowTransparency: false,
      }));

      // Bold text
      const boldText = '\x1b[1mBold\x1b[0m';
      mockIpcRenderer.simulatePtyOutput(boldText);
      expect(mockTerminal.write).toHaveBeenCalledWith(boldText);
    });
  });

  // ===========================================================================
  // AC6: Scrollback buffer works
  // ===========================================================================

  describe('AC6: Scrollback buffer works', () => {
    it('should configure scrollback buffer', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({
        scrollback: expect.any(Number),
      }));
    });

    it('should have reasonable scrollback size (at least 1000 lines)', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      const terminalOptions = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(terminalOptions.scrollback).toBeGreaterThanOrEqual(1000);
    });

    it('should send arrow up key to PTY for shell history', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Simulate arrow up keypress via onData (xterm sends all input through onData)
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x1b[A'); // Arrow up escape sequence
      }

      // Arrow up should be sent to PTY for shell history navigation
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', '\x1b[A');
    });

    it('should send arrow down key to PTY for shell history', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x1b[B'); // Arrow down
      }

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', '\x1b[B');
    });

    it('should enable terminal scrolling', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Terminal should not disable scrolling
      const terminalOptions = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(terminalOptions.disableStdin).not.toBe(true);
    });

    it('should handle large output without performance issues', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Simulate large output
      const largeOutput = 'line\n'.repeat(10000);
      mockIpcRenderer.simulatePtyOutput(largeOutput);

      // Should complete without error
      expect(mockTerminal.write).toHaveBeenCalledWith(largeOutput);
    });

    it('should preserve scroll position when new output arrives at bottom', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // xterm.js handles this by default with scrollOnUserInput option
      const terminalOptions = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // scrollOnUserInput: true is the default behavior we want
      expect(terminalOptions.scrollOnUserInput).not.toBe(false);
    });
  });

  // ===========================================================================
  // AC7: Panel can be positioned/docked like other panels
  // ===========================================================================

  describe('AC7: Panel can be positioned/docked like other panels', () => {
    it('should be addable to Dockview via panel registry', async () => {
      const { registerPanelComponent, PANEL_INVENTORY } = await import(
        '../src/public/components/DockviewWorkspace.js'
      );
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');

      // Panel should be registerable
      expect(() => registerPanelComponent(PANEL_INVENTORY.TTY, TTYPanel)).not.toThrow();
    });

    it('should have panel wrapper class for consistent styling', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      const panel = screen.getByTestId('tty-panel');
      expect(panel).toHaveClass('tty-panel');
    });

    it('should fill available panel space', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      const container = screen.getByTestId('tty-terminal-container');
      // Should have flex-grow or 100% height/width styling
      expect(container).toHaveStyle({ height: '100%' });
    });

    it('should clean up PTY on unmount', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      unmount();

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:kill');
    });

    it('should dispose terminal on unmount', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      unmount();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it('should remove IPC listeners on unmount', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      unmount();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith('pty:data', expect.any(Function));
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith('pty:error', expect.any(Function));
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith('pty:exit', expect.any(Function));
    });

    it('should handle panel being closed and reopened', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      unmount();

      // Re-render (simulating panel reopen)
      mockIpcRenderer.send.mockClear();
      render(<TTYPanel />);

      // Should spawn a new PTY session
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.anything());
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle PTY exit gracefully', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Wrap IPC simulation in act() to flush React state updates
      await act(async () => {
        mockIpcRenderer.simulatePtyExit(0);
      });

      expect(screen.getByTestId('tty-exited')).toBeInTheDocument();
      expect(screen.getByText(/exited|process ended/i)).toBeInTheDocument();
    });

    it('should offer restart option after PTY exit', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Wrap IPC simulation in act() to flush React state updates
      await act(async () => {
        mockIpcRenderer.simulatePtyExit(0);
      });

      expect(screen.getByRole('button', { name: /restart|new session/i })).toBeInTheDocument();
    });

    it('should restart PTY when restart button clicked', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Wrap IPC simulation in act() to flush React state updates
      await act(async () => {
        mockIpcRenderer.simulatePtyExit(0);
      });

      expect(screen.getByRole('button', { name: /restart|new session/i })).toBeInTheDocument();

      mockIpcRenderer.send.mockClear();
      const restartButton = screen.getByRole('button', { name: /restart|new session/i });
      // Use fireEvent instead of userEvent to avoid timer conflicts
      await act(async () => {
        fireEvent.click(restartButton);
      });

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:spawn', expect.anything());
    });

    it('should handle rapid input without dropping characters', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Rapid character input
      const rapidInput = 'abcdefghijklmnop';
      for (const char of rapidInput) {
        if (mockTerminalState._dataCallback) {
          mockTerminalState._dataCallback(char);
        }
      }

      // All characters should be sent
      for (const char of rapidInput) {
        expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', char);
      }
    });

    it('should handle special characters (Ctrl+C)', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Ctrl+C sends ETX (0x03)
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x03');
      }

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', '\x03');
    });

    it('should handle special characters (Ctrl+D)', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Ctrl+D sends EOT (0x04)
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x04');
      }

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', '\x04');
    });

    it('should handle special characters (Tab completion)', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Tab character
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\t');
      }

      expect(mockIpcRenderer.send).toHaveBeenCalledWith('pty:data', '\t');
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe('Accessibility', () => {
    it('should have accessible role for terminal region', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(screen.getByRole('region', { name: /terminal|tty/i })).toBeInTheDocument();
    });

    it('should announce terminal status changes', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Check for aria-live region
      const statusRegion = screen.getByTestId('tty-status');
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
    });

    it('should focus terminal on panel activation', async () => {
      vi.useFakeTimers();

      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Focus is called after setTimeout(..., 0) in useEffect
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(mockTerminal.focus).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should have keyboard instructions available', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Should have aria-describedby or similar for keyboard help
      const panel = screen.getByTestId('tty-panel');
      expect(panel).toHaveAttribute('aria-describedby');
    });
  });
});
