/**
 * Tests for Story 91-15: Cross-Entity Reference Validation
 *
 * Layer 4 validation — semantic cross-references between agents, workflows,
 * commands, and skills. Builds on Layers 0-3 (formatting, file refs, schema, graph).
 *
 * Run with: node --test dist/workflow/cross-entity-validation.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCrossEntityRefs,
  type CrossEntityContext,
  type CrossEntityValidationResult,
} from './cross-entity-validation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid context with typical agents, workflows, commands, skills */
function defaultContext(overrides?: Partial<CrossEntityContext>): CrossEntityContext {
  return {
    knownAgentFiles: ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm'],
    knownWorkflowNames: ['tdd', 'trivial', 'bdd', 'tdd-tandem'],
    knownCommandFiles: ['pf-sprint', 'pf-dev', 'pf-tea', 'pf-reviewer', 'pf-sm'],
    knownSkillNames: ['pf-sprint', 'pf-testing', 'pf-jira', 'pf-code-review'],
    workflowAgentRefs: [
      { workflow: 'tdd', referencedAgents: ['sm', 'tea', 'dev', 'reviewer'] },
      { workflow: 'trivial', referencedAgents: ['sm', 'dev', 'reviewer'] },
    ],
    agentWorkflowRefs: [
      { agent: 'sm', referencedWorkflows: ['tdd', 'trivial'] },
      { agent: 'tea', referencedWorkflows: ['tdd'] },
      { agent: 'dev', referencedWorkflows: ['tdd', 'trivial'] },
      { agent: 'reviewer', referencedWorkflows: ['tdd', 'trivial'] },
    ],
    skillEntityRefs: [
      { skill: 'pf-sprint', relatedSkills: ['pf-jira'] },
      { skill: 'pf-testing', relatedSkills: ['pf-code-review'] },
      { skill: 'pf-jira', relatedSkills: ['pf-sprint'] },
      { skill: 'pf-code-review', relatedSkills: ['pf-testing'] },
    ],
    commandSkillRefs: [
      { command: 'pf-sprint', referencedSkills: ['pf-sprint'] },
      { command: 'pf-dev', referencedSkills: ['pf-testing'] },
    ],
    ...overrides,
  };
}

/** Helper to collect error messages from result */
function errorMessages(result: CrossEntityValidationResult): string[] {
  return (result.errors ?? []).map(e => e.message);
}

