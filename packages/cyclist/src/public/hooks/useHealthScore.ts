/**
 * useHealthScore Hook — STUB
 *
 * Story 84-2: To be implemented by Dev.
 * Fetches health score from /api/health-score with auto-polling.
 */

import { useState, useCallback } from 'react';

export interface HealthScoreDimension {
  name: string;
  score: number | null;
  weight: number;
}

export interface HealthScoreData {
  success: boolean;
  composite_score: number;
  dimensions: HealthScoreDimension[];
  cached: boolean;
  error?: string;
}

export interface UseHealthScoreReturn {
  data: HealthScoreData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useHealthScore(): UseHealthScoreReturn {
  const [data] = useState<HealthScoreData | null>(null);
  const [isLoading] = useState(false);
  const [error] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    // TODO: Implement fetch to /api/health-score with AbortController and 60s polling
  }, []);

  return { data, isLoading, error, refresh };
}
