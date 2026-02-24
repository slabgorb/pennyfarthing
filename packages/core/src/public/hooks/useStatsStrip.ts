/**
 * useStatsStrip Hook
 *
 * React hook for fetching and subscribing to stats strip data.
 * Story MSSCI-12699 - StatsStrip Component
 * Story 124-3 - Refactored to use DataSource<T> pattern
 *
 * Multi-source DataSource composition:
 * - /ws/context: Context percentage, used/total tokens (WebSocket DataSource)
 * - /ws/stats: Model name (WebSocket DataSource)
 * - /api/identity: PWD, Jira email, GitHub username (REST, fetched once)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRawDataSource } from './useDataSource.js';

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

  // Track load state for each source
  const loadStateRef = useRef({
    context: false,
    stats: false,
    projectInfo: false,
  });

  const checkLoadComplete = useCallback(() => {
    const state = loadStateRef.current;
    if (state.context && state.stats && state.projectInfo) {
      setIsLoading(false);
    }
  }, []);

  // DataSource for /ws/context
  const handleContextMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; context?: { percent?: number; tokens?: number; available?: number } };
    if (msg.type === 'init' || msg.type === 'update') {
      const ctx = msg.context;
      if (ctx) {
        setContext({
          percent: ctx.percent ?? 0,
          used: ctx.tokens ?? undefined,
          total: ctx.available ? (ctx.tokens ?? 0) + ctx.available : undefined,
        });
      }
      if (!loadStateRef.current.context) {
        loadStateRef.current.context = true;
        checkLoadComplete();
      }
    }
  }, [checkLoadComplete]);

  useRawDataSource({
    endpoint: '/ws/context',
    onMessage: handleContextMessage,
  });

  // DataSource for /ws/stats
  const handleStatsMessage = useCallback((data: unknown) => {
    const msg = data as { model?: string; pwd?: string };
    setStats({ model: msg.model ?? null });
    if (msg.pwd) {
      setProjectInfo(prev => ({
        pwd: msg.pwd!,
        jiraEmail: prev?.jiraEmail ?? null,
        githubUsername: prev?.githubUsername ?? null,
      }));
    }
    if (!loadStateRef.current.stats) {
      loadStateRef.current.stats = true;
      checkLoadComplete();
    }
  }, [checkLoadComplete]);

  useRawDataSource({
    endpoint: '/ws/stats',
    onMessage: handleStatsMessage,
  });

  // REST for /api/identity (fetched once)
  useEffect(() => {
    const fetchIdentity = async () => {
      try {
        const response = await fetch('/api/identity');
        if (response.ok) {
          const data = await response.json();
          setProjectInfo(prev => ({
            pwd: prev?.pwd ?? '',
            jiraEmail: data.jiraEmail ?? null,
            githubUsername: data.githubUsername ?? null,
          }));
        }
      } catch (err) {
        console.error('[useStatsStrip] Failed to fetch identity:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch identity'));
      } finally {
        loadStateRef.current.projectInfo = true;
        checkLoadComplete();
      }
    };

    fetchIdentity();
  }, [checkLoadComplete]);

  return { context, stats, projectInfo, isLoading, error };
}
