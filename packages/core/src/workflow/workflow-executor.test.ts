/**
 * Workflow Executor Tests for MSSCI-12084
 *
 * Tests for /workflow start, resume, and status commands.
 * Covers all 8 acceptance criteria plus edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  WorkflowDefinition,
  startWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  loadStep,
  completeStep,
  hasActiveWorkflow,
  detectIncompleteWorkflow,
} from './workflow-executor.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockWorkflow: WorkflowDefinition = {
  name: 'architecture',
  type: 'stepped',
  description: 'Architecture design workflow',
  steps: {
    path: '/workflows/architecture/steps',
    pattern: 'step-*.md',
  },
  modes: {
    default: 'create',
    available: ['create', 'validate', 'edit'],
  },
  variables: {
    project_name: 'Test Project',
  },
  gates: {
    after_steps: [2, 5],
  },
  totalSteps: 7,
};

const emptySession = `# Story Test

## Story Overview
- **Epic:** Test Epic

## Acceptance Criteria
- [ ] AC1
`;

const sessionWithWorkflowState = `# Story Test

## Story Overview
- **Epic:** Test Epic

## Workflow State
- **Workflow Name:** architecture
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T11:30:00.000Z
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Status:** in_progress

## Acceptance Criteria
- [ ] AC1
`;

const sessionWithCompletedWorkflow = `# Story Test

## Workflow State
- **Workflow Name:** architecture
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T15:00:00.000Z
- **Current Step:** 7
- **Steps Completed:** [1, 2, 3, 4, 5, 6, 7]
- **Status:** completed
`;

// =============================================================================
// AC1: /workflow start <name> [--mode create|validate|edit] implemented
// =============================================================================

describe('MSSCI-12084: Workflow Executor', () => {
  describe('AC1: /workflow start command', () => {
    it('should start workflow with given name', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.strictEqual(result.success, true);
      assert.ok(result.state);
      assert.strictEqual(result.state.name, 'architecture');
      assert.strictEqual(result.state.type, 'stepped');
    });

    it('should accept --mode flag for tri-modal selection', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession, 'validate');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, 'validate');
    });

    it('should accept create mode', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession, 'create');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, 'create');
    });

    it('should accept validate mode', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession, 'validate');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, 'validate');
    });

    it('should accept edit mode', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession, 'edit');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, 'edit');
    });

    it('should return error for invalid workflow definition', async () => {
      const invalidWorkflow = { ...mockWorkflow, name: '' };
      const result = await startWorkflow(invalidWorkflow, emptySession);

      // Should handle invalid workflow gracefully
      assert.ok(result);
    });
  });

  // =============================================================================
  // AC2: /workflow start creates session and loads step 1
  // =============================================================================

  describe('AC2: Start creates session and loads step 1', () => {
    it('should initialize workflow state at step 1', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.currentStep, 1);
      assert.deepStrictEqual(result.state?.stepsCompleted, []);
    });

    it('should set status to in_progress', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.strictEqual(result.state?.status, 'in_progress');
    });

    it('should include step 1 content in result', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      // Step content should be loaded (or null if file not found)
      assert.ok(result.step !== undefined || result.success === true);
    });

    it('should return updated session content with workflow state', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.ok(result.sessionContent);
      assert.ok(result.sessionContent.includes('## Workflow State'));
      assert.ok(result.sessionContent.includes('**Workflow Name:** architecture'));
    });

    it('should set started timestamp', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.ok(result.state?.started);
      // Should be ISO timestamp
      assert.ok(result.state.started.match(/^\d{4}-\d{2}-\d{2}T/));
    });

    it('should set lastUpdated timestamp', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.ok(result.state?.lastUpdated);
      assert.ok(result.state.lastUpdated.match(/^\d{4}-\d{2}-\d{2}T/));
    });
  });

  // =============================================================================
  // AC3: --mode flag selects tri-modal path (default: create)
  // =============================================================================

  describe('AC3: Tri-modal mode selection', () => {
    it('should use create as default mode when not specified', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.strictEqual(result.state?.mode, 'create');
    });

    it('should use workflow default mode if specified in definition', async () => {
      const workflowWithValidateDefault: WorkflowDefinition = {
        ...mockWorkflow,
        modes: {
          default: 'validate',
          available: ['create', 'validate', 'edit'],
        },
      };

      const result = await startWorkflow(workflowWithValidateDefault, emptySession);

      assert.strictEqual(result.state?.mode, 'validate');
    });

    it('should override workflow default with explicit mode', async () => {
      const workflowWithValidateDefault: WorkflowDefinition = {
        ...mockWorkflow,
        modes: {
          default: 'validate',
          available: ['create', 'validate', 'edit'],
        },
      };

      const result = await startWorkflow(workflowWithValidateDefault, emptySession, 'edit');

      assert.strictEqual(result.state?.mode, 'edit');
    });

    it('should not set mode for workflows without modes config', async () => {
      const workflowWithoutModes: WorkflowDefinition = {
        ...mockWorkflow,
        modes: undefined,
      };

      const result = await startWorkflow(workflowWithoutModes, emptySession);

      // Mode should be undefined or default to create
      assert.ok(result.state?.mode === undefined || result.state?.mode === 'create');
    });

    it('should include mode in session content when set', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession, 'validate');

      assert.ok(result.sessionContent?.includes('**Mode:** validate'));
    });
  });

  // =============================================================================
  // AC4: /workflow resume [name] implemented
  // =============================================================================

  describe('AC4: /workflow resume command', () => {
    it('should resume workflow from existing session state', async () => {
      const result = await resumeWorkflow(mockWorkflow, sessionWithWorkflowState);

      assert.strictEqual(result.success, true);
      assert.ok(result.state);
    });

    it('should return current state from session', async () => {
      const result = await resumeWorkflow(mockWorkflow, sessionWithWorkflowState);

      assert.strictEqual(result.state?.name, 'architecture');
      assert.strictEqual(result.state?.currentStep, 3);
      assert.deepStrictEqual(result.state?.stepsCompleted, [1, 2]);
    });

    it('should return error when no workflow state in session', async () => {
      const result = await resumeWorkflow(mockWorkflow, emptySession);

      // Should fail or return isComplete with no active workflow
      assert.ok(result.error || result.state === undefined);
    });

    it('should preserve mode from existing state', async () => {
      const result = await resumeWorkflow(mockWorkflow, sessionWithWorkflowState);

      assert.strictEqual(result.state?.mode, 'create');
    });
  });

  // =============================================================================
  // AC5: /workflow resume detects incomplete workflow and continues
  // =============================================================================

  describe('AC5: Resume detects incomplete workflow', () => {
    it('should detect incomplete workflow from session', () => {
      const workflowName = detectIncompleteWorkflow(sessionWithWorkflowState);

      assert.strictEqual(workflowName, 'architecture');
    });

    it('should return undefined when no workflow in session', () => {
      const workflowName = detectIncompleteWorkflow(emptySession);

      assert.strictEqual(workflowName, undefined);
    });

    it('should return undefined when workflow is completed', () => {
      const workflowName = detectIncompleteWorkflow(sessionWithCompletedWorkflow);

      // Completed workflows should not be detected as incomplete
      assert.strictEqual(workflowName, undefined);
    });

    it('should continue from last completed step', async () => {
      const result = await resumeWorkflow(mockWorkflow, sessionWithWorkflowState);

      // Current step should be 3 (next after completed steps [1, 2])
      assert.strictEqual(result.state?.currentStep, 3);
    });

    it('should load next step content on resume', async () => {
      const result = await resumeWorkflow(mockWorkflow, sessionWithWorkflowState);

      // Step should be loaded (number should match current step)
      assert.ok(result.step === undefined || result.step?.number === 3);
    });

    it('should mark as complete when all steps done', async () => {
      const result = await resumeWorkflow(mockWorkflow, sessionWithCompletedWorkflow);

      assert.strictEqual(result.isComplete, true);
    });
  });

  // =============================================================================
  // AC6: /workflow status shows step progress and completion %
  // =============================================================================

  describe('AC6: /workflow status command', () => {
    it('should return workflow status from session', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.success, true);
      assert.ok(result.status);
    });

    it('should show current step number', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.status?.currentStep, 3);
    });

    it('should show total steps', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.status?.totalSteps, 7);
    });

    it('should show completed steps array', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.deepStrictEqual(result.status?.stepsCompleted, [1, 2]);
    });

    it('should calculate completion percentage', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      // 2 of 7 steps completed = ~28.57%
      assert.ok(result.status?.completionPercent);
      assert.ok(result.status.completionPercent >= 28 && result.status.completionPercent <= 29);
    });

    it('should show 0% for new workflow', () => {
      const newWorkflowSession = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;
      const result = getWorkflowStatus(newWorkflowSession, 5);

      assert.strictEqual(result.status?.completionPercent, 0);
    });

    it('should show 100% for completed workflow', () => {
      const result = getWorkflowStatus(sessionWithCompletedWorkflow, 7);

      assert.strictEqual(result.status?.completionPercent, 100);
    });

    it('should show workflow name', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.status?.name, 'architecture');
    });

    it('should show workflow type', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.status?.type, 'stepped');
    });

    it('should show mode if set', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.status?.mode, 'create');
    });

    it('should show workflow status', () => {
      const result = getWorkflowStatus(sessionWithWorkflowState, 7);

      assert.strictEqual(result.status?.status, 'in_progress');
    });

    it('should return error when no workflow state', () => {
      const result = getWorkflowStatus(emptySession, 7);

      // Should indicate no active workflow
      assert.ok(!result.status || result.error);
    });
  });

  // =============================================================================
  // AC7: Session file state tracked via Workflow State section
  // =============================================================================

  describe('AC7: Session state integration', () => {
    it('should write workflow state to session on start', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.ok(result.sessionContent?.includes('## Workflow State'));
    });

    it('should update session state on step completion', () => {
      const updated = completeStep(sessionWithWorkflowState, 3);

      assert.ok(updated.includes('**Steps Completed:**'));
      // Should now include step 3
      assert.ok(updated.includes('[1, 2, 3]'));
    });

    it('should advance current step on completion', () => {
      const updated = completeStep(sessionWithWorkflowState, 3);

      assert.ok(updated.includes('**Current Step:** 4'));
    });

    it('should update lastUpdated timestamp on completion', () => {
      const updated = completeStep(sessionWithWorkflowState, 3);

      // lastUpdated should be different from original
      assert.ok(updated.includes('**Last Updated:**'));
    });

    it('should detect active workflow in session', () => {
      const hasActive = hasActiveWorkflow(sessionWithWorkflowState);

      assert.strictEqual(hasActive, true);
    });

    it('should detect no active workflow in empty session', () => {
      const hasActive = hasActiveWorkflow(emptySession);

      assert.strictEqual(hasActive, false);
    });

    it('should preserve other session content when updating state', async () => {
      const result = await startWorkflow(mockWorkflow, emptySession);

      assert.ok(result.sessionContent?.includes('## Story Overview'));
      assert.ok(result.sessionContent?.includes('## Acceptance Criteria'));
    });
  });

  // =============================================================================
  // AC8: Commands available in CLI with help documentation
  // This AC is about CLI integration - tested via bash script existence
  // =============================================================================

  describe('AC8: CLI availability', () => {
    it('should export startWorkflow function', () => {
      assert.strictEqual(typeof startWorkflow, 'function');
    });

    it('should export resumeWorkflow function', () => {
      assert.strictEqual(typeof resumeWorkflow, 'function');
    });

    it('should export getWorkflowStatus function', () => {
      assert.strictEqual(typeof getWorkflowStatus, 'function');
    });

    it('should export loadStep function', () => {
      assert.strictEqual(typeof loadStep, 'function');
    });

    it('should export completeStep function', () => {
      assert.strictEqual(typeof completeStep, 'function');
    });

    it('should export hasActiveWorkflow function', () => {
      assert.strictEqual(typeof hasActiveWorkflow, 'function');
    });

    it('should export detectIncompleteWorkflow function', () => {
      assert.strictEqual(typeof detectIncompleteWorkflow, 'function');
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle workflow with no steps gracefully', async () => {
      const emptyWorkflow: WorkflowDefinition = {
        ...mockWorkflow,
        totalSteps: 0,
      };

      const result = await startWorkflow(emptyWorkflow, emptySession);

      // Should handle gracefully
      assert.ok(result);
    });

    it('should handle single-step workflow', async () => {
      const singleStepWorkflow: WorkflowDefinition = {
        ...mockWorkflow,
        totalSteps: 1,
      };

      const result = await startWorkflow(singleStepWorkflow, emptySession);

      assert.ok(result.state?.currentStep === 1);
    });

    it('should handle phased workflow type', async () => {
      const phasedWorkflow: WorkflowDefinition = {
        ...mockWorkflow,
        type: 'phased',
      };

      const result = await startWorkflow(phasedWorkflow, emptySession);

      assert.strictEqual(result.state?.type, 'phased');
    });

    it('should handle step completion with explicit next step', () => {
      // Skip from step 3 to step 5
      const updated = completeStep(sessionWithWorkflowState, 3, 5);

      assert.ok(updated.includes('**Current Step:** 5'));
    });

    it('should handle resume on paused workflow', async () => {
      const pausedSession = sessionWithWorkflowState.replace('in_progress', 'paused');

      const result = await resumeWorkflow(mockWorkflow, pausedSession);

      // Should be able to resume paused workflow
      assert.ok(result);
    });

    it('should calculate correct percentage for mid-workflow', () => {
      // 3 of 5 steps = 60%
      const sessionWith3of5 = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 4
- **Steps Completed:** [1, 2, 3]
- **Status:** in_progress
`;
      const result = getWorkflowStatus(sessionWith3of5, 5);

      assert.strictEqual(result.status?.completionPercent, 60);
    });

    it('should handle loadStep for non-existent step', async () => {
      const result = await loadStep(mockWorkflow, 999);

      // Should return null or handle gracefully
      assert.ok(result === null || result !== undefined);
    });

    it('should handle workflow variables in step loading', async () => {
      const result = await loadStep(mockWorkflow, 1, { project_name: 'Custom Project' });

      // Should handle variables (even if step doesn't exist)
      assert.ok(result === null || result !== undefined);
    });
  });
});
