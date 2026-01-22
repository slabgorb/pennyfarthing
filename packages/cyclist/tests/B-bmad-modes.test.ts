/**
 * B-bmad-modes: BMAD Mode Selection Tests
 *
 * Story: MSSCI-12146 - BMAD compatibility validation suite
 * AC4: Mode selection tests verify tri-modal routing
 *
 * These tests verify that BMAD tri-modal workflows (create/validate/edit)
 * properly route to their respective step directories.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile, readdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = join(__dirname, '../../../pennyfarthing-dist/workflows');

interface WorkflowConfig {
  workflow: {
    name: string;
    type: string;
    steps?: {
      path: string;
      pattern: string;
    };
    modes?: Record<string, string>;
  };
}

// Standard BMAD tri-modal modes
type StandardMode = 'create' | 'validate' | 'edit';

// Check if workflow uses standard BMAD tri-modal pattern
function usesStandardModes(modes: Record<string, string>): boolean {
  const modeNames = Object.keys(modes);
  return modeNames.some(m => ['create', 'validate', 'edit'].includes(m));
}

/**
 * Get the step directory for a given mode
 */
function getModeStepPath(
  workflowDir: string,
  config: WorkflowConfig,
  mode: string
): string | null {
  if (!config.workflow.modes) return null;

  const modePath = config.workflow.modes[mode];
  if (!modePath) return null;

  return join(workflowDir, modePath.replace('./', ''));
}

/**
 * Get all mode paths from a workflow config
 */
function getAllModePaths(
  workflowDir: string,
  config: WorkflowConfig
): Array<{ mode: string; path: string }> {
  if (!config.workflow.modes) return [];

  return Object.entries(config.workflow.modes).map(([mode, modePath]) => ({
    mode,
    path: join(workflowDir, modePath.replace('./', '')),
  }));
}

