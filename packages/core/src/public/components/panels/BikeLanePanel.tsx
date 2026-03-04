/**
 * BikeLanePanel - Display workflow visualization
 *
 * Story MSSCI-12849 - Missing AC & BikeLane panels in Progress tab
 *
 * Reference: Deleted vanilla JS in commit 9aea4f371
 * - js/sidebar/bikelane.js
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkflowPhase } from '../../hooks/useStory.js';
import { useStory } from '../../hooks/useStory.js';

export interface PhaseHistoryEntry {
  phase: string;
  agent: string;
  status: 'done' | 'current' | 'pending';
  duration?: string;
}

export interface BikeLanePanelProps {
  workflowType: string | null;
  phases: WorkflowPhase[] | null;
  phaseHistory?: PhaseHistoryEntry[] | null;
  collapsed?: boolean;
  onToggle?: () => void;
}

/**
 * Format workflow type for display
 * TDD, BDD -> uppercase
 * trivial, others -> Title case
 */
function formatWorkflowType(type: string | null): string {
  if (!type) return '—';

  const upperTypes = ['tdd', 'bdd'];
  if (upperTypes.includes(type.toLowerCase())) {
    return type.toUpperCase();
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Get icon for phase status
 */
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

/**
 * Phase step in progress visualization
 */
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

/**
 * Phase history item in timeline
 */
function PhaseHistoryItem({ entry }: { entry: PhaseHistoryEntry }): React.ReactElement {
  const icon = getPhaseIcon(entry.status);
  const statusClass = `phase-history-item ${entry.status}`;

  const durationText = entry.status === 'current'
    ? 'in progress'
    : entry.status === 'pending'
    ? 'pending'
    : entry.duration || '—';

  return (
    <div className={statusClass}>
      <span className="history-icon">{icon}</span>
      <span className="history-phase">{entry.phase.toUpperCase()}</span>
      <span className="history-agent">{entry.agent}</span>
      <span className="history-duration">{durationText}</span>
    </div>
  );
}

/**
 * BikeLanePanel - Displays workflow progress and phase history
 */
export function BikeLanePanel({
  workflowType,
  phases,
  phaseHistory,
  collapsed = false,
  onToggle,
}: BikeLanePanelProps): React.ReactElement {
  // Handle empty state
  if (!workflowType && (!phases || phases.length === 0)) {
    return (
      <div className="bikelane-panel empty hidden" data-testid="bikelane-panel">
        <div className="placeholder">No active workflow</div>
      </div>
    );
  }

  const formattedType = formatWorkflowType(workflowType);

  // Handle collapsed state
  if (collapsed) {
    return (
      <div className="bikelane-panel collapsed" data-testid="bikelane-panel">
        <div className="bikelane-header" onClick={onToggle}>
          <Badge variant="secondary" className="workflow-type-badge" data-workflow-type={workflowType || ''}>
            {formattedType}
          </Badge>
          <span className="bikelane-expand">▶</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bikelane-panel" data-testid="bikelane-panel">
      <div className="bikelane-header" onClick={onToggle}>
        <Badge variant="secondary" className="workflow-type-badge" data-workflow-type={workflowType || ''}>
          {formattedType}
        </Badge>
        {onToggle && <span className="bikelane-expand">▼</span>}
      </div>

      {/* Phase progress visualization */}
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

      {/* Phase history timeline */}
      {phaseHistory && phaseHistory.length > 0 && (
        <div className="phase-history">
          <div className="phase-history-list">
            {phaseHistory.map((entry, index) => (
              <PhaseHistoryItem key={index} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ConnectedBikeLanePanel - Self-contained panel that fetches its own data
 *
 * Used by DockingWorkspace via registerPanelComponent.
 * Subscribes to story updates so it re-renders when session file changes.
 */
export function ConnectedBikeLanePanel(): React.ReactElement {
  const { story, isLoading, error } = useStory();

  if (isLoading) {
    return (
      <div className="bikelane-panel loading" data-testid="bikelane-panel">
        <div className="space-y-2 p-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <div className="flex gap-2 items-center">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bikelane-panel error" data-testid="bikelane-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  return (
    <BikeLanePanel
      workflowType={story?.workflow ?? null}
      phases={story?.workflowPhases ?? null}
    />
  );
}

export default BikeLanePanel;
