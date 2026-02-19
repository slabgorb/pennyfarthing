/**
 * Tests for Story 86-5: Tandem Workflow Templates
 *
 * Validates tandem workflow templates ship with correct pairings,
 * documentation, trigger routing, and tandem indicators.
 *
 * Acceptance Criteria:
 * - AC1: tdd-tandem.yaml verified — Dev + Architect on green phase
 * - AC2: review-tandem.yaml created — Reviewer + Architect on review
 * - AC3: Each template documented with when-to-use guidance
 * - AC4: Trigger routing: 5+ pt → tdd-tandem, UI/UX → bdd-tandem
 * - AC5: /workflow list shows tandem indicator via triggers.tags
 * - AC6: YAML headers explain tandem concept
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkflowFile, loadWorkflowsFromDir } from './workflow-loader.js';
import { routeStoryToWorkflow } from './workflow-router.js';
import type { WorkflowDefinition, WorkflowPhase } from './workflow-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find monorepo root for real workflow files
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pennyfarthing-dist'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const monorepoRoot = findMonorepoRoot(__dirname);
const workflowsDir = monorepoRoot
  ? join(monorepoRoot, 'pennyfarthing-dist', 'workflows')
  : null;

/** Helper: find a phase by name in a workflow */
function getPhase(workflow: WorkflowDefinition, phaseName: string): WorkflowPhase | undefined {
  return workflow.phases?.find(p => p.name === phaseName);
}

/** Helper: get all phase names from a workflow */
function getPhaseNames(workflow: WorkflowDefinition): string[] {
  return (workflow.phases ?? []).map(p => p.name);
}

/** Helper: check if any phase in a workflow has a tandem block */
function hasTandemPhases(workflow: WorkflowDefinition): boolean {
  return (workflow.phases ?? []).some(p => p.tandem !== undefined);
}

// =============================================================================
// AC1: tdd-tandem workflow template structure and pairings
// =============================================================================

describe('AC1: tdd-tandem workflow template', () => {

  it('should load and validate tdd-tandem.yaml', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'tdd-tandem.yaml'));

    assert.ok(result.success, `tdd-tandem.yaml should load: ${JSON.stringify(result.errors)}`);
    assert.ok(result.workflow, 'Should have parsed workflow');
    assert.strictEqual(result.workflow.name, 'tdd-tandem');
  });

  it('should have same phase flow as base tdd workflow (minus verify)', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const tddResult = loadWorkflowFile(join(workflowsDir, 'tdd.yaml'));
    const tandemResult = loadWorkflowFile(join(workflowsDir, 'tdd-tandem.yaml'));

    assert.ok(tddResult.success && tddResult.workflow);
    assert.ok(tandemResult.success && tandemResult.workflow);

    const tddPhases = getPhaseNames(tddResult.workflow).filter(p => p !== 'verify');
    const tandemPhases = getPhaseNames(tandemResult.workflow);

    assert.deepStrictEqual(tandemPhases, tddPhases,
      'tdd-tandem should have same phase sequence as tdd (excluding verify)');
  });

  it('should have Architect as tandem partner on green phase (Dev + Architect)', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'tdd-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const greenPhase = getPhase(result.workflow, 'green');
    assert.ok(greenPhase, 'Should have green phase');
    assert.ok(greenPhase.tandem, 'Green phase should have tandem block');
    assert.strictEqual(greenPhase.tandem.partner, 'architect',
      'Green phase tandem partner should be architect (Dev + Architect alignment on implementation)');
  });

  it('should have tandem on all non-setup/finish phases', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'tdd-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const phasesRequiringTandem = (result.workflow.phases ?? [])
      .filter(p => p.name !== 'setup' && p.name !== 'finish');

    for (const phase of phasesRequiringTandem) {
      assert.ok(phase.tandem,
        `Phase '${phase.name}' should have tandem block in full tandem chain`);
      assert.ok(phase.tandem.partner,
        `Phase '${phase.name}' tandem should have partner specified`);
      assert.ok(phase.tandem.scope,
        `Phase '${phase.name}' tandem should have scope specified`);
    }
  });

  it('should have gates matching base tdd workflow (for shared phases)', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const tddResult = loadWorkflowFile(join(workflowsDir, 'tdd.yaml'));
    const tandemResult = loadWorkflowFile(join(workflowsDir, 'tdd-tandem.yaml'));

    assert.ok(tddResult.success && tddResult.workflow);
    assert.ok(tandemResult.success && tandemResult.workflow);

    // Compare gate types for matching phases (skip verify — not in tandem variant)
    for (const tddPhase of tddResult.workflow.phases ?? []) {
      if (!tddPhase.gate) continue;
      if (tddPhase.name === 'verify') continue; // tandem doesn't have verify phase

      const tandemPhase = getPhase(tandemResult.workflow, tddPhase.name);
      assert.ok(tandemPhase, `Tandem should have phase '${tddPhase.name}'`);
      assert.ok(tandemPhase.gate, `Tandem phase '${tddPhase.name}' should have gate`);
      assert.strictEqual(tandemPhase.gate.type, tddPhase.gate.type,
        `Gate type for '${tddPhase.name}' should match base tdd`);
    }
  });
});

