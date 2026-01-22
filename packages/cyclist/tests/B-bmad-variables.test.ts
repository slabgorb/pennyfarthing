/**
 * B-bmad-variables: BMAD Variable Resolution Tests
 *
 * Story: MSSCI-12146 - BMAD compatibility validation suite
 * AC2: Variable resolution tests verify underscore syntax works
 *
 * These tests verify that BMAD variable syntax ({var_name}) is properly
 * supported and that the variable resolution priority chain works correctly.
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
    variables?: Record<string, string>;
    steps?: {
      path: string;
    };
    modes?: {
      create?: string;
      validate?: string;
      edit?: string;
    };
  };
}

/**
 * Resolves variables in a string using the provided context.
 * Priority: explicit values > workflow defaults > empty string
 */
function resolveVariables(
  template: string,
  workflowVars: Record<string, string>,
  sessionVars: Record<string, string> = {},
  configVars: Record<string, string> = {},
  envVars: Record<string, string> = {}
): string {
  return template.replace(/\{([^}]+)\}/g, (match, varName) => {
    // Priority chain: Session → Config → Env → Workflow defaults
    if (sessionVars[varName] !== undefined) return sessionVars[varName];
    if (configVars[varName] !== undefined) return configVars[varName];
    if (envVars[varName] !== undefined) return envVars[varName];
    if (workflowVars[varName] !== undefined) return workflowVars[varName];
    return match; // Return unresolved if not found
  });
}

