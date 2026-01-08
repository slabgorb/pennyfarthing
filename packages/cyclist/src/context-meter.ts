/**
 * Context Meter - Utility functions for context usage visualization
 *
 * B-19: Provides calculation and formatting functions for the context
 * usage progress bar in the sidebar.
 */

/**
 * Default context window limit for Claude models (Opus)
 */
export const DEFAULT_CONTEXT_LIMIT = 200000;

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
export function calculateContextPercentage(used: number | null | undefined, limit: number): number {
  // Handle null/undefined gracefully
  if (used === null || used === undefined || isNaN(used)) {
    return 0;
  }

  // Avoid division by zero
  if (!limit || limit <= 0) {
    return 0;
  }

  const percentage = (used / limit) * 100;
  return Math.min(100, Math.round(percentage));
}

/**
 * Get the context level based on usage percentage
 *
 * @param percent - Usage percentage (0-100)
 * @returns Level: 'safe' (<50%), 'warning' (50-79%), 'danger' (80-94%), 'critical' (95%+)
 */
export function getContextLevel(percent: number): ContextLevel {
  if (percent >= 95) return 'critical';
  if (percent >= 80) return 'danger';
  if (percent >= 50) return 'warning';
  return 'safe';
}

/**
 * Format number with locale-aware comma separators
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format tooltip text showing raw token counts
 *
 * @param used - Tokens used
 * @param limit - Context limit
 * @returns Formatted tooltip string
 */
export function formatTooltip(used: number | null | undefined, limit: number): string {
  // Handle unavailable data
  if (used === null || used === undefined || isNaN(used)) {
    return 'Context usage unavailable';
  }

  return `${formatNumber(used)} / ${formatNumber(limit)} tokens`;
}
