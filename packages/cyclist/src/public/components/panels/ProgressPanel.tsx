/**
 * ProgressPanel - Unified progress tracking panel
 *
 * Consolidates three related views into a single tabbed panel:
 * - Workflow: BikeLane phase visualization
 * - AC: Acceptance criteria checklist
 * - Todo: Task list with progress
 *
 * Story: Interactive debug workflow - UX consolidation
 */

import React, { useState } from 'react';
import { useTodos, TodoItem } from '../../hooks/useTodos';
import { useStory } from '../../hooks/useStory';
import type { CriteriaItem, WorkflowPhase } from '../../../story-parser.js';

// =============================================================================
// Internal Tab Types
// =============================================================================

type ProgressTab = 'workflow' | 'ac' | 'todo';

// =============================================================================
// Todo Section (from original ProgressPanel)
// =============================================================================

function TodoItemView({ todo }: { todo: TodoItem }): React.ReactElement {
  const statusIcon = {
    pending: '○',
    in_progress: '●',
    completed: '✓',
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

function TodoSection(): React.ReactElement {
  const { todos, isLoading, error } = useTodos();

  if (isLoading) {
    return <div className="spinner">Loading...</div>;
  }

  if (error) {
    return <div className="error-message">{error.message}</div>;
  }

  if (todos.length === 0) {
    return <div className="placeholder">No active tasks</div>;
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
  );
}

// =============================================================================
// AC Section (from AcceptanceCriteriaPanel)
// =============================================================================

function CriteriaItemView({ item }: { item: CriteriaItem }): React.ReactElement {
  const statusClass = item.completed ? 'ac-item ac-done' : 'ac-item';
  const icon = item.completed ? '✓' : '○';

  return (
    <div className={statusClass}>
      <span className="ac-icon">{icon}</span>
      <span className="ac-text">{item.text}</span>
    </div>
  );
}

function ACSection({ criteria }: { criteria: CriteriaItem[] | null }): React.ReactElement {
  if (!criteria || criteria.length === 0) {
    return <div className="placeholder">No acceptance criteria</div>;
  }

  const completedCount = criteria.filter(c => c.completed).length;
  const totalCount = criteria.length;

  return (
    <div className="ac-content">
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
        <span className="progress-text">{completedCount}/{totalCount}</span>
      </div>
      <div className="ac-list">
        {criteria.map((item, index) => (
          <CriteriaItemView key={index} item={item} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Workflow Section (from BikeLanePanel)
// =============================================================================

function getPhaseIcon(status: 'done' | 'current' | 'pending'): string {
  switch (status) {
    case 'done':
      return '✓';
    case 'current':
      return '●';
    case 'pending':
    default:
      return '○';
  }
}

function formatWorkflowType(type: string | null): string {
  if (!type) return '—';

  const upperTypes = ['tdd', 'bdd'];
  if (upperTypes.includes(type.toLowerCase())) {
    return type.toUpperCase();
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

function PhaseStep({ phase, isLast }: { phase: WorkflowPhase; isLast: boolean }): React.ReactElement {
  const icon = getPhaseIcon(phase.status);
  const statusClass = `phase-step ${phase.status}`;

  return (
    <>
      <div className={statusClass}>
        <span className="phase-icon">{icon}</span>
        <span className="phase-label">{phase.label}</span>
      </div>
      {!isLast && <span className="phase-arrow">→</span>}
    </>
  );
}

function WorkflowSection({
  workflowType,
  phases,
}: {
  workflowType: string | null;
  phases: WorkflowPhase[] | null;
}): React.ReactElement {
  if (!workflowType && (!phases || phases.length === 0)) {
    return <div className="placeholder">No active workflow</div>;
  }

  const formattedType = formatWorkflowType(workflowType);

  return (
    <div className="workflow-content">
      <div className="workflow-type-badge" data-workflow-type={workflowType || ''}>
        {formattedType}
      </div>

      {phases && phases.length > 0 && (
        <div className="phase-progress">
          {phases.map((phase, index) => (
            <PhaseStep
              key={phase.name}
              phase={phase}
              isLast={index === phases.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Unified Progress Panel
// =============================================================================

export function ProgressPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<ProgressTab>('workflow');
  const { story, isLoading: storyLoading, error: storyError } = useStory();

  // Determine which tabs have content (for badge indicators)
  const hasWorkflow = story?.workflow || (story?.workflowPhases && story.workflowPhases.length > 0);
  const hasAC = story?.criteria && story.criteria.length > 0;

  if (storyLoading) {
    return (
      <div className="progress-panel loading" data-testid="progress-panel">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  if (storyError) {
    return (
      <div className="progress-panel error" data-testid="progress-panel">
        <div className="error-message">{storyError.message}</div>
      </div>
    );
  }

  return (
    <div className="progress-panel" data-testid="progress-panel">
      {/* Internal tab bar */}
      <div className="progress-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'workflow'}
          className={`progress-tab ${activeTab === 'workflow' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflow')}
        >
          Workflow
          {hasWorkflow && <span className="tab-indicator">●</span>}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'ac'}
          className={`progress-tab ${activeTab === 'ac' ? 'active' : ''}`}
          onClick={() => setActiveTab('ac')}
        >
          AC
          {hasAC && <span className="tab-indicator">●</span>}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'todo'}
          className={`progress-tab ${activeTab === 'todo' ? 'active' : ''}`}
          onClick={() => setActiveTab('todo')}
        >
          Todo
        </button>
      </div>

      {/* Tab content */}
      <div className="progress-tab-content" role="tabpanel">
        {activeTab === 'workflow' && (
          <WorkflowSection
            workflowType={story?.workflow ?? null}
            phases={story?.workflowPhases ?? null}
          />
        )}
        {activeTab === 'ac' && (
          <ACSection criteria={story?.criteria ?? null} />
        )}
        {activeTab === 'todo' && (
          <TodoSection />
        )}
      </div>
    </div>
  );
}

export default ProgressPanel;
