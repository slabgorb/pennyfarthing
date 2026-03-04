/**
 * AcceptanceCriteriaPanel - Display acceptance criteria checklist
 *
 * Story MSSCI-12849 - Missing AC & BikeLane panels in Progress tab
 *
 * Reference: Deleted vanilla JS in commit 9aea4f371
 * - js/sidebar/acceptance-criteria.js
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { CriteriaItem } from '../../hooks/useStory.js';
import { useStory } from '../../hooks/useStory.js';

export interface AcceptanceCriteriaPanelProps {
  criteria: CriteriaItem[] | null;
  collapsed?: boolean;
  onToggle?: () => void;
}

/**
 * Individual acceptance criteria item
 */
function CriteriaItemView({ item }: { item: CriteriaItem }): React.ReactElement {
  const statusClass = `todo-item ${item.completed ? 'todo-completed' : ''}`;
  return (
    <div className={statusClass}>
      <span className="todo-status">{item.completed ? '\u2713' : '\u25CB'}</span>
      <span className="todo-subject">{item.text}</span>
    </div>
  );
}

/**
 * AcceptanceCriteriaPanel - Displays acceptance criteria checklist with progress
 */
export function AcceptanceCriteriaPanel({
  criteria,
}: AcceptanceCriteriaPanelProps): React.ReactElement {
  // Handle empty state
  if (!criteria || criteria.length === 0) {
    return (
      <div className="todo-panel" data-testid="ac-panel">
        <div className="placeholder">No acceptance criteria</div>
      </div>
    );
  }

  // Calculate progress
  const completedCount = criteria.filter(c => c.completed).length;
  const totalCount = criteria.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="todo-panel" data-testid="ac-panel">
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
        <span className="progress-text">{completedCount}/{totalCount}</span>
      </div>
      <div className="todo-section">
        {criteria.map((item, index) => (
          <CriteriaItemView key={index} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * ConnectedAcceptanceCriteriaPanel - Self-contained panel that fetches its own data
 *
 * Used by DockingWorkspace via registerPanelComponent
 */
export function ConnectedAcceptanceCriteriaPanel(): React.ReactElement {
  const { story, isLoading, error } = useStory();

  if (isLoading) {
    return (
      <div className="todo-panel loading" data-testid="ac-panel">
        <div className="space-y-2 p-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="todo-panel error" data-testid="ac-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  return <AcceptanceCriteriaPanel criteria={story?.criteria ?? null} />;
}

export default AcceptanceCriteriaPanel;
