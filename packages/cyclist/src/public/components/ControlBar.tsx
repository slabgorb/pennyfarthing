/**
 * ControlBar Component
 *
 * Provides Stop, Reset, Bell Mode, and Relay Mode controls for Claude sessions.
 * Story MSSCI-12729 - Stop/Reset Controls and Escape Key
 * Story MSSCI-12275 - Bell Mode toggle
 * Story MSSCI-12395 - Relay Mode toggle
 *
 * Features:
 * - Stop button visible only when Claude is running
 * - Reset button always visible
 * - Bell mode toggle (inject queued messages via PostToolUse hook)
 * - Relay mode toggle (auto-handoff to next agent)
 * - Escape key handler for stopping (single press = interrupt, double = force kill)
 * - Visual feedback for "Stopping..." state
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface ControlBarProps {
  /** Whether Claude is currently running */
  isRunning: boolean;
  /** Whether stop is in progress */
  isStopping?: boolean;
  /** Called when stop button clicked or Escape pressed */
  onStop: () => void;
  /** Called on double Escape for force kill */
  onForceStop?: () => void;
  /** Called when reset button clicked */
  onReset: () => void;
  /** Bell mode state (inject queued messages via hook) */
  bellMode?: boolean;
  /** Relay mode state (auto-handoff to next agent) */
  relayMode?: boolean;
  /** Called when bell mode toggle clicked */
  onBellModeChange?: (enabled: boolean) => void;
  /** Called when relay mode toggle clicked */
  onRelayModeChange?: (enabled: boolean) => void;
}

// =============================================================================
// ControlBar Component
// =============================================================================

export function ControlBar({
  isRunning,
  isStopping = false,
  onStop,
  onForceStop,
  onReset,
  bellMode = false,
  relayMode = false,
  onBellModeChange,
  onRelayModeChange,
}: ControlBarProps): React.ReactElement {
  const lastEscapeTime = useRef<number>(0);
  const DOUBLE_PRESS_THRESHOLD = 500; // ms

  // Global Escape key handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle Escape
      if (event.key !== 'Escape' && event.keyCode !== 27) {
        return;
      }

      // Don't handle if not running
      if (!isRunning) {
        return;
      }

      // Check for double press
      const now = Date.now();
      const timeSinceLastEscape = now - lastEscapeTime.current;

      if (timeSinceLastEscape < DOUBLE_PRESS_THRESHOLD && onForceStop) {
        // Double Escape - force kill
        onForceStop();
      } else {
        // Single Escape - normal stop
        onStop();
      }

      lastEscapeTime.current = now;
    },
    [isRunning, onStop, onForceStop]
  );

  // Register global keydown listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="control-bar" data-testid="control-bar">
      {/* Mode toggles - Bell and Relay */}
      <div className="control-bar-toggles">
        {/* Bell Mode Toggle */}
        <button
          type="button"
          className={`btn-toggle bell-toggle ${bellMode ? 'active' : ''}`}
          data-testid="bell-toggle"
          onClick={() => onBellModeChange?.(!bellMode)}
          aria-pressed={bellMode}
          aria-label="Bell mode - inject queued messages via hook"
          title="Bell Mode: Inject queued messages during tool use (Cmd+B)"
        >
          <span className="toggle-icon">🔔</span>
        </button>

        {/* Relay Mode Toggle */}
        <button
          type="button"
          className={`btn-toggle relay-toggle ${relayMode ? 'active' : ''}`}
          data-testid="relay-toggle"
          onClick={() => onRelayModeChange?.(!relayMode)}
          aria-pressed={relayMode}
          aria-label="Relay mode - auto-handoff to next agent"
          title="Relay Mode: Auto-handoff to next agent (Cmd+4)"
        >
          <span className="toggle-icon">🚲</span>
        </button>
      </div>

      {/* Stop button - always visible, disabled when not running */}
      <button
        type="button"
        className={`btn-stop danger ${isStopping ? 'stopping' : ''} ${isRunning && !isStopping ? 'throbbing' : ''}`}
        data-testid="stop-button"
        onClick={onStop}
        disabled={!isRunning || isStopping}
        aria-busy={isStopping}
        aria-label="Stop Claude"
      >
        <span data-icon="stop" className="icon" />
        {isStopping ? (
          <>
            <span className="spinner" data-loading />
            Stopping...
          </>
        ) : (
          'Stop'
        )}
      </button>

      {/* Reset button - always visible */}
      <button
        type="button"
        className="btn-reset"
        data-testid="reset-button"
        onClick={onReset}
        aria-label="Reset session"
      >
        Reset
      </button>
    </div>
  );
}