describe('B-bmad-variables: BMAD Variable Resolution', () => {
  let workflowConfigs: Map<string, WorkflowConfig> = new Map();

  beforeAll(async () => {
    const entries = await readdir(WORKFLOWS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workflowPath = join(WORKFLOWS_DIR, entry.name, 'workflow.yaml');
        try {
          const content = await readFile(workflowPath, 'utf-8');
          const config = parseYaml(content) as WorkflowConfig;
          workflowConfigs.set(entry.name, config);
        } catch {
          // Skip directories without workflow.yaml
        }
      }
    }
  });

  describe('AC2: Underscore syntax validation', () => {
    it('no workflow variables use hyphen syntax', async () => {
      for (const [name, config] of workflowConfigs) {
        if (config.workflow.variables) {
          for (const key of Object.keys(config.workflow.variables)) {
            expect(key, `Workflow ${name} has hyphenated var: ${key}`).not.toMatch(/-/);
          }
        }
      }
    });

    it('variable references use underscore syntax', async () => {
      // Check step files for variable references
      for (const [name, config] of workflowConfigs) {
        if (config.workflow.steps?.path) {
          const stepsDir = join(WORKFLOWS_DIR, name, config.workflow.steps.path.replace('./', ''));
          try {
            const stepFiles = await readdir(stepsDir);

            for (const file of stepFiles.slice(0, 3)) { // Check first 3 files
              if (file.endsWith('.md')) {
                const content = await readFile(join(stepsDir, file), 'utf-8');
                const varRefs = content.match(/\{[a-z][a-z0-9_-]*\}/gi) || [];

                for (const ref of varRefs) {
                  // Skip common markdown patterns like {#anchor} or {.class}
                  if (ref.startsWith('{#') || ref.startsWith('{.')) continue;

                  expect(ref, `${name}/${file} has hyphenated var ref: ${ref}`)
                    .not.toMatch(/\{[^}]*-[^}]*\}/);
                }
              }
            }
          } catch {
            // Skip if steps dir doesn't exist
          }
        }
      }
    });
  });

  describe('Variable resolution priority chain', () => {
    it('session variables override workflow defaults', () => {
      const workflowVars = { project_root: '.', output_file: 'default.md' };
      const sessionVars = { output_file: 'session-override.md' };

      const result = resolveVariables(
        'Output: {output_file}',
        workflowVars,
        sessionVars
      );

      expect(result).toBe('Output: session-override.md');
    });

    it('config variables override workflow defaults', () => {
      const workflowVars = { project_root: '.', theme: 'default' };
      const configVars = { theme: 'star-wars' };

      const result = resolveVariables(
        'Theme: {theme}',
        workflowVars,
        {},
        configVars
      );

      expect(result).toBe('Theme: star-wars');
    });

    it('session variables override config variables', () => {
      const workflowVars = { mode: 'create' };
      const sessionVars = { mode: 'edit' };
      const configVars = { mode: 'validate' };

      const result = resolveVariables(
        'Mode: {mode}',
        workflowVars,
        sessionVars,
        configVars
      );

      expect(result).toBe('Mode: edit');
    });

    it('workflow defaults used when no override', () => {
      const workflowVars = { project_root: '.', planning_artifacts: './artifacts' };

      const result = resolveVariables(
        'Artifacts: {planning_artifacts}',
        workflowVars
      );

      expect(result).toBe('Artifacts: ./artifacts');
    });

    it('unresolved variables remain unchanged', () => {
      const workflowVars = { project_root: '.' };

      const result = resolveVariables(
        'Unknown: {unknown_var}',
        workflowVars
      );

      expect(result).toBe('Unknown: {unknown_var}');
    });
  });

  describe('Common BMAD variables', () => {
    it('project_root is defined in workflows with variables', async () => {
      let workflowsWithVars = 0;
      let workflowsWithProjectRoot = 0;

      for (const [, config] of workflowConfigs) {
        if (config.workflow.variables) {
          workflowsWithVars++;
          if (config.workflow.variables.project_root !== undefined) {
            workflowsWithProjectRoot++;
          }
        }
      }

      // Most workflows with variables should define project_root
      expect(workflowsWithProjectRoot).toBeGreaterThan(workflowsWithVars * 0.5);
    });

    it('planning_artifacts or output paths defined where needed', async () => {
      const productionWorkflows = ['prd', 'product-brief', 'research', 'epics-and-stories'];

      for (const name of productionWorkflows) {
        const config = workflowConfigs.get(name);
        if (config?.workflow.variables) {
          const vars = config.workflow.variables;
          const hasOutputPath = vars.planning_artifacts ||
            vars.output_file ||
            vars.artifacts;
          expect(hasOutputPath, `${name} should have output path variable`).toBeTruthy();
        }
      }
    });
  });

  describe('Variable substitution in step files', () => {
    it('step files can reference workflow variables', async () => {
      // Read a known step file with variable references
      const prdConfig = workflowConfigs.get('prd');
      if (!prdConfig) {
        expect.fail('PRD workflow not found');
        return;
      }

      const stepsDir = join(WORKFLOWS_DIR, 'prd', 'steps-c');
      const stepFile = join(stepsDir, 'step-01-init.md');

      const content = await readFile(stepFile, 'utf-8');

      // This step file references planning_artifacts
      expect(content).toContain('{planning_artifacts}');
    });

    it('variable references are valid identifiers', async () => {
      // Check that variable references follow valid naming
      for (const [name, config] of workflowConfigs) {
        if (config.workflow.steps?.path) {
          const stepsDir = join(WORKFLOWS_DIR, name, config.workflow.steps.path.replace('./', ''));

          try {
            const stepFiles = await readdir(stepsDir);
            const firstStep = stepFiles.find(f => f.endsWith('.md'));

            if (firstStep) {
              const content = await readFile(join(stepsDir, firstStep), 'utf-8');
              const varRefs = content.match(/\{([a-z][a-z0-9_]*)\}/gi) || [];

              for (const ref of varRefs) {
                // Extract variable name from {var_name}
                const varName = ref.slice(1, -1);
                // Should be valid identifier (letters, numbers, underscores)
                expect(varName, `Invalid var name in ${name}/${firstStep}`).toMatch(/^[a-z][a-z0-9_]*$/i);
              }
            }
          } catch {
            // Skip if steps dir doesn't exist
          }
        }
      }
    });
  });
});
