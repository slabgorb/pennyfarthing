/**
 * Tests for Story 91-14: Workflow Graph Validation
 *
 * These tests validate the semantic/graph-level checks for workflow definitions,
 * going beyond the structural schema validation in workflow-schema.ts.
 *
 * Graph validation covers:
 * - Phase reachability (no orphan/unreachable phases)
 * - Duplicate phase name detection
 * - Agent reference validation (phase agents, tandem partners against known agents)
 * - Gate file existence (gate.file references resolve to known gate files)
 * - Data flow validation (input references match prior output declarations)
 * - Collaboration validation (tandem/team agent consistency)
 *
 * Run with: node --test dist/workflow/workflow-graph-validation.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateWorkflowGraph,
  type GraphValidationContext,
  type WorkflowGraphValidationResult,
} from './workflow-graph-validation.js';

import { VALID_AGENT_NAMES, type WorkflowDefinition } from './workflow-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid context with all known gate files */
function defaultContext(overrides?: Partial<GraphValidationContext>): GraphValidationContext {
  return {
    knownGateFiles: [
      'gates/sm-setup-exit',
      'gates/tests-fail',
      'gates/tests-pass',
      'gates/dev-exit',
      'gates/quality-pass',
      'gates/approval',
      'gates/design-review',
      'gates/merge-ready',
      'gates/release-ready',
      'gates/reviewer-preflight-check',
      'gates/confidence',
      'gates/context-ok',
    ],
    ...overrides,
  };
}

/** Build a minimal valid phased workflow for graph testing */
function minimalWorkflow(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    name: 'test-workflow',
    phases: [
      { name: 'setup', agent: 'sm' },
      { name: 'implement', agent: 'dev' },
      { name: 'review', agent: 'reviewer' },
    ],
    ...overrides,
  };
}

/** TDD workflow matching the real tdd.yaml */
function tddWorkflow(): WorkflowDefinition {
  return {
    name: 'tdd',
    phases: [
      {
        name: 'setup',
        agent: 'sm',
        output: ['session_file', 'branches', 'story_context'],
        gate: { file: 'gates/sm-setup-exit', type: 'sm_setup_exit' },
      },
      {
        name: 'red',
        agent: 'tea',
        input: ['session_file', 'story_context'],
        output: ['failing_tests'],
        gate: { file: 'gates/tests-fail', type: 'tests_fail' },
      },
      {
        name: 'green',
        agent: 'dev',
        input: ['failing_tests', 'story_context'],
        output: ['implementation', 'passing_tests'],
        gate: { file: 'gates/dev-exit', type: 'dev_exit' },
      },
      {
        name: 'verify',
        agent: 'tea',
        input: ['implementation', 'passing_tests'],
        output: ['quality_verified'],
        gate: { file: 'gates/quality-pass', type: 'quality_pass' },
      },
      {
        name: 'review',
        agent: 'reviewer',
        input: ['implementation', 'passing_tests', 'quality_verified'],
        output: ['approval'],
        gate: { file: 'gates/approval', type: 'approval' },
      },
      {
        name: 'finish',
        agent: 'sm',
        input: ['approval'],
        output: ['archived_session', 'story_summary'],
      },
    ],
  };
}

/** Helper to collect error messages from result */
function errorMessages(result: WorkflowGraphValidationResult): string[] {
  return (result.errors ?? []).map(e => e.message);
}

