/**
 * Tests for Story MSSCI-14812 (91-27): Normalize stepped workflow output paths
 *
 * Problem: BMAD-ported stepped workflows write to inconsistent directories
 * (./artifacts, planning-artifacts/) with generic filenames that collide.
 * Output should go to sprint/planning/ to align with existing project docs.
 *
 * This test file covers:
 * 1. normalizeOutputPath() — maps workflow output_file to sprint/planning/
 * 2. auditWorkflowOutputPaths() — detects collisions and inconsistent dirs
 * 3. variable-resolver default change — planning_artifacts → sprint/planning/
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import will fail until implementation exists - confirms RED state
import {
  normalizeOutputPath,
  auditWorkflowOutputPaths,
  type WorkflowOutputConfig,
} from './output-path-normalizer.js';

describe('Output Path Normalizer (MSSCI-14812)', () => {

  describe('AC1: normalizeOutputPath maps to sprint/planning/', () => {

    it('should rewrite artifacts/ prefix to sprint/planning/', () => {
      const result = normalizeOutputPath('artifacts/architecture.md');
      assert.strictEqual(result, 'sprint/planning/architecture.md');
    });

    it('should rewrite ./artifacts/ prefix to sprint/planning/', () => {
      const result = normalizeOutputPath('./artifacts/architecture.md');
      assert.strictEqual(result, 'sprint/planning/architecture.md');
    });

    it('should rewrite planning-artifacts/ prefix to sprint/planning/', () => {
      const result = normalizeOutputPath('planning-artifacts/prd.md');
      assert.strictEqual(result, 'sprint/planning/prd.md');
    });

    it('should rewrite ./planning-artifacts/ prefix to sprint/planning/', () => {
      const result = normalizeOutputPath('./planning-artifacts/prd.md');
      assert.strictEqual(result, 'sprint/planning/prd.md');
    });

    it('should preserve subdirectories under the base dir', () => {
      const result = normalizeOutputPath('artifacts/analysis/brainstorming-session-2026-02-11.md');
      assert.strictEqual(result, 'sprint/planning/analysis/brainstorming-session-2026-02-11.md');
    });

    it('should leave sprint/planning/ paths unchanged', () => {
      const result = normalizeOutputPath('sprint/planning/architecture.md');
      assert.strictEqual(result, 'sprint/planning/architecture.md');
    });

    it('should handle bare filename (no directory) by prepending sprint/planning/', () => {
      const result = normalizeOutputPath('architecture.md');
      assert.strictEqual(result, 'sprint/planning/architecture.md');
    });
  });

  describe('AC2: auditWorkflowOutputPaths detects collisions', () => {

    it('should detect duplicate output filenames across workflows', () => {
      const configs: WorkflowOutputConfig[] = [
        { workflowName: 'architecture', outputFile: 'sprint/planning/architecture.md' },
        { workflowName: 'architecture-phased', outputFile: 'sprint/planning/architecture.md' },
      ];

      const result = auditWorkflowOutputPaths(configs);

      assert.strictEqual(result.hasCollisions, true);
      assert.ok(result.collisions.length > 0);
      assert.ok(result.collisions[0].filePath.includes('architecture.md'));
      assert.ok(result.collisions[0].workflows.includes('architecture'));
      assert.ok(result.collisions[0].workflows.includes('architecture-phased'));
    });

    it('should report no collisions when all paths are unique', () => {
      const configs: WorkflowOutputConfig[] = [
        { workflowName: 'architecture', outputFile: 'sprint/planning/architecture.md' },
        { workflowName: 'prd', outputFile: 'sprint/planning/prd.md' },
        { workflowName: 'research', outputFile: 'sprint/planning/research.md' },
      ];

      const result = auditWorkflowOutputPaths(configs);

      assert.strictEqual(result.hasCollisions, false);
      assert.strictEqual(result.collisions.length, 0);
    });

    it('should detect inconsistent base directories', () => {
      const configs: WorkflowOutputConfig[] = [
        { workflowName: 'architecture', outputFile: 'sprint/planning/architecture.md' },
        { workflowName: 'prd', outputFile: 'artifacts/prd.md' },
        { workflowName: 'research', outputFile: './planning-artifacts/research.md' },
      ];

      const result = auditWorkflowOutputPaths(configs);

      assert.strictEqual(result.hasInconsistentPaths, true);
      assert.ok(result.inconsistentPaths.length >= 2);
    });

    it('should report all paths consistent when all use sprint/planning/', () => {
      const configs: WorkflowOutputConfig[] = [
        { workflowName: 'architecture', outputFile: 'sprint/planning/architecture.md' },
        { workflowName: 'prd', outputFile: 'sprint/planning/prd.md' },
      ];

      const result = auditWorkflowOutputPaths(configs);

      assert.strictEqual(result.hasInconsistentPaths, false);
    });

    it('should handle empty config list', () => {
      const result = auditWorkflowOutputPaths([]);

      assert.strictEqual(result.hasCollisions, false);
      assert.strictEqual(result.hasInconsistentPaths, false);
      assert.strictEqual(result.collisions.length, 0);
    });

    it('should detect collision in planning_artifacts variable too', () => {
      const configs: WorkflowOutputConfig[] = [
        { workflowName: 'architecture', outputFile: 'sprint/planning/architecture.md', planningArtifacts: 'sprint/planning' },
        { workflowName: 'prd', outputFile: 'sprint/planning/prd.md', planningArtifacts: './artifacts' },
      ];

      const result = auditWorkflowOutputPaths(configs);

      assert.strictEqual(result.hasInconsistentPaths, true);
    });
  });

  describe('AC3: Workflow YAML output_file values are normalized', () => {

    it('should map architecture workflow output to sprint/planning/architecture.md', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/architecture.md'),
        'sprint/planning/architecture.md'
      );
    });

    it('should map prd workflow output to sprint/planning/prd.md', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/prd.md'),
        'sprint/planning/prd.md'
      );
    });

    it('should map research workflow output to sprint/planning/research.md', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/research.md'),
        'sprint/planning/research.md'
      );
    });

    it('should map epics-and-stories output to sprint/planning/epics.md', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/create-epics-and-stories.md'),
        'sprint/planning/create-epics-and-stories.md'
      );
    });

    it('should map sprint-planning output to sprint/planning/sprint-status.yaml', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/sprint-status.yaml'),
        'sprint/planning/sprint-status.yaml'
      );
    });

    it('should map ux-design output to sprint/planning/ux-design-specification.md', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/ux-design-specification.md'),
        'sprint/planning/ux-design-specification.md'
      );
    });

    it('should map implementation-readiness output to sprint/planning/', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/implementation-readiness-report.md'),
        'sprint/planning/implementation-readiness-report.md'
      );
    });

    it('should map product-brief output to sprint/planning/', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/product-brief.md'),
        'sprint/planning/product-brief.md'
      );
    });

    it('should map project-context output to sprint/planning/', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/generate-project-context.md'),
        'sprint/planning/generate-project-context.md'
      );
    });

    it('should map quick-dev output to sprint/planning/', () => {
      assert.strictEqual(
        normalizeOutputPath('artifacts/quick-dev.md'),
        'sprint/planning/quick-dev.md'
      );
    });
  });
});

describe('Variable Resolver Default Update (MSSCI-14812)', () => {

  // This test imports the existing resolveStepVariables and verifies
  // the default has been changed from 'planning-artifacts/' to 'sprint/planning/'
  it('should use sprint/planning/ as default planning_artifacts', async () => {
    const { resolveStepVariables } = await import('./variable-resolver.js');

    const content = 'Output to: {planning_artifacts}';
    const result = resolveStepVariables(content, {});

    assert.strictEqual(
      result.content,
      'Output to: sprint/planning/',
      'Default planning_artifacts should be sprint/planning/ not planning-artifacts/'
    );
  });

  it('should still allow workflow vars to override the default', async () => {
    const { resolveStepVariables } = await import('./variable-resolver.js');

    const content = 'Output to: {planning_artifacts}';
    const result = resolveStepVariables(content, {
      workflowVars: { planning_artifacts: 'custom/path/' },
    });

    assert.strictEqual(result.content, 'Output to: custom/path/');
  });
});
