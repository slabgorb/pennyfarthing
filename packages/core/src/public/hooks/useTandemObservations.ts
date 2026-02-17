/**
 * useTandemObservations Hook
 *
 * React hook for subscribing to tandem observation data.
 * Story 86-11: Cyclist: Tandem dialogue panel
 *
 * Uses WebSocket /ws/tandem for real-time updates.
 * Parses .session/{story}-tandem-{partner}.md observation files.
 */

import { useState, useEffect, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface TandemTrigger {
  scope: string;   // file-watch, tool-watch, context-watch
  detail: string;  // specific trigger detail
}

export interface TandemObservation {
  timestamp: string;  // ISO timestamp
  time: string;       // HH:MM from section header
  trigger: TandemTrigger;
  content: string;    // observation text
  outcome?: 'applied' | 'deferred' | 'rejected';
  confidence?: number; // 0-1
}

export interface TandemHeader {
  storyId: string;
  observer: string;    // agent role (e.g., "architect")
  character: string;   // persona character name (e.g., "The Man in Black")
  phase: string;       // workflow phase
  startedAt: string;   // ISO timestamp
  theme?: string;      // theme slug for portrait resolution
  slug?: string;       // character slug for portrait image
}

export interface TandemMetrics {
  exchangeCount: number;
  tokenOverhead: number; // percentage
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  outcomeBreakdown: {
    applied: number;
    deferred: number;
    rejected: number;
  };
}

export interface UseTandemObservationsResult {
  header: TandemHeader | null;
  observations: TandemObservation[];
  metrics: TandemMetrics | null;
  isLoading: boolean;
  error: Error | null;
}

/** WebSocket message format from /ws/tandem */
export interface TandemMessage {
  type: 'init' | 'observation' | 'metrics' | 'clear';
  header?: TandemHeader;
  observations?: TandemObservation[];
  observation?: TandemObservation;
  metrics?: TandemMetrics;
}

// =============================================================================
// Hook
// =============================================================================

export function useTandemObservations(): UseTandemObservationsResult {
  const [header, setHeader] = useState<TandemHeader | null>(null);
  const [observations, setObservations] = useState<TandemObservation[]>([]);
  const [metrics, setMetrics] = useState<TandemMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tandem`;

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[useTandemObservations] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as TandemMessage;

            switch (msg.type) {
              case 'init':
                setHeader(msg.header ?? null);
                setObservations(msg.observations ?? []);
                setIsLoading(false);
                setError(null);
                break;

              case 'observation':
                if (msg.observation) {
                  setObservations(prev => [...prev, msg.observation!]);
                }
                break;

              case 'metrics':
                if (msg.metrics) {
                  setMetrics(msg.metrics);
                }
                break;

              case 'clear':
                setHeader(null);
                setObservations([]);
                setMetrics(null);
                break;
            }
          } catch (err) {
            console.error('[useTandemObservations] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[useTandemObservations] WebSocket closed, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[useTandemObservations] WebSocket error:', err);
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        console.error('[useTandemObservations] WebSocket init failed:', err);
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

  return { header, observations, metrics, isLoading, error };
}
