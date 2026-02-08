import { useState, useCallback, useRef, useEffect } from 'react';

export interface FileComplexity {
  path: string;
  total_lines: number;
  longest_function: number;
  avg_cyclomatic_complexity: number;
  max_nesting_depth: number;
  function_count: number;
}

export interface ComplexityData {
  success: boolean;
  target_path: string;
  file_count: number;
  files: FileComplexity[];
  error?: string | null;
}

export interface UseComplexityOptions {
  path?: string;
  top?: number;
}

export interface UseComplexityReturn {
  data: ComplexityData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useComplexity(options: UseComplexityOptions): UseComplexityReturn {
  const [data, setData] = useState<ComplexityData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchComplexity = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (options.path) params.set('path', options.path);
    if (options.top) params.set('top', String(options.top));

    fetch(`/api/complexity?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: ComplexityData) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, [options.path, options.top]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh: fetchComplexity };
}
