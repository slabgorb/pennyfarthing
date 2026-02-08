import { useState, useCallback, useRef, useEffect } from 'react';

// Types matching Python ComplexityResult / FileComplexity
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

// Stub: Story 83-3 — useComplexity hook
// Dev will implement the full fetch + AbortController logic
export function useComplexity(_options: UseComplexityOptions): UseComplexityReturn {
  const [data] = useState<ComplexityData | null>(null);
  const [isLoading] = useState(false);
  const [error] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    // Not implemented — tests will fail on assertions
  }, []);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh };
}
