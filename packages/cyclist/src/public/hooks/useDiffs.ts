/**
 * useDiffs Hook
 *
 * React hook for subscribing to diff data via WebSocket.
 * Story MSSCI-12717 - React Migration
 *
 * IPC DEPRECATED - Now uses WebSocket /ws/diffs
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface DiffData {
  id?: string;
  path: string;
  original: string;
  modified: string;
  toolName: string;
  timestamp: number;
}

interface UseDiffsResult {
  diffs: DiffData[];
  selectedDiff: DiffData | null;
  selectDiff: (path: string) => void;
  clearDiffs: () => void;
}

const WS_RECONNECT_DELAY = 2000;

export function useDiffs(): UseDiffsResult {
  const [diffs, setDiffs] = useState<DiffData[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<DiffData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/diffs`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useDiffs] WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            // Initial load of existing diffs
            const initialDiffs = (data.diffs || []) as DiffData[];
            setDiffs(initialDiffs);
            if (initialDiffs.length > 0) {
              setSelectedDiff(initialDiffs[initialDiffs.length - 1]);
            }
          } else if (data.type === 'diff') {
            // New diff arrived
            const diffData = data.diff as DiffData;
            setDiffs(prev => {
              // Update or add diff
              const existing = prev.findIndex(d => d.path === diffData.path);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = diffData;
                return updated;
              }
              return [...prev, diffData];
            });
            // Auto-select new diff
            setSelectedDiff(diffData);
          }
        } catch (err) {
          console.error('[useDiffs] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        if (mounted) {
          reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = (err) => {
        console.error('[useDiffs] WebSocket error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const selectDiff = useCallback((path: string) => {
    const diff = diffs.find(d => d.path === path);
    setSelectedDiff(diff || null);
  }, [diffs]);

  const clearDiffs = useCallback(() => {
    setDiffs([]);
    setSelectedDiff(null);
    // Send clear message to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear' }));
    }
  }, []);

  return { diffs, selectedDiff, selectDiff, clearDiffs };
}
