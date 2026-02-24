/**
 * usePersona Hook
 *
 * React hook for fetching and subscribing to persona data.
 * Story MSSCI-12700 - PersonaHeader Component
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 * Story 124-3 - Refactored to use DataSource<T> pattern
 */

import { useState, useCallback } from 'react';
import { useRawDataSource } from './useDataSource.js';

export interface TandemAgentData {
  character: string;
  role: string;
  slug: string;
  theme: string;
  isThinking: boolean;
}

export interface PersonaData {
  character: string | null;
  theme: string | null;
  role: string | null;
  slug: string | null;
  quote: string | null;  // Random catchphrase from theme
  tandemAgent?: TandemAgentData | null;
}

interface UsePersonaResult {
  persona: PersonaData | null;
  isStreaming: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function usePersona(): UsePersonaResult {
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; isStreaming?: boolean } & PersonaData;

    // Story 94-1: Handle streaming state updates
    if (msg.type === 'streaming') {
      setIsStreaming(msg.isStreaming ?? false);
      return;
    }

    // Persona data (initial or agent change) — extract isStreaming if present
    if (msg.isStreaming !== undefined) {
      setIsStreaming(msg.isStreaming);
    }
    setPersona(msg as PersonaData);
    setIsLoading(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err);
  }, []);

  useRawDataSource({
    endpoint: '/ws/persona',
    onMessage: handleMessage,
    onClose: handleClose,
    onError: handleError,
  });

  return { persona, isStreaming, isLoading, error };
}
