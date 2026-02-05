/**
 * WorkflowPanel - BikeLane phase visualization panel
 *
 * Extracted from ProgressPanel as part of MSSCI-14188.
 * Shows workflow type badge (TDD/BDD/Trivial) and phase progress.
 *
 * Story: MSSCI-14188 - Split Progress panel into Workflow, AC, and Todo panels
 * Epic: epic-76 (Dockview Panel Migration)
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useStory } from '../../hooks/useStory';
import type { WorkflowPhase } from '../../../story-parser.js';

// =============================================================================
// Helper Functions
// =============================================================================

function getPhaseIcon(status: 'done' | 'current' | 'pending'): string {
  switch (status) {
    case 'done':
      return '\u2713';
    case 'current':
      return '\u25CF';
    case 'pending':
    default:
      return '\u25CB';
  }
}

function formatWorkflowType(type: string | null): string {
  if (!type) return '\u2014';

  const upperTypes = ['tdd', 'bdd'];
  if (upperTypes.includes(type.toLowerCase())) {
    return type.toUpperCase();
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

// =============================================================================
// Phase Step Component
// =============================================================================

function PhaseStep({ phase, isLast }: { phase: WorkflowPhase; isLast: boolean }): React.ReactElement {
  const icon = getPhaseIcon(phase.status);
  const statusClass = `phase-step ${phase.status}`;

  return (
    <>
      <div className={statusClass}>
        <span className="phase-icon">{icon}</span>
        <span className="phase-label">{phase.label}</span>
      </div>
      {!isLast && <span className="phase-arrow">{'\u2192'}</span>}
    </>
  );
}

// =============================================================================
// WorkflowPanel Component
// =============================================================================

export function WorkflowPanel(): React.ReactElement {
  const { story, isLoading, error } = useStory();

  if (isLoading) {
    return (
      <div className="workflow-panel loading" data-testid="workflow-panel">
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
      <div className="workflow-panel error" data-testid="workflow-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  const workflowType = story?.workflow ?? null;
  const phases = story?.workflowPhases ?? null;

  if (!workflowType && (!phases || phases.length === 0)) {
    return (
      <div className="workflow-panel" data-testid="workflow-panel">
        <div className="placeholder">No active workflow</div>
      </div>
    );
  }

  const formattedType = formatWorkflowType(workflowType);

  return (
    <div className="workflow-panel" data-testid="workflow-panel">
      <div className="workflow-content">
        <Badge variant="secondary" className="workflow-type-badge" data-workflow-type={workflowType || ''}>
          {formattedType}
        </Badge>

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
    </div>
  );
}

export default WorkflowPanel;
