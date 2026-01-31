/**
 * BackgroundPanel - Display background tasks
 *
 * Story MSSCI-12717 - React Migration
 */

import React from 'react';
import { useBackgroundTasks, BackgroundTask } from '../../hooks/useBackgroundTasks';

function TaskItem({ task }: { task: BackgroundTask }): React.ReactElement {
  const isPending = task.status === 'pending';
  const statusIcon = isPending ? '...' : (task.success ? 'v' : 'x');
  const statusClass = `task-item task-${task.status}${task.success === false ? ' task-error' : ''}`;

  // Format elapsed time
  const elapsed = Date.now() - task.startedAt;
  const elapsedStr = elapsed < 1000
    ? `${elapsed}ms`
    : elapsed < 60000
      ? `${Math.floor(elapsed / 1000)}s`
      : `${Math.floor(elapsed / 60000)}m`;

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

  if (tasks.length === 0) {
    return (
      <div className="background-panel empty" data-testid="background-panel">
        <div className="placeholder">No background tasks</div>
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
          <button
            type="button"
            className="clear-button"
            onClick={clearCompleted}
          >
            Clear
          </button>
        )}
      </div>

      <div className="task-list">
        {sortedTasks.map(task => (
          <TaskItem key={task.taskId} task={task} />
        ))}
      </div>
    </div>
  );
}

export default BackgroundPanel;
