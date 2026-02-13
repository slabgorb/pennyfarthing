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

import { useState, useEffect, useRef } from 'react';
import type { DockviewApi, SerializedDockview } from 'dockview-react';

export interface UseFocusPanelResult {
  /** Currently focused panel ID, or null if not in focus mode */
  focusedPanel: string | null;
  /** Whether the workspace is currently in single-panel focus mode */
  isInFocusMode: boolean;
  /** The stashed layout that will be restored on reset */
  stashedLayout: SerializedDockview | null;
}

/** WebSocket message format from /ws/focus */
interface FocusMessage {
  type: 'init' | 'update';
  focus: string | null;
}

/**
 * Build a minimal single-panel layout for focus mode.
 */
function buildSinglePanelLayout(panelId: string): SerializedDockview {
  return {
    grid: {
      root: {
        type: 'leaf',
        data: {
          views: [panelId],
          activeView: panelId,
          id: 'focus-group',
        },
        size: 1,
      },
      width: 1,
      height: 1,
      orientation: 'HORIZONTAL',
    },
    panels: {
      [panelId]: {
        id: panelId,
        contentComponent: 'PanelAdapter',
        title: panelId,
        params: { panelId },
      },
    },
    activeGroup: 'focus-group',
  };
}

/**
 * Hook for managing panel focus mode.
 *
 * @param api - Dockview API instance for layout manipulation, or null if not ready
 * @returns Focus state including current focused panel and mode
 */
export function useFocusPanel(api: DockviewApi | null): UseFocusPanelResult {
  const [focusedPanel, setFocusedPanel] = useState<string | null>(null);
  const [isInFocusMode, setIsInFocusMode] = useState(false);
  const [stashedLayout, setStashedLayout] = useState<SerializedDockview | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

  // Refs to access latest values inside WebSocket callbacks without re-creating the effect
  const apiRef = useRef(api);
  apiRef.current = api;

  const inFocusModeRef = useRef(false);
  const stashRef = useRef<SerializedDockview | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/focus`;

    const handleFocusChange = (focus: string | null) => {
      const currentApi = apiRef.current;

      if (focus !== null) {
        // Focus on a panel
        if (!inFocusModeRef.current && currentApi) {
          // First focus after normal mode — stash current layout
          const layout = currentApi.toJSON();
          stashRef.current = layout;
          setStashedLayout(layout);
        }

        inFocusModeRef.current = true;
        setIsInFocusMode(true);
        setFocusedPanel(focus);

        if (currentApi) {
          currentApi.fromJSON(buildSinglePanelLayout(focus));
        }
      } else {
        // Reset — restore stashed layout
        if (inFocusModeRef.current && currentApi && stashRef.current) {
          currentApi.fromJSON(stashRef.current);
        }

        stashRef.current = null;
        inFocusModeRef.current = false;
        setStashedLayout(null);
        setIsInFocusMode(false);
        setFocusedPanel(null);
      }
    };

    const connect = () => {
      if (!isMountedRef.current) return;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as FocusMessage;
          if (msg.type === 'update') {
            // Live /bc commands — apply focus change immediately
            handleFocusChange(msg.focus);
          }
          // 'init' messages are ignored — focus is ephemeral, not persistent.
          // Stale focus values in config would destroy the layout on page load.
        } catch {
          // Ignore malformed messages
        }
      };

      wsRef.current.onclose = () => {
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { focusedPanel, isInFocusMode, stashedLayout };
}
