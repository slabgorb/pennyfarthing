/**
 * useTodos Hook
 *
 * React hook for subscribing to todo list data.
 * Uses WebSocket /ws/todos for real-time updates (no polling).
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect, useRef } from 'react';

export interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
  blockedBy?: string[];
  blocks?: string[];
}

interface UseTodosResult {
  todos: TodoItem[];
  isLoading: boolean;
  error: Error | null;
}

/** WebSocket message format from /ws/todos */
interface TodosMessage {
  type: 'init' | 'update';
  todos: TodoItem[];
}

export function useTodos(): UseTodosResult {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/todos`;

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[useTodos] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as TodosMessage;
            if (msg.type === 'init' || msg.type === 'update') {
              setTodos(msg.todos || []);
              setIsLoading(false);
              setError(null);
            }
          } catch (err) {
            console.error('[useTodos] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[useTodos] WebSocket closed, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[useTodos] WebSocket error:', err);
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        console.error('[useTodos] WebSocket init failed:', err);
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

  return { todos, isLoading, error };
}
