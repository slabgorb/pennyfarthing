/**
 * useBackgroundTasks Hook
 *
 * React hook for subscribing to background task notifications.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12784 - Timer accuracy: fetch on mount, IPC for updates
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 *
 * Uses WebSocket /ws/background-tasks for real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface BackgroundTask {
  taskId: string;
  description: string;
  subagentType: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'pending' | 'completed';
  success?: boolean;
  output?: string;
  error?: string;
  isBackground?: boolean;
}

interface UseBackgroundTasksResult {
  tasks: BackgroundTask[];
  pendingCount: number;
  completedCount: number;
  clearCompleted: () => void;
}

/** WebSocket message format from /ws/background-tasks */
interface BackgroundTaskMessage {
  type: 'init' | 'task:started' | 'task:completed';
  tasks?: BackgroundTask[];
  task?: BackgroundTask;
}

export function useBackgroundTasks(): UseBackgroundTasksResult {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/background-tasks`;

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[useBackgroundTasks] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as BackgroundTaskMessage;

            switch (msg.type) {
              case 'init':
                // Initial snapshot of all tasks
                if (msg.tasks) {
                  setTasks(msg.tasks);
                }
                break;

              case 'task:started':
                // New task started
                if (msg.task) {
                  setTasks(prev => {
                    // Avoid duplicates
                    if (prev.some(t => t.taskId === msg.task!.taskId)) {
                      return prev;
                    }
                    return [...prev, msg.task!];
                  });
                }
                break;

              case 'task:completed':
                // Task completed (includes accurate durationMs from backend)
                if (msg.task) {
                  setTasks(prev => prev.map(t =>
                    t.taskId === msg.task!.taskId ? { ...t, ...msg.task! } : t
                  ));
                }
                break;
            }
          } catch (err) {
            console.error('[useBackgroundTasks] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[useBackgroundTasks] WebSocket closed, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[useBackgroundTasks] WebSocket error:', err);
        };
      } catch (err) {
        console.error('[useBackgroundTasks] WebSocket init failed:', err);
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

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'pending'));
  }, []);

  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return { tasks, pendingCount, completedCount, clearCompleted };
}
