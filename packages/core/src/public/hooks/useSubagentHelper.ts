/**
 * useSubagentHelper Hook
 *
 * React hook for fetching themed helper data for subagent display.
 * Story MSSCI-12776 - Theme-Aware Subagent Display Messages
 *
 * Combines persona lookup with helper resolution to provide
 * themed helper information for subagent spans.
 */

import { useState, useEffect } from 'react';
import { getAgentHelper, Helper } from '../utils/subagent-display';

export type { Helper };

export interface UseSubagentHelperResult {
  helper: Helper | null;
  isLoading: boolean;
  error: Error | null;
}

export function useSubagentHelper(): UseSubagentHelperResult {
  const [helper, setHelper] = useState<Helper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchHelper = async (role: string) => {
      try {
        const helperData = await getAgentHelper(role);
        setHelper(helperData);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch helper'));
        setIsLoading(false);
      }
    };

    // Connect to persona WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/persona`);

    ws.onmessage = (event) => {
      try {
        const persona = JSON.parse(event.data) as { role?: string } | null;
        if (persona?.role) {
          fetchHelper(persona.role);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to parse persona'));
        setIsLoading(false);
      }
    };

    ws.onerror = () => {
      setError(new Error('WebSocket connection failed'));
      setIsLoading(false);
    };

    return () => ws.close();
  }, []);

  return { helper, isLoading, error };
}
