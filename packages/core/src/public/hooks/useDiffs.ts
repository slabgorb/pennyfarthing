/**
 * useDiffs Hook
 *
 * React hook for subscribing to diff data via DataSource.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-14238 - Git-based diffs (replaces OTEL-based extraction)
 * Story 124-3 - Refactored to use DataSource<T> pattern
 */

import { useState, useCallback } from 'react';
import { useRawDataSource } from './useDataSource.js';

export interface DiffData {
  id?: string;
  path: string;
  /** @deprecated Use `diff` field for raw git diff content */
  original: string;
  /** @deprecated Use `diff` field for raw git diff content */
  modified: string;
  /** Raw git diff output (MSSCI-14238) */
  diff?: string;
  toolName: string;
  timestamp: number;
  /** File status from git (MSSCI-14238) */
  status?: 'modified' | 'added' | 'deleted' | 'renamed';
  /** Line additions count (MSSCI-14238) */
  additions?: number;
  /** Line deletions count (MSSCI-14238) */
  deletions?: number;
}

interface UseDiffsResult {
  diffs: DiffData[];
  selectedDiff: DiffData | null;
  selectDiff: (path: string) => void;
  clearDiffs: () => void;
}

export function useDiffs(): UseDiffsResult {
  const [diffs, setDiffs] = useState<DiffData[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<DiffData | null>(null);

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; diffs?: DiffData[]; diff?: DiffData };

    if (msg.type === 'init') {
      const initialDiffs = msg.diffs || [];
      setDiffs(initialDiffs);
      if (initialDiffs.length > 0) {
        setSelectedDiff(initialDiffs[initialDiffs.length - 1]);
      }
    } else if (msg.type === 'diff') {
      const diffData = msg.diff as DiffData;
      setDiffs(prev => {
        const existing = prev.findIndex(d => d.path === diffData.path);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = diffData;
          return updated;
        }
        return [...prev, diffData];
      });
      setSelectedDiff(diffData);
    } else if (msg.type === 'refresh') {
      const refreshedDiffs = msg.diffs || [];
      setDiffs(refreshedDiffs);
      if (refreshedDiffs.length > 0) {
        setSelectedDiff(prev => {
          if (prev) {
            const stillExists = refreshedDiffs.find(d => d.path === prev.path);
            if (stillExists) return stillExists;
          }
          return refreshedDiffs[refreshedDiffs.length - 1];
        });
      } else {
        setSelectedDiff(null);
      }
    }
  }, []);

  const { send } = useRawDataSource({
    endpoint: '/ws/diffs',
    onMessage: handleMessage,
  });

  const selectDiff = useCallback((path: string) => {
    const diff = diffs.find(d => d.path === path);
    setSelectedDiff(diff || null);
  }, [diffs]);

  const clearDiffs = useCallback(() => {
    setDiffs([]);
    setSelectedDiff(null);
    send({ type: 'clear' });
  }, [send]);

  return { diffs, selectedDiff, selectDiff, clearDiffs };
}
