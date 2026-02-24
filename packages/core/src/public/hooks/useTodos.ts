/**
 * useTodos Hook
 *
 * React hook for subscribing to todo list data.
 * Uses DataSource via useDataSource for real-time updates (no polling).
 * Story MSSCI-12717 - React Migration
 * Story 124-3 - Refactored to use DataSource<T> pattern
 */

import { useDataSource } from './useDataSource.js';

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
  const { data, isLoading, error } = useDataSource<TodosMessage, TodoItem[]>({
    endpoint: '/ws/todos',
    transform: (msg) => msg.todos || [],
  });

  return { todos: data ?? [], isLoading, error };
}
