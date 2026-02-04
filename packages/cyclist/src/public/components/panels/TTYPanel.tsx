/**
 * TTYPanel - Terminal panel using xterm.js over WebSocket
 *
 * Story MSSCI-14211 - TTY Panel with xterm.js terminal emulator
 * Epic: Epic 76 - Dockview Panel Migration
 *
 * Features:
 * - Embeds xterm.js terminal in a Dockview panel
 * - Communicates with server via /ws/pty WebSocket (works in both Electron and web mode)
 * - Loads user's shell with environment (bash/zsh profile)
 * - Opens in project root directory
 * - Proper resize handling via FitAddon
 * - Standard terminal features (colors, cursor, scrollback)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

/** Props for TTYPanel component */
export interface TTYPanelProps {
  /** Project root directory for the terminal. Defaults to current project. */
  projectRoot?: string;
}

/** Terminal status states */
type TerminalStatus = 'connecting' | 'connected' | 'error' | 'exited';

/**
 * TTYPanel - Terminal emulator panel for Cyclist
 */
export function TTYPanel({ projectRoot }: TTYPanelProps): React.ReactElement {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Build the WebSocket URL for /ws/pty
   */
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/pty`;
  }, []);

  /**
   * Spawn a new PTY session via WebSocket
   */
  const spawnPty = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    setStatus('connecting');
    setErrorMessage(null);

    const fitAddon = fitAddonRef.current;
    const cols = fitAddon ? Math.max(fitAddon.proposeDimensions()?.cols ?? 80, 1) : 80;
    const rows = fitAddon ? Math.max(fitAddon.proposeDimensions()?.rows ?? 24, 1) : 24;

    ws.send(JSON.stringify({
      type: 'spawn',
      cwd: projectRoot,
      cols,
      rows,
    }));
  }, [projectRoot]);

  /**
   * Handle restart button click
   */
  const handleRestart = useCallback(() => {
    xtermRef.current?.clear();
    xtermRef.current?.reset();
    spawnPty();
  }, [spawnPty]);

  /**
   * Initialize terminal and WebSocket
   */
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create xterm Terminal
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

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(terminalRef.current);

    // Initial fit after open
    setTimeout(() => {
      fitAddon.fit();
      terminal.focus();
    }, 0);

    // Connect WebSocket to /ws/pty
    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Spawn PTY once connected
      const cols = Math.max(fitAddon.proposeDimensions()?.cols ?? 80, 1);
      const rows = Math.max(fitAddon.proposeDimensions()?.rows ?? 24, 1);

      ws.send(JSON.stringify({
        type: 'spawn',
        cwd: projectRoot,
        cols,
        rows,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          terminal.write(msg.data);
        } else if (msg.type === 'spawn') {
          setStatus('connected');
        } else if (msg.type === 'exit') {
          setStatus('exited');
        } else if (msg.type === 'error') {
          setStatus('error');
          setErrorMessage(msg.error);
        }
      } catch {
        // Non-JSON data, write directly
        terminal.write(event.data);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMessage('WebSocket connection failed');
    };

    ws.onclose = () => {
      if (status === 'connected') {
        setStatus('exited');
      }
    };

    // Send terminal input to PTY via WebSocket
    const dataDisposable = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    // Handle terminal resize - notify PTY via WebSocket
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // ResizeObserver for container resize handling with debounce
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    });

    resizeObserver.observe(terminalRef.current);
    resizeObserverRef.current = resizeObserver;

    // Cleanup on unmount
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeObserverRef.current?.disconnect();

      // Kill PTY and close WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'kill' }));
        ws.close();
      }
      wsRef.current = null;

      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
    };
  }, [getWsUrl, projectRoot]);

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
