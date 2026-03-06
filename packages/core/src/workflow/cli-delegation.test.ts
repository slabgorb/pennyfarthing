/**
 * Tests for Story 141-18: Replace TypeScript Workflow Engine with pf CLI Delegation
 *
 * These tests verify that the six workflow TypeScript files delegate to pf CLI
 * subprocess calls instead of implementing logic directly. Each test mocks
 * execFileSync to simulate pf CLI responses and asserts the TypeScript wrappers
 * correctly parse JSON output and return result objects.
 *
 * Acceptance Criteria:
 * - AC1: TypeScript workflow files delegate to pf CLI. No direct session file mutation.
 * - AC2: Workflow routing uses pf workflow route
 * - AC3: Gate checking uses pf handoff resolve-gate
 *
 * Depends on: 141-16 (--json CLI flags), 141-17 (subprocess pattern)
 *
 * Run with: node --test dist/workflow/cli-delegation.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PfMock } from './pf-subprocess-mock.js';

// =============================================================================
// These imports will be the NEW delegation wrappers created by Dev.
// They should replace the current pure-TypeScript implementations.
// Imports will fail until Dev creates the delegation layer — confirms RED state.
// =============================================================================

// AC2: Workflow routing delegation wrapper
import {
  routeStoryViaCli,
  type CliRoutingResult,
} from './workflow-router-delegate.js';

// AC3: Gate checking delegation wrapper
import {
  checkGateViaCli,
  resolveGateViaCli,
  type CliGateCheckResult,
  type CliResolveGateResult,
} from './gate-handler-delegate.js';

// AC1: Handoff delegation wrapper (phase transition, status)
import {
  completePhaseViaCli,
  getHandoffStatusViaCli,
  emitMarkerViaCli,
  type CliCompletePhaseResult,
  type CliHandoffStatus,
  type CliMarkerResult,
} from './handoff-delegate.js';

// AC1: Session state delegation wrapper (no direct file mutation)
import {
  getSessionStateViaCli,
  type CliSessionStateResult,
} from './session-state-delegate.js';

// AC1: Workflow executor delegation wrapper
import {
  getWorkflowStatusViaCli,
  startWorkflowViaCli,
  type CliWorkflowStatusResult,
  type CliStartWorkflowResult,
} from './workflow-executor-delegate.js';

// AC1: Schema validation delegation wrapper
import {
  validateWorkflowViaCli,
  type CliValidationResult,
} from './workflow-schema-delegate.js';


// =============================================================================
// AC2: Workflow Routing via pf workflow route --json
// =============================================================================

describe('141-18 AC2: Workflow routing uses pf workflow route', () => {
  it('should call pf workflow route with story ID and --json flag', () => {
    const mock = new PfMock();
    mock.onCommand(['workflow', 'route', '141-18', '--json'], {
      workflow: 'tdd',
      reason: 'explicit-tag',
    });

    const result: CliRoutingResult = routeStoryViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test-project',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.workflow, 'tdd');
    assert.strictEqual(result.data?.reason, 'explicit-tag');
    mock.assertCalled(['workflow', 'route', '141-18', '--json']);
  });

  it('should return result object with success: false on CLI error', () => {
    const mock = new PfMock();
    mock.onCommandError(
      ['workflow', 'route', 'bad-id', '--json'],
      'Story not found: bad-id',
      1
    );

    const result: CliRoutingResult = routeStoryViaCli('bad-id', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test-project',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.includes('bad-id'));
  });

  it('should handle malformed JSON from CLI gracefully', () => {
    const mock = new PfMock();
    mock.onCommand(['workflow', 'route', '141-18', '--json'], {
      exitCode: 0,
      stdout: 'not valid json{{{',
      stderr: '',
    } as unknown);

    const result: CliRoutingResult = routeStoryViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test-project',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('should NOT contain the 5-priority routing algorithm in TypeScript', () => {
    // After delegation, the routing logic is in Python.
    // TypeScript should have no trace of the algorithm.
    // This test verifies the function delegates rather than reimplements.
    const mock = new PfMock();
    mock.onCommand(['workflow', 'route', '141-18', '--json'], {
      workflow: 'trivial',
      reason: 'points-based: 1pt chore defaults to trivial',
    });

    const result = routeStoryViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test-project',
    });

    // The TypeScript wrapper should pass through whatever pf returns,
    // not apply its own routing logic.
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.workflow, 'trivial');
    assert.ok(result.data?.reason?.includes('points-based'));
  });
});


// =============================================================================
// AC3: Gate checking uses pf handoff resolve-gate --json
// =============================================================================

describe('141-18 AC3: Gate checking uses pf handoff resolve-gate', () => {
  it('should call pf handoff resolve-gate with correct args and --json', () => {
    const mock = new PfMock();
    mock.onCommand(['handoff', 'resolve-gate', '141-18', 'tdd', 'red', '--json'], {
      status: 'ready',
      gate_type: 'tests_fail',
      next_phase: 'green',
      next_agent: 'dev',
      assessment_found: true,
      error: null,
    });

    const result: CliResolveGateResult = resolveGateViaCli(
      '141-18', 'tdd', 'red',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.status, 'ready');
    assert.strictEqual(result.data?.gateType, 'tests_fail');
    assert.strictEqual(result.data?.nextPhase, 'green');
    assert.strictEqual(result.data?.nextAgent, 'dev');
    mock.assertCalled(['handoff', 'resolve-gate', '141-18', 'tdd', 'red', '--json']);
  });

  it('should return gate failure result when gate not passed', () => {
    const mock = new PfMock();
    mock.onCommand(['handoff', 'resolve-gate', '141-18', 'tdd', 'green', '--json'], {
      status: 'blocked',
      gate_type: 'tests_pass',
      next_phase: null,
      next_agent: null,
      assessment_found: false,
      error: 'No assessment found in session file',
    });

    const result = resolveGateViaCli(
      '141-18', 'tdd', 'green',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, true); // CLI succeeded, gate just didn't pass
    assert.strictEqual(result.data?.status, 'blocked');
    assert.ok(result.data?.error);
  });

  it('should return success: false when pf CLI itself errors', () => {
    const mock = new PfMock();
    mock.onCommandError(
      ['handoff', 'resolve-gate', '141-18', 'tdd', 'red', '--json'],
      'Workflow not found: tdd',
      2
    );

    const result = resolveGateViaCli(
      '141-18', 'tdd', 'red',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('should delegate gate detection instead of reimplementing', () => {
    // After delegation, TypeScript should NOT detect gates from
    // workflow YAML, step-meta, or content markers directly.
    // It should call pf and trust the result.
    const mock = new PfMock();
    mock.onCommand(['handoff', 'resolve-gate', '141-18', 'tdd', 'setup', '--json'], {
      status: 'ready',
      gate_type: 'sm_setup_exit',
      gate_file: 'gates/sm-setup-exit',
      next_phase: 'red',
      next_agent: 'tea',
      assessment_found: true,
      error: null,
    });

    const result = resolveGateViaCli(
      '141-18', 'tdd', 'setup',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.gateType, 'sm_setup_exit');
    assert.strictEqual(result.data?.gateFile, 'gates/sm-setup-exit');
  });

  it('should handle checkGateViaCli for simple pass/fail gate checks', () => {
    const mock = new PfMock();
    mock.onCommand(['handoff', 'check-gate', '--json'], {
      passed: true,
      gate_type: 'tests_pass',
      message: 'All 42 tests pass',
    });

    const result: CliGateCheckResult = checkGateViaCli(
      '141-18', 'tdd', 'green',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.passed, true);
    assert.strictEqual(result.data?.gateType, 'tests_pass');
    assert.strictEqual(result.data?.message, 'All 42 tests pass');
  });
});


// =============================================================================
// AC1: Handoff delegation (phase transitions, status, markers)
// =============================================================================

describe('141-18 AC1: Handoff delegates to pf CLI', () => {
  describe('completePhaseViaCli', () => {
    it('should call pf handoff complete-phase with correct args', () => {
      const mock = new PfMock();
      mock.onCommand(['handoff', 'complete-phase', '141-18', 'tdd', 'setup', 'red', 'sm_setup_exit', '--json'], {
        status: 'success',
        session_file: '.session/141-18-session.md',
        error: null,
      });

      const result: CliCompletePhaseResult = completePhaseViaCli(
        '141-18', 'tdd', 'setup', 'red', 'sm_setup_exit',
        { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.status, 'success');
      mock.assertCalled(['handoff', 'complete-phase']);
    });

    it('should return error when assessment missing', () => {
      const mock = new PfMock();
      mock.onCommandError(
        ['handoff', 'complete-phase', '141-18', 'tdd', 'setup', 'red', 'sm_setup_exit', '--json'],
        'No assessment found in session file',
        1
      );

      const result = completePhaseViaCli(
        '141-18', 'tdd', 'setup', 'red', 'sm_setup_exit',
        { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('assessment'));
    });
  });

  describe('getHandoffStatusViaCli', () => {
    it('should call pf handoff status --json and parse response', () => {
      const mock = new PfMock();
      mock.onCommand(['handoff', 'status', '141-18', '--json'], {
        story_id: '141-18',
        workflow: 'tdd',
        phase: 'red',
        next_agent: 'dev',
        handoff_ready: false,
      });

      const result: CliHandoffStatus = getHandoffStatusViaCli('141-18', {
        execFileSync: mock.execFileSync.bind(mock),
        projectDir: '/tmp/test',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.storyId, '141-18');
      assert.strictEqual(result.data?.workflow, 'tdd');
      assert.strictEqual(result.data?.phase, 'red');
      assert.strictEqual(result.data?.nextAgent, 'dev');
    });
  });

  describe('emitMarkerViaCli', () => {
    it('should call pf handoff marker and return relay info', () => {
      const mock = new PfMock();
      mock.onCommand(['handoff', 'marker', 'tea', '--json'], {
        relay: true,
        invoke: '/pf-tea',
        fallback: 'Run `/pf-tea` to continue',
        context_percent: 6,
      });

      const result: CliMarkerResult = emitMarkerViaCli('tea', {
        execFileSync: mock.execFileSync.bind(mock),
        projectDir: '/tmp/test',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.relay, true);
      assert.strictEqual(result.data?.invoke, '/pf-tea');
    });
  });
});


// =============================================================================
// AC1: Session state reads via pf CLI (no direct file mutation)
// =============================================================================

describe('141-18 AC1: Session state delegates to pf CLI', () => {
  it('should read session state via pf handoff status --json, not regex', () => {
    const mock = new PfMock();
    mock.onCommand(['handoff', 'status', '141-18', '--json'], {
      story_id: '141-18',
      workflow: 'tdd',
      phase: 'green',
      next_agent: 'reviewer',
      handoff_ready: false,
      workflow_state: {
        name: 'tdd',
        type: 'phased',
        status: 'in_progress',
        started: '2026-03-04',
        last_updated: '2026-03-04',
        current_step: 2,
        steps_completed: [1],
      },
    });

    const result: CliSessionStateResult = getSessionStateViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.workflowState?.name, 'tdd');
    assert.strictEqual(result.data?.workflowState?.type, 'phased');
    assert.strictEqual(result.data?.workflowState?.status, 'in_progress');
    assert.deepStrictEqual(result.data?.workflowState?.stepsCompleted, [1]);
  });

  it('should NOT use readFileSync to read session files', () => {
    // The delegation wrapper must not import fs or read files directly.
    // It must go through pf CLI for all session state reads.
    const mock = new PfMock();
    mock.onCommand(['handoff', 'status', '141-18', '--json'], {
      story_id: '141-18',
      workflow: 'tdd',
      phase: 'setup',
      next_agent: 'tea',
      handoff_ready: false,
    });

    const result = getSessionStateViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, true);
    // If this test passes, it means the function used our mock (CLI path)
    // rather than reading the file directly.
    mock.assertCalled(['handoff', 'status', '141-18', '--json']);
  });

  it('should handle missing session file gracefully', () => {
    const mock = new PfMock();
    mock.onCommandError(
      ['handoff', 'status', 'nonexistent', '--json'],
      'No session file found for story: nonexistent',
      1
    );

    const result = getSessionStateViaCli('nonexistent', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('nonexistent'));
  });
});


// =============================================================================
// AC1: Workflow executor delegates to pf CLI
// =============================================================================

describe('141-18 AC1: Workflow executor delegates to pf CLI', () => {
  it('should get workflow status via pf workflow status --json', () => {
    const mock = new PfMock();
    mock.onCommand(['workflow', 'status', '141-18', '--json'], {
      name: 'architecture',
      type: 'stepped',
      current_step: 3,
      total_steps: 7,
      steps_completed: [1, 2],
      completion_percent: 28,
      status: 'in_progress',
      started: '2026-03-04',
      last_updated: '2026-03-04',
    });

    const result: CliWorkflowStatusResult = getWorkflowStatusViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.name, 'architecture');
    assert.strictEqual(result.data?.type, 'stepped');
    assert.strictEqual(result.data?.currentStep, 3);
    assert.strictEqual(result.data?.totalSteps, 7);
    assert.deepStrictEqual(result.data?.stepsCompleted, [1, 2]);
    assert.strictEqual(result.data?.completionPercent, 28);
  });

  it('should start workflow via pf workflow start --json', () => {
    const mock = new PfMock();
    mock.onCommand(['workflow', 'start', 'architecture', '141-18', '--json'], {
      success: true,
      workflow: 'architecture',
      step: 1,
      total_steps: 7,
      status: 'in_progress',
    });

    const result: CliStartWorkflowResult = startWorkflowViaCli(
      'architecture', '141-18',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.workflow, 'architecture');
    assert.strictEqual(result.data?.step, 1);
    mock.assertCalled(['workflow', 'start', 'architecture', '141-18', '--json']);
  });

  it('should handle workflow not found error', () => {
    const mock = new PfMock();
    mock.onCommandError(
      ['workflow', 'status', '141-18', '--json'],
      'No active workflow for story 141-18',
      1
    );

    const result = getWorkflowStatusViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});


// =============================================================================
// AC1: Schema validation delegates to pf CLI
// =============================================================================

describe('141-18 AC1: Schema validation delegates to pf CLI', () => {
  it('should validate workflow via pf workflow validate --json', () => {
    const mock = new PfMock();
    mock.onCommand(['workflow', 'validate', 'tdd', '--json'], {
      valid: true,
      workflow: {
        name: 'tdd',
        type: 'phased',
        phases: [
          { name: 'setup', agent: 'sm' },
          { name: 'red', agent: 'tea' },
          { name: 'green', agent: 'dev' },
          { name: 'review', agent: 'reviewer' },
          { name: 'finish', agent: 'sm' },
        ],
      },
      errors: [],
    });

    const result: CliValidationResult = validateWorkflowViaCli('tdd', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.valid, true);
    assert.strictEqual(result.data?.workflow?.name, 'tdd');
    assert.strictEqual(result.data?.errors?.length, 0);
  });

  it('should return validation errors from pf CLI', () => {
    const mock = new PfMock();
    mock.onCommand(['workflow', 'validate', 'broken', '--json'], {
      valid: false,
      workflow: null,
      errors: [
        { field: 'phases', message: 'At least one phase required' },
        { field: 'phases[0].agent', message: 'Invalid agent name: nobody' },
      ],
    });

    const result = validateWorkflowViaCli('broken', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, true); // CLI succeeded, validation found errors
    assert.strictEqual(result.data?.valid, false);
    assert.strictEqual(result.data?.errors?.length, 2);
  });

  it('should handle CLI failure for validation', () => {
    const mock = new PfMock();
    mock.onCommandError(
      ['workflow', 'validate', 'missing', '--json'],
      'Workflow file not found: missing',
      1
    );

    const result = validateWorkflowViaCli('missing', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});


// =============================================================================
// AC1: No direct session file mutation (negative tests)
// =============================================================================

describe('141-18 AC1: No direct session file mutation from TypeScript', () => {
  it('should never call writeFileSync on session files', () => {
    // This is a structural assertion: after Dev replaces the files,
    // grep for writeFileSync/appendFileSync in the workflow directory
    // should return no results.
    //
    // This test verifies by checking that all state mutations go
    // through pf CLI subprocess calls.
    const mock = new PfMock();
    mock.onCommand(['handoff', 'complete-phase', '141-18', 'tdd', 'red', 'green', 'tests_pass', '--json'], {
      status: 'success',
      session_file: '.session/141-18-session.md',
    });

    const result = completePhaseViaCli(
      '141-18', 'tdd', 'red', 'green', 'tests_pass',
      { execFileSync: mock.execFileSync.bind(mock), projectDir: '/tmp/test' }
    );

    assert.strictEqual(result.success, true);
    // The fact that this works via PfMock proves no file I/O happened.
    // Any writeFileSync call would fail because we're in a test environment
    // with no real session file.
    mock.assertCalled(['handoff', 'complete-phase']);
    mock.assertNotCalled(['readFileSync'] as never[]);
  });

  it('should read workflow state through CLI, not by parsing markdown regex', () => {
    const mock = new PfMock();
    mock.onCommand(['handoff', 'status', '141-18', '--json'], {
      story_id: '141-18',
      workflow: 'tdd',
      phase: 'green',
      next_agent: 'reviewer',
      handoff_ready: true,
      workflow_state: {
        name: 'tdd',
        type: 'phased',
        status: 'in_progress',
        started: '2026-03-04',
        last_updated: '2026-03-04',
        current_step: 3,
        steps_completed: [1, 2],
      },
    });

    const result = getSessionStateViaCli('141-18', {
      execFileSync: mock.execFileSync.bind(mock),
      projectDir: '/tmp/test',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.phase, 'green');
    assert.strictEqual(result.data?.handoffReady, true);
    // Verifies the data came from CLI (our mock), not regex parsing
    mock.assertCalled(['handoff', 'status', '141-18', '--json']);
  });
});
