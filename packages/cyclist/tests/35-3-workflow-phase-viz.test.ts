/**
 * 35-3: Workflow Phase Visualization
 *
 * These tests verify the acceptance criteria for dynamic workflow phase display.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Workflow phases displayed visually (stepper/breadcrumb style)
 * - AC2: Current phase highlighted distinctly
 * - AC3: Completed phases marked with checkmark or similar
 * - AC4: Phase names from workflow definition (not hardcoded)
 * - AC5: Updates when phase changes (via IPC or polling)
 * - AC6: Works with TDD, trivial, and custom workflows
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

// Import functions that will be created/modified by Dev
import {
  getWorkflowPhases,
  parseWorkflowProgress,
  type WorkflowPhase,
} from '../src/story-parser.js';

// Test fixtures directory
const TEST_FIXTURES_DIR = join(__dirname, '.fixtures-35-3');

describe('35-3: Workflow Phase Visualization', () => {
  // Setup test fixture directory
  beforeEach(() => {
    if (existsSync(TEST_FIXTURES_DIR)) {
      rmSync(TEST_FIXTURES_DIR, { recursive: true });
    }
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
    mkdirSync(join(TEST_FIXTURES_DIR, '.claude', 'workflows'), { recursive: true });
  });

  // Cleanup after all tests
  afterAll(() => {
    if (existsSync(TEST_FIXTURES_DIR)) {
      rmSync(TEST_FIXTURES_DIR, { recursive: true });
    }
  });

  describe('AC4: Phase names from workflow definition (not hardcoded)', () => {
    describe('getWorkflowPhases()', () => {
      it('should read phases from TDD workflow YAML', () => {
        // Create TDD workflow fixture
        const tddWorkflow = `name: tdd
description: Test-Driven Development workflow

phases:
  - name: setup
    agent: sm
    label: Setup
  - name: red
    agent: tea
    label: Write Tests
  - name: green
    agent: dev
    label: Implement
  - name: review
    agent: reviewer
    label: Review
  - name: finish
    agent: sm
    label: Finish
`;
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'tdd.yaml'),
          tddWorkflow
        );

        const phases = getWorkflowPhases('tdd', TEST_FIXTURES_DIR);

        expect(phases).not.toBeNull();
        expect(phases).toHaveLength(5);
        expect(phases![0]).toMatchObject({ name: 'setup', agent: 'sm', label: 'Setup' });
        expect(phases![1]).toMatchObject({ name: 'red', agent: 'tea', label: 'Write Tests' });
        expect(phases![2]).toMatchObject({ name: 'green', agent: 'dev', label: 'Implement' });
        expect(phases![3]).toMatchObject({ name: 'review', agent: 'reviewer', label: 'Review' });
        expect(phases![4]).toMatchObject({ name: 'finish', agent: 'sm', label: 'Finish' });
      });

      it('should read phases from trivial workflow YAML', () => {
        // Create trivial workflow fixture (no TEA phase)
        const trivialWorkflow = `name: trivial
description: Simple workflow without TDD

phases:
  - name: setup
    agent: sm
    label: Setup
  - name: implement
    agent: dev
    label: Implement
  - name: review
    agent: reviewer
    label: Review
  - name: finish
    agent: sm
    label: Finish
`;
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'trivial.yaml'),
          trivialWorkflow
        );

        const phases = getWorkflowPhases('trivial', TEST_FIXTURES_DIR);

        expect(phases).not.toBeNull();
        expect(phases).toHaveLength(4);
        // Trivial skips TEA
        expect(phases!.map(p => p.agent)).toEqual(['sm', 'dev', 'reviewer', 'sm']);
      });

      it('should read phases from custom workflow YAML', () => {
        // Create custom workflow fixture
        const customWorkflow = `name: custom-flow
description: Custom 3-phase workflow

phases:
  - name: start
    agent: pm
    label: Planning
  - name: build
    agent: dev
    label: Building
  - name: ship
    agent: devops
    label: Deployment
`;
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'custom-flow.yaml'),
          customWorkflow
        );

        const phases = getWorkflowPhases('custom-flow', TEST_FIXTURES_DIR);

        expect(phases).not.toBeNull();
        expect(phases).toHaveLength(3);
        expect(phases![0]).toMatchObject({ name: 'start', agent: 'pm', label: 'Planning' });
        expect(phases![1]).toMatchObject({ name: 'build', agent: 'dev', label: 'Building' });
        expect(phases![2]).toMatchObject({ name: 'ship', agent: 'devops', label: 'Deployment' });
      });

      it('should return null when workflow file does not exist', () => {
        const phases = getWorkflowPhases('nonexistent', TEST_FIXTURES_DIR);
        expect(phases).toBeNull();
      });

      it('should return null for malformed YAML', () => {
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'broken.yaml'),
          'this is not: valid: yaml: content: [[[['
        );

        const phases = getWorkflowPhases('broken', TEST_FIXTURES_DIR);
        expect(phases).toBeNull();
      });

      it('should return null when phases array is missing', () => {
        const noPhases = `name: no-phases
description: Workflow without phases section
`;
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'no-phases.yaml'),
          noPhases
        );

        const phases = getWorkflowPhases('no-phases', TEST_FIXTURES_DIR);
        expect(phases).toBeNull();
      });

      it('should handle phases with optional fields', () => {
        const minimalWorkflow = `name: minimal
phases:
  - name: do-stuff
    agent: dev
`;
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'minimal.yaml'),
          minimalWorkflow
        );

        const phases = getWorkflowPhases('minimal', TEST_FIXTURES_DIR);

        expect(phases).not.toBeNull();
        expect(phases).toHaveLength(1);
        expect(phases![0].name).toBe('do-stuff');
        expect(phases![0].agent).toBe('dev');
        // Label should default to name if not provided
        expect(phases![0].label).toBe('do-stuff');
      });
    });
  });

  describe('AC1-3: Workflow progress visualization', () => {
    describe('parseWorkflowProgress() with dynamic phases', () => {
      const tddWorkflow = `name: tdd
phases:
  - name: setup
    agent: sm
    label: Setup
  - name: red
    agent: tea
    label: Write Tests
  - name: green
    agent: dev
    label: Implement
  - name: review
    agent: reviewer
    label: Review
  - name: finish
    agent: sm
    label: Finish
`;

      beforeEach(() => {
        writeFileSync(
          join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'tdd.yaml'),
          tddWorkflow
        );
      });

      it('should mark setup as current when phase is setup', () => {
        const sessionContent = `# Story 35-3: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** setup
`;
        const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

        expect(progress).not.toBeNull();
        expect(progress).toHaveLength(5);
        expect(progress![0].status).toBe('current');
        expect(progress![1].status).toBe('pending');
        expect(progress![2].status).toBe('pending');
        expect(progress![3].status).toBe('pending');
        expect(progress![4].status).toBe('pending');
      });

      it('should mark completed phases as done', () => {
        const sessionContent = `# Story 35-3: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** green

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-14T10:00:00Z | 2026-01-14T10:30:00Z | 30m |
| red | 2026-01-14T10:30:00Z | 2026-01-14T11:00:00Z | 30m |
| green | 2026-01-14T11:00:00Z | - | - |
`;
        const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

        expect(progress).not.toBeNull();
        expect(progress![0].status).toBe('done');    // setup completed
        expect(progress![1].status).toBe('done');    // red completed
        expect(progress![2].status).toBe('current'); // green is current
        expect(progress![3].status).toBe('pending'); // review pending
        expect(progress![4].status).toBe('pending'); // finish pending
      });

      it('should use labels from workflow definition', () => {
        const sessionContent = `# Story 35-3: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** tea
`;
        const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

        expect(progress).not.toBeNull();
        expect(progress![0].label).toBe('Setup');
        expect(progress![1].label).toBe('Write Tests');
        expect(progress![2].label).toBe('Implement');
        expect(progress![3].label).toBe('Review');
        expect(progress![4].label).toBe('Finish');
      });

      it('should include agent identifier in each step', () => {
        const sessionContent = `# Story 35-3: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** setup
`;
        const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

        expect(progress).not.toBeNull();
        expect(progress![0].agent).toBe('sm');
        expect(progress![1].agent).toBe('tea');
        expect(progress![2].agent).toBe('dev');
        expect(progress![3].agent).toBe('reviewer');
        expect(progress![4].agent).toBe('sm');
      });
    });
  });

  describe('AC6: Works with TDD, trivial, and custom workflows', () => {
    it('should handle trivial workflow (4 phases, no TEA)', () => {
      const trivialWorkflow = `name: trivial
phases:
  - name: setup
    agent: sm
    label: Setup
  - name: implement
    agent: dev
    label: Implement
  - name: review
    agent: reviewer
    label: Review
  - name: finish
    agent: sm
    label: Finish
`;
      writeFileSync(
        join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'trivial.yaml'),
        trivialWorkflow
      );

      const sessionContent = `# Story 35-3: Test Story

## Workflow Tracking
**Workflow:** trivial
**Phase:** implement
`;
      const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

      expect(progress).not.toBeNull();
      expect(progress).toHaveLength(4);
      expect(progress![0].status).toBe('done');    // setup
      expect(progress![1].status).toBe('current'); // implement
      expect(progress![2].status).toBe('pending'); // review
      expect(progress![3].status).toBe('pending'); // finish
    });

    it('should handle custom workflow with different agents', () => {
      const customWorkflow = `name: docs-only
phases:
  - name: research
    agent: architect
    label: Research
  - name: write
    agent: tech-writer
    label: Write Docs
  - name: approve
    agent: pm
    label: Approval
`;
      writeFileSync(
        join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'docs-only.yaml'),
        customWorkflow
      );

      const sessionContent = `# Story 35-3: Docs Story

## Workflow Tracking
**Workflow:** docs-only
**Phase:** write
`;
      const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

      expect(progress).not.toBeNull();
      expect(progress).toHaveLength(3);
      expect(progress![0]).toMatchObject({ agent: 'architect', status: 'done' });
      expect(progress![1]).toMatchObject({ agent: 'tech-writer', status: 'current' });
      expect(progress![2]).toMatchObject({ agent: 'pm', status: 'pending' });
    });

    it('should fall back gracefully when workflow is not specified', () => {
      const sessionContent = `# Story 35-3: Test Story

## Status
- **Phase:** dev
`;
      // No **Workflow:** field - should use default or return null
      const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

      // Either returns null or uses a sensible default
      // Dev will decide the behavior
      expect(progress === null || Array.isArray(progress)).toBe(true);
    });
  });

  describe('WorkflowPhase type interface', () => {
    it('should have required properties', () => {
      const phase: WorkflowPhase = {
        name: 'test-phase',
        agent: 'dev',
        label: 'Test Phase',
        status: 'pending',
      };

      expect(phase.name).toBeDefined();
      expect(phase.agent).toBeDefined();
      expect(phase.label).toBeDefined();
      expect(phase.status).toBeDefined();
    });

    it('should accept valid status values', () => {
      const statuses: Array<'done' | 'current' | 'pending'> = ['done', 'current', 'pending'];

      for (const status of statuses) {
        const phase: WorkflowPhase = {
          name: 'test',
          agent: 'dev',
          label: 'Test',
          status,
        };
        expect(['done', 'current', 'pending']).toContain(phase.status);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle workflow with single phase', () => {
      const singlePhase = `name: single
phases:
  - name: only
    agent: dev
    label: Only Phase
`;
      writeFileSync(
        join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'single.yaml'),
        singlePhase
      );

      const phases = getWorkflowPhases('single', TEST_FIXTURES_DIR);
      expect(phases).toHaveLength(1);
    });

    it('should handle workflow with many phases', () => {
      const manyPhases = `name: many
phases:
${Array.from({ length: 10 }, (_, i) => `  - name: phase${i}
    agent: agent${i}
    label: Phase ${i}`).join('\n')}
`;
      writeFileSync(
        join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'many.yaml'),
        manyPhases
      );

      const phases = getWorkflowPhases('many', TEST_FIXTURES_DIR);
      expect(phases).toHaveLength(10);
    });

    it('should handle session with completed workflow (all phases done)', () => {
      const tddWorkflow = `name: tdd
phases:
  - name: setup
    agent: sm
  - name: red
    agent: tea
  - name: green
    agent: dev
  - name: review
    agent: reviewer
  - name: finish
    agent: sm
`;
      writeFileSync(
        join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'tdd.yaml'),
        tddWorkflow
      );

      const sessionContent = `# Story 35-3: Completed Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-14T10:00:00Z | 2026-01-14T10:30:00Z | 30m |
| red | 2026-01-14T10:30:00Z | 2026-01-14T11:00:00Z | 30m |
| green | 2026-01-14T11:00:00Z | 2026-01-14T12:00:00Z | 1h |
| review | 2026-01-14T12:00:00Z | 2026-01-14T12:30:00Z | 30m |
| finish | 2026-01-14T12:30:00Z | 2026-01-14T13:00:00Z | 30m |
`;
      const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

      expect(progress).not.toBeNull();
      // All phases should be done when finish phase is complete
      expect(progress!.every(p => p.status === 'done')).toBe(true);
    });

    it('should handle phase names that differ from agent names', () => {
      // Phase "red" maps to agent "tea", phase "green" maps to agent "dev"
      const tddWorkflow = `name: tdd
phases:
  - name: red
    agent: tea
  - name: green
    agent: dev
`;
      writeFileSync(
        join(TEST_FIXTURES_DIR, '.claude', 'workflows', 'tdd.yaml'),
        tddWorkflow
      );

      const sessionContent = `# Story 35-3: Test

## Workflow Tracking
**Workflow:** tdd
**Phase:** tea
`;
      // When phase is "tea" (agent name), should match "red" phase
      const progress = parseWorkflowProgress(sessionContent, TEST_FIXTURES_DIR);

      expect(progress).not.toBeNull();
      // Should correctly identify current phase whether matching by name or agent
    });
  });
});
