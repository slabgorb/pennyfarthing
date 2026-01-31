/**
 * usePersona Hook
 *
 * React hook for fetching and subscribing to persona data.
 * Story MSSCI-12700 - PersonaHeader Component
 *
 * Provides:
 * - character: Current agent character name
 * - theme: Current theme name
 * - role: Agent role/title
 */

import { useState, useEffect } from 'react';

export interface PersonaData {
  character: string | null;
  theme: string | null;
  role: string | null;
}

interface UsePersonaResult {
  persona: PersonaData | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePersona(): UsePersonaResult {
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const api = window.electronAPI;

    if (api?.persona) {
      // Fetch initial data
      api.persona.get()
        .then((data) => {
          setPersona(data as PersonaData | null);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err : new Error('Failed to fetch persona'));
          setIsLoading(false);
        });

      // Subscribe to updates
      api.persona.onUpdate((_, data) => {
        setPersona(data as PersonaData | null);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  return { persona, isLoading, error };
}
