/**
 * Workflow Loader
 *
 * Story 31-2: Load workflow definitions from YAML files
 *
 * This module provides functions to:
 * - Load a single workflow YAML file
 * - Load all workflows from a directory
 * - Validate loaded workflows against the schema
 *
 * Uses validateWorkflow() from workflow-schema.ts (Story 31-1)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowValidationError,
  type WorkflowValidationResult
} from './workflow-schema.js';

/**
 * Result of loading a single workflow file
 */
export interface WorkflowLoadResult {
  /** Whether the load and validation succeeded */
  success: boolean;
  /** Path to the workflow file */
  filePath: string;
  /** Parsed and validated workflow (only present if success) */
  workflow?: WorkflowDefinition;
  /** Validation or parse errors (only present if failed) */
  errors?: WorkflowValidationError[];
}

/**
 * Result of loading multiple workflows from a directory
 */
export interface WorkflowLoadResults {
  /** Successfully loaded and validated workflows */
  workflows: WorkflowDefinition[];
  /** Files that failed to load or validate */
  errors: Array<{
    filePath: string;
    errors: WorkflowValidationError[];
  }>;
}

/**
 * Load and validate a single workflow YAML file
 *
 * @param filePath - Absolute or relative path to the workflow YAML file
 * @returns Load result with workflow or errors
 *
 * @example
 * ```typescript
 * const result = loadWorkflowFile('.claude/workflows/tdd.yaml');
 * if (result.success) {
 *   console.log(`Loaded workflow: ${result.workflow.name}`);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export function loadWorkflowFile(filePath: string): WorkflowLoadResult {
  // 1. Read file from disk
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown file read error';
    return {
      success: false,
      filePath,
      errors: [{
        field: 'file',
        message: message.includes('ENOENT') ? `File not found: ${filePath}` : message
      }]
    };
  }

  // 2. Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown YAML parse error';
    return {
      success: false,
      filePath,
      errors: [{
        field: 'yaml',
        message: `YAML parse error: ${message}`
      }]
    };
  }

  // 3. Call validateWorkflow()
  const result = validateWorkflow(parsed);

  // 4. Return result
  if (result.valid && result.workflow) {
    return {
      success: true,
      filePath,
      workflow: result.workflow
    };
  }

  return {
    success: false,
    filePath,
    errors: result.errors
  };
}

/**
 * Load and validate all workflow YAML files from a directory
 *
 * Only processes files with .yaml or .yml extensions.
 * Returns partial results - valid workflows are returned even if some fail.
 *
 * @param dirPath - Path to directory containing workflow files
 * @returns Load results with workflows and errors
 *
 * @example
 * ```typescript
 * const results = loadWorkflowsFromDir('.claude/workflows');
 * console.log(`Loaded ${results.workflows.length} workflows`);
 * if (results.errors.length > 0) {
 *   console.error(`${results.errors.length} files failed to load`);
 * }
 * ```
 */
export function loadWorkflowsFromDir(dirPath: string): WorkflowLoadResults {
  const workflows: WorkflowDefinition[] = [];
  const errors: Array<{ filePath: string; errors: WorkflowValidationError[] }> = [];

  // 1. Check directory exists
  if (!existsSync(dirPath)) {
    return { workflows, errors };
  }

  // 2. List files and filter for .yaml/.yml extensions
  let files: string[];
  try {
    files = readdirSync(dirPath);
  } catch {
    return { workflows, errors };
  }

  const yamlFiles = files.filter(f =>
    f.endsWith('.yaml') || f.endsWith('.yml')
  );

  // 3. Call loadWorkflowFile() for each
  for (const file of yamlFiles) {
    const filePath = join(dirPath, file);
    const result = loadWorkflowFile(filePath);

    // 4. Aggregate results
    if (result.success && result.workflow) {
      workflows.push(result.workflow);
    } else if (result.errors) {
      errors.push({
        filePath,
        errors: result.errors
      });
    }
  }

  return { workflows, errors };
}

// Re-export types from schema for convenience
export type {
  WorkflowDefinition,
  WorkflowPhase,
  WorkflowTriggers,
  WorkflowValidationError,
  WorkflowValidationResult
} from './workflow-schema.js';
