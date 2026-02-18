/**
 * Tests for Story 86-15: Team-enabled workflow templates
 *
 * These tests validate the new tdd-team.yaml and bdd-team.yaml workflow
 * templates that configure phase-scoped native teams.
 *
 * Acceptance Criteria:
 * - [AC1] tdd-team.yaml — Dev + Architect on green, Reviewer + Architect on review
 * - [AC2] bdd-team.yaml — UX + Architect on design, Dev + TEA on green
 * - [AC3] Each template documented with when-to-use vs tandem variants
 * - [AC4] /workflow list shows team-enabled workflows with indicator (see Python tests)
 * - [AC5] Templates include graceful fallback comment for when teams unavailable
 *
 * Run with: node --test dist/workflow/workflow-team-templates.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkflowFile } from './workflow-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const MONOREPO_ROOT = findMonorepoRoot(__dirname);
const WORKFLOWS_DIR = join(MONOREPO_ROOT, 'pennyfarthing-dist', 'workflows');

describe('Team-enabled workflow templates (86-15)', () => {

  // ── AC1: tdd-team.yaml ───────────────────────────────────────────

  describe('tdd-team.yaml', () => {
    const filePath = join(WORKFLOWS_DIR, 'tdd-team.yaml');

    it('should exist in pennyfarthing-dist/workflows/', () => {
      assert.ok(
        existsSync(filePath),
        `tdd-team.yaml should exist at ${filePath}`
      );
    });

    it('should load and validate successfully', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true, `Validation errors: ${JSON.stringify(result.errors)}`);
      assert.ok(result.workflow, 'Should return workflow object');
      assert.strictEqual(result.workflow?.name, 'tdd-team');
    });

    it('should have phased workflow structure with setup, red, green, review, finish', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const phases = result.workflow!.phases!;
      const phaseNames = phases.map(p => p.name);

      assert.ok(phaseNames.includes('setup'), 'Should have setup phase');
      assert.ok(phaseNames.includes('red'), 'Should have red phase');
      assert.ok(phaseNames.includes('green'), 'Should have green phase');
      assert.ok(phaseNames.includes('review'), 'Should have review phase');
      assert.ok(phaseNames.includes('finish'), 'Should have finish phase');
    });

    it('should have Dev as agent on green phase with Architect teammate', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const green = result.workflow!.phases!.find(p => p.name === 'green');

      assert.ok(green, 'green phase must exist');
      assert.strictEqual(green!.agent, 'dev', 'Dev should lead green phase');
      assert.ok(green!.team, 'green phase must have team block');
      assert.ok(green!.team!.teammates.length >= 1, 'team must have at least one teammate');

      const architectTeammate = green!.team!.teammates.find(t => t.agent === 'architect');
      assert.ok(architectTeammate, 'Architect should be a teammate on green phase');
    });

    it('should have Reviewer as agent on review phase with Architect teammate', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const review = result.workflow!.phases!.find(p => p.name === 'review');

      assert.ok(review, 'review phase must exist');
      assert.strictEqual(review!.agent, 'reviewer', 'Reviewer should lead review phase');
      assert.ok(review!.team, 'review phase must have team block');

      const architectTeammate = review!.team!.teammates.find(t => t.agent === 'architect');
      assert.ok(architectTeammate, 'Architect should be a teammate on review phase');
    });

    it('should NOT have team blocks on setup, red, or finish phases', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const phases = result.workflow!.phases!;

      for (const phaseName of ['setup', 'red', 'finish']) {
        const phase = phases.find(p => p.name === phaseName);
        if (phase) {
          assert.strictEqual(
            phase.team,
            undefined,
            `${phaseName} phase should not have a team block`
          );
        }
      }
    });

    it('should have gates on red and green phases', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const phases = result.workflow!.phases!;

      const red = phases.find(p => p.name === 'red');
      assert.ok(red?.gate, 'red phase should have a gate');

      const green = phases.find(p => p.name === 'green');
      assert.ok(green?.gate, 'green phase should have a gate');
    });

    it('should have triggers with team tag', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const triggers = result.workflow!.triggers;
      assert.ok(triggers, 'Should have triggers');
      assert.ok(
        triggers.tags?.includes('team') || triggers.tags?.includes('tdd-team'),
        'Triggers should include a team-related tag'
      );
    });

    it('should not be the default workflow', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      assert.strictEqual(
        result.workflow!.triggers?.default,
        false,
        'Team workflow should not be default (tdd is default)'
      );
    });
  });

  // ── AC2: bdd-team.yaml ───────────────────────────────────────────

  describe('bdd-team.yaml', () => {
    const filePath = join(WORKFLOWS_DIR, 'bdd-team.yaml');

    it('should exist in pennyfarthing-dist/workflows/', () => {
      assert.ok(
        existsSync(filePath),
        `bdd-team.yaml should exist at ${filePath}`
      );
    });

    it('should load and validate successfully', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true, `Validation errors: ${JSON.stringify(result.errors)}`);
      assert.ok(result.workflow, 'Should return workflow object');
      assert.strictEqual(result.workflow?.name, 'bdd-team');
    });

    it('should have phased structure with setup, design, red, green, review, finish', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const phases = result.workflow!.phases!;
      const phaseNames = phases.map(p => p.name);

      assert.ok(phaseNames.includes('setup'), 'Should have setup phase');
      assert.ok(phaseNames.includes('design'), 'Should have design phase');
      assert.ok(phaseNames.includes('red'), 'Should have red phase');
      assert.ok(phaseNames.includes('green'), 'Should have green phase');
      assert.ok(phaseNames.includes('review'), 'Should have review phase');
      assert.ok(phaseNames.includes('finish'), 'Should have finish phase');
    });

    it('should have UX-Designer as agent on design phase with Architect teammate', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const design = result.workflow!.phases!.find(p => p.name === 'design');

      assert.ok(design, 'design phase must exist');
      assert.strictEqual(design!.agent, 'ux-designer', 'UX-Designer should lead design phase');
      assert.ok(design!.team, 'design phase must have team block');

      const architectTeammate = design!.team!.teammates.find(t => t.agent === 'architect');
      assert.ok(architectTeammate, 'Architect should be a teammate on design phase');
    });

    it('should have Dev as agent on green phase with TEA teammate', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const green = result.workflow!.phases!.find(p => p.name === 'green');

      assert.ok(green, 'green phase must exist');
      assert.strictEqual(green!.agent, 'dev', 'Dev should lead green phase');
      assert.ok(green!.team, 'green phase must have team block');

      const teaTeammate = green!.team!.teammates.find(t => t.agent === 'tea');
      assert.ok(teaTeammate, 'TEA should be a teammate on green phase');
    });

    it('should NOT have team blocks on setup, red, or finish phases', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const phases = result.workflow!.phases!;

      for (const phaseName of ['setup', 'red', 'finish']) {
        const phase = phases.find(p => p.name === phaseName);
        if (phase) {
          assert.strictEqual(
            phase.team,
            undefined,
            `${phaseName} phase should not have a team block`
          );
        }
      }
    });

    it('should have gates on design, red, and green phases', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const phases = result.workflow!.phases!;

      const design = phases.find(p => p.name === 'design');
      assert.ok(design?.gate, 'design phase should have a gate');

      const red = phases.find(p => p.name === 'red');
      assert.ok(red?.gate, 'red phase should have a gate');

      const green = phases.find(p => p.name === 'green');
      assert.ok(green?.gate, 'green phase should have a gate');
    });

    it('should have triggers with team tag', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      const triggers = result.workflow!.triggers;
      assert.ok(triggers, 'Should have triggers');
      assert.ok(
        triggers.tags?.includes('team') || triggers.tags?.includes('bdd-team'),
        'Triggers should include a team-related tag'
      );
    });

    it('should not be the default workflow', () => {
      const result = loadWorkflowFile(filePath);
      assert.strictEqual(result.success, true);
      assert.strictEqual(
        result.workflow!.triggers?.default,
        false,
        'Team workflow should not be default'
      );
    });
  });

  // ── AC3: Documentation — when-to-use vs tandem ───────────────────

  describe('template documentation (AC3)', () => {

    it('tdd-team.yaml should document when to use vs tdd-tandem', () => {
      const filePath = join(WORKFLOWS_DIR, 'tdd-team.yaml');
      const content = readFileSync(filePath, 'utf-8');

      // Should have header comments explaining when to use
      assert.ok(
        content.toLowerCase().includes('when to use') ||
        content.toLowerCase().includes('when-to-use'),
        'Should document when to use this workflow'
      );
      assert.ok(
        content.toLowerCase().includes('tandem'),
        'Should reference tandem variant for comparison'
      );
    });

    it('bdd-team.yaml should document when to use vs bdd-tandem', () => {
      const filePath = join(WORKFLOWS_DIR, 'bdd-team.yaml');
      const content = readFileSync(filePath, 'utf-8');

      assert.ok(
        content.toLowerCase().includes('when to use') ||
        content.toLowerCase().includes('when-to-use'),
        'Should document when to use this workflow'
      );
      assert.ok(
        content.toLowerCase().includes('tandem'),
        'Should reference tandem variant for comparison'
      );
    });

    it('tdd-team.yaml description should distinguish from tdd-tandem', () => {
      const result = loadWorkflowFile(join(WORKFLOWS_DIR, 'tdd-team.yaml'));
      assert.strictEqual(result.success, true);
      assert.ok(result.workflow?.description, 'Should have a description');
      assert.ok(
        result.workflow!.description!.toLowerCase().includes('team'),
        'Description should mention team collaboration'
      );
    });

    it('bdd-team.yaml description should distinguish from bdd-tandem', () => {
      const result = loadWorkflowFile(join(WORKFLOWS_DIR, 'bdd-team.yaml'));
      assert.strictEqual(result.success, true);
      assert.ok(result.workflow?.description, 'Should have a description');
      assert.ok(
        result.workflow!.description!.toLowerCase().includes('team'),
        'Description should mention team collaboration'
      );
    });
  });

  // ── AC5: Fallback comments ───────────────────────────────────────

  describe('graceful fallback comments (AC5)', () => {

    it('tdd-team.yaml should include fallback guidance for teams unavailable', () => {
      const filePath = join(WORKFLOWS_DIR, 'tdd-team.yaml');
      const content = readFileSync(filePath, 'utf-8');

      assert.ok(
        content.toLowerCase().includes('fallback') ||
        content.toLowerCase().includes('unavailable') ||
        content.toLowerCase().includes('solo'),
        'Should document fallback behavior when teams are not available'
      );
    });

    it('bdd-team.yaml should include fallback guidance for teams unavailable', () => {
      const filePath = join(WORKFLOWS_DIR, 'bdd-team.yaml');
      const content = readFileSync(filePath, 'utf-8');

      assert.ok(
        content.toLowerCase().includes('fallback') ||
        content.toLowerCase().includes('unavailable') ||
        content.toLowerCase().includes('solo'),
        'Should document fallback behavior when teams are not available'
      );
    });
  });

  // ── Teammate task descriptions ─────────────────────────────────

  describe('teammate task descriptions', () => {

    it('tdd-team green phase architect should have a task description', () => {
      const result = loadWorkflowFile(join(WORKFLOWS_DIR, 'tdd-team.yaml'));
      assert.strictEqual(result.success, true);
      const green = result.workflow!.phases!.find(p => p.name === 'green');
      const architect = green!.team!.teammates.find(t => t.agent === 'architect');
      assert.ok(architect!.task, 'Architect teammate should have a task description');
      assert.ok(architect!.task!.length > 0, 'Task should not be empty');
    });

    it('tdd-team review phase architect should have a task description', () => {
      const result = loadWorkflowFile(join(WORKFLOWS_DIR, 'tdd-team.yaml'));
      assert.strictEqual(result.success, true);
      const review = result.workflow!.phases!.find(p => p.name === 'review');
      const architect = review!.team!.teammates.find(t => t.agent === 'architect');
      assert.ok(architect!.task, 'Architect teammate should have a task description');
    });

    it('bdd-team design phase architect should have a task description', () => {
      const result = loadWorkflowFile(join(WORKFLOWS_DIR, 'bdd-team.yaml'));
      assert.strictEqual(result.success, true);
      const design = result.workflow!.phases!.find(p => p.name === 'design');
      const architect = design!.team!.teammates.find(t => t.agent === 'architect');
      assert.ok(architect!.task, 'Architect teammate should have a task description');
    });

    it('bdd-team green phase tea should have a task description', () => {
      const result = loadWorkflowFile(join(WORKFLOWS_DIR, 'bdd-team.yaml'));
      assert.strictEqual(result.success, true);
      const green = result.workflow!.phases!.find(p => p.name === 'green');
      const tea = green!.team!.teammates.find(t => t.agent === 'tea');
      assert.ok(tea!.task, 'TEA teammate should have a task description');
    });
  });
});
