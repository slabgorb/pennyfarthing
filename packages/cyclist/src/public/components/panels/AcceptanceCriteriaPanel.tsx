/**
 * AcceptanceCriteriaPanel - Display acceptance criteria checklist
 *
 * Story MSSCI-12849 - Missing AC & BikeLane panels in Progress tab
 *
 * Reference: Deleted vanilla JS in commit 9aea4f371
 * - js/sidebar/acceptance-criteria.js
 */

import React from 'react';
import type { CriteriaItem } from '../../../story-parser.js';
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
  const statusClass = item.completed ? 'ac-item ac-done' : 'ac-item';
  const icon = item.completed ? '✓' : '○';

  return (
    <div className={statusClass}>
      <span className="ac-icon">{icon}</span>
      <span className="ac-text">{item.text}</span>
    </div>
  );
}

/**
 * AcceptanceCriteriaPanel - Displays acceptance criteria checklist with progress
 */
export function AcceptanceCriteriaPanel({
  criteria,
  collapsed = false,
  onToggle,
}: AcceptanceCriteriaPanelProps): React.ReactElement {
  // Handle empty state
  if (!criteria || criteria.length === 0) {
    return (
      <div className="ac-panel empty" data-testid="ac-panel">
        <div className="placeholder">No acceptance criteria</div>
      </div>
    );
  }

  // Calculate progress
  const completedCount = criteria.filter(c => c.completed).length;
  const totalCount = criteria.length;
  const progressText = `${completedCount}/${totalCount}`;

  // Handle collapsed state
  if (collapsed) {
    return (
      <div className="ac-panel collapsed" data-testid="ac-panel">
        <div className="ac-header" onClick={onToggle}>
          <span className="ac-title">Acceptance Criteria</span>
          <span className="ac-progress">{progressText}</span>
          <span className="ac-expand">▶</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-panel" data-testid="ac-panel">
      <div className="ac-header" onClick={onToggle}>
        <span className="ac-title">Acceptance Criteria</span>
        <span className="ac-progress">{progressText}</span>
        {onToggle && <span className="ac-expand">▼</span>}
      </div>
      <div className="ac-list">
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
      <div className="ac-panel loading" data-testid="ac-panel">
        <div className="spinner">Loading...</div>
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

  return <AcceptanceCriteriaPanel criteria={story?.criteria ?? null} />;
}

export default AcceptanceCriteriaPanel;