// =============================================================================
// useControlBar Hook
// =============================================================================

interface UseControlBarResult {
  /** Whether Claude is currently running */
  isRunning: boolean;
  /** Whether stop is in progress */
  isStopping: boolean;
  /** Bell mode state */
  bellMode: boolean;
  /** Relay mode state */
  relayMode: boolean;
  /** Handle stop action */
  handleStop: () => void;
  /** Handle force stop action (SIGKILL) */
  handleForceStop: () => void;
  /** Handle reset action */
  handleReset: () => void;
  /** Handle bell mode toggle */
  handleBellModeChange: (enabled: boolean) => void;
  /** Handle relay mode toggle */
  handleRelayModeChange: (enabled: boolean) => void;
}

export function useControlBar(): UseControlBarResult {
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [bellMode, setBellMode] = useState(false);
  const [relayMode, setRelayMode] = useState(false);

  // Permission mode is now managed by Editor component

  // Load initial settings and listen for changes
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.settings) return;

    // Load initial settings
    api.settings.get?.().then((settings: Record<string, unknown>) => {
      const workflow = settings?.workflow as Record<string, unknown> | undefined;
      setBellMode(!!workflow?.bell_mode);
      setRelayMode(!!workflow?.relay_mode);
    });

    // Subscribe to settings changes
    api.settings.onChanged?.((settings: Record<string, unknown>) => {
      const workflow = settings?.workflow as Record<string, unknown> | undefined;
      setBellMode(!!workflow?.bell_mode);
      setRelayMode(!!workflow?.relay_mode);
    });
  }, []);

  // Listen for Claude running state changes
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.claude) return;

    // Track when Claude starts/completes
    const handleMessage = () => {
      setIsRunning(true);
      setIsStopping(false);
    };

    const handleComplete = () => {
      setIsRunning(false);
      setIsStopping(false);
    };

    const handleError = () => {
      setIsRunning(false);
      setIsStopping(false);
    };

    // Subscribe to events
    api.claude.onMessage?.(handleMessage);
    api.claude.onComplete?.(handleComplete);
    api.claude.onError?.(handleError);

    // Cleanup handled by electronAPI internally
  }, []);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      // Use abort() - SIGINT doesn't reliably stop Claude CLI
      await window.electronAPI?.claude?.abort?.();
    } catch (err) {
      console.error('[ControlBar] Stop failed:', err);
    }
  }, []);

  const handleForceStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await window.electronAPI?.claude?.abort?.();
    } catch (err) {
      console.error('[ControlBar] Force stop failed:', err);
    }
  }, []);

  const handleReset = useCallback(async () => {
    try {
      await window.electronAPI?.claude?.clear?.();
      await window.electronAPI?.messages?.clear?.();
      setIsRunning(false);
      setIsStopping(false);
    } catch (err) {
      console.error('[ControlBar] Reset failed:', err);
    }
  }, []);

  const handleBellModeChange = useCallback(async (enabled: boolean) => {
    try {
      const api = window.electronAPI;
      if (!api?.settings) return;

      const current = await api.settings.get?.() as Record<string, unknown> || {};
      const workflow = (current.workflow as Record<string, unknown>) || {};
      await api.settings.save?.({
        ...current,
        workflow: { ...workflow, bell_mode: enabled },
      });
      setBellMode(enabled);
      console.log('[ControlBar] Bell mode set to:', enabled);
    } catch (err) {
      console.error('[ControlBar] Failed to toggle bell mode:', err);
    }
  }, []);

  const handleRelayModeChange = useCallback(async (enabled: boolean) => {
    try {
      const api = window.electronAPI;
      if (!api?.settings) return;

      const current = await api.settings.get?.() as Record<string, unknown> || {};
      const workflow = (current.workflow as Record<string, unknown>) || {};
      await api.settings.save?.({
        ...current,
        workflow: { ...workflow, relay_mode: enabled },
      });
      setRelayMode(enabled);
      console.log('[ControlBar] Relay mode set to:', enabled);
    } catch (err) {
      console.error('[ControlBar] Failed to toggle relay mode:', err);
    }
  }, []);

  return {
    isRunning,
    isStopping,
    bellMode,
    relayMode,
    handleStop,
    handleForceStop,
    handleReset,
    handleBellModeChange,
    handleRelayModeChange,
  };
}

export default ControlBar;
