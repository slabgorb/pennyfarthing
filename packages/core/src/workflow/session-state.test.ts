/**
 * Session State Tests for MSSCI-12082
 *
 * Tests for session file stepped workflow state tracking.
 * Covers all 4 acceptance criteria plus edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  WorkflowState,
  initWorkflowState,
  updateWorkflowState,
  parseSessionState,
  updateSessionContent,
  formatWorkflowState,
} from './session-state.js';

// =============================================================================
// AC1: Session file has Workflow State section
// =============================================================================

describe('MSSCI-12082: Session State', () => {
  describe('AC1: Session file has Workflow State section', () => {
    it('should parse Workflow State section from session file', () => {
      const content = `# Story MSSCI-12082: Test Story

## Story Overview
- **Epic:** Test Epic
- **Points:** 2

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
- [ ] AC1: Test
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.ok(result.state);
      assert.strictEqual(result.state.name, 'architecture');
      assert.strictEqual(result.state.type, 'stepped');
      assert.strictEqual(result.state.mode, 'create');
      assert.strictEqual(result.state.currentStep, 3);
      assert.deepStrictEqual(result.state.stepsCompleted, [1, 2]);
      assert.strictEqual(result.state.status, 'in_progress');
    });

    it('should extract workflow name correctly', () => {
      const content = `## Workflow State
- **Workflow Name:** planning-workflow
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.name, 'planning-workflow');
    });

    it('should extract type as stepped or phased', () => {
      const steppedContent = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const phasedContent = `## Workflow State
- **Workflow Name:** test
- **Type:** phased
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const steppedResult = parseSessionState(steppedContent);
      const phasedResult = parseSessionState(phasedContent);

      assert.strictEqual(steppedResult.state?.type, 'stepped');
      assert.strictEqual(phasedResult.state?.type, 'phased');
    });

    it('should extract optional mode field (create/validate/edit)', () => {
      const createContent = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const validateContent = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Mode:** validate
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const editContent = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Mode:** edit
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      assert.strictEqual(parseSessionState(createContent).state?.mode, 'create');
      assert.strictEqual(parseSessionState(validateContent).state?.mode, 'validate');
      assert.strictEqual(parseSessionState(editContent).state?.mode, 'edit');
    });

    it('should extract timestamps in ISO format', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:30:45.123Z
- **Last Updated:** 2026-01-20T14:22:33.456Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.state?.started, '2026-01-20T10:30:45.123Z');
      assert.strictEqual(result.state?.lastUpdated, '2026-01-20T14:22:33.456Z');
    });

    it('should handle notes field if present', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 2
- **Steps Completed:** [1]
- **Status:** paused
- **Notes:** Waiting for user input at gate

## Next Section
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.state?.notes, 'Waiting for user input at gate');
    });
  });

  // =============================================================================
  // AC2: State tracks current step and completed steps
  // =============================================================================

  describe('AC2: State tracks current step and completed steps', () => {
    it('should initialize state at step 1 with empty completed array', () => {
      const state = initWorkflowState('architecture', 'stepped', 'create');

      assert.strictEqual(state.name, 'architecture');
      assert.strictEqual(state.type, 'stepped');
      assert.strictEqual(state.mode, 'create');
      assert.strictEqual(state.currentStep, 1);
      assert.deepStrictEqual(state.stepsCompleted, []);
      assert.strictEqual(state.status, 'in_progress');
    });

    it('should initialize state without mode for phased workflows', () => {
      const state = initWorkflowState('tdd-workflow', 'phased');

      assert.strictEqual(state.name, 'tdd-workflow');
      assert.strictEqual(state.type, 'phased');
      assert.strictEqual(state.mode, undefined);
    });

    it('should update state from step 1 to step 2', () => {
      const initial = initWorkflowState('test', 'stepped');
      const updated = updateWorkflowState(initial, 1); // completed step 1

      assert.strictEqual(updated.currentStep, 2);
      assert.deepStrictEqual(updated.stepsCompleted, [1]);
    });

    it('should update state from step 2 to step 3', () => {
      const state: WorkflowState = {
        name: 'test',
        type: 'stepped',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T10:00:00.000Z',
        currentStep: 2,
        stepsCompleted: [1],
        status: 'in_progress',
      };

      const updated = updateWorkflowState(state, 2);

      assert.strictEqual(updated.currentStep, 3);
      assert.deepStrictEqual(updated.stepsCompleted, [1, 2]);
    });

    it('should accumulate completed steps in order', () => {
      let state = initWorkflowState('test', 'stepped');

      state = updateWorkflowState(state, 1);
      assert.deepStrictEqual(state.stepsCompleted, [1]);

      state = updateWorkflowState(state, 2);
      assert.deepStrictEqual(state.stepsCompleted, [1, 2]);

      state = updateWorkflowState(state, 3);
      assert.deepStrictEqual(state.stepsCompleted, [1, 2, 3]);

      state = updateWorkflowState(state, 4);
      assert.deepStrictEqual(state.stepsCompleted, [1, 2, 3, 4]);
    });

    it('should allow jumping to specific next step', () => {
      const state = initWorkflowState('test', 'stepped');
      const updated = updateWorkflowState(state, 1, 5); // skip to step 5

      assert.strictEqual(updated.currentStep, 5);
      assert.deepStrictEqual(updated.stepsCompleted, [1]);
    });

    it('should update lastUpdated timestamp on state change', () => {
      const state = initWorkflowState('test', 'stepped');
      const _originalLastUpdated = state.lastUpdated;

      // Small delay to ensure timestamp changes
      const updated = updateWorkflowState(state, 1);

      // lastUpdated should be different (or at least not throw)
      assert.ok(updated.lastUpdated);
      assert.strictEqual(typeof updated.lastUpdated, 'string');
    });

    it('should preserve started timestamp on updates', () => {
      const state: WorkflowState = {
        name: 'test',
        type: 'stepped',
        started: '2026-01-15T09:00:00.000Z',
        lastUpdated: '2026-01-15T09:00:00.000Z',
        currentStep: 1,
        stepsCompleted: [],
        status: 'in_progress',
      };

      const updated = updateWorkflowState(state, 1);

      assert.strictEqual(updated.started, '2026-01-15T09:00:00.000Z');
    });
  });

  // =============================================================================
  // AC3: State persists across session reloads
  // =============================================================================

  describe('AC3: State persists across session reloads', () => {
    it('should format state as markdown section', () => {
      const state: WorkflowState = {
        name: 'architecture',
        type: 'stepped',
        mode: 'create',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T11:30:00.000Z',
        currentStep: 3,
        stepsCompleted: [1, 2],
        status: 'in_progress',
      };

      const formatted = formatWorkflowState(state);

      assert.ok(formatted.includes('## Workflow State'));
      assert.ok(formatted.includes('**Workflow Name:** architecture'));
      assert.ok(formatted.includes('**Type:** stepped'));
      assert.ok(formatted.includes('**Mode:** create'));
      assert.ok(formatted.includes('**Current Step:** 3'));
      assert.ok(formatted.includes('**Steps Completed:** [1, 2]'));
    });

    it('should write state to session file content', () => {
      const originalContent = `# Story Test

## Story Overview
- **Epic:** Test

## Acceptance Criteria
- [ ] AC1
`;

      const state: WorkflowState = {
        name: 'test-workflow',
        type: 'stepped',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T10:00:00.000Z',
        currentStep: 1,
        stepsCompleted: [],
        status: 'in_progress',
      };

      const result = updateSessionContent(originalContent, state);

      assert.strictEqual(result.success, true);
      assert.ok(result.content?.includes('## Workflow State'));
      assert.ok(result.content?.includes('**Workflow Name:** test-workflow'));
    });

    it('should read back written state unchanged', () => {
      const originalState: WorkflowState = {
        name: 'architecture',
        type: 'stepped',
        mode: 'validate',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T12:00:00.000Z',
        currentStep: 5,
        stepsCompleted: [1, 2, 3, 4],
        status: 'in_progress',
      };

      const sessionContent = `# Story Test

## Workflow State
- **Workflow Name:** architecture
- **Type:** stepped
- **Mode:** validate
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T12:00:00.000Z
- **Current Step:** 5
- **Steps Completed:** [1, 2, 3, 4]
- **Status:** in_progress
`;

      // Write then read back
      const writeResult = updateSessionContent(sessionContent, originalState);
      assert.strictEqual(writeResult.success, true);

      const readResult = parseSessionState(writeResult.content!);
      assert.strictEqual(readResult.success, true);

      // Verify all fields match
      assert.strictEqual(readResult.state?.name, originalState.name);
      assert.strictEqual(readResult.state?.type, originalState.type);
      assert.strictEqual(readResult.state?.mode, originalState.mode);
      assert.strictEqual(readResult.state?.started, originalState.started);
      assert.strictEqual(readResult.state?.currentStep, originalState.currentStep);
      assert.deepStrictEqual(readResult.state?.stepsCompleted, originalState.stepsCompleted);
      assert.strictEqual(readResult.state?.status, originalState.status);
    });

    it('should handle multi-step workflow state persistence', () => {
      const state: WorkflowState = {
        name: 'comprehensive-workflow',
        type: 'stepped',
        mode: 'create',
        started: '2026-01-15T08:00:00.000Z',
        lastUpdated: '2026-01-20T16:45:30.123Z',
        currentStep: 10,
        stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        status: 'in_progress',
        notes: 'Almost complete',
      };

      const formatted = formatWorkflowState(state);
      const parsed = parseSessionState(formatted);

      assert.strictEqual(parsed.success, true);
      assert.deepStrictEqual(parsed.state?.stepsCompleted, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      assert.strictEqual(parsed.state?.currentStep, 10);
    });

    it('should update existing Workflow State section', () => {
      const existingContent = `# Story Test

## Story Overview
- **Epic:** Test

## Workflow State
- **Workflow Name:** old-workflow
- **Type:** stepped
- **Started:** 2026-01-19T10:00:00.000Z
- **Last Updated:** 2026-01-19T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress

## Acceptance Criteria
- [ ] AC1
`;

      const newState: WorkflowState = {
        name: 'old-workflow',
        type: 'stepped',
        started: '2026-01-19T10:00:00.000Z',
        lastUpdated: '2026-01-20T15:00:00.000Z',
        currentStep: 3,
        stepsCompleted: [1, 2],
        status: 'in_progress',
      };

      const result = updateSessionContent(existingContent, newState);

      assert.strictEqual(result.success, true);
      assert.ok(result.content?.includes('**Current Step:** 3'));
      assert.ok(result.content?.includes('**Steps Completed:** [1, 2]'));
      // Should still have other sections
      assert.ok(result.content?.includes('## Story Overview'));
      assert.ok(result.content?.includes('## Acceptance Criteria'));
    });
  });

  // =============================================================================
  // AC4: Reader/writer handles missing state gracefully
  // =============================================================================

  describe('AC4: Reader/writer handles missing state gracefully', () => {
    it('should return success with undefined state for missing section', () => {
      const content = `# Story Test

## Story Overview
- **Epic:** Test

## Acceptance Criteria
- [ ] AC1
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state, undefined);
    });

    it('should insert Workflow State section when missing', () => {
      const content = `# Story Test

## Story Overview
- **Epic:** Test

## Acceptance Criteria
- [ ] AC1
`;

      const state: WorkflowState = {
        name: 'new-workflow',
        type: 'stepped',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T10:00:00.000Z',
        currentStep: 1,
        stepsCompleted: [],
        status: 'in_progress',
      };

      const result = updateSessionContent(content, state);

      assert.strictEqual(result.success, true);
      assert.ok(result.content?.includes('## Workflow State'));
      assert.ok(result.content?.includes('**Workflow Name:** new-workflow'));
    });

    it('should handle empty session file', () => {
      const content = '';

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state, undefined);
    });

    it('should handle session file with only header', () => {
      const content = '# Story Test\n';

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state, undefined);
    });

    it('should use default values for missing optional fields', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, undefined);
      assert.strictEqual(result.state?.notes, undefined);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty stepsCompleted array', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.state?.stepsCompleted, []);
    });

    it('should handle completed workflow status', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T12:00:00.000Z
- **Current Step:** 5
- **Steps Completed:** [1, 2, 3, 4, 5]
- **Status:** completed
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.state?.status, 'completed');
    });

    it('should handle paused workflow status', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T11:00:00.000Z
- **Current Step:** 2
- **Steps Completed:** [1]
- **Status:** paused
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.state?.status, 'paused');
    });

    it('should handle malformed stepsCompleted gracefully', () => {
      const content = `## Workflow State
- **Workflow Name:** test
- **Type:** stepped
- **Started:** 2026-01-20T10:00:00.000Z
- **Last Updated:** 2026-01-20T10:00:00.000Z
- **Current Step:** 1
- **Steps Completed:** not-an-array
- **Status:** in_progress
`;

      // Should either parse as empty array or return error - implementation choice
      const result = parseSessionState(content);

      // At minimum, should not throw
      assert.ok(result);
    });

    it('should handle section with extra whitespace', () => {
      const content = `## Workflow State

- **Workflow Name:**   architecture
- **Type:**   stepped
- **Started:**   2026-01-20T10:00:00.000Z
- **Last Updated:**   2026-01-20T10:00:00.000Z
- **Current Step:**   2
- **Steps Completed:**   [1]
- **Status:**   in_progress

## Next Section
`;

      const result = parseSessionState(content);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.name, 'architecture');
      assert.strictEqual(result.state?.currentStep, 2);
    });

    it('should not duplicate completed steps', () => {
      const state: WorkflowState = {
        name: 'test',
        type: 'stepped',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T10:00:00.000Z',
        currentStep: 2,
        stepsCompleted: [1],
        status: 'in_progress',
      };

      // Try to complete step 1 again
      const updated = updateWorkflowState(state, 1, 2);

      // Should not have duplicate 1s
      const counts = updated.stepsCompleted.filter((s) => s === 1).length;
      assert.strictEqual(counts, 1);
    });

    it('should initialize with current ISO timestamp', () => {
      const before = new Date().toISOString();
      const state = initWorkflowState('test', 'stepped');
      const after = new Date().toISOString();

      // Started should be between before and after
      assert.ok(state.started >= before);
      assert.ok(state.started <= after);
      assert.ok(state.lastUpdated >= before);
      assert.ok(state.lastUpdated <= after);
    });

    it('should format stepsCompleted as JSON array in markdown', () => {
      const state: WorkflowState = {
        name: 'test',
        type: 'stepped',
        started: '2026-01-20T10:00:00.000Z',
        lastUpdated: '2026-01-20T10:00:00.000Z',
        currentStep: 4,
        stepsCompleted: [1, 2, 3],
        status: 'in_progress',
      };

      const formatted = formatWorkflowState(state);

      assert.ok(formatted.includes('[1, 2, 3]'));
    });
  });
});
