/**
 * Output Path Normalizer for MSSCI-14812 (91-27)
 *
 * Normalizes stepped workflow output paths to use sprint/planning/
 * and detects filename collisions across workflows.
 */

/**
 * Configuration for a workflow's output path
 */
export interface WorkflowOutputConfig {
  workflowName: string;
  outputFile: string;
  planningArtifacts?: string;
}

/**
 * Result of auditing workflow output paths
 */
export interface OutputPathAuditResult {
  hasCollisions: boolean;
  collisions: Array<{
    filePath: string;
    workflows: string[];
  }>;
  hasInconsistentPaths: boolean;
  inconsistentPaths: Array<{
    workflowName: string;
    path: string;
  }>;
}

/**
 * Normalize an output path to use sprint/planning/ as base directory
 *
 * Rewrites artifacts/, ./artifacts/, planning-artifacts/, ./planning-artifacts/
 * prefixes to sprint/planning/. Bare filenames get sprint/planning/ prepended.
 *
 * @param outputPath - The original output_file path from workflow YAML
 * @returns Normalized path under sprint/planning/
 */
export function normalizeOutputPath(_outputPath: string): string {
  throw new Error('Not implemented');
}

/**
 * Audit workflow output paths for collisions and inconsistencies
 *
 * @param configs - Array of workflow output configurations
 * @returns Audit result with collision and consistency details
 */
export function auditWorkflowOutputPaths(_configs: WorkflowOutputConfig[]): OutputPathAuditResult {
  throw new Error('Not implemented');
}
