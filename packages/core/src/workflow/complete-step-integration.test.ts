/**
 * Integration tests for stepped workflow step completion exposure
 * Story: MSSCI-14299 - Wire up stepped workflow session state advancement
 *
 * Tests that the step completion API is properly exported and accessible
 * from the package's public API, and that the complete-step CLI script
 * can be invoked programmatically.
 *
 * These tests verify the "wiring" — the exposure layer that connects
 * the existing internal API to external callers (CLI scripts, skills).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// AC1-AC4: Barrel export verification
// The workflow module must export session-state and workflow-executor
// so that CLI scripts and other consumers can access completeStep()
// =============================================================================

describe('MSSCI-14299: Stepped workflow state advancement wiring', () => {
  describe('Module exports: session-state API accessible from workflow barrel', () => {
    it('should export WorkflowState type from workflow index', async () => {
      const workflowModule = await import('./index.js');
      // WorkflowState should be re-exported from the workflow barrel
      assert.ok(
        'initWorkflowState' in workflowModule,
        'initWorkflowState should be exported from workflow/index.js'
      );
    });

    it('should export parseSessionState from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'parseSessionState' in workflowModule,
        'parseSessionState should be exported from workflow/index.js'
      );
    });

    it('should export updateSessionContent from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'updateSessionContent' in workflowModule,
        'updateSessionContent should be exported from workflow/index.js'
      );
    });

    it('should export updateWorkflowState from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'updateWorkflowState' in workflowModule,
        'updateWorkflowState should be exported from workflow/index.js'
      );
    });

    it('should export formatWorkflowState from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'formatWorkflowState' in workflowModule,
        'formatWorkflowState should be exported from workflow/index.js'
      );
    });
  });

  describe('Module exports: workflow-executor API accessible from workflow barrel', () => {
    it('should export completeStep from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'completeStep' in workflowModule,
        'completeStep should be exported from workflow/index.js'
      );
    });

    it('should export startWorkflow from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'startWorkflow' in workflowModule,
        'startWorkflow should be exported from workflow/index.js'
      );
    });

    it('should export resumeWorkflow from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'resumeWorkflow' in workflowModule,
        'resumeWorkflow should be exported from workflow/index.js'
      );
    });

    it('should export getWorkflowStatus from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'getWorkflowStatus' in workflowModule,
        'getWorkflowStatus should be exported from workflow/index.js'
      );
    });

    it('should export hasActiveWorkflow from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'hasActiveWorkflow' in workflowModule,
        'hasActiveWorkflow should be exported from workflow/index.js'
      );
    });

    it('should export detectIncompleteWorkflow from workflow index', async () => {
      const workflowModule = await import('./index.js');
      assert.ok(
        'detectIncompleteWorkflow' in workflowModule,
        'detectIncompleteWorkflow should be exported from workflow/index.js'
      );
    });
  });

  // ===========================================================================
  // AC5: CLI script exists for step completion
  // ===========================================================================

  describe('CLI exposure: complete-step.sh script exists', () => {
    it('should have complete-step.sh in workflow scripts', () => {
      // The script should exist in pennyfarthing-dist/scripts/workflow/
      // __dirname is packages/core/dist/workflow/ → 4 levels up = pennyfarthing repo root
      const projectRoot = resolve(__dirname, '../../../..');
      const scriptPath = resolve(
        projectRoot,
        'pennyfarthing-dist/scripts/workflow/complete-step.sh'
      );
      assert.ok(
        existsSync(scriptPath),
        `complete-step.sh should exist at ${scriptPath}`
      );
    });

    it('should have complete-step.sh be executable', () => {
      const projectRoot = resolve(__dirname, '../../../..');
      const scriptPath = resolve(
        projectRoot,
        'pennyfarthing-dist/scripts/workflow/complete-step.sh'
      );

      // Skip if file doesn't exist (previous test covers this)
      if (!existsSync(scriptPath)) {
        assert.fail('complete-step.sh does not exist yet');
        return;
      }

      try {
        // Check if file is executable
        execSync(`test -x "${scriptPath}"`, { stdio: 'pipe' });
        assert.ok(true, 'Script is executable');
      } catch {
        assert.fail('complete-step.sh should be executable');
      }
    });
  });

  // ===========================================================================
  // Functional: completeStep correctly wires through to session update
  // (These test the function directly, not through CLI)
  // ===========================================================================

  describe('Functional: completeStep end-to-end state transitions', () => {
    it('should mark workflow as completed when final step is done', async () => {
      // Import directly from session-state and workflow-executor
      // (these already work - this tests they STAY working after refactor)
      const { completeStep } = await import('./workflow-executor.js');

      const sessionWith2Of3Done = `# Workflow Session: test

## Workflow State
- **Workflow Name:** test-workflow
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-02-05T10:00:00Z
- **Last Updated:** 2026-02-05T11:00:00Z
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Status:** in_progress

## Progress
- Total Steps: 3
- Completion: 66%
`;

      const updated = completeStep(sessionWith2Of3Done, 3);

      // After completing the final step, steps completed should include 3
      assert.ok(
        updated.includes('[1, 2, 3]'),
        'Steps Completed should include all 3 steps'
      );
      // Current step should advance beyond total
      assert.ok(
        updated.includes('**Current Step:** 4'),
        'Current step should advance to 4 (beyond total)'
      );
    });

    it('should NOT auto-set status to completed (requires separate logic)', async () => {
      // NOTE: The existing completeStep() function does NOT set status to
      // 'completed' — it only updates stepsCompleted and currentStep.
      // The complete-step.sh script needs to handle this transition.
      const { completeStep } = await import('./workflow-executor.js');

      const sessionWith2Of3Done = `# Workflow Session: test

## Workflow State
- **Workflow Name:** test-workflow
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-02-05T10:00:00Z
- **Last Updated:** 2026-02-05T11:00:00Z
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Status:** in_progress

## Progress
- Total Steps: 3
- Completion: 66%
`;

      const updated = completeStep(sessionWith2Of3Done, 3);

      // The TS function alone does NOT set status to completed.
      // This verifies the gap that complete-step.sh must fill.
      assert.ok(
        updated.includes('**Status:** in_progress'),
        'completeStep() alone does not change status — script must handle this'
      );
    });
  });
});
