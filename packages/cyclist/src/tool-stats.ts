/**
 * Tool Stats Parser Module
 *
 * Parses and validates tool execution statistics from JSON format.
 * Used by E5-2: PostToolUse Hook for Rich Stats.
 *
 * The PostToolUse hook writes stats to .session/tool-stats.json,
 * and Cyclist watches this file and parses it using this module.
 */

/**
 * Interface for tool execution statistics
 */
export interface ToolStats {
  tools: {
    total: number;
    byType: Record<string, number>;
  };
  filesChanged: number;
  errors: number;
  lastUpdated?: string;
}

/**
 * Default empty tool stats
 */
export const EMPTY_TOOL_STATS: ToolStats = {
  tools: {
    total: 0,
    byType: {},
  },
  filesChanged: 0,
  errors: 0,
};

/**
 * Parse tool stats from JSON string
 *
 * Safely parses JSON and validates the expected structure.
 * Returns null for invalid input - never throws.
 *
 * @param json - The JSON string to parse
 * @returns Parsed ToolStats or null if invalid
 */
export function parseToolStats(json: string): ToolStats | null {
  // Handle non-string input
  if (typeof json !== 'string') {
    return null;
  }

  // Handle empty or whitespace-only input
  const trimmed = json.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);

    // Validate it's an object (not array or primitive)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    // Validate tools structure
    if (!parsed.tools || typeof parsed.tools !== 'object') {
      return null;
    }

    // Validate tools.total is a number
    if (typeof parsed.tools.total !== 'number') {
      return null;
    }

    // Validate tools.byType is an object
    if (!parsed.tools.byType || typeof parsed.tools.byType !== 'object') {
      return null;
    }

    // Validate filesChanged is a number (or default to 0)
    const filesChanged = typeof parsed.filesChanged === 'number' ? parsed.filesChanged : 0;

    // Validate errors is a number (or default to 0)
    const errors = typeof parsed.errors === 'number' ? parsed.errors : 0;

    // Return validated stats
    return {
      tools: {
        total: parsed.tools.total,
        byType: parsed.tools.byType,
      },
      filesChanged,
      errors,
      lastUpdated: typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : undefined,
    };
  } catch {
    // JSON parsing failed
    return null;
  }
}

/**
 * Create a new empty stats object
 */
export function createEmptyStats(): ToolStats {
  return {
    tools: {
      total: 0,
      byType: {},
    },
    filesChanged: 0,
    errors: 0,
  };
}
