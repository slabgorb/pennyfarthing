import { useState, useCallback, useRef } from 'react';

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
  lastFetchedAt: number | null;
  refresh: () => void;
}

export function useHealthScore(): UseHealthScoreReturn {
  const [data, setData] = useState<HealthScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetch('/api/health-score', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: HealthScoreData) => {
        setData(json);
        setLastFetchedAt(Date.now());
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, []);

  return { data, isLoading, error, lastFetchedAt, refresh };
}
