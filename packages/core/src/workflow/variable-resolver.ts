/**
 * Variable Resolver for MSSCI-12081
 *
 * Resolves {variable} placeholders in step file content from multiple sources
 * with priority-based fallback chain.
 */

/**
 * Represents a source of variable values
 */
export interface VariableSource {
  /** Name of this source (e.g., 'workflow', 'session', 'environment') */
  name: string;
  /** Priority level (lower number = higher priority) */
  priority: number;
  /** Map of variable names to their values */
  values: Record<string, string>;
}

/**
 * Result of variable resolution
 */
export interface ResolveResult {
  /** Content with variables resolved (unresolved variables left as-is) */
  content: string;
  /** List of variables that were successfully resolved */
  resolved: string[];
  /** List of variables that could not be resolved */
  unresolved: string[];
  /** Map of variable name to source name that provided the value */
  sources: Record<string, string>;
}

/**
 * Options for the convenience resolveStepVariables function
 */
export interface ResolveStepOptions {
  /** Variables from workflow YAML (highest priority) */
  workflowVars?: Record<string, unknown>;
  /** Variables from session file */
  sessionVars?: Record<string, string>;
  /** Path to config file */
  configPath?: string;
  /** Project root path (for {project_root} variable) */
  projectRoot?: string;
}

// Regex to match valid variable names: {name} where name starts with letter or underscore
// followed by letters, numbers, or underscores.
// Uses negative lookbehind to avoid matching inside nested braces like {outer_{inner}}
const VARIABLE_REGEX = /(?<!\{[^}]*)\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Convert a value to string, handling various types
 */
function valueToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Look up a variable in sources by priority
 */
function lookupVariable(
  varName: string,
  sortedSources: VariableSource[]
): { value: string; sourceName: string } | null {
  for (const source of sortedSources) {
    if (varName in source.values) {
      const rawValue = source.values[varName];
      const value = valueToString(rawValue);
      if (value !== null) {
        return { value, sourceName: source.name };
      }
    }
  }
  return null;
}

/**
 * Resolve variables in content from prioritized sources
 *
 * @param content - The content containing {variable} placeholders
 * @param sources - Array of variable sources, sorted by priority
 * @returns ResolveResult with resolved content and metadata
 */
export function resolveVariables(
  content: string,
  sources: VariableSource[]
): ResolveResult {
  const resolved: string[] = [];
  const unresolved: string[] = [];
  const sourceMap: Record<string, string> = {};

  // Sort sources by priority (lower number = higher priority)
  // Stable sort preserves array order for same priority
  const sortedSources = [...sources].sort((a, b) => a.priority - b.priority);

  // Find all variable references in content
  const matches = content.matchAll(VARIABLE_REGEX);
  const seenVars = new Set<string>();

  for (const match of matches) {
    const varName = match[1];
    if (seenVars.has(varName)) {
      continue;
    }
    seenVars.add(varName);

    const lookup = lookupVariable(varName, sortedSources);
    if (lookup) {
      resolved.push(varName);
      sourceMap[varName] = lookup.sourceName;
    } else {
      unresolved.push(varName);
    }
  }

  // Replace variables in content
  const resolvedContent = content.replace(VARIABLE_REGEX, (match, varName) => {
    const lookup = lookupVariable(varName, sortedSources);
    return lookup ? lookup.value : match;
  });

  return {
    content: resolvedContent,
    resolved,
    unresolved,
    sources: sourceMap,
  };
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convenience function to resolve variables in step file content
 *
 * Automatically builds sources from:
 * 1. Workflow variables (priority 1)
 * 2. Session variables (priority 2)
 * 3. Config file values (priority 3)
 * 4. Environment/system variables (priority 4)
 * 5. Default values (priority 5)
 *
 * @param stepContent - The step file content to process
 * @param options - Optional configuration for variable sources
 * @returns ResolveResult with resolved content and metadata
 */
export function resolveStepVariables(
  stepContent: string,
  options?: ResolveStepOptions
): ResolveResult {
  const sources: VariableSource[] = [];

  // Priority 1: Workflow variables
  if (options?.workflowVars) {
    const workflowValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.workflowVars)) {
      const strValue = valueToString(value);
      if (strValue !== null) {
        workflowValues[key] = strValue;
      }
    }
    sources.push({
      name: 'workflow',
      priority: 1,
      values: workflowValues,
    });
  }

  // Priority 2: Session variables
  if (options?.sessionVars) {
    sources.push({
      name: 'session',
      priority: 2,
      values: options.sessionVars,
    });
  }

  // Priority 4: Environment/system variables
  const envValues: Record<string, string> = {
    date: getCurrentDate(),
  };
  if (options?.projectRoot) {
    envValues.project_root = options.projectRoot;
  }
  sources.push({
    name: 'environment',
    priority: 4,
    values: envValues,
  });

  // Priority 5: Default values
  sources.push({
    name: 'defaults',
    priority: 5,
    values: {
      planning_artifacts: 'sprint/planning/',
    },
  });

  return resolveVariables(stepContent, sources);
}
