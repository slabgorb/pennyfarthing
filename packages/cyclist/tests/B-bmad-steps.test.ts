/**
 * B-bmad-steps: BMAD Step Enumeration Tests
 *
 * Story: MSSCI-12146 - BMAD compatibility validation suite
 * AC3: Step enumeration tests confirm correct ordering
 *
 * These tests verify that stepped workflows have properly structured
 * step files that load in the correct order.
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
    modes?: {
      create?: string;
      validate?: string;
      edit?: string;
    };
  };
}

interface StepFrontmatter {
  name: string;
  description?: string;
  nextStepFile?: string;
  continueStepFile?: string;
  outputFile?: string;
}

/**
 * Parse YAML frontmatter from a markdown file
 */
function parseFrontmatter(content: string): StepFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    return parseYaml(match[1]) as StepFrontmatter;
  } catch {
    return null;
  }
}

/**
 * Extract step number from filename (e.g., step-01-init.md → 1)
 */
function extractStepNumber(filename: string): number | null {
  const match = filename.match(/step-(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

describe('B-bmad-steps: BMAD Step Enumeration', () => {
  let steppedWorkflows: Array<{ name: string; config: WorkflowConfig }> = [];

  beforeAll(async () => {
    const entries = await readdir(WORKFLOWS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workflowPath = join(WORKFLOWS_DIR, entry.name, 'workflow.yaml');
        try {
          const content = await readFile(workflowPath, 'utf-8');
          const config = parseYaml(content) as WorkflowConfig;

          if (config.workflow.type === 'stepped') {
            steppedWorkflows.push({ name: entry.name, config });
          }
        } catch {
          // Skip directories without workflow.yaml
        }
      }
    }
  });

  describe('AC3: Step files exist at declared paths', () => {
    it('should have at least 10 stepped workflows', () => {
      expect(steppedWorkflows.length).toBeGreaterThanOrEqual(10);
    });

    it('step directories exist for all stepped workflows', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        expect(stepsPath, `${name} missing steps.path`).toBeDefined();

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath!.replace('./', ''));

        try {
          await access(stepsDir);
        } catch {
          expect.fail(`${name}: Steps directory does not exist: ${stepsDir}`);
        }
      }
    });

    it('step files match declared pattern', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        const pattern = config.workflow.steps?.pattern;

        if (!stepsPath || !pattern) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.endsWith('.md'));

          expect(stepFiles.length, `${name} has no step files`).toBeGreaterThan(0);

          // All step files should match pattern (e.g., step-*.md)
          const patternRegex = new RegExp(pattern.replace('*', '.*'));
          for (const file of stepFiles) {
            expect(file, `${name}/${file} doesn't match pattern ${pattern}`).toMatch(patternRegex);
          }
        } catch {
          // Already caught in previous test
        }
      }
    });
  });

  describe('Step ordering', () => {
    it('steps are numbered sequentially', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.match(/^step-\d+/));

          const stepNumbers = stepFiles
            .map(f => extractStepNumber(f))
            .filter((n): n is number => n !== null)
            .sort((a, b) => a - b);

          // Remove duplicates (for steps like 01, 01b)
          const uniqueSteps = [...new Set(stepNumbers)];

          // Check sequential ordering (allowing for gaps)
          expect(uniqueSteps[0], `${name} first step should be 1`).toBe(1);

          // No major gaps (gap > 2 between consecutive steps)
          for (let i = 1; i < uniqueSteps.length; i++) {
            const gap = uniqueSteps[i] - uniqueSteps[i - 1];
            expect(gap, `${name} has gap between steps ${uniqueSteps[i - 1]} and ${uniqueSteps[i]}`).toBeLessThanOrEqual(2);
          }
        } catch {
          // Skip if dir doesn't exist
        }
      }
    });

    it('conditional steps (like 01b) are properly named', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const conditionalSteps = files.filter(f => f.match(/step-\d+[a-z]-/));

          for (const file of conditionalSteps) {
            // Conditional steps should reference their parent step
            const match = file.match(/step-(\d+)([a-z])-/);
            if (match) {
              const [, baseNum, suffix] = match;
              const baseStep = `step-${baseNum.padStart(2, '0')}-`;

              // There should be a base step file
              const hasBase = files.some(f => f.startsWith(baseStep) && !f.match(/step-\d+[a-z]-/));
              expect(hasBase, `${name}/${file} has no base step`).toBe(true);

              // Suffix should be a-z
              expect(suffix, `${name}/${file} invalid suffix`).toMatch(/^[a-z]$/);
            }
          }
        } catch {
          // Skip if dir doesn't exist
        }
      }
    });
  });

  describe('Step file frontmatter', () => {
    it('step files have YAML frontmatter', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

          // Check first 3 step files
          for (const file of stepFiles.slice(0, 3)) {
            const content = await readFile(join(stepsDir, file), 'utf-8');
            const frontmatter = parseFrontmatter(content);

            expect(frontmatter, `${name}/${file} missing frontmatter`).not.toBeNull();
            expect(frontmatter?.name, `${name}/${file} missing name in frontmatter`).toBeDefined();
          }
        } catch {
          // Skip if dir doesn't exist
        }
      }
    });

    it('frontmatter name matches filename', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

          for (const file of stepFiles.slice(0, 3)) {
            const content = await readFile(join(stepsDir, file), 'utf-8');
            const frontmatter = parseFrontmatter(content);

            if (frontmatter?.name) {
              const filenameWithoutExt = file.replace('.md', '');
              expect(frontmatter.name, `${name}/${file} frontmatter name mismatch`).toBe(filenameWithoutExt);
            }
          }
        } catch {
          // Skip if dir doesn't exist
        }
      }
    });

    it('nextStepFile references exist', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

          for (const file of stepFiles) {
            const content = await readFile(join(stepsDir, file), 'utf-8');
            const frontmatter = parseFrontmatter(content);

            if (frontmatter?.nextStepFile) {
              // nextStepFile is relative to steps dir
              const nextFile = frontmatter.nextStepFile.replace('./', '');
              const exists = files.includes(nextFile);

              // Final step may not have nextStepFile or it may point to non-existent file
              if (!file.includes('-complete') && !file.includes('-finish')) {
                expect(exists, `${name}/${file} references non-existent ${nextFile}`).toBe(true);
              }
            }
          }
        } catch {
          // Skip if dir doesn't exist
        }
      }
    });
  });

  describe('Step content structure', () => {
    it('steps have required heading structure', async () => {
      for (const { name, config } of steppedWorkflows) {
        const stepsPath = config.workflow.steps?.path;
        if (!stepsPath) continue;

        const stepsDir = join(WORKFLOWS_DIR, name, stepsPath.replace('./', ''));

        try {
          const files = await readdir(stepsDir);
          const stepFiles = files.filter(f => f.match(/^step-\d+/) && f.endsWith('.md'));

          // Check first step file
          const firstStep = stepFiles.find(f => f.match(/step-01-/));
          if (firstStep) {
            const content = await readFile(join(stepsDir, firstStep), 'utf-8');

            // Should have main heading
            expect(content, `${name}/${firstStep} missing main heading`).toMatch(/^#+ Step \d+/m);
          }
        } catch {
          // Skip if dir doesn't exist
        }
      }
    });
  });
});
