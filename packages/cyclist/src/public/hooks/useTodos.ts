/**
 * useTodos Hook
 *
 * React hook for subscribing to todo list data via electronAPI.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect } from 'react';

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

export function useTodos(): UseTodosResult {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.todos) {
      setError(new Error('electronAPI.todos not available'));
      setIsLoading(false);
      return;
    }

    // Initial fetch
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
  }, []);

  return { todos, isLoading, error };
}
