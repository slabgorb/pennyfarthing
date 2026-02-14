/**
 * BackgroundPanel - Display background tasks
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12784 - Timer updates in real-time with accurate completion times
 *
 * Timer strategy:
 * - On mount: fetch all tasks from backend (accurate snapshot)
 * - Pending tasks: estimate elapsed from startedAt, update via interval
 * - Completed tasks: use authoritative durationMs from backend
 * - IPC events provide real-time updates with accurate timing
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useBackgroundTasks, BackgroundTask } from '../../hooks/useBackgroundTasks';

/**
 * Format milliseconds into human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m`;
}

function TaskItem({ task, tick }: { task: BackgroundTask; tick: number }): React.ReactElement {
  const isPending = task.status === 'pending';
  const statusIcon = isPending ? '...' : (task.success ? 'v' : 'x');
  const statusClass = `task-item task-${task.status}${task.success === false ? ' task-error' : ''}`;

  // For completed tasks, use authoritative durationMs from backend
  // For pending tasks, estimate from startedAt (tick triggers re-render)
  let elapsedStr: string;
  if (task.status === 'completed' && task.durationMs !== undefined) {
    // Completed: use accurate duration from backend
    elapsedStr = formatDuration(task.durationMs);
  } else {
    // Pending: estimate elapsed time (tick forces recalculation)
    void tick; // Intentionally used to trigger re-render
    elapsedStr = formatDuration(Date.now() - task.startedAt);
  }

  return (
    <div className={statusClass} data-testid={`task-${task.taskId}`}>
      <span className="task-status">{statusIcon}</span>
      <div className="task-content">
        <span className="task-description">{task.description}</span>
        <span className="task-type">{task.subagentType}</span>
      </div>
      <span className="task-elapsed">{elapsedStr}</span>
    </div>
  );
}

export function BackgroundPanel(): React.ReactElement {
  const { tasks, pendingCount, completedCount, clearCompleted } = useBackgroundTasks();
  const [tick, setTick] = useState(0);

  // Timer for live updates - only runs when there are pending tasks and panel is visible
  useEffect(() => {
    if (pendingCount === 0) return;

    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingCount]);

  if (tasks.length === 0) {
    return (
      <div className="background-panel empty" data-testid="background-panel">
        <div className="placeholder">No subagent tasks</div>
      </div>
    );
  }

  // Sort: pending first, then by start time (newest first)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return b.startedAt - a.startedAt;
  });

  return (
    <div className="background-panel" data-testid="background-panel">
      <div className="panel-header">
        <span className="task-counts">
          {pendingCount > 0 && <span className="pending-count">{pendingCount} running</span>}
          {completedCount > 0 && <span className="completed-count">{completedCount} done</span>}
        </span>
        {completedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="clear-button"
            onClick={clearCompleted}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="task-list">
        {sortedTasks.map(task => (
          <TaskItem key={task.taskId} task={task} tick={tick} />
        ))}
      </div>
    </div>
  );
}

export default BackgroundPanel;
