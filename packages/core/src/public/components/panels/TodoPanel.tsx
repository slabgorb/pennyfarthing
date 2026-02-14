/**
 * TodoPanel - Task list with progress panel
 *
 * Extracted from ProgressPanel as part of MSSCI-14188.
 * Shows todos grouped by status with progress bar.
 *
 * Story: MSSCI-14188 - Split Progress panel into Workflow, AC, and Todo panels
 * Epic: epic-76 (Dockview Panel Migration)
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTodos, TodoItem } from '../../hooks/useTodos';

// =============================================================================
// Todo Item Component
// =============================================================================

function TodoItemView({ todo }: { todo: TodoItem }): React.ReactElement {
  const statusIcon = {
    pending: '\u25CB',
    in_progress: '\u25CF',
    completed: '\u2713',
  }[todo.status];

  const statusClass = `todo-item todo-${todo.status}`;

  // Use activeForm for in_progress (more descriptive), content for others
  const displayText = todo.status === 'in_progress' && todo.activeForm
    ? todo.activeForm
    : todo.content;

  return (
    <div className={statusClass} data-testid={`todo-${todo.id}`}>
      <span className="todo-status">{statusIcon}</span>
      <span className="todo-subject">{displayText}</span>
      {todo.blockedBy && todo.blockedBy.length > 0 && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="todo-blocked">
                (blocked)
              </span>
            </TooltipTrigger>
            <TooltipContent>{`Blocked by: ${todo.blockedBy.join(', ')}`}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// =============================================================================
// TodoPanel Component
// =============================================================================

export function TodoPanel(): React.ReactElement {
  const { todos, isLoading, error } = useTodos();

  if (isLoading) {
    return (
      <div className="todo-panel loading" data-testid="todo-panel">
        <div className="space-y-2 p-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="todo-panel error" data-testid="todo-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="todo-panel" data-testid="todo-panel">
        <div className="placeholder">No active tasks</div>
      </div>
    );
  }

  // Group by status
  const inProgress = todos.filter(t => t.status === 'in_progress');
  const pending = todos.filter(t => t.status === 'pending');
  const completed = todos.filter(t => t.status === 'completed');

  // Calculate progress
  const totalCount = todos.length;
  const completedCount = completed.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="todo-panel" data-testid="todo-panel">
      <div className="todo-content">
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
          <span className="progress-text">{completedCount}/{totalCount}</span>
        </div>

        {inProgress.length > 0 && (
          <div className="todo-section">
            <h4>In Progress</h4>
            {inProgress.map(todo => (
              <TodoItemView key={todo.id} todo={todo} />
            ))}
          </div>
        )}

        {pending.length > 0 && (
          <div className="todo-section">
            <h4>Pending</h4>
            {pending.map(todo => (
              <TodoItemView key={todo.id} todo={todo} />
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div className="todo-section todo-completed">
            <h4>Completed ({completed.length})</h4>
            {completed.map(todo => (
              <TodoItemView key={todo.id} todo={todo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TodoPanel;
