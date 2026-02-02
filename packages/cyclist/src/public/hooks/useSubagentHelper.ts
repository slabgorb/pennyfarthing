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

export function useSubagentHelper(): UseSubagentHelperResult {
  const [helper, setHelper] = useState<Helper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const api = window.electronAPI;

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
        .then((data) => {
          const persona = data as { role?: string } | null;
          if (persona?.role) {
            return fetchHelper(persona.role);
          }
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err : new Error('Failed to fetch persona'));
          setIsLoading(false);
        });

      // Subscribe to persona updates (follows usePersona pattern) - capture cleanup function
      const cleanup = api.persona.onUpdate((_, data) => {
        const persona = data as { role?: string } | null;
        if (persona?.role) {
          fetchHelper(persona.role);
        }
      });

      return cleanup;
    } else {
      setIsLoading(false);
    }
  }, []);

  return { helper, isLoading, error };
}
