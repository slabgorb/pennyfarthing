/**
 * ControlBar Component
 *
 * Provides Stop and Reset controls for Claude sessions.
 * Story MSSCI-12729 - Stop/Reset Controls and Escape Key
 *
 * Features:
 * - Stop button visible only when Claude is running
 * - Reset button always visible
 * - Escape key handler for stopping (single press = interrupt, double = force kill)
 * - Visual feedback for "Stopping..." state
 */

import React, { useEffect, useRef, useCallback } from 'react';

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
  /** Handle stop action */
  handleStop: () => void;
  /** Handle force stop action (SIGKILL) */
  handleForceStop: () => void;
  /** Handle reset action */
  handleReset: () => void;
}

export function useControlBar(): UseControlBarResult {
  const [isRunning, setIsRunning] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);

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

  return {
    isRunning,
    isStopping,
    handleStop,
    handleForceStop,
    handleReset,
  };
}

export default ControlBar;
