/**
 * useDiffs Hook
 *
 * React hook for subscribing to diff data via electronAPI.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect, useCallback } from 'react';

export interface DiffData {
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

export function useDiffs(): UseDiffsResult {
  const [diffs, setDiffs] = useState<DiffData[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<DiffData | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.diff) {
      return;
    }

    // Subscribe to diff updates
    api.diff.onUpdate((_, data) => {
      const diffData = data as DiffData;
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
    });
  }, []);

  const selectDiff = useCallback((path: string) => {
    const diff = diffs.find(d => d.path === path);
    setSelectedDiff(diff || null);
  }, [diffs]);

  const clearDiffs = useCallback(() => {
    setDiffs([]);
    setSelectedDiff(null);
  }, []);

  return { diffs, selectedDiff, selectDiff, clearDiffs };
}
