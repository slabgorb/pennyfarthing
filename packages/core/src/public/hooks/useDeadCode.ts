// Story 124-3: REST-based DataSource<T> variant
import { useState, useCallback, useRef, useEffect } from 'react';

export interface StaleFile {
  path: string;
  last_commit_date: string;
  days_since_last_commit: number;
  size_bytes: number;
}

export interface UnusedExport {
  symbol: string;
  file: string;
  line: number;
  export_type: string;
}

export interface DeadCodeData {
  success: boolean;
  repo_name?: string;
  repo_path?: string;
  time_window_days?: number;
  stale_files?: StaleFile[];
  unused_exports?: UnusedExport[];
  stale_file_count?: number;
  unused_export_count?: number;
  total_files?: number;
  total_exports_scanned?: number;
  repo_results?: DeadCodeData[];
  error?: string | null;
}

export interface UseDeadCodeOptions {
  days: number;
  repo?: string;
  layer?: 'stale' | 'exports' | 'all';
}

export interface UseDeadCodeReturn {
  data: DeadCodeData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useDeadCode(options: UseDeadCodeOptions): UseDeadCodeReturn {
  const [data, setData] = useState<DeadCodeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDeadCode = useCallback(() => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      days: String(options.days),
      layer: options.layer || 'all',
    });
    if (options.repo) {
      params.set('repo', options.repo);
    }

    fetch(`/api/dead-code?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: DeadCodeData) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, [options.days, options.repo, options.layer]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh: fetchDeadCode };
}
