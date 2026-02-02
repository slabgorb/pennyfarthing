/**
 * useTodos Hook
 *
 * React hook for subscribing to todo list data.
 * Uses electronAPI in Electron mode, falls back to REST API in web mode.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect, useCallback } from 'react';

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

// Fetch todos via REST API (web mode fallback)
async function fetchTodosFromApi(): Promise<TodoItem[]> {
  const response = await fetch('/api/todos');
  if (!response.ok) {
    throw new Error(`Failed to fetch todos: ${response.status}`);
  }
  const data = await response.json();
  return (data as TodoItem[]) || [];
}

export function useTodos(): UseTodosResult {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      const data = await fetchTodosFromApi();
      setTodos(data);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch todos'));
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const api = window.electronAPI;

    // Electron mode: use IPC
    if (api?.todos) {
      api.todos.get()
        .then((data) => {
          setTodos((data as TodoItem[]) || []);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err : new Error('Failed to fetch todos'));
          setIsLoading(false);
        });

      // Subscribe to updates
      api.todos.onUpdate((_, data) => {
        setTodos((data as TodoItem[]) || []);
      });
      return;
    }

    // Web mode: use REST API with polling
    fetchTodos();

    // Poll for updates every 5 seconds in web mode
    const interval = setInterval(fetchTodos, 5000);
    return () => clearInterval(interval);
  }, [fetchTodos]);

  return { todos, isLoading, error };
}
