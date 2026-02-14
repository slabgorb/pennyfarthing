/**
 * WorkflowPanel - BikeLane phase visualization panel
 *
 * Extracted from ProgressPanel as part of MSSCI-14188.
 * Shows workflow type badge (TDD/BDD/Trivial) and phase progress.
 * MSSCI-14300: Added stepped workflow "Step N of M" display.
 * MSSCI-14301: Added available workflows discovery list.
 *
 * Story: MSSCI-14188 - Split Progress panel into Workflow, AC, and Todo panels
 * Epic: epic-76 (Dockview Panel Migration)
 */

import React, { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useClaudeContext } from '../../contexts/ClaudeContext';
import { useStory } from '../../hooks/useStory';
import type { WorkflowPhase, AvailableWorkflow } from '../../../story-parser.js';

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
// Phase Step Component (for phased workflows)
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
// Stepped Progress Component (for stepped workflows)
// =============================================================================

function SteppedProgress({ phases }: { phases: WorkflowPhase[] }): React.ReactElement {
  const total = phases.length;
  const currentIndex = phases.findIndex(p => p.status === 'current');
  const doneCount = phases.filter(p => p.status === 'done').length;

  // If all done, current step = total; otherwise use 1-based index of current
  const currentStep = currentIndex >= 0 ? currentIndex + 1 : (doneCount === total ? total : 1);
  const currentPhase = currentIndex >= 0 ? phases[currentIndex] : null;

  return (
    <div className="stepped-progress">
      <span className="stepped-counter">Step {currentStep} of {total}</span>
      {currentPhase && (
        <span className="stepped-current-label">{currentPhase.label}</span>
      )}
    </div>
  );
}

// =============================================================================
// Available Workflows List (MSSCI-14301)
// =============================================================================

function AvailableWorkflowsList({ workflows, onStart }: {
  workflows: AvailableWorkflow[];
  onStart?: (workflow: AvailableWorkflow) => void;
}): React.ReactElement {
  return (
    <div className="available-workflows">
      <div className="available-workflows-header">
        <span className="available-workflows-title">Available Workflows ({workflows.length})</span>
      </div>
      <div className="available-workflows-list">
        {workflows.map((wf) => (
          <div
            key={wf.name}
            className="workflow-entry"
            data-testid="workflow-entry"
            data-workflow-entry-type={wf.type}
          >
            <div className="workflow-entry-header">
              <span className="workflow-entry-name">{wf.name}</span>
              <Badge variant="outline" className="workflow-entry-type-badge">
                {wf.type}
              </Badge>
            </div>
            <div className="workflow-entry-description">{wf.description}</div>
            {wf.type === 'stepped' && (
              <div className="workflow-entry-hint">/workflow start {wf.name}</div>
            )}
            <div className="workflow-entry-footer">
              <Button
                variant="ghost"
                size="sm"
                className="workflow-start-button"
                data-testid="workflow-start-button"
                onClick={() => onStart?.(wf)}
              >
                Start
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// WorkflowPanel Component
// =============================================================================

export function WorkflowPanel(): React.ReactElement {
  const { story, isLoading, error, availableWorkflows } = useStory();
  const { send, isConnected } = useClaudeContext();

  const handleStartWorkflow = useCallback((wf: AvailableWorkflow) => {
    if (!isConnected) return;
    send(`/workflow start ${wf.name}`);
  }, [send, isConnected]);

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
  const isStepped = story?.workflowType === 'stepped';

  if (!workflowType && (!phases || phases.length === 0)) {
    // MSSCI-14301: Show available workflows when no active workflow
    if (availableWorkflows && availableWorkflows.length > 0) {
      return (
        <div className="workflow-panel" data-testid="workflow-panel">
          <AvailableWorkflowsList workflows={availableWorkflows} onStart={handleStartWorkflow} />
        </div>
      );
    }
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
          isStepped ? (
            <SteppedProgress phases={phases} />
          ) : (
            <div className="phase-progress">
              {phases.map((phase, index) => (
                <PhaseStep
                  key={phase.name}
                  phase={phase}
                  isLast={index === phases.length - 1}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default WorkflowPanel;
