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
export declare const EMPTY_TOOL_STATS: ToolStats;
/**
 * Parse tool stats from JSON string
 *
 * Safely parses JSON and validates the expected structure.
 * Returns null for invalid input - never throws.
 *
 * @param json - The JSON string to parse
 * @returns Parsed ToolStats or null if invalid
 */
export declare function parseToolStats(json: string): ToolStats | null;
/**
 * Create a new empty stats object
 */
export declare function createEmptyStats(): ToolStats;
//# sourceMappingURL=tool-stats.d.ts.map