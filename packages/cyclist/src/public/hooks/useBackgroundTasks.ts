/**
 * useBackgroundTasks Hook
 *
 * React hook for subscribing to background task notifications via electronAPI.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect, useCallback } from 'react';

export interface BackgroundTask {
  taskId: string;
  description: string;
  subagentType: string;
  startedAt: number;
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

export function useBackgroundTasks(): UseBackgroundTasksResult {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.backgroundTask) {
      return;
    }

    // Subscribe to task started events
    api.backgroundTask.onStarted((_, task) => {
      setTasks(prev => {
        // Avoid duplicates
        if (prev.some(t => t.taskId === task.taskId)) {
          return prev;
        }
        return [...prev, task as BackgroundTask];
      });
    });

    // Subscribe to task completed events
    api.backgroundTask.onCompleted((_, task) => {
      setTasks(prev => prev.map(t =>
        t.taskId === task.taskId ? { ...t, ...(task as BackgroundTask) } : t
      ));
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'pending'));
  }, []);

  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return { tasks, pendingCount, completedCount, clearCompleted };
}
