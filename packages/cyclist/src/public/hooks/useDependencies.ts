import { useState, useCallback, useRef, useEffect } from 'react';

// Types matching Python DependenciesResult / OutdatedPackage / SecurityAdvisory
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

// Stub: Story 83-3 — useDependencies hook
// Dev will implement the full fetch + AbortController logic
export function useDependencies(_options: UseDependenciesOptions): UseDependenciesReturn {
  const [data] = useState<DependenciesData | null>(null);
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
