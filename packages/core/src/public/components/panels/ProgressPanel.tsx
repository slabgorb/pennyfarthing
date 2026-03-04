/**
 * ProgressPanel - At-a-glance story dashboard
 *
 * Unified panel combining story context, workflow phase, AC completion,
 * todo status, git changes, and context window usage.
 *
 * Story: MSSCI-14966 / 103-11
 * Epic: 103 - BikeRack TUI
 */

import React from 'react';
import { useStory } from '../../hooks/useStory.js';
import type { CriteriaItem, WorkflowPhase } from '../../hooks/useStory.js';
import { useSprint } from '../../hooks/useSprint';
import { useTodos } from '../../hooks/useTodos';
import type { TodoItem } from '../../hooks/useTodos';
import { useGitStatus } from '../../hooks/useGitStatus';
import { useStatsStrip } from '../../hooks/useStatsStrip';

export function ProgressPanel(): React.ReactElement {
  const { story, isLoading: storyLoading, error: storyError } = useStory();
  const { data: sprintData, isLoading: sprintLoading } = useSprint();
  const { todos } = useTodos();
  const { gitStatus } = useGitStatus();
  const { context } = useStatsStrip();

  // Loading state
  if (storyLoading || sprintLoading) {
    return (
      <div className="progress-panel loading" data-testid="progress-panel">
        <div className="progress-loading">Loading...</div>
      </div>
    );
  }

  // Error state
  if (storyError) {
    return (
      <div className="progress-panel" data-testid="progress-panel">
        <div className="error-message">{storyError.message}</div>
      </div>
    );
  }

  // Empty state
  const currentStory = sprintData?.currentStory;
  if (!story && !currentStory) {
    return (
      <div className="progress-panel" data-testid="progress-panel">
        <div className="empty-state">
          <div>No active story</div>
          <div className="empty-hint">Run /sprint work to start</div>
        </div>
      </div>
    );
  }

  // Merge data from story + sprint hooks
  const storyId = story?.id ?? currentStory?.id ?? '';
  const storyTitle = story?.title ?? currentStory?.title ?? '';
  const storyPoints = story?.points ?? currentStory?.points ?? 0;
  const jiraKey = currentStory?.jiraKey ?? '';
  const storyStatus = story?.status ?? currentStory?.status ?? '';
  const epic = story?.epic ?? '';
  const displayStatus = storyStatus.replace(/_/g, ' ');

  // Workflow
  const workflowType = story?.workflow ?? null;
  const phases = story?.workflowPhases ?? null;
  const hasWorkflow = workflowType || (phases && phases.length > 0);

  // AC
  const criteria = story?.criteria ?? null;
  const hasCriteria = criteria != null && criteria.length > 0;
  const completedAC = hasCriteria ? criteria.filter((c: CriteriaItem) => c.completed).length : 0;
  const totalAC = hasCriteria ? criteria.length : 0;
  const acPercent = totalAC > 0 ? Math.round((completedAC / totalAC) * 100) : 0;

  // Todos
  const hasTodos = todos && todos.length > 0;
  const completedTodos = hasTodos ? todos.filter((t: TodoItem) => t.status === 'completed').length : 0;
  const totalTodos = hasTodos ? todos.length : 0;
  const activeTodo = hasTodos ? todos.find((t: TodoItem) => t.status === 'in_progress') : null;

  // Git
  const branch = gitStatus?.branch ?? '';
  const modified = gitStatus?.modified ?? 0;
  const untracked = gitStatus?.untracked ?? 0;
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;

  // Context
  const contextPercent = context?.percent ?? 0;

  return (
    <div className="progress-panel" data-testid="progress-panel">
      {/* Story Header (AC3) */}
      <div className="progress-section" data-testid="progress-story-header">
        <div className="story-header-row">
          <span className="story-id">{storyId}</span>
          <span className="story-points">{storyPoints}pt</span>
          <span className="story-status">{displayStatus}</span>
        </div>
        <div className="story-title">{storyTitle}</div>
        <div className="story-meta">
          <span className="story-jira">{jiraKey}</span>
          <span className="story-epic">{epic}</span>
        </div>
      </div>

      {/* Workflow Row (AC4) */}
      {hasWorkflow && (
        <div className="progress-section" data-testid="progress-workflow-row">
          {workflowType && (
            <span className="workflow-badge">
              {workflowType.toUpperCase() === 'TDD' || workflowType.toUpperCase() === 'BDD'
                ? workflowType.toUpperCase()
                : workflowType.charAt(0).toUpperCase() + workflowType.slice(1)}
            </span>
          )}
          {phases && phases.length > 0 && (
            <div className="phase-progress">
              {phases.map((phase: WorkflowPhase) => (
                <div key={phase.name} className={`phase-step ${phase.status}`}>
                  <span className="phase-label">{phase.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AC Row (AC5) */}
      {hasCriteria && (
        <div className="progress-section" data-testid="progress-ac-row">
          <span className="row-label">AC</span>
          <span className="progress-count">{completedAC}/{totalAC}</span>
          <div
            className="progress-bar-container"
            role="progressbar"
            aria-valuenow={completedAC}
            aria-valuemin={0}
            aria-valuemax={totalAC}
          >
            <div className="progress-bar" style={{ width: `${acPercent}%` }} />
          </div>
        </div>
      )}

      {/* Todo Row (AC6) */}
      {hasTodos && (
        <div className="progress-section" data-testid="progress-todo-row">
          <span className="row-label">Tasks</span>
          <span className="progress-count">{completedTodos}/{totalTodos}</span>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0}%` }}
            />
          </div>
          {activeTodo && (
            <span className="active-task">{activeTodo.activeForm || activeTodo.content}</span>
          )}
        </div>
      )}

      {/* Git Row (AC7) */}
      <div className="progress-section" data-testid="progress-git-row">
        <span className="git-branch">{branch}</span>
        <span className="git-stats">{modified}M {untracked}U ↑{ahead} ↓{behind}</span>
      </div>

      {/* Context Row (AC8) */}
      <div className="progress-section" data-testid="progress-context-row">
        <span className="row-label">Context</span>
        <span className="context-percent">{contextPercent}%</span>
        <div
          className="progress-bar-container"
          role="progressbar"
          aria-valuenow={contextPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-bar" style={{ width: `${contextPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

export default ProgressPanel;
