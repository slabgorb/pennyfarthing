/**
 * useStatsStrip Hook
 *
 * React hook for fetching and subscribing to stats strip data.
 * Story MSSCI-12699 - StatsStrip Component
 *
 * Aggregates data from:
 * - context: Context percentage, used/total tokens
 * - stats: Model name
 * - projectInfo: PWD, Jira email, GitHub username
 */

import { useState, useEffect, useCallback } from 'react';

export interface ContextData {
  percent: number;
  used?: number;
  total?: number;
}

export interface StatsData {
  model: string | null;
}

export interface ProjectInfoData {
  pwd: string;
  jiraEmail: string | null;
  githubUsername: string | null;
}

interface UseStatsStripResult {
  context: ContextData | null;
  stats: StatsData | null;
  projectInfo: ProjectInfoData | null;
  isLoading: boolean;
  error: Error | null;
}

export function useStatsStrip(): UseStatsStripResult {
  const [context, setContext] = useState<ContextData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track load state for each API (value unused, only type needed for callback)
  const [_loadState, setLoadState] = useState({
    context: false,
    stats: false,
    projectInfo: false,
  });

  const checkLoadComplete = useCallback((state: typeof _loadState) => {
    if (state.context && state.stats && state.projectInfo) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const api = window.electronAPI;

    // Fetch context
    if (api?.context) {
      api.context.get()
        .then((data) => {
          setContext(data as ContextData | null);
          setLoadState(prev => {
            const next = { ...prev, context: true };
            checkLoadComplete(next);
            return next;
          });
        })
        .catch((err) => {
          setError(err instanceof Error ? err : new Error('Failed to fetch context'));
          setLoadState(prev => {
            const next = { ...prev, context: true };
            checkLoadComplete(next);
            return next;
          });
        });

      // Subscribe to updates
      api.context.onUpdate((_, data) => {
        setContext(data as ContextData | null);
      });
    } else {
      setLoadState(prev => {
        const next = { ...prev, context: true };
        checkLoadComplete(next);
        return next;
      });
    }

    // Fetch stats
    if (api?.stats) {
      api.stats.get()
        .then((data) => {
          setStats(data as StatsData | null);
          setLoadState(prev => {
            const next = { ...prev, stats: true };
            checkLoadComplete(next);
            return next;
          });
        })
        .catch((err) => {
          if (!error) setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
          setLoadState(prev => {
            const next = { ...prev, stats: true };
            checkLoadComplete(next);
            return next;
          });
        });

      // Subscribe to updates
      api.stats.onUpdate((_, data) => {
        setStats(data as StatsData | null);
      });
    } else {
      setLoadState(prev => {
        const next = { ...prev, stats: true };
        checkLoadComplete(next);
        return next;
      });
    }

    // Fetch projectInfo
    if (api?.projectInfo) {
      api.projectInfo.get()
        .then((data) => {
          setProjectInfo(data as ProjectInfoData | null);
          setLoadState(prev => {
            const next = { ...prev, projectInfo: true };
            checkLoadComplete(next);
            return next;
          });
        })
        .catch((err) => {
          if (!error) setError(err instanceof Error ? err : new Error('Failed to fetch projectInfo'));
          setLoadState(prev => {
            const next = { ...prev, projectInfo: true };
            checkLoadComplete(next);
            return next;
          });
        });

      // Subscribe to updates
      api.projectInfo.onUpdate((_, data) => {
        setProjectInfo(data as ProjectInfoData | null);
      });
    } else {
      setLoadState(prev => {
        const next = { ...prev, projectInfo: true };
        checkLoadComplete(next);
        return next;
      });
    }
  }, [checkLoadComplete, error]);

  return { context, stats, projectInfo, isLoading, error };
}
