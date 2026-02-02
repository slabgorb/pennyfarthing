/**
 * ProgressPanel - Display todos and workflow progress
 *
 * Story MSSCI-12717 - React Migration
 */

import React from 'react';
import { useTodos, TodoItem } from '../../hooks/useTodos';

function TodoItemView({ todo }: { todo: TodoItem }): React.ReactElement {
  const statusIcon = {
    pending: '*',
    in_progress: '>',
    completed: 'v',
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
        <span className="todo-blocked" title={`Blocked by: ${todo.blockedBy.join(', ')}`}>
          (blocked)
        </span>
      )}
    </div>
  );
}

export function ProgressPanel(): React.ReactElement {
  const { todos, isLoading, error } = useTodos();

  if (isLoading) {
    return (
      <div className="progress-panel loading" data-testid="progress-panel">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="progress-panel error" data-testid="progress-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="progress-panel empty" data-testid="progress-panel">
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
    <div className="progress-panel" data-testid="progress-panel">
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
        <div className="todo-section collapsed">
          <h4>Completed ({completed.length})</h4>
        </div>
      )}
    </div>
  );
}

export default ProgressPanel;
