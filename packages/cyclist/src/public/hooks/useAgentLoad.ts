import { useState, useCallback, useRef, useEffect } from 'react';

export interface AgentLoadComponent {
  name: string;
  tokens: number;
  source?: string | null;
}

export interface AgentLoadEntry {
  agent: string;
  totalTokens: number | null;
  tokenCounts?: Record<string, number>;
  components?: AgentLoadComponent[];
  error?: string;
}

export interface AgentLoadData {
  agents: AgentLoadEntry[];
  cachedAt: string;
  totalAcrossAllAgents: number;
}

export interface PruneResult {
  success: boolean;
  tokensFreed?: number;
  agent?: string;
  file?: string;
  error?: string;
}

export interface UseAgentLoadReturn {
  data: AgentLoadData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  pruneSidecar: (agent: string, file: string) => Promise<void>;
  pruneResult: PruneResult | null;
}

export function useAgentLoad(): UseAgentLoadReturn {
  const [data, setData] = useState<AgentLoadData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pruneResult, setPruneResult] = useState<PruneResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetch('/api/agent-load', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: AgentLoadData) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, []);

  const pruneSidecar = useCallback(async (agent: string, file: string) => {
    const res = await fetch('/api/agent-load/prune-sidecar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, file }),
    });

    if (!res.ok) {
      setPruneResult({ success: false, error: `HTTP ${res.status}: ${res.statusText}` });
      return;
    }

    const result: PruneResult = await res.json();
    setPruneResult(result);

    if (result.success) {
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh, pruneSidecar, pruneResult };
}
