/**
 * TaskTracker - Shared task list with dependencies
 *
 * Story 86-12: Cyclist: Native team panel
 */

import React from 'react';
import type { TaskListItem } from '../../hooks/useTeamMembers';

export interface TaskTrackerProps {
  tasks: TaskListItem[];
}

export function TaskTracker({ tasks }: TaskTrackerProps): React.ReactElement {
  if (tasks.length === 0) {
    return (
      <div data-testid="task-tracker">
        <div data-testid="tasks-empty">No tasks</div>
      </div>
    );
  }

  const completed = tasks.filter(t => t.status === 'completed').length;

  return (
    <div data-testid="task-tracker">
      <div data-testid="task-progress-summary">
        {completed} of {tasks.length} completed
      </div>
      {tasks.map(task => (
        <div key={task.id} data-testid="task-item">
          <span>{task.title}</span>
          <span data-testid="task-owner">{task.owner ?? 'unassigned'}</span>
          <span data-testid="task-status" data-status={task.status}>
            {task.status}
          </span>
          {task.blockedBy && task.blockedBy.length > 0 && (
            <span data-testid="task-blocked-indicator">
              Blocked by: {task.blockedBy.join(', ')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default TaskTracker;
