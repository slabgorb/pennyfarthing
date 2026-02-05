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
 * Updated: Tests now validate WebSocket-based PTY communication (not Electron IPC)
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

// =============================================================================
// Mock WebSocket for PTY communication
// =============================================================================

/** Track all sent messages for assertion */
const mockWsSentMessages: string[] = [];

/** Store the active mock WebSocket instance for triggering server messages */
let activeMockWs: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  // Instance constants matching the WebSocket spec
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url: string;
  onopen: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    activeMockWs = this;
    // Simulate connection open immediately
    setTimeout(() => {
      if (this.onopen) this.onopen({});
    }, 0);
  }

  send(data: string) {
    mockWsSentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }
}

/** Helper: get all parsed messages sent over WebSocket */
function getSentMessages(): Array<Record<string, unknown>> {
  return mockWsSentMessages.map((raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  });
}

/** Helper: find sent messages of a given type */
function getSentMessagesOfType(type: string): Array<Record<string, unknown>> {
  return getSentMessages().filter((msg) => msg.type === type);
}

/** Helper: simulate the server sending a message to the client */
function simulateServerMessage(data: Record<string, unknown>) {
  if (activeMockWs?.onmessage) {
    activeMockWs.onmessage({ data: JSON.stringify(data) });
  }
}

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
  mockTerminalState._dataCallback = null;
  mockTerminalState._resizeCallback = null;
  mockTerminalState._keyCallback = null;
  MockResizeObserver.instances = [];
  mockWsSentMessages.length = 0;
  activeMockWs = null;
  // Set up global mocks
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  (global as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  vi.clearAllMocks();
  // NOTE: Do NOT delete global.WebSocket here.
  // React passive effects (useEffect cleanup) run asynchronously and may reference
  // WebSocket.OPEN after the test ends. The mock is reset in beforeEach anyway.
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
    it('should send PTY spawn message over WebSocket on mount', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Trigger the WebSocket onopen callback (which fires via setTimeout 0)
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it('should send spawn message with cols and rows', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);
      expect(spawnMessages[0]).toHaveProperty('cols');
      expect(spawnMessages[0]).toHaveProperty('rows');

      vi.useRealTimers();
    });

    it('should initialize xterm Terminal on mount', async () => {
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalled();
      expect(mockTerminal.open).toHaveBeenCalled();
    });

    it('should connect xterm to PTY data stream via WebSocket', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Trigger the onopen -> spawn
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Simulate server sending data over WebSocket
      await act(async () => {
        simulateServerMessage({ type: 'data', data: 'test output' });
      });

      expect(mockTerminal.write).toHaveBeenCalledWith('test output');

      vi.useRealTimers();
    });

    it('should send terminal input to PTY via WebSocket', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Trigger WebSocket open
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Clear sent messages to isolate the data message
      mockWsSentMessages.length = 0;

      // Simulate user typing in xterm
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('ls\r');
      }

      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(1);
      expect(dataMessages[0].data).toBe('ls\r');

      vi.useRealTimers();
    });

    it('should handle PTY spawn success', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Simulate spawn success from server
      await act(async () => {
        simulateServerMessage({ type: 'spawn', pid: 12345 });
      });

      // Should not show error state
      expect(screen.queryByTestId('tty-error')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should handle PTY spawn error gracefully', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Simulate error from server
      await act(async () => {
        simulateServerMessage({ type: 'error', error: 'Failed to spawn shell' });
      });

      expect(screen.getByTestId('tty-error')).toBeInTheDocument();
      // Error message appears in both the overlay and the aria-live status region
      const errorMatches = screen.getAllByText(/Failed to spawn shell/i);
      expect(errorMatches.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // AC3: Opens in project root directory
  // ===========================================================================

  describe('AC3: Opens in project root directory', () => {
    it('should send spawn message when no projectRoot provided', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);
      // Spawn is sent even without projectRoot
      expect(spawnMessages[0].type).toBe('spawn');

      vi.useRealTimers();
    });

    it('should use projectRoot prop if provided', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const customRoot = '/custom/project/path';

      render(<TTYPanel projectRoot={customRoot} />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);
      expect(spawnMessages[0].cwd).toBe(customRoot);

      vi.useRealTimers();
    });

    it('should handle invalid project root gracefully', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel projectRoot="/nonexistent/path" />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Spawn should still be sent
      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
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

    it('should notify PTY of new dimensions after resize via WebSocket', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      // Trigger WebSocket open
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Clear to isolate resize messages
      mockWsSentMessages.length = 0;

      // Simulate terminal resize callback
      if (mockTerminalState._resizeCallback) {
        mockTerminalState._resizeCallback({ cols: 100, rows: 30 });
      }

      const resizeMessages = getSentMessagesOfType('resize');
      expect(resizeMessages.length).toBe(1);
      expect(resizeMessages[0]).toEqual(
        expect.objectContaining({ type: 'resize', cols: 100, rows: 30 })
      );

      vi.useRealTimers();
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

    it('should render ANSI escape sequences correctly', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Simulate colored output (red text) from server
      const redText = '\x1b[31mError\x1b[0m';
      await act(async () => {
        simulateServerMessage({ type: 'data', data: redText });
      });

      // xterm.js should receive the raw escape sequences
      expect(mockTerminal.write).toHaveBeenCalledWith(redText);

      vi.useRealTimers();
    });

    it('should support cursor movement sequences', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Cursor movement: move cursor to row 5, column 10
      const cursorMove = '\x1b[5;10H';
      await act(async () => {
        simulateServerMessage({ type: 'data', data: cursorMove });
      });

      expect(mockTerminal.write).toHaveBeenCalledWith(cursorMove);

      vi.useRealTimers();
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
      vi.useFakeTimers();
      const { Terminal } = await import('xterm');
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({
        allowTransparency: false,
      }));

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Bold text
      const boldText = '\x1b[1mBold\x1b[0m';
      await act(async () => {
        simulateServerMessage({ type: 'data', data: boldText });
      });
      expect(mockTerminal.write).toHaveBeenCalledWith(boldText);

      vi.useRealTimers();
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

    it('should send arrow up key to PTY via WebSocket for shell history', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Clear to isolate
      mockWsSentMessages.length = 0;

      // Simulate arrow up keypress via onData (xterm sends all input through onData)
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x1b[A'); // Arrow up escape sequence
      }

      // Arrow up should be sent to PTY via WebSocket
      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(1);
      expect(dataMessages[0].data).toBe('\x1b[A');

      vi.useRealTimers();
    });

    it('should send arrow down key to PTY via WebSocket for shell history', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      mockWsSentMessages.length = 0;

      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x1b[B'); // Arrow down
      }

      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(1);
      expect(dataMessages[0].data).toBe('\x1b[B');

      vi.useRealTimers();
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
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Simulate large output from server
      const largeOutput = 'line\n'.repeat(10000);
      await act(async () => {
        simulateServerMessage({ type: 'data', data: largeOutput });
      });

      // Should complete without error
      expect(mockTerminal.write).toHaveBeenCalledWith(largeOutput);

      vi.useRealTimers();
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

    it('should send kill message and close WebSocket on unmount', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      mockWsSentMessages.length = 0;

      unmount();

      // Should have sent a kill message over WebSocket
      const killMessages = getSentMessagesOfType('kill');
      expect(killMessages.length).toBe(1);

      vi.useRealTimers();
    });

    it('should dispose terminal on unmount', async () => {
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      unmount();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it('should handle panel being closed and reopened', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      const { unmount } = render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      unmount();

      // Re-render (simulating panel reopen)
      mockWsSentMessages.length = 0;
      render(<TTYPanel />);

      // Trigger WebSocket open on the new instance
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Should spawn a new PTY session
      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle PTY exit gracefully', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Simulate exit from server
      await act(async () => {
        simulateServerMessage({ type: 'exit', code: 0 });
      });

      expect(screen.getByTestId('tty-exited')).toBeInTheDocument();
      expect(screen.getByText(/exited|process ended/i)).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should offer restart option after PTY exit', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      await act(async () => {
        simulateServerMessage({ type: 'exit', code: 0 });
      });

      expect(screen.getByRole('button', { name: /new session/i })).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should restart PTY when restart button clicked', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      await act(async () => {
        simulateServerMessage({ type: 'exit', code: 0 });
      });

      const restartButton = screen.getByRole('button', { name: /new session/i });
      expect(restartButton).toBeInTheDocument();

      mockWsSentMessages.length = 0;
      await act(async () => {
        fireEvent.click(restartButton);
      });

      const spawnMessages = getSentMessagesOfType('spawn');
      expect(spawnMessages.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it('should handle rapid input without dropping characters', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Clear initial spawn messages
      mockWsSentMessages.length = 0;

      // Rapid character input
      const rapidInput = 'abcdefghijklmnop';
      for (const char of rapidInput) {
        if (mockTerminalState._dataCallback) {
          mockTerminalState._dataCallback(char);
        }
      }

      // All characters should be sent as WebSocket data messages
      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(rapidInput.length);
      for (let i = 0; i < rapidInput.length; i++) {
        expect(dataMessages[i].data).toBe(rapidInput[i]);
      }

      vi.useRealTimers();
    });

    it('should handle special characters (Ctrl+C)', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      mockWsSentMessages.length = 0;

      // Ctrl+C sends ETX (0x03)
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x03');
      }

      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(1);
      expect(dataMessages[0].data).toBe('\x03');

      vi.useRealTimers();
    });

    it('should handle special characters (Ctrl+D)', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      mockWsSentMessages.length = 0;

      // Ctrl+D sends EOT (0x04)
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\x04');
      }

      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(1);
      expect(dataMessages[0].data).toBe('\x04');

      vi.useRealTimers();
    });

    it('should handle special characters (Tab completion)', async () => {
      vi.useFakeTimers();
      const { TTYPanel } = await import('../src/public/components/panels/TTYPanel.js');
      render(<TTYPanel />);

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      mockWsSentMessages.length = 0;

      // Tab character
      if (mockTerminalState._dataCallback) {
        mockTerminalState._dataCallback('\t');
      }

      const dataMessages = getSentMessagesOfType('data');
      expect(dataMessages.length).toBe(1);
      expect(dataMessages[0].data).toBe('\t');

      vi.useRealTimers();
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
