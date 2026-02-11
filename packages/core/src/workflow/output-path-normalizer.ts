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
export function normalizeOutputPath(outputPath: string): string {
  const TARGET = 'sprint/planning/';

  // Already normalized
  if (outputPath.startsWith(TARGET)) {
    return outputPath;
  }

  // Strip known prefixes (with optional ./ leader)
  const prefixes = [
    './artifacts/',
    'artifacts/',
    './planning-artifacts/',
    'planning-artifacts/',
  ];

  for (const prefix of prefixes) {
    if (outputPath.startsWith(prefix)) {
      return TARGET + outputPath.slice(prefix.length);
    }
  }

  // Bare filename — no directory separator
  if (!outputPath.includes('/')) {
    return TARGET + outputPath;
  }

  return outputPath;
}

/**
 * Audit workflow output paths for collisions and inconsistencies
 *
 * @param configs - Array of workflow output configurations
 * @returns Audit result with collision and consistency details
 */
export function auditWorkflowOutputPaths(configs: WorkflowOutputConfig[]): OutputPathAuditResult {
  const TARGET = 'sprint/planning/';

  // Detect duplicate output filenames
  const fileMap = new Map<string, string[]>();
  for (const config of configs) {
    const existing = fileMap.get(config.outputFile) ?? [];
    existing.push(config.workflowName);
    fileMap.set(config.outputFile, existing);
  }

  const collisions = [...fileMap.entries()]
    .filter(([, workflows]) => workflows.length > 1)
    .map(([filePath, workflows]) => ({ filePath, workflows }));

  // Detect inconsistent base directories (outputFile + planningArtifacts)
  const inconsistentPaths: Array<{ workflowName: string; path: string }> = [];

  for (const config of configs) {
    if (!config.outputFile.startsWith(TARGET)) {
      inconsistentPaths.push({ workflowName: config.workflowName, path: config.outputFile });
    }
    if (config.planningArtifacts !== undefined) {
      const normalized = config.planningArtifacts.replace(/\/$/, '');
      const targetNormalized = TARGET.replace(/\/$/, '');
      if (normalized !== targetNormalized) {
        inconsistentPaths.push({ workflowName: config.workflowName, path: config.planningArtifacts });
      }
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
    hasInconsistentPaths: inconsistentPaths.length > 0,
    inconsistentPaths,
  };
}
