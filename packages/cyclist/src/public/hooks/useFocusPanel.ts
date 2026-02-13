/**
 * useFocusPanel Hook
 *
 * React hook for handling panel focus events via /ws/focus WebSocket.
 * Story MSSCI-14977 - BikeShow client layout stash/restore on panel focus
 * Epic 104: /bc CLI Panel Focus
 *
 * Listens to /ws/focus WebSocket for focus events. On focus:
 * - Stash current layout (once)
 * - Render target panel as single-panel fullscreen
 * On reset (focus: null):
 * - Restore stashed layout
 *
 * No stash stack — successive /bc calls preserve original saved state.
 */

import { useEffect, useRef } from 'react';
import type { DockviewApi, SerializedDockview } from 'dockview-react';

export interface UseFocusPanelResult {
  /** Currently focused panel ID, or null if not in focus mode */
  focusedPanel: string | null;
  /** Whether the workspace is currently in single-panel focus mode */
  isInFocusMode: boolean;
  /** The stashed layout that will be restored on reset */
  stashedLayout: SerializedDockview | null;
}

/**
 * Hook for managing panel focus mode.
 *
 * @param api - Dockview API instance for layout manipulation, or null if not ready
 * @returns Focus state including current focused panel and mode
 */
export function useFocusPanel(api: DockviewApi | null): UseFocusPanelResult {
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to /ws/focus WebSocket — stub: connects but does not process messages
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/focus`;

    wsRef.current = new WebSocket(wsUrl);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Stub: not implemented — returns default empty state
  // Dev will implement: message handling, stash/restore, state management
  return {
    focusedPanel: null,
    isInFocusMode: false,
    stashedLayout: null,
  };
}
