/**
 * Tests for Story 31-7: Workflow-Driven Handoff Subagent
 *
 * These tests define the contract for the handoff module that
 * replaces 5 hardcoded handoff files (sm-handoff, tea-handoff, dev-handoff,
 * reviewer-handoff-approve, reviewer-handoff-reject).
 *
 * The handoff module reads phase requirements from workflow definitions
 * and performs gate checks based on phase gate type.
 *
 * Test categories:
 * 1. findCurrentPhase() - Locate phase by name in workflow
 * 2. getNextPhase() - Determine next phase (forward or rejection loop)
 * 3. checkGate() - Run gate-specific checks
 * 4. formatPhaseTransition() - Format session file updates
 * 5. Integration - Full handoff scenarios with TDD/trivial workflows
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import types from existing modules
import type { WorkflowDefinition } from './workflow-schema.js';

// Import the handoff functions
import {
  findCurrentPhase,
  getNextPhase,
  checkGate,
  formatPhaseTransition,
  calculateDuration
} from './handoff.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_handoff__');

// Helper to find monorepo root for integration tests
function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pennyfarthing-dist'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find monorepo root from ${startDir}`);
}

// Test fixture: TDD workflow definition
const TDD_WORKFLOW: WorkflowDefinition = {
  name: 'tdd',
  description: 'Test-driven development with code review',
  version: '1.0.0',
  phases: [
    { name: 'setup', agent: 'sm', output: ['session_file', 'branches', 'story_context'] },
    {
      name: 'red',
      agent: 'tea',
      input: ['session_file', 'story_context'],
      output: ['failing_tests'],
      gate: { type: 'tests_fail', condition: 'All acceptance criteria have test coverage' }
    },
    {
      name: 'green',
      agent: 'dev',
      input: ['failing_tests', 'story_context'],
      output: ['implementation', 'passing_tests'],
      gate: { type: 'tests_pass', condition: 'All tests passing, no skipped tests' }
    },
    {
      name: 'review',
      agent: 'reviewer',
      input: ['implementation', 'passing_tests'],
      output: ['approval'],
      gate: { type: 'approval', condition: 'Code review approved, no blocking issues' }
    },
    {
      name: 'finish',
      agent: 'sm',
      input: ['approval'],
      output: ['archived_session', 'story_summary']
    }
  ],
  triggers: { types: ['feature', 'enhancement'], points: { min: 3 }, default: true }
};

// Test fixture: Trivial workflow definition
const TRIVIAL_WORKFLOW: WorkflowDefinition = {
  name: 'trivial',
  description: 'Quick fixes without full TDD ceremony',
  version: '1.0.0',
  phases: [
    { name: 'setup', agent: 'sm', output: ['session_file', 'branches'] },
    {
      name: 'implement',
      agent: 'dev',
      input: ['session_file'],
      output: ['implementation'],
      gate: { type: 'tests_pass', condition: 'Existing tests still pass' }
    },
    {
      name: 'review',
      agent: 'reviewer',
      input: ['implementation'],
      output: ['approval'],
      gate: { type: 'approval' }
    },
    {
      name: 'finish',
      agent: 'sm',
      input: ['approval'],
      output: ['archived_session']
    }
  ],
  triggers: { types: ['chore', 'fix', 'refactor'], points: { max: 2 } }
};

describe('Generic Handoff (31-7)', () => {

  // Setup/teardown for test fixtures
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('findCurrentPhase() - Locate phase by name', () => {

    it('should find phase by exact name match', () => {
      // AC: Reads gate type from workflow
      const phase = findCurrentPhase(TDD_WORKFLOW, 'red');

      assert.ok(phase, 'Should find the red phase');
      assert.strictEqual(phase.name, 'red');
      assert.strictEqual(phase.agent, 'tea');
      assert.strictEqual(phase.gate?.type, 'tests_fail');
    });

    it('should find setup phase (no gate)', () => {
      const phase = findCurrentPhase(TDD_WORKFLOW, 'setup');

      assert.ok(phase, 'Should find setup phase');
      assert.strictEqual(phase.name, 'setup');
      assert.strictEqual(phase.agent, 'sm');
      assert.strictEqual(phase.gate, undefined, 'Setup should have no gate');
    });

    it('should return null for non-existent phase', () => {
      const phase = findCurrentPhase(TDD_WORKFLOW, 'nonexistent');

      assert.strictEqual(phase, null, 'Should return null for unknown phase');
    });

    it('should find phase in trivial workflow', () => {
      const phase = findCurrentPhase(TRIVIAL_WORKFLOW, 'implement');

      assert.ok(phase, 'Should find implement phase');
      assert.strictEqual(phase.agent, 'dev');
      assert.strictEqual(phase.gate?.type, 'tests_pass');
    });

    it('should be case-sensitive', () => {
      const phase = findCurrentPhase(TDD_WORKFLOW, 'RED');

      assert.strictEqual(phase, null, 'Phase names are case-sensitive');
    });
  });

  describe('getNextPhase() - Determine next phase', () => {

    it('should return next phase in sequence for forward progression', () => {
      // AC: Determines next agent from workflow phases array
      const next = getNextPhase(TDD_WORKFLOW, 'setup');

      assert.ok(next, 'Should find next phase');
      assert.strictEqual(next.name, 'red');
      assert.strictEqual(next.agent, 'tea');
    });

    it('should return next phase from red to green', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'red');

      assert.ok(next, 'Should find next phase');
      assert.strictEqual(next.name, 'green');
      assert.strictEqual(next.agent, 'dev');
    });

    it('should return next phase from green to review', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'green');

      assert.ok(next, 'Should find next phase');
      assert.strictEqual(next.name, 'review');
      assert.strictEqual(next.agent, 'reviewer');
    });

    it('should return finish phase from review (when approved)', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'review');

      assert.ok(next, 'Should find next phase');
      assert.strictEqual(next.name, 'finish');
      assert.strictEqual(next.agent, 'sm');
    });

    it('should return null when at final phase', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'finish');

      assert.strictEqual(next, null, 'No next phase after finish');
    });

    it('should return null for non-existent current phase', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'nonexistent');

      assert.strictEqual(next, null, 'No next phase for unknown phase');
    });

    it('should handle rejection loop back to dev phase', () => {
      // AC: Handles rejection flows (Reviewer → Dev loop)
      const next = getNextPhase(TDD_WORKFLOW, 'review', { verdict: 'rejected' });

      assert.ok(next, 'Should find phase to loop back to');
      assert.strictEqual(next.name, 'green', 'Should loop back to green (dev) phase');
      assert.strictEqual(next.agent, 'dev');
    });

    it('should proceed forward on approval', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'review', { verdict: 'approved' });

      assert.ok(next, 'Should find next phase');
      assert.strictEqual(next.name, 'finish');
    });

    it('should handle trivial workflow progression', () => {
      // Trivial: setup → implement → review → finish
      const next1 = getNextPhase(TRIVIAL_WORKFLOW, 'setup');
      assert.strictEqual(next1?.name, 'implement');

      const next2 = getNextPhase(TRIVIAL_WORKFLOW, 'implement');
      assert.strictEqual(next2?.name, 'review');

      const next3 = getNextPhase(TRIVIAL_WORKFLOW, 'review');
      assert.strictEqual(next3?.name, 'finish');
    });

    it('should find correct loop-back phase in trivial workflow on rejection', () => {
      // In trivial, rejection from review should go back to implement
      const next = getNextPhase(TRIVIAL_WORKFLOW, 'review', { verdict: 'rejected' });

      assert.ok(next, 'Should find phase to loop back to');
      assert.strictEqual(next.name, 'implement', 'Should loop back to implement phase');
    });
  });

  describe('checkGate() - Run gate-specific checks', () => {

    it('should pass gate for phase with no gate defined', () => {
      // Setup phase has no gate
      const result = checkGate(TDD_WORKFLOW, 'setup', {});

      assert.strictEqual(result.passed, true, 'Phase with no gate should pass');
      assert.strictEqual(result.gateType, undefined);
    });

    it('should identify tests_fail gate type', () => {
      // AC: Reads gate type from workflow
      const result = checkGate(TDD_WORKFLOW, 'red', {});

      assert.strictEqual(result.gateType, 'tests_fail');
      // The actual pass/fail depends on context provided
    });

    it('should identify tests_pass gate type', () => {
      const result = checkGate(TDD_WORKFLOW, 'green', {});

      assert.strictEqual(result.gateType, 'tests_pass');
    });

    it('should identify approval gate type', () => {
      const result = checkGate(TDD_WORKFLOW, 'review', {});

      assert.strictEqual(result.gateType, 'approval');
    });

    it('should pass tests_fail gate when tests are failing', () => {
      // AC: Runs gate-specific checks (tests_fail → verify RED)
      const result = checkGate(TDD_WORKFLOW, 'red', {
        testsRed: true,
        testFailCount: 3
      });

      assert.strictEqual(result.passed, true, 'Should pass when tests are RED');
      assert.strictEqual(result.gateType, 'tests_fail');
    });

    it('should fail tests_fail gate when tests are passing', () => {
      const result = checkGate(TDD_WORKFLOW, 'red', {
        testsRed: false,
        testFailCount: 0
      });

      assert.strictEqual(result.passed, false, 'Should fail when tests are GREEN (not RED)');
      assert.ok(result.message, 'Should have failure message');
    });

    it('should pass tests_pass gate when all tests pass', () => {
      // AC: Runs gate-specific checks (tests_pass → verify GREEN)
      const result = checkGate(TDD_WORKFLOW, 'green', {
        testsGreen: true,
        testPassCount: 15,
        testFailCount: 0
      });

      assert.strictEqual(result.passed, true, 'Should pass when tests are GREEN');
    });

    it('should fail tests_pass gate when tests are failing', () => {
      const result = checkGate(TDD_WORKFLOW, 'green', {
        testsGreen: false,
        testPassCount: 12,
        testFailCount: 3
      });

      assert.strictEqual(result.passed, false, 'Should fail when tests are RED');
      assert.ok(result.message, 'Should have failure message');
    });

    it('should pass approval gate when verdict is approved', () => {
      // AC: Runs gate-specific checks (approval → verify Assessment)
      const result = checkGate(TDD_WORKFLOW, 'review', {
        verdict: 'approved'
      });

      assert.strictEqual(result.passed, true, 'Should pass when approved');
    });

    it('should pass approval gate when verdict is rejected (rejection is valid outcome)', () => {
      // Rejection is not a failure - it's a valid routing decision
      const result = checkGate(TDD_WORKFLOW, 'review', {
        verdict: 'rejected'
      });

      assert.strictEqual(result.passed, true, 'Rejection is a valid gate outcome');
    });

    it('should fail approval gate when no verdict provided', () => {
      const result = checkGate(TDD_WORKFLOW, 'review', {});

      assert.strictEqual(result.passed, false, 'Should fail without verdict');
      assert.ok(result.message, 'Should have message about missing verdict');
    });

    it('should handle manual gate type (always pass)', () => {
      // Create a workflow with manual gate
      const manualWorkflow: WorkflowDefinition = {
        name: 'manual-test',
        phases: [
          { name: 'work', agent: 'dev', gate: { type: 'manual' } }
        ]
      };

      const result = checkGate(manualWorkflow, 'work', {});

      assert.strictEqual(result.passed, true, 'Manual gate should always pass');
      assert.strictEqual(result.gateType, 'manual');
    });

    it('should return error for non-existent phase', () => {
      const result = checkGate(TDD_WORKFLOW, 'nonexistent', {});

      assert.strictEqual(result.passed, false);
      assert.ok(result.message?.includes('not found'), 'Should indicate phase not found');
    });

    // Story 108-2: Unknown gate types should fail, not silently pass
    it('should fail for unknown gate type (108-2: remove inline fallback)', () => {
      // AC4: After removing the gate.type fallback, unknown gate types must
      // return passed=false instead of silently treating them as manual gates.
      // This ensures only recognized gate types (tests_fail, tests_pass,
      // approval, manual) are accepted — single code path enforcement.
      const unknownGateWorkflow: WorkflowDefinition = {
        name: 'unknown-gate-test',
        phases: [
          { name: 'work', agent: 'dev', gate: { type: 'nonexistent_gate_type' } }
        ]
      };

      const result = checkGate(unknownGateWorkflow, 'work', {});

      assert.strictEqual(
        result.passed,
        false,
        'Unknown gate type should fail — not silently pass as manual'
      );
      assert.ok(
        result.message,
        'Should provide error message for unknown gate type'
      );
    });
  });

  describe('formatPhaseTransition() - Format session file updates', () => {

    it('should format workflow tracking section correctly', () => {
      // AC: Updates session file workflow section with phase transition
      const result = formatPhaseTransition({
        workflowName: 'tdd',
        fromPhase: 'red',
        toPhase: 'green',
        startedAt: '2026-01-13T14:00:00Z',
        endedAt: '2026-01-13T14:30:00Z'
      });

      assert.ok(result.includes('**Workflow:** tdd'), 'Should include workflow name');
      assert.ok(result.includes('**Phase:** green'), 'Should include new phase');
      assert.ok(result.includes('**Phase Started:**'), 'Should include phase started');
    });

    it('should include phase history table row', () => {
      // AC: Records phase transitions with timestamps
      const result = formatPhaseTransition({
        workflowName: 'tdd',
        fromPhase: 'red',
        toPhase: 'green',
        startedAt: '2026-01-13T14:00:00Z',
        endedAt: '2026-01-13T14:30:00Z'
      });

      // Should have markdown table row for the completed phase
      assert.ok(result.includes('| red |'), 'Should have row for from-phase');
      assert.ok(result.includes('2026-01-13T14:00:00Z'), 'Should have start time');
      assert.ok(result.includes('2026-01-13T14:30:00Z'), 'Should have end time');
    });

    it('should handle first phase transition (from setup)', () => {
      const result = formatPhaseTransition({
        workflowName: 'tdd',
        fromPhase: 'setup',
        toPhase: 'red',
        startedAt: '2026-01-13T13:00:00Z',
        endedAt: '2026-01-13T13:15:00Z'
      });

      assert.ok(result.includes('**Phase:** red'));
      assert.ok(result.includes('| setup |'));
    });

    it('should handle rejection loop transition', () => {
      // When going from review back to green (rejection)
      const result = formatPhaseTransition({
        workflowName: 'tdd',
        fromPhase: 'review',
        toPhase: 'green',
        startedAt: '2026-01-13T15:00:00Z',
        endedAt: '2026-01-13T15:30:00Z',
        isRejection: true
      });

      assert.ok(result.includes('**Phase:** green'), 'Should show dev phase');
      assert.ok(result.includes('| review |'), 'Should record review phase completion');
    });
  });

  describe('calculateDuration() - Format duration strings', () => {

    it('should format duration as minutes for short durations', () => {
      // AC: Records phase transitions with timestamps (duration calculation)
      const duration = calculateDuration(
        '2026-01-13T14:00:00Z',
        '2026-01-13T14:30:00Z'
      );

      assert.strictEqual(duration, '30m', 'Should format as 30 minutes');
    });

    it('should format duration as hours and minutes for longer durations', () => {
      const duration = calculateDuration(
        '2026-01-13T14:00:00Z',
        '2026-01-13T16:30:00Z'
      );

      assert.strictEqual(duration, '2h 30m', 'Should format as 2 hours 30 minutes');
    });

    it('should format sub-minute durations', () => {
      const duration = calculateDuration(
        '2026-01-13T14:00:00Z',
        '2026-01-13T14:00:45Z'
      );

      // Either "45s" or "1m" is acceptable
      assert.ok(
        duration === '45s' || duration === '1m' || duration === '0m',
        `Duration should be short: ${duration}`
      );
    });

    it('should handle same start and end time', () => {
      const duration = calculateDuration(
        '2026-01-13T14:00:00Z',
        '2026-01-13T14:00:00Z'
      );

      assert.ok(duration === '0m' || duration === '0s', 'Zero duration should format correctly');
    });

    it('should handle invalid timestamps gracefully', () => {
      const duration = calculateDuration('invalid', '2026-01-13T14:00:00Z');

      assert.ok(duration, 'Should return some value even for invalid input');
    });
  });

  describe('Integration: Full handoff scenarios', () => {

    it('should complete TDD workflow transition: setup → red', () => {
      // AC: Backward compatible with existing TDD flow
      const currentPhase = findCurrentPhase(TDD_WORKFLOW, 'setup');
      const nextPhase = getNextPhase(TDD_WORKFLOW, 'setup');
      const gateResult = checkGate(TDD_WORKFLOW, 'setup', {});

      assert.ok(currentPhase, 'Should find setup phase');
      assert.strictEqual(gateResult.passed, true, 'Setup has no gate');
      assert.strictEqual(nextPhase?.name, 'red');
      assert.strictEqual(nextPhase?.agent, 'tea');
    });

    it('should complete TDD workflow transition: red → green', () => {
      const gateResult = checkGate(TDD_WORKFLOW, 'red', {
        testsRed: true,
        testFailCount: 5
      });
      const nextPhase = getNextPhase(TDD_WORKFLOW, 'red');

      assert.strictEqual(gateResult.passed, true, 'Gate should pass with failing tests');
      assert.strictEqual(nextPhase?.name, 'green');
      assert.strictEqual(nextPhase?.agent, 'dev');
    });

    it('should complete TDD workflow transition: green → review', () => {
      const gateResult = checkGate(TDD_WORKFLOW, 'green', {
        testsGreen: true,
        testPassCount: 20,
        testFailCount: 0
      });
      const nextPhase = getNextPhase(TDD_WORKFLOW, 'green');

      assert.strictEqual(gateResult.passed, true, 'Gate should pass with passing tests');
      assert.strictEqual(nextPhase?.name, 'review');
      assert.strictEqual(nextPhase?.agent, 'reviewer');
    });

    it('should complete TDD workflow transition: review → finish (approved)', () => {
      const gateResult = checkGate(TDD_WORKFLOW, 'review', { verdict: 'approved' });
      const nextPhase = getNextPhase(TDD_WORKFLOW, 'review', { verdict: 'approved' });

      assert.strictEqual(gateResult.passed, true);
      assert.strictEqual(nextPhase?.name, 'finish');
      assert.strictEqual(nextPhase?.agent, 'sm');
    });

    it('should complete TDD workflow rejection loop: review → green', () => {
      const gateResult = checkGate(TDD_WORKFLOW, 'review', { verdict: 'rejected' });
      const nextPhase = getNextPhase(TDD_WORKFLOW, 'review', { verdict: 'rejected' });

      assert.strictEqual(gateResult.passed, true, 'Rejection is valid outcome');
      assert.strictEqual(nextPhase?.name, 'green', 'Should loop back to dev');
      assert.strictEqual(nextPhase?.agent, 'dev');
    });

    it('should complete trivial workflow: setup → implement → review → finish', () => {
      // AC: Works with both TDD and trivial workflows

      // setup → implement
      let gateResult = checkGate(TRIVIAL_WORKFLOW, 'setup', {});
      let nextPhase = getNextPhase(TRIVIAL_WORKFLOW, 'setup');
      assert.strictEqual(gateResult.passed, true);
      assert.strictEqual(nextPhase?.name, 'implement');

      // implement → review
      gateResult = checkGate(TRIVIAL_WORKFLOW, 'implement', {
        testsGreen: true,
        testPassCount: 10,
        testFailCount: 0
      });
      nextPhase = getNextPhase(TRIVIAL_WORKFLOW, 'implement');
      assert.strictEqual(gateResult.passed, true);
      assert.strictEqual(nextPhase?.name, 'review');

      // review → finish
      gateResult = checkGate(TRIVIAL_WORKFLOW, 'review', { verdict: 'approved' });
      nextPhase = getNextPhase(TRIVIAL_WORKFLOW, 'review', { verdict: 'approved' });
      assert.strictEqual(gateResult.passed, true);
      assert.strictEqual(nextPhase?.name, 'finish');
    });

    it('should block progression when gate fails', () => {
      // Dev tries to hand off but tests are still failing
      const gateResult = checkGate(TDD_WORKFLOW, 'green', {
        testsGreen: false,
        testPassCount: 15,
        testFailCount: 5
      });

      assert.strictEqual(gateResult.passed, false, 'Should block when tests failing');
      assert.ok(gateResult.message, 'Should explain why blocked');
    });
  });

  describe('Integration with real workflow files', () => {

    it('should work with loaded tdd.yaml workflow', async () => {
      // AC: Backward compatible with existing TDD flow
      const root = findMonorepoRoot(__dirname);
      const { loadWorkflowFile } = await import('./workflow-loader.js');
      const tddPath = join(root, 'pennyfarthing-dist', 'workflows', 'tdd.yaml');

      const loadResult = loadWorkflowFile(tddPath);
      assert.strictEqual(loadResult.success, true, 'tdd.yaml should load successfully');

      const workflow = loadResult.workflow!;

      // Test phase lookup
      const redPhase = findCurrentPhase(workflow, 'red');
      assert.ok(redPhase, 'Should find red phase in loaded workflow');
      assert.strictEqual(redPhase.agent, 'tea');

      // Test progression
      const nextPhase = getNextPhase(workflow, 'red');
      assert.ok(nextPhase, 'Should find next phase');
      assert.strictEqual(nextPhase.name, 'green');
    });

    it('should work with loaded trivial.yaml workflow', async () => {
      const root = findMonorepoRoot(__dirname);
      const { loadWorkflowFile } = await import('./workflow-loader.js');
      const trivialPath = join(root, 'pennyfarthing-dist', 'workflows', 'trivial.yaml');

      const loadResult = loadWorkflowFile(trivialPath);
      assert.strictEqual(loadResult.success, true, 'trivial.yaml should load successfully');

      const workflow = loadResult.workflow!;

      // Trivial skips TEA, goes setup → implement
      const nextPhase = getNextPhase(workflow, 'setup');
      assert.ok(nextPhase, 'Should find next phase');
      assert.strictEqual(nextPhase.name, 'implement');
      assert.strictEqual(nextPhase.agent, 'dev');
    });
  });
});
