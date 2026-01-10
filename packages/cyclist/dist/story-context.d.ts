/**
 * Story Context - Story 19-5
 *
 * Tracks which Pennyfarthing story is currently active and provides
 * per-story token aggregation for cost tracking.
 *
 * The active story is set via PENNYFARTHING_STORY_ID environment variable
 * or programmatically via setStoryContext().
 *
 * @see telemetry-types.ts for AgentSpanAttributes['pennyfarthing.story_id']
 */
import type { TokenStats } from './otlp-receiver.js';
/**
 * Set the current story context
 *
 * If called without argument, reads from PENNYFARTHING_STORY_ID env var.
 * Empty string is treated as no story (undefined).
 *
 * @param storyId - Story ID to set, or undefined to read from env
 */
export declare function setStoryContext(storyId?: string): void;
/**
 * Get the current story context
 *
 * @returns Current story ID or undefined if not set
 */
export declare function getStoryContext(): string | undefined;
/**
 * Reset story context (for testing or session reset)
 */
export declare function resetStoryContext(): void;
/**
 * Aggregate tokens for the current story
 *
 * Called by aggregateTokenStats in otlp-receiver.ts to track per-story usage.
 *
 * @param tokens - Partial token stats to aggregate
 */
export declare function aggregateTokensForStory(tokens: Partial<TokenStats>): void;
/**
 * Get token stats broken down by story
 *
 * @returns Object mapping story IDs to their TokenStats
 */
export declare function getTokenStatsByStory(): Record<string, TokenStats>;
/**
 * Reset per-story token stats (for testing or session reset)
 *
 * Note: Called by resetTokenStats in otlp-receiver.ts
 */
export declare function resetStoryTokenStats(): void;
//# sourceMappingURL=story-context.d.ts.map