/**
 * Tests for Story 31-1: Workflow Definition Schema
 *
 * These tests define the contract for workflow YAML validation.
 * The loader (31-2) will implement validateWorkflow() to pass these tests.
 *
 * Schema requirements:
 * - Required: workflow.name, workflow.phases (at least one), phases[].name, phases[].agent
 * - Optional: description, version, phases[].input/output/gate, triggers
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import the validator function
import { validateWorkflow, type WorkflowValidationError as _WorkflowValidationError } from './workflow-schema.js';

describe('Workflow Schema Validation (31-1)', () => {

  describe('Valid workflows', () => {

    it('should accept a minimal valid workflow', () => {
      const workflow = {
        workflow: {
          name: 'minimal',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Minimal workflow should be valid');
      assert.strictEqual(result.workflow?.name, 'minimal');
    });

    it('should accept a workflow with all optional fields', () => {
      const workflow = {
        workflow: {
          name: 'full-example',
          description: 'A complete workflow with all fields',
          version: '1.0.0',
          phases: [
            {
              name: 'setup',
              agent: 'sm',
              output: ['session_file', 'branches']
            },
            {
              name: 'implement',
              agent: 'dev',
              input: ['session_file'],
              output: ['code'],
              gate: {
                type: 'tests_pass',
                condition: 'all tests green'
              }
            },
            {
              name: 'review',
              agent: 'reviewer',
              input: ['code'],
              gate: {
                type: 'approval'
              }
            }
          ],
          triggers: {
            tags: ['feature'],
            types: ['feature', 'enhancement'],
            points: { min: 3, max: 8 },
            default: false
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Complete workflow should be valid');
      assert.strictEqual(result.workflow?.phases.length, 3);
    });

    it('should accept TDD workflow structure', () => {
      const workflow = {
        workflow: {
          name: 'tdd',
          description: 'Test-driven development with code review',
          version: '1.0.0',
          phases: [
            { name: 'setup', agent: 'sm', output: ['session_file', 'branches'] },
            { name: 'red', agent: 'tea', input: ['session_file'], output: ['failing_tests'], gate: { type: 'tests_fail' } },
            { name: 'green', agent: 'dev', input: ['failing_tests'], output: ['implementation', 'passing_tests'], gate: { type: 'tests_pass' } },
            { name: 'review', agent: 'reviewer', input: ['implementation'], output: ['approval'], gate: { type: 'approval' } },
            { name: 'finish', agent: 'sm', input: ['approval'], output: ['archived_session'] }
          ],
          triggers: {
            types: ['feature'],
            default: true
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'TDD workflow should be valid');
      assert.strictEqual(result.workflow?.name, 'tdd');
      assert.strictEqual(result.workflow?.phases.length, 5);
    });

    it('should accept trivial workflow (skip TEA)', () => {
      const workflow = {
        workflow: {
          name: 'trivial',
          description: 'Quick fixes without full TDD ceremony',
          version: '1.0.0',
          phases: [
            { name: 'setup', agent: 'sm' },
            { name: 'implement', agent: 'dev', gate: { type: 'tests_pass' } },
            { name: 'review', agent: 'reviewer', gate: { type: 'approval' } },
            { name: 'finish', agent: 'sm' }
          ],
          triggers: {
            types: ['chore', 'fix'],
            points: { max: 2 }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Trivial workflow should be valid');
    });
  });

  describe('Required fields validation', () => {

    it('should reject workflow missing name', () => {
      const workflow = {
        workflow: {
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject workflow without name');
      assert.ok(result.errors?.some(e => e.field === 'workflow.name'), 'Should report missing name');
    });

    it('should reject workflow missing phases', () => {
      const workflow = {
        workflow: {
          name: 'no-phases'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject workflow without phases');
      assert.ok(result.errors?.some(e => e.field === 'workflow.phases'), 'Should report missing phases');
    });

    it('should reject workflow with empty phases array', () => {
      const workflow = {
        workflow: {
          name: 'empty-phases',
          phases: []
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject workflow with empty phases');
      assert.ok(result.errors?.some(e => e.message.includes('at least one phase')), 'Should report need for phases');
    });

    it('should reject phase missing name', () => {
      const workflow = {
        workflow: {
          name: 'missing-phase-name',
          phases: [
            { agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject phase without name');
      assert.ok(result.errors?.some(e => e.field?.includes('phases') && e.field?.includes('name')), 'Should report missing phase name');
    });

    it('should reject phase missing agent', () => {
      const workflow = {
        workflow: {
          name: 'missing-agent',
          phases: [
            { name: 'work' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject phase without agent');
      assert.ok(result.errors?.some(e => e.field?.includes('phases') && e.field?.includes('agent')), 'Should report missing agent');
    });

    it('should reject workflow missing root workflow key', () => {
      const workflow = {
        name: 'wrong-structure',
        phases: [
          { name: 'work', agent: 'dev' }
        ]
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject missing workflow root key');
      assert.ok(result.errors?.some(e => e.field === 'workflow'), 'Should report missing workflow key');
    });
  });

  describe('Optional fields handling', () => {

    it('should accept workflow without description', () => {
      const workflow = {
        workflow: {
          name: 'no-description',
          phases: [{ name: 'work', agent: 'dev' }]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept workflow without description');
      assert.strictEqual(result.workflow?.description, undefined);
    });

    it('should accept workflow without version', () => {
      const workflow = {
        workflow: {
          name: 'no-version',
          phases: [{ name: 'work', agent: 'dev' }]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept workflow without version');
    });

    it('should accept phase without input/output', () => {
      const workflow = {
        workflow: {
          name: 'no-io',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept phase without input/output');
    });

    it('should accept phase without gate', () => {
      const workflow = {
        workflow: {
          name: 'no-gate',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept phase without gate');
    });

    it('should accept workflow without triggers', () => {
      const workflow = {
        workflow: {
          name: 'no-triggers',
          phases: [{ name: 'work', agent: 'dev' }]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept workflow without triggers');
    });
  });

  describe('Trigger rules validation', () => {

    it('should accept triggers with only tags', () => {
      const workflow = {
        workflow: {
          name: 'tags-only',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            tags: ['urgent', 'hotfix']
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept triggers with only tags');
    });

    it('should accept triggers with only types', () => {
      const workflow = {
        workflow: {
          name: 'types-only',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            types: ['feature', 'bug']
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept triggers with only types');
    });

    it('should accept triggers with only points range', () => {
      const workflow = {
        workflow: {
          name: 'points-only',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            points: { min: 1, max: 5 }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept triggers with only points');
    });

    it('should accept points with only min', () => {
      const workflow = {
        workflow: {
          name: 'points-min-only',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            points: { min: 3 }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept points with only min');
    });

    it('should accept points with only max', () => {
      const workflow = {
        workflow: {
          name: 'points-max-only',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            points: { max: 2 }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept points with only max');
    });

    it('should accept default trigger', () => {
      const workflow = {
        workflow: {
          name: 'default-workflow',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            default: true
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept default trigger');
      assert.strictEqual(result.workflow?.triggers?.default, true);
    });

    it('should reject invalid points range (min > max)', () => {
      const workflow = {
        workflow: {
          name: 'bad-points',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            points: { min: 10, max: 5 }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject min > max');
      assert.ok(result.errors?.some(e => e.field?.includes('points')), 'Should report invalid points range');
    });
  });

  describe('Phase order preservation', () => {

    it('should preserve phase order in validated workflow', () => {
      const workflow = {
        workflow: {
          name: 'ordered',
          phases: [
            { name: 'first', agent: 'sm' },
            { name: 'second', agent: 'tea' },
            { name: 'third', agent: 'dev' },
            { name: 'fourth', agent: 'reviewer' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.workflow?.phases[0].name, 'first');
      assert.strictEqual(result.workflow?.phases[1].name, 'second');
      assert.strictEqual(result.workflow?.phases[2].name, 'third');
      assert.strictEqual(result.workflow?.phases[3].name, 'fourth');
    });
  });

  describe('Gate validation', () => {

    it('should accept valid gate types', () => {
      const workflow = {
        workflow: {
          name: 'gates',
          phases: [
            { name: 'test', agent: 'tea', gate: { type: 'tests_pass' } },
            { name: 'review', agent: 'reviewer', gate: { type: 'approval' } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept standard gate types');
    });

    it('should accept gate with optional condition', () => {
      const workflow = {
        workflow: {
          name: 'gate-condition',
          phases: [
            {
              name: 'test',
              agent: 'tea',
              gate: {
                type: 'tests_pass',
                condition: 'coverage > 80%'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept gate with condition');
    });

    it('should reject gate without type', () => {
      const workflow = {
        workflow: {
          name: 'bad-gate',
          phases: [
            {
              name: 'test',
              agent: 'tea',
              gate: {
                condition: 'something'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject gate without type');
      assert.ok(result.errors?.some(e => e.field?.includes('gate')), 'Should report missing gate type');
    });
  });

  describe('Error reporting', () => {

    it('should report multiple errors at once', () => {
      const workflow = {
        workflow: {
          // missing name
          phases: [
            { /* missing name and agent */ },
            { name: 'valid', agent: 'dev' },
            { name: 'bad-gate', agent: 'reviewer', gate: { /* missing type */ } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should be invalid');
      assert.ok(result.errors && result.errors.length >= 3, 'Should report multiple errors');
    });

    it('should include field path in error', () => {
      const workflow = {
        workflow: {
          name: 'test',
          phases: [
            { name: 'work' } // missing agent
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      const error = result.errors?.find(e => e.field?.includes('agent'));
      assert.ok(error, 'Should have error for missing agent');
      assert.ok(error?.field?.includes('phases[0]'), 'Should include array index in path');
    });

    it('should include human-readable message', () => {
      const workflow = {
        workflow: {
          phases: [{ name: 'work', agent: 'dev' }]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      const error = result.errors?.find(e => e.field === 'workflow.name');
      assert.ok(error?.message, 'Error should have message');
      assert.ok(error?.message.toLowerCase().includes('required'), 'Message should indicate field is required');
    });
  });

  describe('Type validation', () => {

    it('should reject non-string workflow name', () => {
      const workflow = {
        workflow: {
          name: 123,
          phases: [{ name: 'work', agent: 'dev' }]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-string name');
    });

    it('should reject non-array phases', () => {
      const workflow = {
        workflow: {
          name: 'test',
          phases: 'not-an-array'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-array phases');
    });

    it('should reject non-array tags', () => {
      const workflow = {
        workflow: {
          name: 'test',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            tags: 'not-an-array'
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-array tags');
    });

    it('should reject non-number points values', () => {
      const workflow = {
        workflow: {
          name: 'test',
          phases: [{ name: 'work', agent: 'dev' }],
          triggers: {
            points: { min: 'not-a-number' }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-number points');
    });
  });
});

// Export type for WorkflowValidationError (for reference by implementer)
export interface WorkflowValidationErrorType {
  field: string;
  message: string;
}

export interface WorkflowValidationResultType {
  valid: boolean;
  workflow?: {
    name: string;
    description?: string;
    version?: string;
    phases: Array<{
      name: string;
      agent: string;
      input?: string[];
      output?: string[];
      gate?: {
        type: string;
        condition?: string;
      };
    }>;
    triggers?: {
      tags?: string[];
      types?: string[];
      points?: {
        min?: number;
        max?: number;
      };
      default?: boolean;
    };
  };
  errors?: WorkflowValidationErrorType[];
}