// =============================================================================
// AC1: bdd-tandem workflow template structure and pairings
// =============================================================================

describe('AC1: bdd-tandem workflow template', () => {

  it('should load and validate bdd-tandem.yaml', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'bdd-tandem.yaml'));

    assert.ok(result.success, `bdd-tandem.yaml should load: ${JSON.stringify(result.errors)}`);
    assert.ok(result.workflow, 'Should have parsed workflow');
    assert.strictEqual(result.workflow.name, 'bdd-tandem');
  });

  it('should have same phase flow as base bdd workflow', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const bddResult = loadWorkflowFile(join(workflowsDir, 'bdd.yaml'));
    const tandemResult = loadWorkflowFile(join(workflowsDir, 'bdd-tandem.yaml'));

    assert.ok(bddResult.success && bddResult.workflow);
    assert.ok(tandemResult.success && tandemResult.workflow);

    const bddPhases = getPhaseNames(bddResult.workflow);
    const tandemPhases = getPhaseNames(tandemResult.workflow);

    assert.deepStrictEqual(tandemPhases, bddPhases,
      'bdd-tandem should have identical phase sequence to bdd');
  });

  it('should have Dev as tandem partner on red phase (TEA + Dev)', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'bdd-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const redPhase = getPhase(result.workflow, 'red');
    assert.ok(redPhase, 'Should have red phase');
    assert.ok(redPhase.tandem, 'Red phase should have tandem block (TEA + Dev collaboration)');
    assert.strictEqual(redPhase.tandem.partner, 'dev',
      'Red phase tandem partner should be dev (TEA + Dev on test writing)');
  });

  it('should have gates matching base bdd workflow', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const bddResult = loadWorkflowFile(join(workflowsDir, 'bdd.yaml'));
    const tandemResult = loadWorkflowFile(join(workflowsDir, 'bdd-tandem.yaml'));

    assert.ok(bddResult.success && bddResult.workflow);
    assert.ok(tandemResult.success && tandemResult.workflow);

    for (const bddPhase of bddResult.workflow.phases ?? []) {
      if (!bddPhase.gate) continue;

      const tandemPhase = getPhase(tandemResult.workflow, bddPhase.name);
      assert.ok(tandemPhase, `Tandem should have phase '${bddPhase.name}'`);
      assert.ok(tandemPhase.gate, `Tandem phase '${bddPhase.name}' should have gate`);
      assert.strictEqual(tandemPhase.gate.type, bddPhase.gate.type,
        `Gate type for '${bddPhase.name}' should match base bdd`);
    }
  });
});

// =============================================================================
// AC2: review-tandem workflow template
// =============================================================================