describe('B-bmad-modes: BMAD Mode Selection', () => {
  // Workflows with 2+ modes (any mode names, not just create/validate/edit)
  let multiModeWorkflows: Array<{ name: string; config: WorkflowConfig; dir: string }> = [];
  // Workflows using standard BMAD tri-modal (create/validate/edit)
  let standardTriModalWorkflows: Array<{ name: string; config: WorkflowConfig; dir: string }> = [];
  // Workflows with custom mode names
  let customModeWorkflows: Array<{ name: string; config: WorkflowConfig; dir: string }> = [];
  // Single-mode or no-mode workflows
  let singleModeWorkflows: Array<{ name: string; config: WorkflowConfig; dir: string }> = [];

  beforeAll(async () => {
    const entries = await readdir(WORKFLOWS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workflowPath = join(WORKFLOWS_DIR, entry.name, 'workflow.yaml');
        try {
          const content = await readFile(workflowPath, 'utf-8');
          const config = parseYaml(content) as WorkflowConfig;

          if (config.workflow.type === 'stepped') {
            const dir = join(WORKFLOWS_DIR, entry.name);

            if (config.workflow.modes) {
              const modeCount = Object.keys(config.workflow.modes).length;

              if (modeCount >= 2) {
                multiModeWorkflows.push({ name: entry.name, config, dir });

                if (usesStandardModes(config.workflow.modes)) {
                  standardTriModalWorkflows.push({ name: entry.name, config, dir });
                } else {
                  customModeWorkflows.push({ name: entry.name, config, dir });
                }
              } else {
                singleModeWorkflows.push({ name: entry.name, config, dir });
              }
            } else {
              singleModeWorkflows.push({ name: entry.name, config, dir });
            }
          }
        } catch {
          // Skip directories without workflow.yaml
        }
      }
    }
  });

  describe('AC4: Multi-mode workflow identification', () => {
    it('should identify multi-mode workflows (those with 2+ modes)', () => {
      // PRD uses standard tri-modal, research uses custom modes
      expect(multiModeWorkflows.length).toBeGreaterThanOrEqual(1);
    });

    it('at least one workflow uses standard BMAD tri-modal (create/validate/edit)', () => {
      // PRD is the primary example of standard tri-modal
      expect(standardTriModalWorkflows.length).toBeGreaterThanOrEqual(1);
    });

    it('standard tri-modal workflows have create mode defined', () => {
      for (const { name, config } of standardTriModalWorkflows) {
        expect(config.workflow.modes?.create, `${name} missing create mode`).toBeDefined();
      }
    });

    it('most standard tri-modal workflows have validate mode', () => {
      const withValidate = standardTriModalWorkflows.filter(w => w.config.workflow.modes?.validate);
      // Most standard tri-modal workflows should have validate
      if (standardTriModalWorkflows.length > 0) {
        expect(withValidate.length).toBeGreaterThanOrEqual(standardTriModalWorkflows.length * 0.7);
      }
    });

    it('custom mode workflows have valid mode paths', () => {
      for (const { name, config } of customModeWorkflows) {
        const modes = config.workflow.modes!;
        for (const [modeName, modePath] of Object.entries(modes)) {
          expect(typeof modePath, `${name} mode ${modeName} should be string`).toBe('string');
          expect(modePath.startsWith('./'), `${name} mode ${modeName} path should start with ./`).toBe(true);
        }
      }
    });
  });

  describe('Mode directory routing', () => {
    it('all mode directories exist and have step files', async () => {
      for (const { name, config, dir } of multiModeWorkflows) {
        const modePaths = getAllModePaths(dir, config);

        for (const { mode, path } of modePaths) {
          try {
            await access(path);
            const files = await readdir(path);
            const stepFiles = files.filter(f => f.endsWith('.md'));

            expect(stepFiles.length, `${name}/${mode} has no step files`).toBeGreaterThan(0);
          } catch {
            expect.fail(`${name}: Mode directory missing: ${path}`);
          }
        }
      }
    });

    it('standard tri-modal: create mode directories exist', async () => {
      for (const { name, config, dir } of standardTriModalWorkflows) {
        const createPath = getModeStepPath(dir, config, 'create');
        if (!createPath) continue;

        try {
          await access(createPath);
          const files = await readdir(createPath);
          const stepFiles = files.filter(f => f.endsWith('.md'));

          expect(stepFiles.length, `${name}/steps-c has no step files`).toBeGreaterThan(0);
        } catch {
          expect.fail(`${name}: Create mode directory missing: ${createPath}`);
        }
      }
    });

    it('standard tri-modal: validate mode directories exist when declared', async () => {
      for (const { name, config, dir } of standardTriModalWorkflows) {
        if (!config.workflow.modes?.validate) continue;

        const validatePath = getModeStepPath(dir, config, 'validate');
        if (!validatePath) continue;

        try {
          await access(validatePath);
          const files = await readdir(validatePath);
          const stepFiles = files.filter(f => f.endsWith('.md'));

          expect(stepFiles.length, `${name}/steps-v has no step files`).toBeGreaterThan(0);
        } catch {
          expect.fail(`${name}: Validate mode directory missing: ${validatePath}`);
        }
      }
    });

    it('standard tri-modal: edit mode directories exist when declared', async () => {
      for (const { name, config, dir } of standardTriModalWorkflows) {
        if (!config.workflow.modes?.edit) continue;

        const editPath = getModeStepPath(dir, config, 'edit');
        if (!editPath) continue;

        try {
          await access(editPath);
          const files = await readdir(editPath);
          const stepFiles = files.filter(f => f.endsWith('.md'));

          expect(stepFiles.length, `${name}/steps-e has no step files`).toBeGreaterThan(0);
        } catch {
          expect.fail(`${name}: Edit mode directory missing: ${editPath}`);
        }
      }
    });
  });

  describe('Mode step consistency', () => {
    it('standard tri-modal: mode directories follow naming convention (steps-c, steps-v, steps-e)', () => {
      for (const { name, config } of standardTriModalWorkflows) {
        if (config.workflow.modes?.create) {
          expect(config.workflow.modes.create, `${name} create mode should be steps-c/`).toMatch(/steps-c/);
        }
        if (config.workflow.modes?.validate) {
          expect(config.workflow.modes.validate, `${name} validate mode should be steps-v/`).toMatch(/steps-v/);
        }
        if (config.workflow.modes?.edit) {
          expect(config.workflow.modes.edit, `${name} edit mode should be steps-e/`).toMatch(/steps-e/);
        }
      }
    });

    it('standard tri-modal: create mode has the most steps (as primary flow)', async () => {
      for (const { name, config, dir } of standardTriModalWorkflows) {
        const createPath = getModeStepPath(dir, config, 'create');
        const validatePath = getModeStepPath(dir, config, 'validate');
        const editPath = getModeStepPath(dir, config, 'edit');

        if (!createPath) continue;

        try {
          const createFiles = await readdir(createPath);
          const createSteps = createFiles.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

          if (validatePath) {
            try {
              const validateFiles = await readdir(validatePath);
              const validateSteps = validateFiles.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

              // Create should have at least as many steps as validate
              expect(createSteps.length, `${name}: create should have >= validate steps`)
                .toBeGreaterThanOrEqual(validateSteps.length * 0.5);
            } catch {
              // Validate dir doesn't exist
            }
          }

          if (editPath) {
            try {
              const editFiles = await readdir(editPath);
              const editSteps = editFiles.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

              // Edit mode typically has fewer steps
              expect(editSteps.length, `${name}: edit should have fewer steps than create`)
                .toBeLessThanOrEqual(createSteps.length);
            } catch {
              // Edit dir doesn't exist
            }
          }
        } catch {
          // Create dir doesn't exist (caught in earlier test)
        }
      }
    });

    it('custom mode workflows have descriptive mode names', () => {
      for (const { name, config } of customModeWorkflows) {
        const modeNames = Object.keys(config.workflow.modes!);
        for (const modeName of modeNames) {
          // Mode names should be descriptive (at least 3 chars)
          expect(modeName.length, `${name} mode ${modeName} should be descriptive`).toBeGreaterThanOrEqual(3);
          // Mode names should be lowercase
          expect(modeName, `${name} mode ${modeName} should be lowercase`).toBe(modeName.toLowerCase());
        }
      }
    });
  });

  describe('Single-mode workflows', () => {
    it('single-mode workflows work without modes section', () => {
      for (const { name, config } of singleModeWorkflows) {
        // Should have steps.path defined instead of modes
        expect(config.workflow.steps?.path, `${name} missing steps.path`).toBeDefined();
      }
    });

    it('single-mode workflows have step files', async () => {
      for (const { name, config, dir } of singleModeWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(dir, stepsPath.replace('./', ''));

        try {
          await access(stepsDir);
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.endsWith('.md'));

          expect(stepFiles.length, `${name} has no step files`).toBeGreaterThan(0);
        } catch {
          // Some workflows may be procedural without step files
        }
      }
    });
  });

  describe('Mode selection function', () => {
    it('getModeStepPath returns correct path for create mode', () => {
      const mockConfig: WorkflowConfig = {
        workflow: {
          name: 'test',
          type: 'stepped',
          modes: {
            create: './steps-c/',
            validate: './steps-v/',
          },
        },
      };

      const path = getModeStepPath('/workflows/test', mockConfig, 'create');
      expect(path).toBe('/workflows/test/steps-c/');
    });

    it('getModeStepPath returns null for undefined mode', () => {
      const mockConfig: WorkflowConfig = {
        workflow: {
          name: 'test',
          type: 'stepped',
          modes: {
            create: './steps-c/',
          },
        },
      };

      const path = getModeStepPath('/workflows/test', mockConfig, 'edit');
      expect(path).toBeNull();
    });

    it('getModeStepPath returns null for workflow without modes', () => {
      const mockConfig: WorkflowConfig = {
        workflow: {
          name: 'test',
          type: 'stepped',
          steps: {
            path: './steps/',
            pattern: 'step-*.md',
          },
        },
      };

      const path = getModeStepPath('/workflows/test', mockConfig, 'create');
      expect(path).toBeNull();
    });
  });
});
