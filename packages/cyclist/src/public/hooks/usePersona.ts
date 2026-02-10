/**
 * usePersona Hook
 *
 * React hook for fetching and subscribing to persona data.
 * Story MSSCI-12700 - PersonaHeader Component
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 *
 * Provides:
 * - character: Current agent character name
 * - theme: Current theme name
 * - role: Agent role/title
 */

import { useState, useEffect, useRef } from 'react';

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/persona`;

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[usePersona] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Story 94-1: Handle streaming state updates
            if (data.type === 'streaming') {
              setIsStreaming(data.isStreaming ?? false);
              return;
            }

            // Persona data (initial or agent change) — extract isStreaming if present
            if (data.isStreaming !== undefined) {
              setIsStreaming(data.isStreaming);
            }
            setPersona(data as PersonaData);
            setIsLoading(false);
            setError(null);
          } catch (err) {
            console.error('[usePersona] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[usePersona] WebSocket closed, reconnecting...');
          setIsStreaming(false);
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[usePersona] WebSocket error:', err);
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        console.error('[usePersona] WebSocket init failed:', err);
        setError(err instanceof Error ? err : new Error('Failed to connect'));
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { persona, isStreaming, isLoading, error };
}
