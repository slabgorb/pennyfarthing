/**
 * Tests for Story 141-18: CLI Delegation Layer
 *
 * Verifies that workflow engine operations delegate to `pf` CLI
 * subprocess calls instead of implementing logic in TypeScript.
 *
 * Uses pf-mock.ts to intercept subprocess calls and verify correct
 * command invocations and response parsing.
 *
 * Test categories:
 * 1. routeWorkflow() - AC3: Workflow routing via pf workflow route
 * 2. resolveGate() - AC4: Gate checking via pf handoff resolve-gate
 * 3. getHandoffStatus() - AC2: Session reads via pf handoff status
 * 4. completePhase() - AC2: Phase transitions via pf handoff complete-phase
 * 5. emitMarker() - AC1: Handoff markers via pf handoff marker
 * 6. getWorkflowPhases() - AC1: Workflow status via pf workflow phases
 * 7. validateWorkflowDef() - AC1: Schema validation via pf workflow show
 * 8. Error handling - All functions return result objects on failure
 *
 * Run with: pnpm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createPfMock, type PfMock } from '../test-utils/pf-mock.js';
import {
  routeWorkflow,
  resolveGate,
  getHandoffStatus,
  completePhase,
  emitMarker,
  getWorkflowPhases,
  validateWorkflowDef,
  type RouteResult,
  type GateResult,
  type HandoffStatusResult,
  type PhaseCompleteResult,
  type MarkerResult,
  type WorkflowPhasesResult,
} from './cli-delegation.js';

const PROJECT_DIR = '/tmp/test-project';

describe('CLI Delegation Layer (Story 141-18)', () => {
  let pfMock: PfMock;

  beforeEach(() => {
    pfMock = createPfMock();
  });

  afterEach(() => {
    pfMock.restore();
  });

  // ===========================================================================
  // AC3: Workflow routing uses pf workflow route
  // ===========================================================================

  describe('routeWorkflow() — AC3', () => {
    it('should call pf workflow route with story ID and --json', () => {
      const mockResponse: RouteResult = {
        workflow: 'tdd',
        reason: "Matched type 'refactor' to workflow 'tdd'",
      };
      pfMock.register(['workflow', 'route', '141-18', '--json'], mockResponse);

      const result = routeWorkflow('141-18', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled(['workflow', 'route', '141-18', '--json']);
    });

    it('should return parsed route result with workflow and reason', () => {
      const mockResponse: RouteResult = {
        workflow: 'trivial',
        reason: 'Matched points 2 (range: 1-2) to workflow trivial',
      };
      pfMock.register(['workflow', 'route', '42-7', '--json'], mockResponse);

      const result = routeWorkflow('42-7', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data, mockResponse);
    });

    it('should return error result when pf command fails', () => {
      pfMock.registerError(['workflow', 'route', 'bad-id', '--json'], 1, 'Story not found');

      const result = routeWorkflow('bad-id', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should not implement routing algorithm locally (no explicit-tag/trigger-tag logic)', () => {
      // This test verifies delegation — the function MUST call pf, not compute locally
      pfMock.register(['workflow', 'route', '99-1', '--json'], {
        workflow: 'tdd',
        reason: 'default',
      });

      routeWorkflow('99-1', PROJECT_DIR);

      // The mock was called, proving delegation happened
      pfMock.assertCalled(['workflow', 'route', '99-1', '--json']);
      // If this function implemented routing locally, it would NOT call pf
      assert.strictEqual(pfMock.getCalls().length, 1, 'Should make exactly one pf call');
    });
  });

  // ===========================================================================
  // AC4: Gate checking uses pf handoff resolve-gate
  // ===========================================================================

  describe('resolveGate() — AC4', () => {
    it('should call pf handoff resolve-gate with correct args and --json', () => {
      const mockResponse: GateResult = {
        passed: true,
        gateType: 'tests_fail',
        nextPhase: 'green',
        nextAgent: 'dev',
      };
      pfMock.register(
        ['handoff', 'resolve-gate', '141-18', 'tdd', 'red', '--json'],
        mockResponse,
      );

      const result = resolveGate('141-18', 'tdd', 'red', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled(['handoff', 'resolve-gate', '141-18', 'tdd', 'red', '--json']);
    });

    it('should return gate result with passed status and gate type', () => {
      const mockResponse: GateResult = {
        passed: true,
        gateType: 'tests_pass',
        nextPhase: 'review',
        nextAgent: 'reviewer',
      };
      pfMock.register(
        ['handoff', 'resolve-gate', '105-1', 'tdd', 'green', '--json'],
        mockResponse,
      );

      const result = resolveGate('105-1', 'tdd', 'green', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.passed, true);
      assert.strictEqual(result.data?.gateType, 'tests_pass');
      assert.strictEqual(result.data?.nextPhase, 'review');
      assert.strictEqual(result.data?.nextAgent, 'reviewer');
    });

    it('should return gate failure result when gate check fails', () => {
      const mockResponse: GateResult = {
        passed: false,
        gateType: 'tests_fail',
        message: 'Tests must be failing (RED) to proceed',
      };
      pfMock.register(
        ['handoff', 'resolve-gate', '141-18', 'tdd', 'red', '--json'],
        mockResponse,
      );

      const result = resolveGate('141-18', 'tdd', 'red', PROJECT_DIR);

      assert.strictEqual(result.success, true); // CLI call succeeded
      assert.strictEqual(result.data?.passed, false); // But gate didn't pass
      assert.ok(result.data?.message);
    });

    it('should return error result when pf command exits non-zero', () => {
      pfMock.registerError(
        ['handoff', 'resolve-gate', 'bad', 'tdd', 'red', '--json'],
        1,
        'Session not found',
      );

      const result = resolveGate('bad', 'tdd', 'red', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should not implement gate detection logic locally (no GATE marker regex)', () => {
      pfMock.register(
        ['handoff', 'resolve-gate', '50-1', 'trivial', 'implement', '--json'],
        { passed: true, gateType: 'manual' },
      );

      resolveGate('50-1', 'trivial', 'implement', PROJECT_DIR);

      pfMock.assertCalled(['handoff', 'resolve-gate', '50-1', 'trivial', 'implement', '--json']);
      assert.strictEqual(pfMock.getCalls().length, 1);
    });
  });

  // ===========================================================================
  // AC2: No direct session file mutation — reads via pf handoff status
  // ===========================================================================

  describe('getHandoffStatus() — AC2', () => {
    it('should call pf handoff status --json', () => {
      const mockResponse: HandoffStatusResult = {
        storyId: '141-18',
        phase: 'red',
        workflow: 'tdd',
        gateType: 'tests_fail',
        nextPhase: 'green',
        nextAgent: 'dev',
        status: 'active',
      };
      pfMock.register(['handoff', 'status', '--json'], mockResponse);

      const result = getHandoffStatus(PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled(['handoff', 'status', '--json']);
    });

    it('should return full handoff status with all fields', () => {
      const mockResponse: HandoffStatusResult = {
        storyId: '105-1',
        phase: 'green',
        workflow: 'tdd',
        gateType: 'tests_pass',
        nextPhase: 'review',
        nextAgent: 'reviewer',
        status: 'active',
      };
      pfMock.register(['handoff', 'status', '--json'], mockResponse);

      const result = getHandoffStatus(PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.data, mockResponse);
    });

    it('should return error when no active session exists', () => {
      pfMock.registerError(['handoff', 'status', '--json'], 1, 'No active session');

      const result = getHandoffStatus(PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should not read session files directly (no readFileSync/FIELD_PATTERNS)', () => {
      // Verify the function delegates to pf, not direct file parsing
      pfMock.register(['handoff', 'status', '--json'], {
        storyId: '1-1',
        phase: 'setup',
        workflow: 'tdd',
        status: 'active',
      });

      getHandoffStatus(PROJECT_DIR);

      pfMock.assertCalled(['handoff', 'status', '--json']);
      assert.strictEqual(pfMock.getCalls().length, 1);
    });
  });

  // ===========================================================================
  // AC2: Phase transitions via pf handoff complete-phase
  // ===========================================================================

  describe('completePhase() — AC2', () => {
    it('should call pf handoff complete-phase with all required args', () => {
      const mockResponse: PhaseCompleteResult = {
        sessionFile: '.session/141-18-session.md',
        status: 'success',
      };
      pfMock.register(
        ['handoff', 'complete-phase', '141-18', 'tdd', 'red', 'green', 'tests_fail'],
        mockResponse,
      );

      const result = completePhase('141-18', 'tdd', 'red', 'green', 'tests_fail', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled([
        'handoff', 'complete-phase', '141-18', 'tdd', 'red', 'green', 'tests_fail',
      ]);
    });

    it('should return phase complete result', () => {
      const mockResponse: PhaseCompleteResult = {
        sessionFile: '.session/105-1-session.md',
        status: 'success',
      };
      pfMock.register(
        ['handoff', 'complete-phase', '105-1', 'tdd', 'green', 'review', 'tests_pass'],
        mockResponse,
      );

      const result = completePhase('105-1', 'tdd', 'green', 'review', 'tests_pass', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.status, 'success');
      assert.strictEqual(result.data?.sessionFile, '.session/105-1-session.md');
    });

    it('should return error when assessment is missing', () => {
      pfMock.registerError(
        ['handoff', 'complete-phase', '141-18', 'tdd', 'red', 'green', 'tests_fail'],
        1,
        'No assessment found in session file',
      );

      const result = completePhase('141-18', 'tdd', 'red', 'green', 'tests_fail', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('assessment'));
    });

    it('should not write to session files directly (no writeFileSync/updateSessionContent)', () => {
      pfMock.register(
        ['handoff', 'complete-phase', '1-1', 'trivial', 'implement', 'review', 'manual'],
        { sessionFile: '.session/1-1-session.md', status: 'success' },
      );

      completePhase('1-1', 'trivial', 'implement', 'review', 'manual', PROJECT_DIR);

      pfMock.assertCalled([
        'handoff', 'complete-phase', '1-1', 'trivial', 'implement', 'review', 'manual',
      ]);
      assert.strictEqual(pfMock.getCalls().length, 1);
    });
  });

  // ===========================================================================
  // AC1: Handoff markers via pf handoff marker
  // ===========================================================================

  describe('emitMarker() — AC1', () => {
    it('should call pf handoff marker with agent name', () => {
      const mockResponse: MarkerResult = {
        relay: true,
        invoke: '/pf-dev',
        fallback: 'Run `/pf-dev` to continue',
      };
      pfMock.register(['handoff', 'marker', 'dev'], mockResponse);

      const result = emitMarker('dev', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled(['handoff', 'marker', 'dev']);
    });

    it('should return marker result with relay flag and invoke command', () => {
      const mockResponse: MarkerResult = {
        relay: true,
        invoke: '/pf-tea',
        fallback: 'Run `/pf-tea` to continue',
        contextPercent: 10,
      };
      pfMock.register(['handoff', 'marker', 'tea'], mockResponse);

      const result = emitMarker('tea', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.relay, true);
      assert.strictEqual(result.data?.invoke, '/pf-tea');
      assert.strictEqual(result.data?.contextPercent, 10);
    });

    it('should handle non-relay marker (fallback only)', () => {
      const mockResponse: MarkerResult = {
        relay: false,
        invoke: '/pf-reviewer',
        fallback: 'Run `/pf-reviewer` to continue',
      };
      pfMock.register(['handoff', 'marker', 'reviewer'], mockResponse);

      const result = emitMarker('reviewer', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.relay, false);
    });

    it('should return error for invalid agent', () => {
      pfMock.registerError(['handoff', 'marker', 'nonexistent'], 1, 'Unknown agent');

      const result = emitMarker('nonexistent', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  // ===========================================================================
  // AC1: Workflow phases via pf workflow phases
  // ===========================================================================

  describe('getWorkflowPhases() — AC1', () => {
    it('should call pf workflow phases with workflow name and --json', () => {
      const mockResponse: WorkflowPhasesResult = {
        workflow: 'tdd',
        phases: [
          { name: 'setup', agent: 'sm', label: 'setup', status: 'done' },
          { name: 'red', agent: 'tea', label: 'red', status: 'current' },
          { name: 'green', agent: 'dev', label: 'green', status: 'pending' },
          { name: 'review', agent: 'reviewer', label: 'review', status: 'pending' },
          { name: 'finish', agent: 'sm', label: 'finish', status: 'pending' },
        ],
      };
      pfMock.register(['workflow', 'phases', 'tdd', '--json'], mockResponse);

      const result = getWorkflowPhases('tdd', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled(['workflow', 'phases', 'tdd', '--json']);
    });

    it('should return all phases with correct structure', () => {
      const mockResponse: WorkflowPhasesResult = {
        workflow: 'trivial',
        phases: [
          { name: 'setup', agent: 'sm', label: 'setup', status: 'done' },
          { name: 'implement', agent: 'dev', label: 'implement', status: 'current' },
          { name: 'review', agent: 'reviewer', label: 'review', status: 'pending' },
          { name: 'finish', agent: 'sm', label: 'finish', status: 'pending' },
        ],
      };
      pfMock.register(['workflow', 'phases', 'trivial', '--json'], mockResponse);

      const result = getWorkflowPhases('trivial', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.phases.length, 4);
      assert.strictEqual(result.data?.phases[1].agent, 'dev');
    });

    it('should return error for unknown workflow', () => {
      pfMock.registerError(['workflow', 'phases', 'nonexistent', '--json'], 1, 'Workflow not found');

      const result = getWorkflowPhases('nonexistent', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  // ===========================================================================
  // AC1: Schema validation via pf workflow show
  // ===========================================================================

  describe('validateWorkflowDef() — AC1', () => {
    it('should call pf workflow show with --json to validate', () => {
      pfMock.register(['workflow', 'show', 'tdd', '--json'], {
        valid: true,
      });

      const result = validateWorkflowDef('tdd', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      pfMock.assertCalled(['workflow', 'show', 'tdd', '--json']);
    });

    it('should return valid result for well-formed workflow', () => {
      pfMock.register(['workflow', 'show', 'tdd', '--json'], {
        valid: true,
      });

      const result = validateWorkflowDef('tdd', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.valid, true);
    });

    it('should return validation errors for malformed workflow', () => {
      pfMock.register(['workflow', 'show', 'broken', '--json'], {
        valid: false,
        errors: [
          { field: 'phases[0].agent', message: 'Agent field is required' },
        ],
      });

      const result = validateWorkflowDef('broken', PROJECT_DIR);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.valid, false);
      assert.strictEqual(result.data?.errors?.length, 1);
    });

    it('should return error for nonexistent workflow', () => {
      pfMock.registerError(
        ['workflow', 'show', 'nonexistent', '--json'],
        1,
        'Workflow not found',
      );

      const result = validateWorkflowDef('nonexistent', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  // ===========================================================================
  // Error handling: all functions return result objects
  // ===========================================================================

  describe('Error handling — result objects, never throw', () => {
    it('routeWorkflow returns result object on subprocess failure', () => {
      pfMock.registerError(['workflow', 'route', 'crash', '--json'], 127, 'pf not found');

      const result = routeWorkflow('crash', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(result.data, undefined);
    });

    it('resolveGate returns result object on subprocess failure', () => {
      pfMock.registerError(
        ['handoff', 'resolve-gate', 'crash', 'tdd', 'red', '--json'],
        127,
        'pf not found',
      );

      const result = resolveGate('crash', 'tdd', 'red', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('getHandoffStatus returns result object on subprocess failure', () => {
      pfMock.registerError(['handoff', 'status', '--json'], 127, 'pf not found');

      const result = getHandoffStatus(PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('completePhase returns result object on subprocess failure', () => {
      pfMock.registerError(
        ['handoff', 'complete-phase', 'c', 'tdd', 'red', 'green', 'tests_fail'],
        127,
        'pf not found',
      );

      const result = completePhase('c', 'tdd', 'red', 'green', 'tests_fail', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('emitMarker returns result object on subprocess failure', () => {
      pfMock.registerError(['handoff', 'marker', 'dev'], 127, 'pf not found');

      const result = emitMarker('dev', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('getWorkflowPhases returns result object on subprocess failure', () => {
      pfMock.registerError(['workflow', 'phases', 'tdd', '--json'], 127, 'pf not found');

      const result = getWorkflowPhases('tdd', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('validateWorkflowDef returns result object on subprocess failure', () => {
      pfMock.registerError(['workflow', 'show', 'tdd', '--json'], 127, 'pf not found');

      const result = validateWorkflowDef('tdd', PROJECT_DIR);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('no function throws — all return {success: false}', () => {
      // Register no mocks — all calls will get "no response registered" error
      // Functions must catch and return result objects
      assert.doesNotThrow(() => routeWorkflow('x', PROJECT_DIR));
      assert.doesNotThrow(() => resolveGate('x', 'tdd', 'red', PROJECT_DIR));
      assert.doesNotThrow(() => getHandoffStatus(PROJECT_DIR));
      assert.doesNotThrow(() => completePhase('x', 'tdd', 'a', 'b', 'c', PROJECT_DIR));
      assert.doesNotThrow(() => emitMarker('dev', PROJECT_DIR));
      assert.doesNotThrow(() => getWorkflowPhases('tdd', PROJECT_DIR));
      assert.doesNotThrow(() => validateWorkflowDef('tdd', PROJECT_DIR));
    });
  });
});
