/**
 * useCodeMarkers React hook — Story 80-3 (MSSCI-14456)
 *
 * Wraps /api/code-markers endpoint with AbortController,
 * loading/error/data state management, and manual refresh.
 */
import { useState, useCallback, useEffect, useRef } from 'react';

export interface CodeMarker {
  path: string;
  line: number;
  marker_type: string;
  text: string;
  author: string;
  date: string;
  age_days: number;
  is_stale: boolean;
}

export interface MarkerSummary {
  total_markers: number;
  stale_markers: number;
  by_type: Record<string, number>;
}

export interface CodeMarkersData {
  success: boolean;
  repo_name: string;
  repo_path: string;
  stale_threshold_days: number;
  markers: CodeMarker[];
  summary: MarkerSummary;
  error: string | null;
}

export interface UseCodeMarkersOptions {
  days: number;
  repo?: string;
  type?: 'all' | 'stale' | 'deprecated';
}

export interface UseCodeMarkersReturn {
  data: CodeMarkersData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useCodeMarkers(options: UseCodeMarkersOptions): UseCodeMarkersReturn {
  const [data, setData] = useState<CodeMarkersData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCodeMarkers = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ days: String(options.days) });
    if (options.repo) {
      params.set('repo', options.repo);
    }
    if (options.type) {
      params.set('type', options.type);
    }

    fetch(`/api/code-markers?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: CodeMarkersData) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, [options.days, options.repo, options.type]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh: fetchCodeMarkers };
}