describe('AC2: review-tandem workflow template', () => {

  it('should exist as a workflow file', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const filePath = join(workflowsDir, 'review-tandem.yaml');
    assert.ok(existsSync(filePath),
      'review-tandem.yaml should exist in pennyfarthing-dist/workflows/');
  });

  it('should load and validate successfully', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'review-tandem.yaml'));

    assert.ok(result.success, `review-tandem.yaml should load: ${JSON.stringify(result.errors)}`);
    assert.ok(result.workflow, 'Should have parsed workflow');
    assert.strictEqual(result.workflow.name, 'review-tandem');
  });

  it('should have Architect as tandem partner on review phase', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'review-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const reviewPhase = getPhase(result.workflow, 'review');
    assert.ok(reviewPhase, 'Should have review phase');
    assert.strictEqual(reviewPhase.agent, 'reviewer',
      'Review phase primary agent should be reviewer');
    assert.ok(reviewPhase.tandem, 'Review phase should have tandem block');
    assert.strictEqual(reviewPhase.tandem.partner, 'architect',
      'Review phase tandem partner should be architect');
  });

  it('should have setup and finish phases with SM', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'review-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const setupPhase = getPhase(result.workflow, 'setup');
    const finishPhase = getPhase(result.workflow, 'finish');

    assert.ok(setupPhase, 'Should have setup phase');
    assert.strictEqual(setupPhase.agent, 'sm', 'Setup phase agent should be sm');

    assert.ok(finishPhase, 'Should have finish phase');
    assert.strictEqual(finishPhase.agent, 'sm', 'Finish phase agent should be sm');
  });

  it('should have approval gate on review phase', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'review-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const reviewPhase = getPhase(result.workflow, 'review');
    assert.ok(reviewPhase?.gate, 'Review phase should have gate');
    assert.strictEqual(reviewPhase.gate.type, 'approval',
      'Review phase gate should be approval type');
  });

  it('should not be the default workflow', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'review-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    assert.strictEqual(result.workflow.triggers?.default, undefined,
      'review-tandem should not be the default workflow');
  });
});

// =============================================================================
// AC3/AC6: Template documentation in YAML files
// =============================================================================

describe('AC3/AC6: Tandem template documentation', () => {

  const tandemFiles = ['tdd-tandem.yaml', 'bdd-tandem.yaml', 'review-tandem.yaml'];

  for (const filename of tandemFiles) {
    it(`${filename} should contain when-to-use guidance in comments`, () => {
      if (!workflowsDir) {
        assert.fail('Workflows directory not found');
      }

      const filePath = join(workflowsDir, filename);
      if (!existsSync(filePath)) {
        assert.fail(`${filename} does not exist`);
      }

      const content = readFileSync(filePath, 'utf-8');

      // Check for when-to-use documentation in YAML comments
      assert.ok(
        content.includes('when-to-use') ||
        content.includes('When to use') ||
        content.includes('Use this') ||
        content.includes('Best for'),
        `${filename} should contain when-to-use guidance in comments`
      );
    });

    it(`${filename} should have description mentioning tandem`, () => {
      if (!workflowsDir) {
        assert.fail('Workflows directory not found');
      }

      const result = loadWorkflowFile(join(workflowsDir, filename));
      if (!result.success || !result.workflow) {
        assert.fail(`${filename} failed to load`);
      }

      assert.ok(result.workflow.description,
        `${filename} should have a description`);
      assert.ok(
        result.workflow.description!.toLowerCase().includes('tandem'),
        `${filename} description should mention tandem`
      );
    });

    it(`${filename} should document tandem pairings in comments`, () => {
      if (!workflowsDir) {
        assert.fail('Workflows directory not found');
      }

      const filePath = join(workflowsDir, filename);
      if (!existsSync(filePath)) {
        assert.fail(`${filename} does not exist`);
      }

      const content = readFileSync(filePath, 'utf-8');

      // Check for pairing documentation (partner names in comments)
      const hasPartnerDoc = content.includes('partner') ||
        content.includes('Architect') ||
        content.includes('architect');

      assert.ok(hasPartnerDoc,
        `${filename} should document tandem partner pairings in comments`);
    });
  }
});

// =============================================================================
// AC4: Trigger routing for tandem variants
// =============================================================================

