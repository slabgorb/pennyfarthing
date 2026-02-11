/**
 * repos-topology.ts — Schema validation for repos.yaml topology fields
 *
 * Story 87-1: Extend repos.yaml schema with ownership and boundaries.
 * Validates the spatial awareness fields that agents use to know which
 * repo owns which paths, what's off-limits, and rendering context.
 */

/** Valid values for the ui_layer field */
export type UiLayer = 'react' | 'cli' | 'none';

/** Topology-extended repo entry */
export interface RepoTopology {
  path: string;
  type: string;
  description: string;
  language?: string;
  build_command?: string;
  test_command?: string;
  lint_command?: string;
  notes?: string;

  // Topology fields (Story 87-1)
  owns?: string[];
  never_edit?: string[];
  symlinks?: Record<string, string>;
  ui_layer?: UiLayer;
  components_path?: string;
}

/** Top-level repos.yaml structure */
export interface ReposConfig {
  repos: Record<string, RepoTopology>;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_UI_LAYERS: UiLayer[] = ['react', 'cli', 'none'];

/**
 * Validate a parsed repos.yaml config for topology schema compliance.
 * Returns { valid, errors } — never throws.
 */
export function validateReposTopology(_config: unknown): ValidationResult {
  // Stub: not implemented yet — Dev will implement
  return { valid: false, errors: ['not implemented'] };
}

/**
 * Load and validate repos.yaml from a file path.
 * Returns the parsed config if valid, or errors if not.
 */
export function loadReposConfig(_filePath: string): { success: boolean; data?: ReposConfig; errors?: string[] } {
  // Stub: not implemented yet — Dev will implement
  return { success: false, errors: ['not implemented'] };
}
