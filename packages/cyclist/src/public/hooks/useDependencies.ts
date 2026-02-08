import { useState, useCallback, useRef, useEffect } from 'react';

export interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: string;
}

export interface SecurityAdvisory {
  severity: string;
  count: number;
}

export interface DependenciesData {
  success: boolean;
  target_path: string;
  outdated: OutdatedPackage[];
  advisories: SecurityAdvisory[];
  error?: string | null;
}

export interface UseDependenciesOptions {
  path?: string;
}

export interface UseDependenciesReturn {
  data: DependenciesData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useDependencies(options: UseDependenciesOptions): UseDependenciesReturn {
  const [data, setData] = useState<DependenciesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDependencies = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (options.path) params.set('path', options.path);

    fetch(`/api/dependencies?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: DependenciesData) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, [options.path]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh: fetchDependencies };
}
