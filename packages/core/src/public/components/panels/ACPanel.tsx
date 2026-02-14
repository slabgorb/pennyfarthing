/**
 * ACPanel - Acceptance criteria checklist panel
 *
 * Extracted from ProgressPanel as part of MSSCI-14188.
 * Shows acceptance criteria with completion status and progress bar.
 *
 * Story: MSSCI-14188 - Split Progress panel into Workflow, AC, and Todo panels
 * Epic: epic-76 (Dockview Panel Migration)
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useStory } from '../../hooks/useStory';
import type { CriteriaItem } from '../../../story-parser.js';

// =============================================================================
// Criteria Item Component
// =============================================================================

function CriteriaItemView({ item }: { item: CriteriaItem }): React.ReactElement {
  const statusClass = item.completed ? 'ac-item ac-done' : 'ac-item';
  const icon = item.completed ? '\u2713' : '\u25CB';

  return (
    <div className={statusClass}>
      <span className="ac-icon">{icon}</span>
      <span className="ac-text">{item.text}</span>
    </div>
  );
}

// =============================================================================
// ACPanel Component
// =============================================================================

export function ACPanel(): React.ReactElement {
  const { story, isLoading, error } = useStory();

  if (isLoading) {
    return (
      <div className="ac-panel loading" data-testid="ac-panel">
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
      <div className="ac-panel error" data-testid="ac-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  const criteria = story?.criteria ?? null;

  if (!criteria || criteria.length === 0) {
    return (
      <div className="ac-panel" data-testid="ac-panel">
        <div className="placeholder">No acceptance criteria</div>
      </div>
    );
  }

  const completedCount = criteria.filter(c => c.completed).length;
  const totalCount = criteria.length;

  return (
    <div className="ac-panel" data-testid="ac-panel">
      <div className="ac-content">
        <span className="progress-text">{completedCount}/{totalCount}</span>
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
        <div className="ac-list">
          {criteria.map((item, index) => (
            <CriteriaItemView key={index} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ACPanel;
