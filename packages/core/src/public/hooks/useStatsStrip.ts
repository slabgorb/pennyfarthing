/**
 * useStatsStrip Hook
 *
 * React hook for fetching and subscribing to stats strip data.
 * Story MSSCI-12699 - StatsStrip Component
 *
 * IPC DEPRECATED - Now uses WebSocket for all data:
 * - /ws/context: Context percentage, used/total tokens
 * - /ws/stats: Model name
 * - /api/identity: PWD, Jira email, GitHub username (REST, fetched once)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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

const WS_RECONNECT_DELAY = 2000;

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

  // WebSocket for /ws/context
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/context`);

      ws.onopen = () => {
        console.log('[useStatsStrip] Context WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init' || data.type === 'update') {
            const ctx = data.context;
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
        } catch (err) {
          console.error('[useStatsStrip] Failed to parse context message:', err);
        }
      };

      ws.onclose = () => {
        if (mounted) {
          reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = (err) => {
        console.error('[useStatsStrip] Context WebSocket error:', err);
        ws?.close();
      };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [checkLoadComplete]);

  // WebSocket for /ws/stats
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/stats`);

      ws.onopen = () => {
        console.log('[useStatsStrip] Stats WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Stats sends data directly (not wrapped in type)
          setStats({ model: data.model ?? null });
          // Also extract pwd from stats (updated on Bash tool completions)
          if (data.pwd) {
            setProjectInfo(prev => ({
              pwd: data.pwd,
              jiraEmail: prev?.jiraEmail ?? null,
              githubUsername: prev?.githubUsername ?? null,
            }));
          }
          if (!loadStateRef.current.stats) {
            loadStateRef.current.stats = true;
            checkLoadComplete();
          }
        } catch (err) {
          console.error('[useStatsStrip] Failed to parse stats message:', err);
        }
      };

      ws.onclose = () => {
        if (mounted) {
          reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = (err) => {
        console.error('[useStatsStrip] Stats WebSocket error:', err);
        ws?.close();
      };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [checkLoadComplete]);

  // REST for /api/identity (jiraEmail, githubUsername - fetched once)
  // pwd comes from /ws/stats (updated on Bash tool completions)
  useEffect(() => {
    const fetchIdentity = async () => {
      try {
        const response = await fetch('/api/identity');
        if (response.ok) {
          const data = await response.json();
          // Merge with existing projectInfo (preserve pwd from stats)
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
