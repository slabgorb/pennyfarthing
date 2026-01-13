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
import { type WorkflowDefinition, type WorkflowValidationError } from './workflow-schema.js';
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
export declare function loadWorkflowFile(filePath: string): WorkflowLoadResult;
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
export declare function loadWorkflowsFromDir(dirPath: string): WorkflowLoadResults;
export type { WorkflowDefinition, WorkflowPhase, WorkflowTriggers, WorkflowValidationError, WorkflowValidationResult } from './workflow-schema.js';
//# sourceMappingURL=workflow-loader.d.ts.map