describe('AC4: Trigger routing for tandem workflows', () => {

  it('tdd-tandem should trigger for 5+ point stories', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'tdd-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const triggers = result.workflow.triggers;
    assert.ok(triggers, 'tdd-tandem should have triggers');
    assert.ok(triggers.points, 'tdd-tandem should have points trigger');
    assert.strictEqual(triggers.points.min, 5,
      'tdd-tandem should have points.min = 5 (for 5+ point stories)');
  });

  it('bdd-tandem should trigger for UI/UX story types', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'bdd-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const triggers = result.workflow.triggers;
    assert.ok(triggers, 'bdd-tandem should have triggers');
    assert.ok(triggers.types, 'bdd-tandem should have types trigger');

    const hasUiType = triggers.types.includes('ui') || triggers.types.includes('ux');
    assert.ok(hasUiType,
      'bdd-tandem types should include UI or UX story types');
  });

  it('review-tandem should have appropriate triggers', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const result = loadWorkflowFile(join(workflowsDir, 'review-tandem.yaml'));
    assert.ok(result.success && result.workflow);

    const triggers = result.workflow.triggers;
    assert.ok(triggers, 'review-tandem should have triggers');
    assert.strictEqual(triggers.default, undefined,
      'review-tandem should not be default');
  });

  it('should route story with "tandem" tag to tdd-tandem', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story = {
      id: 'test-tandem',
      tags: ['tandem'],
      points: 5,
      type: 'feature' as const
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route tandem-tagged story');
    assert.strictEqual(result.workflow.name, 'tdd-tandem',
      'Story with tandem tag and 5+ points should route to tdd-tandem');
  });

  it('should route story with "bdd-tandem" tag to bdd-tandem', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story = {
      id: 'test-bdd-tandem',
      tags: ['bdd-tandem'],
      points: 5,
      type: 'ui' as const
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route bdd-tandem-tagged story');
    assert.strictEqual(result.workflow.name, 'bdd-tandem',
      'Story with bdd-tandem tag should route to bdd-tandem');
  });
});

// =============================================================================
// AC5: Tandem indicator in workflow metadata (triggers.tags)
// =============================================================================

describe('AC5: Tandem indicator via triggers.tags', () => {

  const tandemWorkflowNames = ['tdd-tandem', 'bdd-tandem', 'review-tandem'];

  it('all tandem workflows should have "tandem" in triggers.tags', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    for (const name of tandemWorkflowNames) {
      const wf = workflows.find(w => w.name === name);
      assert.ok(wf, `${name} should be loadable`);
      assert.ok(wf.triggers?.tags, `${name} should have triggers.tags`);
      assert.ok(wf.triggers.tags.includes('tandem'),
        `${name} triggers.tags should include 'tandem' for list indicator`);
    }
  });

  it('non-tandem workflows should NOT have "tandem" in triggers.tags', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    const nonTandemWorkflows = workflows.filter(
      w => !tandemWorkflowNames.includes(w.name)
    );

    for (const wf of nonTandemWorkflows) {
      const hasTandemTag = wf.triggers?.tags?.includes('tandem') ?? false;
      assert.ok(!hasTandemTag,
        `Non-tandem workflow '${wf.name}' should not have 'tandem' in triggers.tags`);
    }
  });

  it('hasTandemPhases helper correctly detects tandem workflows', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    for (const name of tandemWorkflowNames) {
      const wf = workflows.find(w => w.name === name);
      if (wf) {
        assert.ok(hasTandemPhases(wf),
          `hasTandemPhases should return true for ${name}`);
      }
    }

    // Base tdd and bdd should NOT have tandem phases
    const tdd = workflows.find(w => w.name === 'tdd');
    if (tdd) {
      assert.ok(!hasTandemPhases(tdd),
        'hasTandemPhases should return false for base tdd');
    }

    const bdd = workflows.find(w => w.name === 'bdd');
    if (bdd) {
      assert.ok(!hasTandemPhases(bdd),
        'hasTandemPhases should return false for base bdd');
    }
  });
});

// =============================================================================
// Integration: All tandem workflows load alongside non-tandem
// =============================================================================

describe('Integration: Tandem workflows in workflow directory', () => {

  it('should load all tandem workflows without errors from workflows directory', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows, errors } = loadWorkflowsFromDir(workflowsDir);

    assert.strictEqual(errors.length, 0,
      `No workflow load errors: ${JSON.stringify(errors)}`);

    const tandemWorkflows = workflows.filter(w => w.name.includes('tandem'));
    assert.ok(tandemWorkflows.length >= 3,
      `Should have at least 3 tandem workflows (tdd, bdd, review), found ${tandemWorkflows.length}: ${tandemWorkflows.map(w => w.name).join(', ')}`);
  });

  it('tandem workflows should not conflict with base workflow triggers', () => {
    if (!workflowsDir) {
      assert.fail('Workflows directory not found');
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    // No tandem workflow should be marked as default
    const tandemWorkflows = workflows.filter(w => w.name.includes('tandem'));
    for (const wf of tandemWorkflows) {
      assert.ok(!wf.triggers?.default,
        `Tandem workflow '${wf.name}' should not be default (conflicts with base workflow)`);
    }
  });
});
