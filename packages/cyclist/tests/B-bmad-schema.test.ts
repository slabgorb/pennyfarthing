/**
 * B-bmad-schema: BMAD Workflow Schema Validation Tests
 *
 * Story: MSSCI-12146 - BMAD compatibility validation suite
 * AC1: Schema validation tests pass for all 12 imported workflows
 *
 * These tests verify that all imported BMAD workflows conform to
 * the Pennyfarthing workflow schema requirements.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = join(__dirname, '../../../pennyfarthing-dist/workflows');

interface WorkflowConfig {
  workflow: {
    name: string;
    description: string;
    version?: string;
    type: 'stepped' | 'procedural' | 'linear';
    steps?: {
      path: string;
      pattern: string;
    };
    // Modes can be standard (create/validate/edit) or custom (any string keys)
    modes?: Record<string, string>;
    variables?: Record<string, string>;
    gates?: {
      after_steps?: number[];
      gate_marker?: string;
    };
    agent?: string;
    triggers?: {
      types?: string[];
      tags?: string[];
    };
    instructions?: string;
    checklist?: string;
  };
}

describe('B-bmad-schema: BMAD Workflow Schema Validation', () => {
  let steppedWorkflows: string[] = [];
  let proceduralWorkflows: string[] = [];
  let allWorkflowPaths: string[] = [];

  beforeAll(async () => {
    // Find all workflow.yaml files in subdirectories
    const entries = await readdir(WORKFLOWS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workflowPath = join(WORKFLOWS_DIR, entry.name, 'workflow.yaml');
        try {
          const content = await readFile(workflowPath, 'utf-8');
          const config = parseYaml(content) as WorkflowConfig;
          allWorkflowPaths.push(workflowPath);

          if (config.workflow.type === 'stepped') {
            steppedWorkflows.push(workflowPath);
          } else if (config.workflow.type === 'procedural') {
            proceduralWorkflows.push(workflowPath);
          }
        } catch {
          // Skip directories without workflow.yaml
        }
      }
    }
  });

  describe('AC1: All workflows have required base fields', () => {
    it('should find at least 10 stepped workflows', () => {
      expect(steppedWorkflows.length).toBeGreaterThanOrEqual(10);
    });

    it('should find at least 12 total BMAD workflows', () => {
      expect(allWorkflowPaths.length).toBeGreaterThanOrEqual(12);
    });

    it('all workflows have name field', async () => {
      for (const path of allWorkflowPaths) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;
        expect(config.workflow.name, `${path} missing name`).toBeDefined();
        expect(typeof config.workflow.name).toBe('string');
        expect(config.workflow.name.length).toBeGreaterThan(0);
      }
    });

    it('all workflows have description field', async () => {
      for (const path of allWorkflowPaths) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;
        expect(config.workflow.description, `${path} missing description`).toBeDefined();
        expect(typeof config.workflow.description).toBe('string');
      }
    });

    it('all workflows have valid type field or phases', async () => {
      const validTypes = ['stepped', 'procedural', 'linear'];

      for (const path of allWorkflowPaths) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;
        const hasType = validTypes.includes(config.workflow.type);
        const hasPhases = Array.isArray((config.workflow as any).phases);
        expect(hasType || hasPhases,
          `${path} has neither valid type (${config.workflow.type}) nor phases`).toBe(true);
      }
    });

    it('all workflows have agent field or phases with agents', async () => {
      for (const path of allWorkflowPaths) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;
        const hasAgent = config.workflow.agent !== undefined;
        const hasPhases = Array.isArray((config.workflow as any).phases);
        expect(hasAgent || hasPhases,
          `${path} missing both agent and phases`).toBe(true);
      }
    });
  });

  describe('Stepped workflow specific requirements', () => {
    it('stepped workflows have steps configuration', async () => {
      for (const path of steppedWorkflows) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;
        expect(config.workflow.steps, `${path} missing steps config`).toBeDefined();
        expect(config.workflow.steps?.path, `${path} missing steps.path`).toBeDefined();
        expect(config.workflow.steps?.pattern, `${path} missing steps.pattern`).toBeDefined();
      }
    });

    it('stepped workflows with modes have valid mode paths', async () => {
      for (const path of steppedWorkflows) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;

        if (config.workflow.modes) {
          const modes = config.workflow.modes;
          const modeEntries = Object.entries(modes);

          // At least one mode must be defined
          expect(modeEntries.length, `${path} has modes but no mode paths`).toBeGreaterThan(0);

          // Each defined mode must be a valid path string starting with ./
          for (const [modeName, modePath] of modeEntries) {
            expect(typeof modePath, `${path} mode ${modeName} should be string`).toBe('string');
            expect(modePath.startsWith('./'), `${path} mode ${modeName} path should start with ./`).toBe(true);
          }
        }
      }
    });

    it('stepped workflows with gates have valid gate config', async () => {
      for (const path of steppedWorkflows) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;

        if (config.workflow.gates) {
          const gates = config.workflow.gates;

          if (gates.after_steps) {
            expect(Array.isArray(gates.after_steps), `${path} gates.after_steps not array`).toBe(true);
            for (const step of gates.after_steps) {
              expect(typeof step, `${path} gate step not number`).toBe('number');
              expect(step).toBeGreaterThan(0);
            }
          }

          if (gates.gate_marker) {
            expect(typeof gates.gate_marker).toBe('string');
          }
        }
      }
    });
  });

  describe('Procedural workflow specific requirements', () => {
    it('procedural workflows have instructions file', async () => {
      for (const path of proceduralWorkflows) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;
        expect(config.workflow.instructions, `${path} missing instructions`).toBeDefined();
      }
    });
  });

  describe('Variable syntax validation', () => {
    it('variables use underscore syntax (not hyphen)', async () => {
      for (const path of allWorkflowPaths) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;

        if (config.workflow.variables) {
          for (const [key, value] of Object.entries(config.workflow.variables)) {
            // Variable names should use underscores
            expect(key, `${path} variable ${key} uses hyphen`).not.toContain('-');

            // Variable references in values should use underscore syntax
            if (typeof value === 'string' && value.includes('{')) {
              const varRefs = value.match(/\{[^}]+\}/g) || [];
              for (const ref of varRefs) {
                expect(ref, `${path} variable reference ${ref} uses hyphen`).not.toMatch(/\{[^}]*-[^}]*\}/);
              }
            }
          }
        }
      }
    });
  });

  describe('Trigger configuration validation', () => {
    it('workflows with triggers have valid trigger structure', async () => {
      for (const path of allWorkflowPaths) {
        const content = await readFile(path, 'utf-8');
        const config = parseYaml(content) as WorkflowConfig;

        if (config.workflow.triggers) {
          const triggers = config.workflow.triggers;

          if (triggers.types) {
            expect(Array.isArray(triggers.types), `${path} triggers.types not array`).toBe(true);
          }

          if (triggers.tags) {
            expect(Array.isArray(triggers.tags), `${path} triggers.tags not array`).toBe(true);
          }
        }
      }
    });
  });
});