/** Helper to collect warning messages from result */
function warningMessages(result: WorkflowGraphValidationResult): string[] {
  return (result.warnings ?? []).map(w => w.message);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Workflow Graph Validation (91-14)', () => {

  // -------------------------------------------------------------------------
  // AC1: Phase reachability — no orphans, no unreachable states
  // -------------------------------------------------------------------------
  describe('Phase reachability', () => {

    it('should accept a linear workflow where all phases are reachable', () => {
      const wf = minimalWorkflow();
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true, 'Linear workflow should be fully reachable');
      assert.strictEqual((result.errors ?? []).length, 0);
    });

    it('should accept the full TDD workflow as reachable', () => {
      const wf = tddWorkflow();
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true, 'TDD workflow should be fully reachable');
    });

    it('should accept a single-phase workflow', () => {
      const wf = minimalWorkflow({
        phases: [{ name: 'work', agent: 'dev' }],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true, 'Single phase is trivially reachable');
    });

    it('should detect an unreachable phase when next: creates a bypass', () => {
      // setup -> implement (skipped via next:review) -> review
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm', next: 'review' },
          { name: 'implement', agent: 'dev' },
          { name: 'review', agent: 'reviewer' },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false, 'Unreachable phase should fail');
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('implement') && m.toLowerCase().includes('unreachable')),
        `Expected unreachable error for 'implement', got: ${msgs.join('; ')}`,
      );
    });

    it('should accept non-linear routing via next: when all phases remain reachable', () => {
      // setup -> red, red -> green, green -> review (next:review skips verify), verify also reached via review -> verify
      // Actually let's use a simpler case: a -> b -> c, a also has next:c but b is still reachable
      // because the default sequential flow reaches b before next: kicks in
      // Wait — need to think about this. If a has next:c, does b get visited?
      //
      // The convention: `next:` overrides the default sequential progression.
      // If phase[0].next = 'c', then the flow goes 0 -> c, skipping b.
      // So b IS unreachable.
      //
      // For all phases to remain reachable with next:, we need explicit next: chains:
      // a (next:c) -> c (next:b) -> b
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm', next: 'review' },
          { name: 'implement', agent: 'dev' },
          { name: 'review', agent: 'reviewer', next: 'implement' },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true, 'All phases reachable via next: chain');
    });

    it('should detect cycle that leaves trailing phases unreachable', () => {
      // a -> b -> a (cycle), c is unreachable
      const wf = minimalWorkflow({
        phases: [
          { name: 'a', agent: 'sm', next: 'b' },
          { name: 'b', agent: 'dev', next: 'a' },
          { name: 'c', agent: 'reviewer' },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('c') && m.toLowerCase().includes('unreachable')),
        `Expected unreachable error for 'c', got: ${msgs.join('; ')}`,
      );
    });

    it('should handle workflows without phases (stepped) gracefully', () => {
      const wf: WorkflowDefinition = {
        name: 'stepped-wf',
        type: 'stepped',
        steps: { path: 'workflows/steps', pattern: 'step-{nn}-*.md' },
      };
      const result = validateWorkflowGraph(wf, defaultContext());
      // Stepped workflows skip phase reachability (no phases to check)
      assert.strictEqual(result.valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // AC1 continued: Duplicate phase names
  // -------------------------------------------------------------------------
  describe('Duplicate phase names', () => {

    it('should accept a workflow with unique phase names', () => {
      const wf = tddWorkflow();
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should detect duplicate phase names', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm' },
          { name: 'work', agent: 'dev' },
          { name: 'setup', agent: 'reviewer' }, // duplicate
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('setup') && m.toLowerCase().includes('duplicate')),
        `Expected duplicate phase name error, got: ${msgs.join('; ')}`,
      );
    });

    it('should report all duplicates, not just the first', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'a', agent: 'sm' },
          { name: 'b', agent: 'dev' },
          { name: 'a', agent: 'tea' },    // dup of a
          { name: 'b', agent: 'reviewer' }, // dup of b
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes("'a'")), 'Should report duplicate a');
      assert.ok(msgs.some(m => m.includes("'b'")), 'Should report duplicate b');
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Dangling agent references
  // -------------------------------------------------------------------------
  describe('Agent reference validation', () => {

    it('should accept a workflow where all phase agents are known', () => {
      const wf = tddWorkflow();
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should detect an unknown phase agent', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm' },
          { name: 'work', agent: 'nonexistent-agent' },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('nonexistent-agent')),
        `Expected unknown agent error, got: ${msgs.join('; ')}`,
      );
    });

    it('should detect an unknown tandem partner', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm' },
          {
            name: 'implement',
            agent: 'dev',
            tandem: { partner: 'ghost-agent', scope: 'file-watch' },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('ghost-agent') && m.toLowerCase().includes('tandem')),
        `Expected unknown tandem partner error, got: ${msgs.join('; ')}`,
      );
    });

    it('should accept all valid agent names as phase agents', () => {
      // Each VALID_AGENT_NAME should be accepted
      for (const agent of VALID_AGENT_NAMES) {
        const wf = minimalWorkflow({
          phases: [{ name: 'work', agent }],
        });
        const result = validateWorkflowGraph(wf, defaultContext());
        assert.strictEqual(
          result.valid, true,
          `Agent '${agent}' should be accepted`,
        );
      }
    });

    it('should accept a custom knownAgents list', () => {
      const wf = minimalWorkflow({
        phases: [{ name: 'work', agent: 'custom-agent' }],
      });
      const ctx = defaultContext({ knownAgents: ['custom-agent'] });
      const result = validateWorkflowGraph(wf, ctx);
      assert.strictEqual(result.valid, true, 'Custom agent should be accepted via context');
    });

    it('should detect unknown team teammate agents', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm' },
          {
            name: 'work',
            agent: 'dev',
            team: {
              teammates: [
                { agent: 'fake-agent', task: 'Help implement' },
              ],
            },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('fake-agent') && m.toLowerCase().includes('team')),
        `Expected unknown team agent error, got: ${msgs.join('; ')}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Gate file existence
  // -------------------------------------------------------------------------
  describe('Gate file validation', () => {

    it('should accept a workflow where all gate files are known', () => {
      const wf = tddWorkflow();
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should detect a gate file that does not exist', () => {
      const wf = minimalWorkflow({
        phases: [
          {
            name: 'setup',
            agent: 'sm',
            gate: { file: 'gates/nonexistent-gate', type: 'manual' },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('nonexistent-gate') && m.toLowerCase().includes('gate')),
        `Expected unknown gate file error, got: ${msgs.join('; ')}`,
      );
    });

    it('should skip gate file check for phases without gates', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'work', agent: 'dev' }, // no gate
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should skip gate file check for gates with type only (no file)', () => {
      const wf = minimalWorkflow({
        phases: [
          {
            name: 'work',
            agent: 'dev',
            gate: { type: 'manual' }, // type only, no file
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should detect multiple missing gate files', () => {
      const wf = minimalWorkflow({
        phases: [
          {
            name: 'a',
            agent: 'sm',
            gate: { file: 'gates/missing-one' },
          },
          {
            name: 'b',
            agent: 'dev',
            gate: { file: 'gates/missing-two' },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('missing-one')), 'Should report first missing gate');
      assert.ok(msgs.some(m => m.includes('missing-two')), 'Should report second missing gate');
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Collaboration validation (tandem + team)
  // -------------------------------------------------------------------------
  describe('Collaboration validation', () => {

    it('should accept valid tandem configuration', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm' },
          {
            name: 'red',
            agent: 'tea',
            tandem: { partner: 'architect', scope: 'file-watch' },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should accept valid team configuration', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm' },
          {
            name: 'work',
            agent: 'dev',
            team: {
              teammates: [
                { agent: 'tea', task: 'Verify tests' },
              ],
            },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should warn when tandem partner is the same as phase agent', () => {
      const wf = minimalWorkflow({
        phases: [
          {
            name: 'work',
            agent: 'dev',
            tandem: { partner: 'dev' }, // same as phase agent
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      // This is a warning, not an error — unusual but maybe intentional
      const warns = warningMessages(result);
      assert.ok(
        warns.some(m => m.toLowerCase().includes('same') || m.toLowerCase().includes('self')),
        `Expected warning about self-tandem, got: ${warns.join('; ')}`,
      );
    });

    it('should error when team teammate is the same as phase agent (lead)', () => {
      const wf = minimalWorkflow({
        phases: [
          {
            name: 'work',
            agent: 'dev',
            team: {
              teammates: [
                { agent: 'dev', task: 'Help myself' }, // same as lead
              ],
            },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.toLowerCase().includes('lead') || m.toLowerCase().includes('same')),
        `Expected error about teammate same as lead, got: ${msgs.join('; ')}`,
      );
    });

    it('should detect duplicate teammates in a team', () => {
      const wf = minimalWorkflow({
        phases: [
          {
            name: 'work',
            agent: 'dev',
            team: {
              teammates: [
                { agent: 'tea', task: 'Run tests' },
                { agent: 'tea', task: 'Also run tests' }, // duplicate
              ],
            },
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('tea') && m.toLowerCase().includes('duplicate')),
        `Expected duplicate teammate error, got: ${msgs.join('; ')}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Data flow validation (input/output wiring)
  // -------------------------------------------------------------------------
  describe('Data flow validation', () => {

    it('should accept TDD workflow with correct data flow', () => {
      const wf = tddWorkflow();
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
      assert.strictEqual((result.warnings ?? []).length, 0, 'No warnings for correct data flow');
    });

    it('should warn when a phase input is not produced by any prior phase output', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm', output: ['session_file'] },
          {
            name: 'work',
            agent: 'dev',
            input: ['session_file', 'magic_data'], // magic_data not produced
          },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      // Unresolved inputs are warnings (advisory), not errors
      const warns = warningMessages(result);
      assert.ok(
        warns.some(m => m.includes('magic_data')),
        `Expected warning about unresolved input 'magic_data', got: ${warns.join('; ')}`,
      );
    });

    it('should not warn when inputs come from earlier phases', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'setup', agent: 'sm', output: ['session_file', 'branches'] },
          { name: 'work', agent: 'dev', input: ['session_file'] },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual((result.warnings ?? []).length, 0, 'All inputs resolved');
    });

    it('should not warn for phases without inputs or outputs', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'a', agent: 'sm' },
          { name: 'b', agent: 'dev' },
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
      assert.strictEqual((result.warnings ?? []).length, 0);
    });

    it('should warn for multiple unresolved inputs across phases', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'a', agent: 'sm', output: ['x'] },
          { name: 'b', agent: 'dev', input: ['x', 'y'] },    // y unresolved
          { name: 'c', agent: 'reviewer', input: ['x', 'z'] }, // z unresolved
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      const warns = warningMessages(result);
      assert.ok(warns.some(m => m.includes('y')), 'Should warn about unresolved y');
      assert.ok(warns.some(m => m.includes('z')), 'Should warn about unresolved z');
    });
  });

  // -------------------------------------------------------------------------
  // AC6: Integration — validate real workflow files
  // -------------------------------------------------------------------------
  describe('Integration with real workflow structures', () => {

    it('should validate the tdd-tandem workflow graph', () => {
      const wf: WorkflowDefinition = {
        name: 'tdd-tandem',
        phases: [
          {
            name: 'setup',
            agent: 'sm',
            output: ['session_file', 'branches', 'story_context'],
            gate: { file: 'gates/sm-setup-exit', type: 'sm_setup_exit' },
          },
          {
            name: 'red',
            agent: 'tea',
            input: ['session_file', 'story_context'],
            output: ['failing_tests'],
            gate: { file: 'gates/tests-fail', type: 'tests_fail' },
            tandem: { partner: 'architect', scope: 'file-watch' },
          },
          {
            name: 'green',
            agent: 'dev',
            input: ['failing_tests', 'story_context'],
            output: ['implementation', 'passing_tests'],
            gate: { file: 'gates/dev-exit', type: 'dev_exit' },
            tandem: { partner: 'architect', scope: 'file-watch' },
          },
          {
            name: 'review',
            agent: 'reviewer',
            input: ['implementation', 'passing_tests'],
            output: ['approval'],
            gate: { file: 'gates/approval', type: 'approval' },
            tandem: { partner: 'pm', scope: 'file-watch' },
          },
          {
            name: 'finish',
            agent: 'sm',
            input: ['approval'],
            output: ['archived_session', 'story_summary'],
          },
        ],
      };

      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true, 'tdd-tandem should have valid graph');
    });

    it('should validate the bdd-team workflow graph', () => {
      const wf: WorkflowDefinition = {
        name: 'bdd-team',
        phases: [
          {
            name: 'setup',
            agent: 'sm',
            output: ['session_file', 'branches', 'story_context'],
          },
          {
            name: 'design',
            agent: 'ux-designer',
            input: ['session_file', 'story_context'],
            output: ['design_spec', 'user_flows', 'wireframes', 'behavior_scenarios'],
            gate: { file: 'gates/design-review', type: 'design_review' },
            team: {
              teammates: [
                { agent: 'architect', task: 'Validate technical feasibility' },
              ],
            },
          },
          {
            name: 'red',
            agent: 'tea',
            input: ['design_spec', 'behavior_scenarios', 'story_context'],
            output: ['failing_tests'],
            gate: { file: 'gates/tests-fail', type: 'tests_fail' },
          },
          {
            name: 'green',
            agent: 'dev',
            input: ['failing_tests', 'design_spec', 'story_context'],
            output: ['implementation', 'passing_tests'],
            gate: { file: 'gates/tests-pass', type: 'tests_pass' },
            team: {
              teammates: [{ agent: 'tea', task: 'Verify tests stay green' }],
            },
          },
          {
            name: 'review',
            agent: 'reviewer',
            input: ['implementation', 'passing_tests', 'design_spec'],
            output: ['approval'],
            gate: { file: 'gates/approval', type: 'approval' },
          },
          {
            name: 'finish',
            agent: 'sm',
            input: ['approval'],
            output: ['archived_session', 'story_summary'],
          },
        ],
      };

      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true, 'bdd-team should have valid graph');
    });

    it('should detect a malformed workflow with multiple graph issues', () => {
      const wf: WorkflowDefinition = {
        name: 'broken',
        phases: [
          {
            name: 'setup',
            agent: 'sm',
            next: 'review', // skips implement → implement unreachable
          },
          {
            name: 'implement',
            agent: 'invalid-agent', // unknown agent
            gate: { file: 'gates/does-not-exist' }, // missing gate file
          },
          {
            name: 'review',
            agent: 'reviewer',
            tandem: { partner: 'nobody' }, // unknown tandem partner
            input: ['phantom_data'], // unresolved input
          },
        ],
      };

      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false, 'Workflow with multiple issues should fail');

      const msgs = errorMessages(result);
      // Should catch: unreachable phase, unknown agent, missing gate, unknown tandem
      assert.ok(msgs.length >= 3, `Expected at least 3 errors, got ${msgs.length}: ${msgs.join('; ')}`);
      assert.ok(msgs.some(m => m.includes('implement') && m.toLowerCase().includes('unreachable')));
      assert.ok(msgs.some(m => m.includes('invalid-agent')));
      assert.ok(msgs.some(m => m.includes('nobody')));
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('Edge cases', () => {

    it('should handle undefined phases gracefully', () => {
      const wf: WorkflowDefinition = { name: 'no-phases' };
      const result = validateWorkflowGraph(wf, defaultContext());
      // No phases = nothing to validate graph-wise
      assert.strictEqual(result.valid, true);
    });

    it('should handle empty phases array', () => {
      const wf: WorkflowDefinition = { name: 'empty', phases: [] };
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, true);
    });

    it('should handle empty knownGateFiles list', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'work', agent: 'dev', gate: { file: 'gates/approval' } },
        ],
      });
      const ctx = defaultContext({ knownGateFiles: [] });
      const result = validateWorkflowGraph(wf, ctx);
      assert.strictEqual(result.valid, false, 'Gate file should fail against empty known list');
    });

    it('should validate gate file paths case-sensitively', () => {
      const wf = minimalWorkflow({
        phases: [
          { name: 'work', agent: 'dev', gate: { file: 'gates/Approval' } }, // wrong case
        ],
      });
      const result = validateWorkflowGraph(wf, defaultContext());
      assert.strictEqual(result.valid, false, 'Gate file check should be case-sensitive');
    });
  });
});
