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

const VALID_UI_LAYERS: readonly string[] = ['react', 'cli', 'none'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateStringArray(value: unknown, repoName: string, field: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`repos.${repoName}.${field} must be an array`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      errors.push(`repos.${repoName}.${field}[${i}] must be a string`);
    }
  }
}

function validateRepo(repoName: string, repo: unknown, errors: string[]): void {
  if (!isRecord(repo)) {
    errors.push(`repos.${repoName} must be an object`);
    return;
  }

  // Required fields
  for (const field of ['path', 'type', 'description'] as const) {
    if (typeof repo[field] !== 'string') {
      errors.push(`repos.${repoName}.${field} is required and must be a string`);
    }
  }

  // Optional topology fields — validate only when present
  if ('owns' in repo && repo.owns !== undefined) {
    validateStringArray(repo.owns, repoName, 'owns', errors);
  }

  if ('never_edit' in repo && repo.never_edit !== undefined) {
    validateStringArray(repo.never_edit, repoName, 'never_edit', errors);
  }

  if ('symlinks' in repo && repo.symlinks !== undefined) {
    if (!isRecord(repo.symlinks)) {
      errors.push(`repos.${repoName}.symlinks must be an object`);
    } else {
      for (const [key, val] of Object.entries(repo.symlinks)) {
        if (typeof val !== 'string') {
          errors.push(`repos.${repoName}.symlinks["${key}"] must be a string`);
        }
      }
    }
  }

  if ('ui_layer' in repo && repo.ui_layer !== undefined) {
    if (typeof repo.ui_layer !== 'string' || !VALID_UI_LAYERS.includes(repo.ui_layer)) {
      errors.push(`repos.${repoName}.ui_layer must be one of: ${VALID_UI_LAYERS.join(', ')}`);
    }
  }

  if ('components_path' in repo && repo.components_path !== undefined) {
    if (typeof repo.components_path !== 'string') {
      errors.push(`repos.${repoName}.components_path must be a string`);
    }
  }
}

/**
 * Validate a parsed repos.yaml config for topology schema compliance.
 * Returns { valid, errors } — never throws.
 */
export function validateReposTopology(config: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(config)) {
    return { valid: false, errors: ['config must be an object'] };
  }

  if (!isRecord(config.repos)) {
    return { valid: false, errors: ['config.repos must be an object'] };
  }

  for (const [name, repo] of Object.entries(config.repos)) {
    validateRepo(name, repo, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load and validate repos.yaml from a file path.
 * Returns the parsed config if valid, or errors if not.
 */
export async function loadReposConfig(filePath: string): Promise<{ success: boolean; data?: ReposConfig; errors?: string[] }> {
  try {
    const { readFileSync } = await import('node:fs');
    const { parse } = await import('yaml');
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parse(content);
    const result = validateReposTopology(parsed);
    if (!result.valid) {
      return { success: false, errors: result.errors };
    }
    return { success: true, data: parsed as ReposConfig };
  } catch (err) {
    return { success: false, errors: [(err as Error).message] };
  }
}
