/**
 * TTYPanel - Terminal panel using xterm.js
 *
 * Story MSSCI-14211 - TTY Panel with xterm.js terminal emulator
 * Epic: Epic 76 - Dockview Panel Migration
 *
 * Features:
 * - Embeds xterm.js terminal in a Dockview panel
 * - Loads user's shell with environment (bash/zsh profile)
 * - Opens in project root directory
 * - Proper resize handling via FitAddon
 * - Standard terminal features (colors, cursor, scrollback)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

// Safely access electron IPC - only available in Electron context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipcRenderer: typeof import('electron').ipcRenderer | null = (() => {
  try {
    // Check if we're in Electron renderer with contextIsolation=false
    // or if preload script exposed it on window
    if (typeof window !== 'undefined' && (window as { electronAPI?: { ipcRenderer?: unknown } }).electronAPI?.ipcRenderer) {
      return (window as { electronAPI: { ipcRenderer: typeof import('electron').ipcRenderer } }).electronAPI.ipcRenderer;
    }
    // Try direct require (works with nodeIntegration=true, contextIsolation=false)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('electron').ipcRenderer;
  } catch {
    // Not in Electron environment
    return null;
  }
})();

/** Props for TTYPanel component */
export interface TTYPanelProps {
  /** Project root directory for the terminal. Defaults to current project. */
  projectRoot?: string;
}

/** Terminal status states */
type TerminalStatus = 'connecting' | 'connected' | 'error' | 'exited';

/**
 * Detect user's default shell from environment
 */
function getDefaultShell(): string {
  // In Electron, process.env.SHELL is available
  const shell = typeof process !== 'undefined' ? process.env.SHELL : undefined;
  // Fallback to /bin/bash if SHELL is not set
  return shell || '/bin/bash';
}

/**
 * Get project root - uses provided prop or attempts to detect from environment
 */
function getProjectRoot(propRoot?: string): string {
  if (propRoot) return propRoot;

  // In Electron, we can get the project directory from various sources
  // The main process sets CYCLIST_PROJECT_DIR
  if (typeof process !== 'undefined' && process.env.CYCLIST_PROJECT_DIR) {
    return process.env.CYCLIST_PROJECT_DIR;
  }

  // Fallback to current working directory (not home)
  return process.cwd?.() || '/';
}

/**
 * TTYPanel - Terminal emulator panel for Cyclist
 */
