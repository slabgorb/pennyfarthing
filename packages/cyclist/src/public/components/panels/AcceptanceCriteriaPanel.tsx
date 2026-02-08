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
  return (
    <div className={`flex items-start gap-2 py-1 text-sm ${item.completed ? 'text-[var(--status-success)]' : 'text-[var(--text-primary)]'}`}>
      <span className="flex-shrink-0 w-4 text-center">{item.completed ? '✓' : '○'}</span>
      <span className="flex-1 leading-snug">{item.text}</span>
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
      <div className="p-3" data-testid="ac-panel">
        <div className="text-sm text-[var(--text-muted)]">No acceptance criteria</div>
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
      <div className="p-3" data-testid="ac-panel">
        <div
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={onToggle}
        >
          <span className="text-xs text-[var(--text-muted)]">▶</span>
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Acceptance Criteria</span>
          <span className="text-xs tabular-nums font-mono text-[var(--text-muted)] ml-auto">{progressText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3" data-testid="ac-panel">
      <div
        className="flex items-center gap-2 mb-2 cursor-pointer select-none"
        onClick={onToggle}
      >
        {onToggle && <span className="text-xs text-[var(--text-muted)]">▼</span>}
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Acceptance Criteria</span>
        <span className="text-xs tabular-nums font-mono text-[var(--text-muted)] ml-auto">{progressText}</span>
      </div>
      <div className="border-t border-[var(--border)] pt-2">
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
      <div className="p-3" data-testid="ac-panel">
        <div className="space-y-2">
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
      <div className="p-3" data-testid="ac-panel">
        <div className="p-3 rounded border border-[var(--status-error)]/20 bg-[var(--status-error)]/5 text-[var(--status-error)] text-sm">
          {error.message}
        </div>
      </div>
    );
  }

  return <AcceptanceCriteriaPanel criteria={story?.criteria ?? null} />;
}

export default AcceptanceCriteriaPanel;