/** Helper to collect warning messages from result */
function warningMessages(result: CrossEntityValidationResult): string[] {
  return (result.warnings ?? []).map(w => w.message);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Cross-Entity Reference Validation (91-15)', () => {

  // -------------------------------------------------------------------------
  // AC1: Validate that agents referenced in workflows exist
  // -------------------------------------------------------------------------
  describe('AC1: Agents referenced in workflows exist', () => {

    it('should accept when all workflow-referenced agents have agent files', () => {
      const ctx = defaultContext();
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true, 'All agents exist — should be valid');
      assert.strictEqual((result.errors ?? []).length, 0, 'No errors expected');
    });

    it('should error when workflow references an agent with no agent file', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'tea', 'ghost-agent', 'reviewer'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Missing agent file should fail');
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('ghost-agent') && m.includes('tdd')),
        `Expected error about 'ghost-agent' in workflow 'tdd', got: ${msgs.join('; ')}`,
      );
    });

    it('should report all missing agents across multiple workflows', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'phantom'] },
          { workflow: 'trivial', referencedAgents: ['missing-dev', 'reviewer'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('phantom')), 'Should report phantom');
      assert.ok(msgs.some(m => m.includes('missing-dev')), 'Should report missing-dev');
    });

    it('should error for each distinct missing agent in a workflow', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'broken', referencedAgents: ['nobody', 'also-nobody'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('nobody')), 'Should report nobody');
      assert.ok(msgs.some(m => m.includes('also-nobody')), 'Should report also-nobody');
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Validate that workflows referenced in agents are properly defined
  // -------------------------------------------------------------------------
  describe('AC2: Workflows referenced in agents are properly defined', () => {

    it('should accept when all agent-referenced workflows exist', () => {
      const ctx = defaultContext();
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true, 'All workflows exist — should be valid');
    });

    it('should error when agent references a workflow that does not exist', () => {
      const ctx = defaultContext({
        agentWorkflowRefs: [
          { agent: 'dev', referencedWorkflows: ['tdd', 'nonexistent-workflow'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Missing workflow should fail');
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('nonexistent-workflow') && m.includes('dev')),
        `Expected error about 'nonexistent-workflow' referenced by 'dev', got: ${msgs.join('; ')}`,
      );
    });

    it('should report multiple missing workflow references across agents', () => {
      const ctx = defaultContext({
        agentWorkflowRefs: [
          { agent: 'sm', referencedWorkflows: ['tdd', 'missing-wf-1'] },
          { agent: 'tea', referencedWorkflows: ['missing-wf-2'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('missing-wf-1')), 'Should report missing-wf-1');
      assert.ok(msgs.some(m => m.includes('missing-wf-2')), 'Should report missing-wf-2');
    });

    it('should accept agents with empty workflow references', () => {
      const ctx = defaultContext({
        agentWorkflowRefs: [
          { agent: 'orchestrator', referencedWorkflows: [] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      // An agent that doesn't reference any workflows is fine
      assert.strictEqual(result.valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Validate that commands referenced in skills exist
  // (skills' related_skills references exist in the skill registry)
  // -------------------------------------------------------------------------
  describe('AC3: Skill related_skills references exist', () => {

    it('should accept when all related_skills references point to known skills', () => {
      const ctx = defaultContext();
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true);
    });

    it('should error when a skill references a nonexistent related_skill', () => {
      const ctx = defaultContext({
        skillEntityRefs: [
          { skill: 'pf-sprint', relatedSkills: ['pf-jira', 'pf-nonexistent'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Missing related skill should fail');
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('pf-nonexistent') && m.includes('pf-sprint')),
        `Expected error about 'pf-nonexistent' referenced by 'pf-sprint', got: ${msgs.join('; ')}`,
      );
    });

    it('should report all broken related_skill references', () => {
      const ctx = defaultContext({
        skillEntityRefs: [
          { skill: 'pf-sprint', relatedSkills: ['ghost-skill-1'] },
          { skill: 'pf-testing', relatedSkills: ['ghost-skill-2'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('ghost-skill-1')), 'Should report ghost-skill-1');
      assert.ok(msgs.some(m => m.includes('ghost-skill-2')), 'Should report ghost-skill-2');
    });

    it('should accept skills with empty related_skills', () => {
      const ctx = defaultContext({
        skillEntityRefs: [
          { skill: 'pf-cyclist', relatedSkills: [] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true);
    });

    it('should not allow a skill to list itself as related', () => {
      const ctx = defaultContext({
        skillEntityRefs: [
          { skill: 'pf-sprint', relatedSkills: ['pf-sprint'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      // Self-reference is an error or warning
      const msgs = errorMessages(result);
      const warns = warningMessages(result);
      const allMsgs = [...msgs, ...warns];
      assert.ok(
        allMsgs.some(m => m.includes('pf-sprint') && (m.includes('self') || m.includes('itself'))),
        `Expected self-reference flagged for 'pf-sprint', got: ${allMsgs.join('; ')}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Validate that skills referenced in command definitions exist
  // -------------------------------------------------------------------------
  describe('AC4: Skills referenced in commands exist', () => {

    it('should accept when all command-referenced skills exist', () => {
      const ctx = defaultContext();
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true);
    });

    it('should error when command references a nonexistent skill', () => {
      const ctx = defaultContext({
        commandSkillRefs: [
          { command: 'pf-sprint', referencedSkills: ['pf-sprint', 'pf-ghost-skill'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Missing skill reference should fail');
      const msgs = errorMessages(result);
      assert.ok(
        msgs.some(m => m.includes('pf-ghost-skill') && m.includes('pf-sprint')),
        `Expected error about 'pf-ghost-skill' in command 'pf-sprint', got: ${msgs.join('; ')}`,
      );
    });

    it('should report all missing skill references across commands', () => {
      const ctx = defaultContext({
        commandSkillRefs: [
          { command: 'pf-dev', referencedSkills: ['missing-skill-a'] },
          { command: 'pf-tea', referencedSkills: ['missing-skill-b'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false);
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('missing-skill-a')), 'Should report missing-skill-a');
      assert.ok(msgs.some(m => m.includes('missing-skill-b')), 'Should report missing-skill-b');
    });

    it('should accept commands with no skill references', () => {
      const ctx = defaultContext({
        commandSkillRefs: [
          { command: 'pf-help', referencedSkills: [] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Bidirectional consistency of all references
  // -------------------------------------------------------------------------
  describe('AC5: Bidirectional consistency', () => {

    it('should accept fully bidirectional references', () => {
      // TDD references sm, and sm references tdd — both directions match
      const ctx = defaultContext();
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true);
      assert.strictEqual((result.warnings ?? []).length, 0, 'No warnings for bidirectional match');
    });

    it('should warn when workflow references agent but agent does not reference that workflow', () => {
      const ctx = defaultContext({
        // tdd references architect, but architect doesn't claim tdd
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'tea', 'dev', 'reviewer', 'architect'] },
        ],
        agentWorkflowRefs: [
          { agent: 'sm', referencedWorkflows: ['tdd'] },
          { agent: 'tea', referencedWorkflows: ['tdd'] },
          { agent: 'dev', referencedWorkflows: ['tdd'] },
          { agent: 'reviewer', referencedWorkflows: ['tdd'] },
          { agent: 'architect', referencedWorkflows: [] }, // doesn't claim tdd
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      // This is a warning (advisory), not an error
      const warns = warningMessages(result);
      assert.ok(
        warns.some(m => m.includes('architect') && m.includes('tdd')),
        `Expected warning about architect not referencing tdd, got: ${warns.join('; ')}`,
      );
    });

    it('should warn when agent references workflow but workflow does not use that agent', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'tea', 'dev', 'reviewer'] },
        ],
        agentWorkflowRefs: [
          // pm claims to participate in tdd, but tdd doesn't reference pm
          { agent: 'pm', referencedWorkflows: ['tdd'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      const warns = warningMessages(result);
      assert.ok(
        warns.some(m => m.includes('pm') && m.includes('tdd')),
        `Expected warning about pm claiming tdd but not used, got: ${warns.join('; ')}`,
      );
    });

    it('should warn for asymmetric related_skills (A lists B but B does not list A)', () => {
      const ctx = defaultContext({
        skillEntityRefs: [
          { skill: 'pf-sprint', relatedSkills: ['pf-jira'] },
          { skill: 'pf-jira', relatedSkills: [] }, // doesn't list pf-sprint back
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      const warns = warningMessages(result);
      assert.ok(
        warns.some(m => m.includes('pf-sprint') && m.includes('pf-jira')),
        `Expected asymmetric related_skills warning, got: ${warns.join('; ')}`,
      );
    });

    it('should not warn when related_skills are fully symmetric', () => {
      const ctx = defaultContext({
        skillEntityRefs: [
          { skill: 'pf-sprint', relatedSkills: ['pf-jira'] },
          { skill: 'pf-jira', relatedSkills: ['pf-sprint'] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual((result.warnings ?? []).length, 0, 'Symmetric refs = no warnings');
    });

    it('should detect multiple bidirectional inconsistencies', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'architect'] },
          { workflow: 'bdd', referencedAgents: ['sm', 'pm'] },
        ],
        agentWorkflowRefs: [
          { agent: 'sm', referencedWorkflows: ['tdd', 'bdd'] },
          { agent: 'architect', referencedWorkflows: [] },  // missing tdd
          { agent: 'pm', referencedWorkflows: [] },          // missing bdd
        ],
        skillEntityRefs: [
          { skill: 'pf-testing', relatedSkills: ['pf-code-review'] },
          { skill: 'pf-code-review', relatedSkills: [] }, // asymmetric
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      const warns = warningMessages(result);
      // Should have warnings for architect↔tdd, pm↔bdd, and pf-testing↔pf-code-review
      assert.ok(warns.length >= 3, `Expected at least 3 warnings, got ${warns.length}: ${warns.join('; ')}`);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('Edge cases', () => {

    it('should handle empty context gracefully', () => {
      const ctx: CrossEntityContext = {
        knownAgentFiles: [],
        knownWorkflowNames: [],
        knownCommandFiles: [],
        knownSkillNames: [],
        workflowAgentRefs: [],
        agentWorkflowRefs: [],
        skillEntityRefs: [],
        commandSkillRefs: [],
      };
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true, 'Empty context has nothing to validate');
    });

    it('should handle context with only agents and no workflows', () => {
      const ctx: CrossEntityContext = {
        knownAgentFiles: ['sm', 'dev'],
        knownWorkflowNames: [],
        knownCommandFiles: [],
        knownSkillNames: [],
        workflowAgentRefs: [],
        agentWorkflowRefs: [],
        skillEntityRefs: [],
        commandSkillRefs: [],
      };
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true, 'Agents alone, no cross-refs to break');
    });

    it('should treat agent file names case-sensitively', () => {
      const ctx = defaultContext({
        knownAgentFiles: ['sm', 'dev'],
        workflowAgentRefs: [
          { workflow: 'test', referencedAgents: ['SM'] }, // wrong case
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Agent name matching should be case-sensitive');
      const msgs = errorMessages(result);
      assert.ok(msgs.some(m => m.includes('SM')), 'Should report case-sensitive mismatch');
    });

    it('should treat skill names case-sensitively', () => {
      const ctx = defaultContext({
        knownSkillNames: ['pf-sprint'],
        skillEntityRefs: [
          { skill: 'pf-testing', relatedSkills: ['PF-Sprint'] }, // wrong case
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Skill name matching should be case-sensitive');
    });

    it('should handle workflows that reference no agents', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'empty-workflow', referencedAgents: [] },
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      // A workflow with no agent refs is valid (maybe it's a stepped workflow)
      assert.strictEqual(result.valid, true);
    });

    it('should handle a mixed scenario with both errors and warnings', () => {
      const ctx = defaultContext({
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'ghost'] }, // ghost = error
        ],
        agentWorkflowRefs: [
          { agent: 'sm', referencedWorkflows: ['tdd'] },
          { agent: 'pm', referencedWorkflows: ['tdd'] }, // pm not in tdd = warning
        ],
      });
      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Should fail due to missing agent error');
      const msgs = errorMessages(result);
      const warns = warningMessages(result);
      assert.ok(msgs.length > 0, 'Should have errors');
      assert.ok(warns.length > 0, 'Should have warnings');
      assert.ok(msgs.some(m => m.includes('ghost')), 'Should error on ghost agent');
      assert.ok(warns.some(m => m.includes('pm')), 'Should warn on pm bidirectional mismatch');
    });
  });

  // -------------------------------------------------------------------------
  // Integration: realistic scenario
  // -------------------------------------------------------------------------
  describe('Integration with realistic data', () => {

    it('should validate a realistic pennyfarthing-like context successfully', () => {
      const ctx: CrossEntityContext = {
        knownAgentFiles: [
          'sm', 'tea', 'dev', 'reviewer', 'architect', 'pm',
          'tech-writer', 'ux-designer', 'devops', 'ba', 'orchestrator',
          'sm-setup', 'sm-finish', 'testing-runner', 'reviewer-preflight',
        ],
        knownWorkflowNames: [
          'tdd', 'tdd-tandem', 'trivial', 'bdd', 'bdd-tandem', 'agent-docs', 'patch',
        ],
        knownCommandFiles: [
          'pf-sprint', 'pf-dev', 'pf-tea', 'pf-sm', 'pf-reviewer',
          'pf-architect', 'pf-pm', 'pf-workflow',
        ],
        knownSkillNames: [
          'pf-sprint', 'pf-testing', 'pf-jira', 'pf-code-review',
          'pf-workflow', 'pf-theme', 'pf-just',
        ],
        workflowAgentRefs: [
          { workflow: 'tdd', referencedAgents: ['sm', 'tea', 'dev', 'reviewer'] },
          { workflow: 'trivial', referencedAgents: ['sm', 'dev', 'reviewer'] },
          { workflow: 'bdd', referencedAgents: ['sm', 'ux-designer', 'tea', 'dev', 'reviewer'] },
          { workflow: 'agent-docs', referencedAgents: ['sm', 'orchestrator', 'tech-writer'] },
        ],
        agentWorkflowRefs: [
          { agent: 'sm', referencedWorkflows: ['tdd', 'trivial', 'bdd', 'agent-docs'] },
          { agent: 'tea', referencedWorkflows: ['tdd', 'bdd'] },
          { agent: 'dev', referencedWorkflows: ['tdd', 'trivial', 'bdd'] },
          { agent: 'reviewer', referencedWorkflows: ['tdd', 'trivial', 'bdd'] },
          { agent: 'ux-designer', referencedWorkflows: ['bdd'] },
          { agent: 'orchestrator', referencedWorkflows: ['agent-docs'] },
          { agent: 'tech-writer', referencedWorkflows: ['agent-docs'] },
        ],
        skillEntityRefs: [
          { skill: 'pf-sprint', relatedSkills: ['pf-jira'] },
          { skill: 'pf-jira', relatedSkills: ['pf-sprint'] },
          { skill: 'pf-testing', relatedSkills: ['pf-code-review'] },
          { skill: 'pf-code-review', relatedSkills: ['pf-testing'] },
        ],
        commandSkillRefs: [
          { command: 'pf-sprint', referencedSkills: ['pf-sprint'] },
          { command: 'pf-workflow', referencedSkills: ['pf-workflow'] },
        ],
      };

      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, true, 'Realistic context should validate');
      assert.strictEqual((result.errors ?? []).length, 0, 'No errors');
      assert.strictEqual((result.warnings ?? []).length, 0, 'No warnings');
    });

    it('should catch multiple issues in a broken realistic scenario', () => {
      const ctx: CrossEntityContext = {
        knownAgentFiles: ['sm', 'dev', 'reviewer'],
        knownWorkflowNames: ['tdd'],
        knownCommandFiles: ['pf-sprint'],
        knownSkillNames: ['pf-sprint', 'pf-jira'],
        workflowAgentRefs: [
          // tea and architect referenced but no agent files
          { workflow: 'tdd', referencedAgents: ['sm', 'tea', 'dev', 'architect', 'reviewer'] },
        ],
        agentWorkflowRefs: [
          // dev references bdd which doesn't exist
          { agent: 'dev', referencedWorkflows: ['tdd', 'bdd'] },
        ],
        skillEntityRefs: [
          // references nonexistent skill
          { skill: 'pf-sprint', relatedSkills: ['pf-jira', 'pf-nonexistent'] },
        ],
        commandSkillRefs: [
          // references nonexistent skill
          { command: 'pf-sprint', referencedSkills: ['pf-sprint', 'pf-ghost'] },
        ],
      };

      const result = validateCrossEntityRefs(ctx);
      assert.strictEqual(result.valid, false, 'Broken scenario should fail');
      const msgs = errorMessages(result);

      // AC1: missing agent files for tea and architect
      assert.ok(msgs.some(m => m.includes('tea')), 'Should report missing tea agent file');
      assert.ok(msgs.some(m => m.includes('architect')), 'Should report missing architect agent file');

      // AC2: missing bdd workflow
      assert.ok(msgs.some(m => m.includes('bdd')), 'Should report missing bdd workflow');

      // AC3: missing related skill
      assert.ok(msgs.some(m => m.includes('pf-nonexistent')), 'Should report missing related skill');

      // AC4: missing command skill reference
      assert.ok(msgs.some(m => m.includes('pf-ghost')), 'Should report missing command skill ref');

      // Should have at least 5 errors total
      assert.ok(
        msgs.length >= 5,
        `Expected at least 5 errors, got ${msgs.length}: ${msgs.join('; ')}`,
      );
    });
  });
});