export function TTYPanel({ projectRoot }: TTYPanelProps): React.ReactElement {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if we're in Electron environment
  if (!ipcRenderer) {
    return (
      <div
        className="tty-panel tty-not-available"
        data-testid="tty-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-secondary, #94a3b8)',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🖥️</div>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary, #e2e8f0)' }}>
          Terminal Not Available
        </h3>
        <p style={{ margin: 0, fontSize: '13px' }}>
          The terminal panel requires Electron.
          <br />
          Run Cyclist as a desktop app to use this feature.
        </p>
      </div>
    );
  }

  // Store IPC listener references for cleanup
  const ipcListenersRef = useRef<{
    data: (event: unknown, data: string) => void;
    error: (event: unknown, error: string) => void;
    exit: (event: unknown, code: number) => void;
    spawn: (event: unknown, pid: number) => void;
  } | null>(null);

  /**
   * Spawn a new PTY session
   */
  const spawnPty = useCallback(() => {
    const shell = getDefaultShell();
    const cwd = getProjectRoot(projectRoot);

    setStatus('connecting');
    setErrorMessage(null);

    ipcRenderer.send('pty:spawn', {
      shell,
      args: ['-l'], // Login shell to load profile
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });
  }, [projectRoot]);

  /**
   * Handle restart button click
   */
  const handleRestart = useCallback(() => {
    // Clear and reset terminal
    xtermRef.current?.clear();
    xtermRef.current?.reset();
    spawnPty();
  }, [spawnPty]);

  /**
   * Initialize terminal and PTY
   */
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create xterm Terminal with proper configuration
    const terminal = new Terminal({
      allowProposedApi: true,
      allowTransparency: false,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      scrollback: 5000,
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
      },
    });

    // Create and load FitAddon for resize handling
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Open terminal in container
    terminal.open(terminalRef.current);

    // Initial fit after open
    setTimeout(() => {
      fitAddon.fit();
      terminal.focus();
    }, 0);

    // Set up IPC listeners for PTY communication
    const handlePtyData = (_event: unknown, data: string) => {
      terminal.write(data);
    };

    const handlePtyError = (_event: unknown, error: string) => {
      setStatus('error');
      setErrorMessage(error);
    };

    const handlePtyExit = (_event: unknown, _code: number) => {
      setStatus('exited');
    };

    const handlePtySpawn = (_event: unknown, _pid: number) => {
      setStatus('connected');
    };

    // Store listener references for cleanup
    ipcListenersRef.current = {
      data: handlePtyData,
      error: handlePtyError,
      exit: handlePtyExit,
      spawn: handlePtySpawn,
    };

    // Register IPC listeners
    ipcRenderer.on('pty:data', handlePtyData);
    ipcRenderer.on('pty:error', handlePtyError);
    ipcRenderer.on('pty:exit', handlePtyExit);
    ipcRenderer.on('pty:spawn', handlePtySpawn);

    // Send terminal input to PTY
    const dataDisposable = terminal.onData((data) => {
      ipcRenderer.send('pty:data', data);
    });

    // Handle terminal resize - notify PTY
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      ipcRenderer.send('pty:resize', { cols, rows });
    });

    // Set up ResizeObserver for container resize handling with debounce
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    });

    resizeObserver.observe(terminalRef.current);
    resizeObserverRef.current = resizeObserver;

    // Spawn PTY session
    spawnPty();

    // Cleanup on unmount
    return () => {
      // Clear resize timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Disconnect ResizeObserver
      resizeObserverRef.current?.disconnect();

      // Remove IPC listeners
      if (ipcListenersRef.current) {
        ipcRenderer.removeListener('pty:data', ipcListenersRef.current.data);
        ipcRenderer.removeListener('pty:error', ipcListenersRef.current.error);
        ipcRenderer.removeListener('pty:exit', ipcListenersRef.current.exit);
        ipcRenderer.removeListener('pty:spawn', ipcListenersRef.current.spawn);
      }

      // Kill PTY process
      ipcRenderer.send('pty:kill');

      // Dispose terminal
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
    };
  }, [spawnPty]);

  // Render status message for error/exit states
  const renderStatusOverlay = () => {
    if (status === 'error') {
      return (
        <div className="tty-overlay" data-testid="tty-error">
          <div className="tty-overlay-content">
            <span className="tty-overlay-icon">⚠️</span>
            <span className="tty-overlay-message">Failed to spawn shell: {errorMessage}</span>
            <button
              className="tty-restart-button"
              onClick={handleRestart}
              aria-label="Restart terminal"
            >
              Restart
            </button>
          </div>
        </div>
      );
    }

    if (status === 'exited') {
      return (
        <div className="tty-overlay" data-testid="tty-exited">
          <div className="tty-overlay-content">
            <span className="tty-overlay-icon">✓</span>
            <span className="tty-overlay-message">Process ended</span>
            <button
              className="tty-restart-button"
              onClick={handleRestart}
              aria-label="New session"
            >
              New Session
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="tty-panel"
      data-testid="tty-panel"
      role="region"
      aria-label="Terminal"
      aria-describedby="tty-keyboard-help"
    >
      {/* Hidden keyboard help for screen readers */}
      <span id="tty-keyboard-help" className="sr-only">
        Terminal panel. Use keyboard to interact with the shell.
      </span>

      {/* Status announcer for screen readers */}
      <div
        data-testid="tty-status"
        aria-live="polite"
        className="sr-only"
      >
        {status === 'connecting' && 'Connecting to terminal...'}
        {status === 'connected' && 'Terminal connected'}
        {status === 'error' && `Terminal error: ${errorMessage}`}
        {status === 'exited' && 'Terminal session ended'}
      </div>

      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="tty-terminal-container"
        data-testid="tty-terminal-container"
        style={{ height: '100%', width: '100%' }}
      />

      {/* Status overlay for error/exit states */}
      {renderStatusOverlay()}
    </div>
  );
}

export default TTYPanel;
