/**
 * Tests for Story 107-1: Gate Schema Validation at Parse Time
 *
 * Validates that gate definitions in workflow YAML are schema-checked
 * when loaded, catching malformed gates early rather than at runtime.
 *
 * ACs:
 * 1. Schema validates gate structure (type, condition, file if present)
 * 2. Parser validates gates at load time, raises clear errors
 * 3. All existing gate definitions conform to schema (no breaking changes)
 * 4. Error messages guide authors on valid gate syntax
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflow } from './workflow-schema.js';

// Known valid gate types used across workflows
const VALID_GATE_TYPES = ['tests_pass', 'tests_fail', 'approval', 'manual'];

describe('Gate Schema Validation (107-1)', () => {

  // ── AC1: Schema validates gate structure ──────────────────────────

  describe('AC1: gate.file field support', () => {

    it('should accept gate with file field alongside type', () => {
      const workflow = {
        workflow: {
          name: 'gate-file-test',
          phases: [
            {
              name: 'green',
              agent: 'dev',
              gate: {
                type: 'tests_pass',
                file: 'gates/tests-pass',
                condition: 'All tests passing'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Gate with file + type should be valid');
      // file field must be preserved in the parsed output — use bracket notation
      // since the type doesn't include 'file' yet (that's what this story adds)
      const gate = result.workflow?.phases?.[0].gate as Record<string, unknown> | undefined;
      assert.strictEqual(gate?.['file'], 'gates/tests-pass', 'gate.file should be preserved in parsed output');
    });

    it('should accept gate with only file (no type) for file-based gates', () => {
      // Forward-looking: file-based gates don't need a legacy type
      const workflow = {
        workflow: {
          name: 'file-only-gate',
          phases: [
            {
              name: 'green',
              agent: 'dev',
              gate: {
                file: 'gates/tests-pass'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Gate with only file field should be valid');
      const gate = result.workflow?.phases?.[0].gate as Record<string, unknown> | undefined;
      assert.strictEqual(gate?.['file'], 'gates/tests-pass');
    });

    it('should reject gate.file that is not a string', () => {
      const workflow = {
        workflow: {
          name: 'bad-file-type',
          phases: [
            {
              name: 'green',
              agent: 'dev',
              gate: {
                type: 'tests_pass',
                file: 123
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Non-string gate.file should be rejected');
      assert.ok(
        result.errors?.some(e => e.field?.includes('gate.file')),
        'Should report error for gate.file field'
      );
    });

    it('should reject gate.file with path traversal', () => {
      const workflow = {
        workflow: {
          name: 'traversal-gate',
          phases: [
            {
              name: 'green',
              agent: 'dev',
              gate: {
                type: 'tests_pass',
                file: '../../../etc/passwd'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Path traversal in gate.file should be rejected');
      assert.ok(
        result.errors?.some(e => e.field?.includes('gate.file') && e.message.includes('traversal')),
        'Error should mention path traversal'
      );
    });

    it('should reject gate.file with empty string', () => {
      const workflow = {
        workflow: {
          name: 'empty-file-gate',
          phases: [
            {
              name: 'green',
              agent: 'dev',
              gate: {
                type: 'tests_pass',
                file: ''
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Empty gate.file should be rejected');
      assert.ok(
        result.errors?.some(e => e.field?.includes('gate.file')),
        'Should report error for empty gate.file'
      );
    });

    it('should reject gate.file with absolute path', () => {
      const workflow = {
        workflow: {
          name: 'absolute-file-gate',
          phases: [
            {
              name: 'green',
              agent: 'dev',
              gate: {
                type: 'tests_pass',
                file: '/etc/gates/tests-pass'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Absolute path in gate.file should be rejected');
      assert.ok(
        result.errors?.some(e => e.field?.includes('gate.file')),
        'Should report error for absolute gate.file path'
      );
    });
  });

  // ── AC2: Parser validates gates at load time ─────────────────────

  describe('AC2: gate type validation', () => {

    it('should accept all known gate types', () => {
      for (const gateType of VALID_GATE_TYPES) {
        const workflow = {
          workflow: {
            name: `gate-type-${gateType}`,
            phases: [
              { name: 'work', agent: 'dev', gate: { type: gateType } }
            ]
          }
        };

        const result = validateWorkflow(workflow);
        assert.strictEqual(result.valid, true, `Gate type '${gateType}' should be valid`);
      }
    });

    it('should reject unknown gate type', () => {
      const workflow = {
        workflow: {
          name: 'bad-gate-type',
          phases: [
            {
              name: 'work',
              agent: 'dev',
              gate: {
                type: 'invalid_nonexistent_type'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Unknown gate type should be rejected');
      assert.ok(
        result.errors?.some(e =>
          e.field?.includes('gate.type') &&
          e.message.includes('invalid_nonexistent_type')
        ),
        'Error should mention the invalid type value'
      );
    });

    it('should reject gate with neither type nor file', () => {
      const workflow = {
        workflow: {
          name: 'empty-gate',
          phases: [
            {
              name: 'work',
              agent: 'dev',
              gate: {
                condition: 'some condition'
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Gate with neither type nor file should be rejected');
      assert.ok(
        result.errors?.some(e => e.field?.includes('gate')),
        'Should report error for gate missing both type and file'
      );
    });

    it('should reject gate.condition that is not a string', () => {
      const workflow = {
        workflow: {
          name: 'bad-condition',
          phases: [
            {
              name: 'work',
              agent: 'dev',
              gate: {
                type: 'tests_pass',
                condition: 42
              }
            }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Non-string gate.condition should be rejected');
      assert.ok(
        result.errors?.some(e => e.field?.includes('gate.condition')),
        'Should report error for non-string condition'
      );
    });
  });

  // ── AC3: Existing gate definitions conform (no breaking changes) ──

  describe('AC3: backward compatibility', () => {

    it('should accept TDD workflow gates with new file field', () => {
      // Simulates the real tdd.yaml after Epic 106 added gate.file
      const workflow = {
        workflow: {
          name: 'tdd',
          phases: [
            { name: 'setup', agent: 'sm' },
            { name: 'red', agent: 'tea', gate: { type: 'tests_fail', condition: 'All ACs have test coverage' } },
            { name: 'green', agent: 'dev', gate: { file: 'gates/tests-pass', type: 'tests_pass', condition: 'All tests passing' } },
            { name: 'review', agent: 'reviewer', gate: { type: 'approval', condition: 'Code review approved' } },
            { name: 'finish', agent: 'sm' }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'TDD workflow with gate.file should be valid');
      // Verify file field is preserved on the green phase
      const greenPhase = result.workflow?.phases?.find(p => p.name === 'green');
      const greenGate = greenPhase?.gate as Record<string, unknown> | undefined;
      assert.strictEqual(greenGate?.['file'], 'gates/tests-pass', 'gate.file should be preserved on green phase');
      assert.strictEqual(greenPhase?.gate?.type, 'tests_pass', 'gate.type should still be preserved');
    });

    it('should accept legacy gates without file field', () => {
      const workflow = {
        workflow: {
          name: 'legacy',
          phases: [
            { name: 'test', agent: 'tea', gate: { type: 'tests_fail' } },
            { name: 'review', agent: 'reviewer', gate: { type: 'approval' } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Legacy gates without file should still validate');
      const gate = result.workflow?.phases?.[0].gate as Record<string, unknown> | undefined;
      assert.strictEqual(gate?.['file'], undefined, 'file should be undefined when not provided');
    });

    it('should accept manual gate type (no file needed)', () => {
      const workflow = {
        workflow: {
          name: 'manual-gate',
          phases: [
            { name: 'deploy', agent: 'devops', gate: { type: 'manual', condition: 'Manual deployment check' } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Manual gate should validate without file');
    });
  });

  // ── AC4: Error messages guide authors ─────────────────────────────

  describe('AC4: helpful error messages', () => {

    it('should list valid gate types in error when unknown type given', () => {
      const workflow = {
        workflow: {
          name: 'unknown-type',
          phases: [
            { name: 'work', agent: 'dev', gate: { type: 'bogus' } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      const typeError = result.errors?.find(e => e.field?.includes('gate.type'));
      assert.ok(typeError, 'Should have gate.type error');
      // Error message should list at least some valid types to guide the author
      assert.ok(
        typeError?.message.includes('tests_pass') || typeError?.message.includes('approval'),
        'Error message should list valid gate types as guidance'
      );
    });

    it('should explain gate.file format in error when invalid', () => {
      const workflow = {
        workflow: {
          name: 'bad-file-format',
          phases: [
            { name: 'work', agent: 'dev', gate: { type: 'tests_pass', file: 123 } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      const fileError = result.errors?.find(e => e.field?.includes('gate.file'));
      assert.ok(fileError, 'Should have gate.file error');
      assert.ok(
        fileError?.message.includes('string') || fileError?.message.includes('gates/'),
        'Error message should explain expected file format'
      );
    });

    it('should include phase index in gate error field path', () => {
      const workflow = {
        workflow: {
          name: 'indexed-error',
          phases: [
            { name: 'ok', agent: 'sm' },
            { name: 'bad', agent: 'dev', gate: { type: 'bogus' } }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors?.some(e => e.field?.includes('phases[1]')),
        'Error field path should include phase index [1]'
      );
    });

    it('should explain that gate needs type or file when both missing', () => {
      const workflow = {
        workflow: {
          name: 'no-type-no-file',
          phases: [
            { name: 'work', agent: 'dev', gate: {} }
          ]
        }
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      const gateError = result.errors?.find(e => e.field?.includes('gate'));
      assert.ok(gateError, 'Should have gate error');
      assert.ok(
        gateError?.message.includes('type') && gateError?.message.includes('file'),
        'Error should mention both type and file as options'
      );
    });
  });
});
