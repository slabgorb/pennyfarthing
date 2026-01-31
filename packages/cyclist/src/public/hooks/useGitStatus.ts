/**
 * useGitStatus Hook
 *
 * React hook for subscribing to git status data via electronAPI.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect } from 'react';

export interface GitStatusData {
  branch: string;
  ahead?: number;
  behind?: number;
  staged?: number;
  modified?: number;
  untracked?: number;
  isDirty?: boolean;
}

interface UseGitStatusResult {
  gitStatus: GitStatusData | null;
  isLoading: boolean;
  error: Error | null;
}

export function useGitStatus(): UseGitStatusResult {
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.git) {
      setError(new Error('electronAPI.git not available'));
      setIsLoading(false);
      return;
    }

    // Initial fetch
    api.git.get()
      .then((data) => {
        setGitStatus(data as GitStatusData | null);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch git status'));
        setIsLoading(false);
      });

    // Subscribe to updates
    api.git.onUpdate((_, data) => {
      setGitStatus(data as GitStatusData | null);
    });
  }, []);

  return { gitStatus, isLoading, error };
}
