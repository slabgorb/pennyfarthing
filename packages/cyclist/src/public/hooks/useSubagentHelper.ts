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
import { getAgentHelper, Helper } from '../js/subagent-display';

export type { Helper };

export interface UseSubagentHelperResult {
  helper: Helper | null;
  isLoading: boolean;
  error: Error | null;
}

export function useSubagentHelper(subagentType: string): UseSubagentHelperResult {
  const [helper, setHelper] = useState<Helper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;

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

    if (api?.persona) {
      // Fetch initial persona and helper
      api.persona.get()
        .then((persona: { role?: string } | null) => {
          if (persona?.role) {
            return fetchHelper(persona.role);
          }
          setIsLoading(false);
        })
        .catch((err: Error) => {
          setError(err instanceof Error ? err : new Error('Failed to fetch persona'));
          setIsLoading(false);
        });

      // Subscribe to persona updates
      api.persona.onUpdate((_: unknown, data: { role?: string } | null) => {
        if (data?.role) {
          fetchHelper(data.role);
        }
      });
    } else {
      setIsLoading(false);
    }
  }, [subagentType]);

  return { helper, isLoading, error };
}
