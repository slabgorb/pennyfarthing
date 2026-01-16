/**
 * Tests for Story 31-2: Workflow Loader and Validator
 *
 * These tests define the contract for loading workflow YAML files from disk.
 * The loader (workflow-loader.ts) will implement these functions to pass these tests.
 *
 * Test categories:
 * 1. loadWorkflowFile() - Single file loading
 * 2. loadWorkflowsFromDir() - Directory traversal
 * 3. Integration - Real workflow files from pennyfarthing-dist/
 *
 * Run with: npm test
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Import the loader functions
import { loadWorkflowFile, loadWorkflowsFromDir } from './workflow-loader.js';
// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_workflows__');
// Helper to find monorepo root for integration tests
function findMonorepoRoot(startDir) {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, 'pennyfarthing-dist'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    throw new Error(`Could not find monorepo root from ${startDir}`);
}
describe('Workflow Loader (31-2)', () => {
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
    describe('loadWorkflowFile() - Single file loading', () => {
        it('should load a valid workflow file and return workflow object', () => {
            // AC1: Loads YAML files
            // AC4: Returns structured workflow objects
            const validYaml = `
workflow:
  name: test-workflow
  phases:
    - name: work
      agent: dev
`;
            const filePath = join(TEST_DIR, 'valid.yaml');
            writeFileSync(filePath, validYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, true, 'Should succeed for valid workflow');
            assert.strictEqual(result.filePath, filePath, 'Should include file path');
            assert.ok(result.workflow, 'Should return workflow object');
            assert.strictEqual(result.workflow?.name, 'test-workflow');
            assert.strictEqual(result.workflow?.phases.length, 1);
            assert.strictEqual(result.errors, undefined, 'Should not have errors');
        });
        it('should return error for file not found', () => {
            // AC3: Clear error messages for invalid workflows
            const nonExistentPath = join(TEST_DIR, 'does-not-exist.yaml');
            const result = loadWorkflowFile(nonExistentPath);
            assert.strictEqual(result.success, false, 'Should fail for missing file');
            assert.strictEqual(result.filePath, nonExistentPath, 'Should include file path');
            assert.ok(result.errors, 'Should have errors');
            assert.ok(result.errors.length > 0, 'Should have at least one error');
            assert.ok(result.errors[0].message.toLowerCase().includes('not found') ||
                result.errors[0].message.toLowerCase().includes('enoent'), 'Error should indicate file not found');
        });
        it('should return error for malformed YAML with line info', () => {
            // AC3: Clear error messages
            const malformedYaml = `
workflow:
  name: bad-yaml
  phases:
    - name: work
      agent: dev
    invalid indentation here
`;
            const filePath = join(TEST_DIR, 'malformed.yaml');
            writeFileSync(filePath, malformedYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, false, 'Should fail for malformed YAML');
            assert.ok(result.errors, 'Should have errors');
            assert.ok(result.errors.length > 0, 'Should have at least one error');
            // YAML parse errors should include line info when available
            const errorMessage = result.errors[0].message;
            assert.ok(errorMessage.length > 0, 'Should have error message');
        });
        it('should return validation errors for valid YAML but invalid schema', () => {
            // AC2: Validates each against schema
            // AC3: Clear error messages with field paths
            const invalidSchemaYaml = `
workflow:
  name: missing-phases
`;
            const filePath = join(TEST_DIR, 'invalid-schema.yaml');
            writeFileSync(filePath, invalidSchemaYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, false, 'Should fail for invalid schema');
            assert.ok(result.errors, 'Should have errors');
            assert.ok(result.errors.some(e => e.field?.includes('phases')), 'Should report missing phases field');
        });
        it('should return validation errors for phase without agent', () => {
            // AC2: Validates against schema (uses existing validateWorkflow)
            const missingAgentYaml = `
workflow:
  name: bad-phase
  phases:
    - name: incomplete
`;
            const filePath = join(TEST_DIR, 'missing-agent.yaml');
            writeFileSync(filePath, missingAgentYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, false, 'Should fail for phase without agent');
            assert.ok(result.errors, 'Should have errors');
            assert.ok(result.errors.some(e => e.field?.includes('agent')), 'Should report missing agent');
        });
        it('should handle .yml extension', () => {
            // AC1: Loads YAML files (both .yaml and .yml)
            const validYaml = `
workflow:
  name: yml-extension
  phases:
    - name: work
      agent: dev
`;
            const filePath = join(TEST_DIR, 'valid.yml');
            writeFileSync(filePath, validYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, true, 'Should handle .yml extension');
            assert.strictEqual(result.workflow?.name, 'yml-extension');
        });
        it('should preserve all workflow fields', () => {
            // AC4: Returns structured workflow objects
            const fullYaml = `
workflow:
  name: full-workflow
  description: A complete workflow
  version: "1.0.0"
  phases:
    - name: setup
      agent: sm
      output: [session]
    - name: work
      agent: dev
      input: [session]
      gate:
        type: tests_pass
        condition: All tests green
  triggers:
    types: [feature]
    points:
      min: 3
    default: true
`;
            const filePath = join(TEST_DIR, 'full.yaml');
            writeFileSync(filePath, fullYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.workflow?.description, 'A complete workflow');
            assert.strictEqual(result.workflow?.version, '1.0.0');
            assert.strictEqual(result.workflow?.phases.length, 2);
            assert.deepStrictEqual(result.workflow?.phases[0].output, ['session']);
            assert.strictEqual(result.workflow?.phases[1].gate?.type, 'tests_pass');
            assert.strictEqual(result.workflow?.triggers?.default, true);
        });
    });
    describe('loadWorkflowsFromDir() - Directory loading', () => {
        it('should return empty results for empty directory', () => {
            // Edge case: empty directory
            const result = loadWorkflowsFromDir(TEST_DIR);
            assert.ok(Array.isArray(result.workflows), 'Should have workflows array');
            assert.strictEqual(result.workflows.length, 0, 'Should be empty');
            assert.ok(Array.isArray(result.errors), 'Should have errors array');
            assert.strictEqual(result.errors.length, 0, 'Should have no errors');
        });
        it('should return empty results for non-existent directory', () => {
            // AC3: Clear error handling
            const nonExistentDir = join(TEST_DIR, 'does-not-exist');
            const result = loadWorkflowsFromDir(nonExistentDir);
            assert.strictEqual(result.workflows.length, 0, 'Should have no workflows');
            // Either empty errors or an error about directory not found
            // Implementation choice: return empty or include directory error
        });
        it('should load all valid workflows from directory', () => {
            // AC1: Loads all YAML files from directory
            // AC4: Returns structured workflow objects
            writeFileSync(join(TEST_DIR, 'first.yaml'), `
workflow:
  name: first
  phases:
    - name: work
      agent: dev
`);
            writeFileSync(join(TEST_DIR, 'second.yaml'), `
workflow:
  name: second
  phases:
    - name: work
      agent: tea
`);
            const result = loadWorkflowsFromDir(TEST_DIR);
            assert.strictEqual(result.workflows.length, 2, 'Should load both workflows');
            const names = result.workflows.map(w => w.name).sort();
            assert.deepStrictEqual(names, ['first', 'second']);
            assert.strictEqual(result.errors.length, 0, 'Should have no errors');
        });
        it('should return partial results with errors for mixed directory', () => {
            // AC3: Clear error messages for invalid workflows
            writeFileSync(join(TEST_DIR, 'valid.yaml'), `
workflow:
  name: valid-one
  phases:
    - name: work
      agent: dev
`);
            writeFileSync(join(TEST_DIR, 'invalid.yaml'), `
workflow:
  name: missing-phases
`);
            const result = loadWorkflowsFromDir(TEST_DIR);
            assert.strictEqual(result.workflows.length, 1, 'Should load valid workflow');
            assert.strictEqual(result.workflows[0].name, 'valid-one');
            assert.strictEqual(result.errors.length, 1, 'Should have one error');
            assert.ok(result.errors[0].filePath.includes('invalid.yaml'), 'Error should reference invalid file');
        });
        it('should ignore non-YAML files', () => {
            // AC1: Only loads YAML files
            writeFileSync(join(TEST_DIR, 'workflow.yaml'), `
workflow:
  name: yaml-file
  phases:
    - name: work
      agent: dev
`);
            writeFileSync(join(TEST_DIR, 'readme.md'), '# Not a workflow');
            writeFileSync(join(TEST_DIR, 'config.json'), '{"not": "yaml"}');
            writeFileSync(join(TEST_DIR, '.hidden'), 'hidden file');
            const result = loadWorkflowsFromDir(TEST_DIR);
            assert.strictEqual(result.workflows.length, 1, 'Should only load .yaml file');
            assert.strictEqual(result.workflows[0].name, 'yaml-file');
        });
        it('should handle both .yaml and .yml extensions', () => {
            // AC1: Loads all YAML files
            writeFileSync(join(TEST_DIR, 'first.yaml'), `
workflow:
  name: yaml-ext
  phases:
    - name: work
      agent: dev
`);
            writeFileSync(join(TEST_DIR, 'second.yml'), `
workflow:
  name: yml-ext
  phases:
    - name: work
      agent: dev
`);
            const result = loadWorkflowsFromDir(TEST_DIR);
            assert.strictEqual(result.workflows.length, 2, 'Should load both extensions');
        });
        it('should include file paths in error results', () => {
            // AC3: Clear error messages include file path
            writeFileSync(join(TEST_DIR, 'broken.yaml'), `
workflow:
  phases:
    - name: no-agent
`);
            const result = loadWorkflowsFromDir(TEST_DIR);
            assert.strictEqual(result.errors.length, 1);
            assert.ok(result.errors[0].filePath, 'Error should have filePath');
            assert.ok(result.errors[0].filePath.endsWith('broken.yaml'), 'filePath should be the file that failed');
            assert.ok(Array.isArray(result.errors[0].errors), 'Should have validation errors array');
        });
    });
    describe('Integration with real workflow files', () => {
        it('should successfully load tdd.yaml from pennyfarthing-dist', () => {
            // AC2: Validates against schema
            // AC4: Returns structured workflow objects
            const root = findMonorepoRoot(__dirname);
            const tddPath = join(root, 'pennyfarthing-dist', 'workflows', 'tdd.yaml');
            const result = loadWorkflowFile(tddPath);
            assert.strictEqual(result.success, true, 'tdd.yaml should be valid');
            assert.strictEqual(result.workflow?.name, 'tdd');
            assert.ok(result.workflow?.phases.length >= 4, 'TDD has multiple phases');
        });
        it('should successfully load trivial.yaml from pennyfarthing-dist', () => {
            // AC2: Validates against schema
            const root = findMonorepoRoot(__dirname);
            const trivialPath = join(root, 'pennyfarthing-dist', 'workflows', 'trivial.yaml');
            const result = loadWorkflowFile(trivialPath);
            assert.strictEqual(result.success, true, 'trivial.yaml should be valid');
            assert.strictEqual(result.workflow?.name, 'trivial');
        });
        it('should load all workflows from pennyfarthing-dist/workflows/', () => {
            // AC1: Loads all YAML files from directory
            const root = findMonorepoRoot(__dirname);
            const workflowsDir = join(root, 'pennyfarthing-dist', 'workflows');
            const result = loadWorkflowsFromDir(workflowsDir);
            assert.ok(result.workflows.length >= 2, 'Should load at least tdd and trivial');
            assert.strictEqual(result.errors.length, 0, 'Built-in workflows should be valid');
            const names = result.workflows.map(w => w.name);
            assert.ok(names.includes('tdd'), 'Should include tdd workflow');
            assert.ok(names.includes('trivial'), 'Should include trivial workflow');
        });
    });
    describe('Error message quality', () => {
        it('should provide clear message for missing workflow root key', () => {
            // AC3: Clear error messages
            const noRootYaml = `
name: wrong-structure
phases:
  - name: work
    agent: dev
`;
            const filePath = join(TEST_DIR, 'no-root.yaml');
            writeFileSync(filePath, noRootYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors?.some(e => e.message.toLowerCase().includes('workflow') &&
                (e.message.toLowerCase().includes('missing') || e.message.toLowerCase().includes('root'))), 'Should mention missing workflow root key');
        });
        it('should report multiple validation errors', () => {
            // AC3: Clear error messages (accumulate all errors)
            const multipleErrorsYaml = `
workflow:
  phases:
    - agent: dev
`;
            const filePath = join(TEST_DIR, 'multiple-errors.yaml');
            writeFileSync(filePath, multipleErrorsYaml);
            const result = loadWorkflowFile(filePath);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors, 'Should have errors');
            // Should have errors for: missing name, phase missing name
            assert.ok(result.errors.length >= 2, 'Should report multiple errors');
        });
    });
});
//# sourceMappingURL=workflow-loader.test.js.map