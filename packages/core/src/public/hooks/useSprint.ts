/**
 * useSprint Hook
 *
 * React hook for subscribing to sprint data.
 * Story MSSCI-14189 - Enhanced Sprint Panel
 *
 * Uses WebSocket /ws/sprint for real-time updates.
 */

import { useState, useEffect, useRef } from 'react';

// =============================================================================
// Types matching EnhancedSprintPanel expectations
// =============================================================================

export interface SprintStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  jiraKey: string | null;
  hasContext?: boolean;
  assignedTo?: string | null;
  completed?: string | null;
  started?: string | null;
  workflow?: string | null;
  priority?: string | null;
  description?: string | null;
}

export interface SprintEpic {
  id: string;
  title: string;
  jiraKey: string | null;
  stories: SprintStory[];
  hasContext?: boolean;
}

export interface FutureEpicChild {
  id: string;
  title: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
  jiraKey: string | null;
  storyCount: number;
}

export interface FutureEpic {
  id: string;
  title: string;
  description: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
  children: FutureEpicChild[];
}

export interface SprintRegistry {
  name: string;
  type: string;
  description: string;
  file: string;
  isDefault: boolean;
}

export interface SprintData {
  currentStory: SprintStory | null;
  nextStory: SprintStory | null;
  epics: SprintEpic[];
  futureEpics: FutureEpic[];
  sprint: {
    number: number;
    name: string;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
  registry?: SprintRegistry;
}

interface UseSprintResult {
  data: SprintData | null;
  isLoading: boolean;
  error: Error | null;
}

/** WebSocket message format from /ws/sprint */
interface SprintMessage extends Partial<SprintData> {
  type: 'init' | 'update';
}

export function useSprint(): UseSprintResult {
  const [data, setData] = useState<SprintData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sprint`;

    const connect = () => {
      // Don't reconnect if component has unmounted
      if (!isMountedRef.current) {
        return;
      }

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[useSprint] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as SprintMessage;
            if (msg.type === 'init' || msg.type === 'update') {
              // Extract data, excluding type field
              const { type: _type, ...sprintData } = msg;
              setData((prev) => {
                if (!prev) return sprintData as SprintData;
                // Merge partial updates; explicitly set registry so absence clears it
                return { ...prev, ...sprintData, registry: (sprintData as SprintData).registry } as SprintData;
              });
              setIsLoading(false);
              setError(null);
            }
          } catch (err) {
            console.error('[useSprint] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[useSprint] WebSocket closed, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[useSprint] WebSocket error:', err);
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        console.error('[useSprint] WebSocket init failed:', err);
        setError(err instanceof Error ? err : new Error('Failed to connect'));
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { data, isLoading, error };
}
