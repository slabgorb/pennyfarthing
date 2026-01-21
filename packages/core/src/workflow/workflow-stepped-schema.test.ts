/**
 * Tests for Story MSSCI-12078: Workflow YAML schema extension for type: stepped
 *
 * These tests define the contract for stepped workflow schema validation.
 * The implementation will extend validateWorkflow() to pass these tests.
 *
 * Schema extensions:
 * - type: 'stepped' | 'phased' (phased is default for backward compat)
 * - steps: { path, pattern } (required for stepped workflows)
 * - modes: { default, create, validate, edit } (optional tri-modal support)
 * - variables: object (optional key-value pairs)
 * - gates: { after_steps, gate_marker } (optional gate configuration)
 * - template: string (optional output template path)
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { validateWorkflow } from './workflow-schema.js';

describe('Stepped Workflow Schema (MSSCI-12078)', () => {

  describe('AC1: Workflow YAML supports type field (stepped | phased)', () => {

    it('should accept type: phased explicitly', () => {
      const workflow = {
        workflow: {
          name: 'explicit-phased',
          type: 'phased',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept explicit type: phased');
      assert.strictEqual(result.workflow?.type, 'phased');
    });

    it('should accept type: stepped with required steps config', () => {
      const workflow = {
        workflow: {
          name: 'stepped-workflow',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept type: stepped');
      assert.strictEqual(result.workflow?.type, 'stepped');
    });

    it('should default to type: phased when type field is absent', () => {
      const workflow = {
        workflow: {
          name: 'implicit-phased',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept workflow without explicit type');
      // Type should default to 'phased' for backward compatibility
      assert.strictEqual(result.workflow?.type ?? 'phased', 'phased');
    });

    it('should reject invalid type value', () => {
      const workflow = {
        workflow: {
          name: 'bad-type',
          type: 'invalid-type',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject invalid type');
      assert.ok(
        result.errors?.some(e => e.field?.includes('type')),
        'Should report invalid type error'
      );
    });

    it('should reject type: stepped without steps configuration', () => {
      const workflow = {
        workflow: {
          name: 'stepped-no-steps',
          type: 'stepped',
          agent: 'architect'
          // Missing required 'steps' for stepped workflow
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject stepped without steps');
      assert.ok(
        result.errors?.some(e => e.message?.includes('steps')),
        'Should report missing steps for stepped workflow'
      );
    });

    it('should reject type: stepped with phases (mutually exclusive)', () => {
      const workflow = {
        workflow: {
          name: 'stepped-with-phases',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject stepped with phases');
      assert.ok(
        result.errors?.some(e => e.message?.includes('phases') || e.message?.includes('mutually exclusive')),
        'Should report phases not allowed with stepped'
      );
    });

    it('should reject type: phased without phases', () => {
      const workflow = {
        workflow: {
          name: 'phased-no-phases',
          type: 'phased'
          // Missing required 'phases' for phased workflow
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject phased without phases');
    });
  });

  describe('AC2: Steps configuration validates path and pattern', () => {

    it('should accept valid steps configuration', () => {
      const workflow = {
        workflow: {
          name: 'valid-steps',
          type: 'stepped',
          steps: {
            path: './architecture-steps/',
            pattern: 'step-{nn}-*.md'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept valid steps config');
      assert.strictEqual(result.workflow?.steps?.path, './architecture-steps/');
      assert.strictEqual(result.workflow?.steps?.pattern, 'step-{nn}-*.md');
    });

    it('should require path in steps configuration', () => {
      const workflow = {
        workflow: {
          name: 'missing-path',
          type: 'stepped',
          steps: {
            pattern: 'step-{nn}-*.md'
            // Missing required 'path'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject steps without path');
      assert.ok(
        result.errors?.some(e => e.field?.includes('steps.path')),
        'Should report missing steps.path'
      );
    });

    it('should require pattern in steps configuration', () => {
      const workflow = {
        workflow: {
          name: 'missing-pattern',
          type: 'stepped',
          steps: {
            path: './steps/'
            // Missing required 'pattern'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject steps without pattern');
      assert.ok(
        result.errors?.some(e => e.field?.includes('steps.pattern')),
        'Should report missing steps.pattern'
      );
    });

    it('should reject non-string path', () => {
      const workflow = {
        workflow: {
          name: 'bad-path-type',
          type: 'stepped',
          steps: {
            path: 123,
            pattern: 'step-{nn}-*.md'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-string path');
    });

    it('should reject non-string pattern', () => {
      const workflow = {
        workflow: {
          name: 'bad-pattern-type',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: ['step-*.md']
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-string pattern');
    });

    it('should reject empty path string', () => {
      const workflow = {
        workflow: {
          name: 'empty-path',
          type: 'stepped',
          steps: {
            path: '',
            pattern: 'step-{nn}-*.md'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject empty path');
      assert.ok(
        result.errors?.some(e => e.message?.includes('empty')),
        'Should report empty path error'
      );
    });

    it('should reject whitespace-only path string', () => {
      const workflow = {
        workflow: {
          name: 'whitespace-path',
          type: 'stepped',
          steps: {
            path: '   ',
            pattern: 'step-{nn}-*.md'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject whitespace-only path');
    });

    it('should reject empty pattern string', () => {
      const workflow = {
        workflow: {
          name: 'empty-pattern',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: ''
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject empty pattern');
      assert.ok(
        result.errors?.some(e => e.message?.includes('empty')),
        'Should report empty pattern error'
      );
    });
  });

  describe('AC3: Modes configuration supports tri-modal paths', () => {

    it('should accept modes configuration with all paths', () => {
      const workflow = {
        workflow: {
          name: 'trimodal',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          modes: {
            default: 'create',
            create: './steps/',
            validate: './steps-v/',
            edit: './steps-e/'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept full modes config');
      assert.strictEqual(result.workflow?.modes?.default, 'create');
      assert.strictEqual(result.workflow?.modes?.create, './steps/');
      assert.strictEqual(result.workflow?.modes?.validate, './steps-v/');
      assert.strictEqual(result.workflow?.modes?.edit, './steps-e/');
    });

    it('should accept modes with only default and create', () => {
      const workflow = {
        workflow: {
          name: 'minimal-modes',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          modes: {
            default: 'create',
            create: './steps/'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept partial modes config');
    });

    it('should accept stepped workflow without modes (optional)', () => {
      const workflow = {
        workflow: {
          name: 'no-modes',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept stepped without modes');
    });

    it('should reject invalid default mode value', () => {
      const workflow = {
        workflow: {
          name: 'bad-default-mode',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          modes: {
            default: 'invalid-mode',
            create: './steps/'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject invalid default mode');
      assert.ok(
        result.errors?.some(e => e.field?.includes('modes.default')),
        'Should report invalid modes.default'
      );
    });

    it('should reject modes on phased workflow', () => {
      const workflow = {
        workflow: {
          name: 'phased-with-modes',
          type: 'phased',
          phases: [
            { name: 'work', agent: 'dev' }
          ],
          modes: {
            default: 'create',
            create: './steps/'
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject modes on phased workflow');
      assert.ok(
        result.errors?.some(e => e.message?.includes('modes') && e.message?.includes('stepped')),
        'Should report modes only valid for stepped'
      );
    });
  });

  describe('Variables, gates, and template fields', () => {

    it('should accept variables object', () => {
      const workflow = {
        workflow: {
          name: 'with-variables',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          variables: {
            output_file: 'planning-artifacts/architecture.md',
            project_name: 'My Project'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept variables');
      assert.deepStrictEqual(result.workflow?.variables, {
        output_file: 'planning-artifacts/architecture.md',
        project_name: 'My Project'
      });
    });

    it('should accept gates configuration', () => {
      const workflow = {
        workflow: {
          name: 'with-gates',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          gates: {
            after_steps: [1, 3, 7],
            gate_marker: '<!-- GATE -->'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept gates config');
      assert.deepStrictEqual(result.workflow?.gates?.after_steps, [1, 3, 7]);
      assert.strictEqual(result.workflow?.gates?.gate_marker, '<!-- GATE -->');
    });

    it('should accept gates with only after_steps', () => {
      const workflow = {
        workflow: {
          name: 'gates-after-only',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          gates: {
            after_steps: [2, 5]
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept gates with only after_steps');
    });

    it('should accept gates with only gate_marker', () => {
      const workflow = {
        workflow: {
          name: 'gates-marker-only',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          gates: {
            gate_marker: '<!-- USER_GATE -->'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept gates with only gate_marker');
    });

    it('should reject non-array after_steps', () => {
      const workflow = {
        workflow: {
          name: 'bad-after-steps',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          gates: {
            after_steps: 'not-an-array'
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-array after_steps');
    });

    it('should reject non-number values in after_steps', () => {
      const workflow = {
        workflow: {
          name: 'bad-after-steps-values',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          gates: {
            after_steps: [1, 'two', 3]
          },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-number in after_steps');
    });

    it('should accept template path', () => {
      const workflow = {
        workflow: {
          name: 'with-template',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          template: './templates/architecture-template.md',
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Should accept template');
      assert.strictEqual(result.workflow?.template, './templates/architecture-template.md');
    });

    it('should reject non-string template', () => {
      const workflow = {
        workflow: {
          name: 'bad-template',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-{nn}-*.md'
          },
          template: { path: './templates/' },
          agent: 'architect'
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Should reject non-string template');
    });
  });

  describe('AC4: Existing phased workflows work unchanged', () => {

    it('should validate existing TDD workflow unchanged', () => {
      const workflow = {
        workflow: {
          name: 'tdd',
          description: 'Test-driven development with code review',
          version: '1.0.0',
          phases: [
            { name: 'setup', agent: 'sm', output: ['session_file', 'branches'] },
            { name: 'red', agent: 'tea', input: ['session_file'], output: ['failing_tests'], gate: { type: 'tests_fail' } },
            { name: 'green', agent: 'dev', input: ['failing_tests'], output: ['implementation'], gate: { type: 'tests_pass' } },
            { name: 'review', agent: 'reviewer', input: ['implementation'], gate: { type: 'approval' } },
            { name: 'finish', agent: 'sm', input: ['approval'] }
          ],
          triggers: {
            types: ['feature', 'enhancement'],
            points: { min: 3 },
            default: true
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'TDD workflow should still validate');
      assert.strictEqual(result.workflow?.name, 'tdd');
      assert.strictEqual(result.workflow?.phases?.length, 5);
    });

    it('should validate existing trivial workflow unchanged', () => {
      const workflow = {
        workflow: {
          name: 'trivial',
          description: 'Quick fixes without full TDD ceremony',
          version: '1.0.0',
          phases: [
            { name: 'setup', agent: 'sm' },
            { name: 'impl', agent: 'dev', gate: { type: 'tests_pass' } },
            { name: 'review', agent: 'reviewer', gate: { type: 'approval' } },
            { name: 'finish', agent: 'sm' }
          ],
          triggers: {
            types: ['chore', 'fix', 'refactor'],
            points: { max: 2 }
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Trivial workflow should still validate');
    });

    it('should validate minimal phased workflow unchanged', () => {
      const workflow = {
        workflow: {
          name: 'minimal',
          phases: [
            { name: 'work', agent: 'dev' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Minimal workflow should still validate');
    });
  });

  describe('Complete stepped workflow example', () => {

    it('should accept full architecture stepped workflow', () => {
      const workflow = {
        workflow: {
          name: 'architecture',
          description: 'Collaborative architectural decision-making workflow',
          version: '1.0.0',
          type: 'stepped',
          agent: 'architect',

          steps: {
            path: './architecture-steps/',
            pattern: 'step-{nn}-*.md'
          },

          modes: {
            default: 'create',
            create: './architecture-steps/',
            validate: './architecture-steps-v/',
            edit: './architecture-steps-e/'
          },

          variables: {
            output_file: 'planning-artifacts/architecture.md',
            input_required: ['prd']
          },

          gates: {
            after_steps: [1, 4, 7],
            gate_marker: '<!-- GATE -->'
          },

          template: './templates/architecture-template.md',

          triggers: {
            tags: ['architecture', 'design'],
            types: ['feature']
          }
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Full architecture workflow should validate');
      assert.strictEqual(result.workflow?.type, 'stepped');
      assert.strictEqual(result.workflow?.name, 'architecture');
      assert.strictEqual(result.workflow?.agent, 'architect');
      assert.ok(result.workflow?.steps, 'Should have steps');
      assert.ok(result.workflow?.modes, 'Should have modes');
      assert.ok(result.workflow?.variables, 'Should have variables');
      assert.ok(result.workflow?.gates, 'Should have gates');
      assert.ok(result.workflow?.template, 'Should have template');
    });
  });
});
