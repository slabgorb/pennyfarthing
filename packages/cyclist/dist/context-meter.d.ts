/**
 * Context Meter - Utility functions for context usage visualization
 *
 * B-19: Provides calculation and formatting functions for the context
 * usage progress bar in the sidebar.
 */
/**
 * Default context window limit for Claude models (Opus)
 */
export declare const DEFAULT_CONTEXT_LIMIT = 200000;
/**
 * Context level thresholds
 */
export type ContextLevel = 'safe' | 'warning' | 'danger' | 'critical';
/**
 * Calculate context usage percentage from token counts
 *
 * @param used - Number of tokens used
 * @param limit - Maximum context window size
 * @returns Percentage (0-100), capped at 100
 */
export declare function calculateContextPercentage(used: number | null | undefined, limit: number): number;
/**
 * Get the context level based on usage percentage
 *
 * @param percent - Usage percentage (0-100)
 * @returns Level: 'safe' (<50%), 'warning' (50-79%), 'danger' (80-94%), 'critical' (95%+)
 */
export declare function getContextLevel(percent: number): ContextLevel;
/**
 * Format tooltip text showing raw token counts
 *
 * @param used - Tokens used
 * @param limit - Context limit
 * @returns Formatted tooltip string
 */
export declare function formatTooltip(used: number | null | undefined, limit: number): string;
//# sourceMappingURL=context-meter.d.ts.map