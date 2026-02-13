/**
 * useFocusPanel Hook
 *
 * React hook for handling panel focus events via /ws/focus WebSocket.
 * Story MSSCI-14977 - BikeShow client layout stash/restore on panel focus
 * Epic 104: /bc CLI Panel Focus
 *
 * Listens to /ws/focus WebSocket for focus events.
 *
 * Multi-group layouts (Cyclist): maximizeGroup/exitMaximizedGroup
 * Single-group layouts (BikeRack): activate target tab, stash previous
 */

import { useState, useEffect, useRef } from 'react';
import type { DockviewApi } from 'dockview-react';

export interface UseFocusPanelResult {
  /** Currently focused panel ID, or null if not in focus mode */
  focusedPanel: string | null;
  /** Whether the workspace is currently in single-panel focus mode */
  isInFocusMode: boolean;
}

/** WebSocket message format from /ws/focus */
interface FocusMessage {
  type: 'init' | 'update';
  focus: string | null;
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

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

  // Refs to access latest values inside WebSocket callbacks without re-creating the effect
  const apiRef = useRef(api);
  apiRef.current = api;

  // Stash the previously active panel ID for single-group reset
  const previousActivePanelRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/focus`;

    const handleFocusChange = (focus: string | null) => {
      const currentApi = apiRef.current;
      if (!currentApi) return;

      if (focus !== null) {
        const panel = currentApi.getPanel(focus);
        if (!panel) return;

        const isMultiGroup = currentApi.groups.length > 1;

        if (isMultiGroup) {
          // Multi-group (Cyclist): maximize the target panel's group
          currentApi.maximizeGroup(panel);
        } else {
          // Single-group (BikeRack): stash current active, switch tab
          if (!previousActivePanelRef.current) {
            previousActivePanelRef.current = currentApi.activePanel?.id ?? null;
          }
          panel.api.setActive();
        }

        setIsInFocusMode(true);
        setFocusedPanel(focus);
      } else {
        // Reset
        const isMaximized = currentApi.hasMaximizedGroup();

        if (isMaximized) {
          // Multi-group: exit maximize
          currentApi.exitMaximizedGroup();
        } else if (previousActivePanelRef.current) {
          // Single-group: restore previous active tab
          const prev = currentApi.getPanel(previousActivePanelRef.current);
          if (prev) prev.api.setActive();
        }

        previousActivePanelRef.current = null;
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

  return { focusedPanel, isInFocusMode };
}
