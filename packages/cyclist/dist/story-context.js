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
// =============================================================================
// Story Context State
// =============================================================================
/** Current story context (undefined if no story active) */
let currentStory;
/** Per-story token accumulation */
const tokensByStory = new Map();
// =============================================================================
// Story Context Functions
// =============================================================================
/**
 * Set the current story context
 *
 * If called without argument, reads from PENNYFARTHING_STORY_ID env var.
 * Empty string is treated as no story (undefined).
 *
 * @param storyId - Story ID to set, or undefined to read from env
 */
export function setStoryContext(storyId) {
    if (storyId !== undefined) {
        // Explicit story ID provided
        currentStory = storyId;
    }
    else {
        // Read from environment
        const envStory = process.env.PENNYFARTHING_STORY_ID;
        currentStory = envStory && envStory.length > 0 ? envStory : undefined;
    }
}
/**
 * Get the current story context
 *
 * @returns Current story ID or undefined if not set
 */
export function getStoryContext() {
    return currentStory;
}
/**
 * Reset story context (for testing or session reset)
 */
export function resetStoryContext() {
    currentStory = undefined;
    tokensByStory.clear();
}
// =============================================================================
// Per-Story Token Aggregation
// =============================================================================
/**
 * Create an empty TokenStats object
 */
function createEmptyTokenStats() {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
        lastUpdated: 0,
    };
}
/**
 * Aggregate tokens for the current story
 *
 * Called by aggregateTokenStats in otlp-receiver.ts to track per-story usage.
 *
 * @param tokens - Partial token stats to aggregate
 */
export function aggregateTokensForStory(tokens) {
    const story = currentStory ?? 'unknown';
    let storyStats = tokensByStory.get(story);
    if (!storyStats) {
        storyStats = createEmptyTokenStats();
        tokensByStory.set(story, storyStats);
    }
    if (tokens.inputTokens !== undefined) {
        storyStats.inputTokens += tokens.inputTokens;
    }
    if (tokens.outputTokens !== undefined) {
        storyStats.outputTokens += tokens.outputTokens;
    }
    if (tokens.cacheReadTokens !== undefined) {
        storyStats.cacheReadTokens += tokens.cacheReadTokens;
    }
    if (tokens.cacheCreationTokens !== undefined) {
        storyStats.cacheCreationTokens += tokens.cacheCreationTokens;
    }
    storyStats.lastUpdated = Date.now();
}
/**
 * Get token stats broken down by story
 *
 * @returns Object mapping story IDs to their TokenStats
 */
export function getTokenStatsByStory() {
    const result = {};
    for (const [story, stats] of tokensByStory.entries()) {
        result[story] = { ...stats };
    }
    return result;
}
/**
 * Reset per-story token stats (for testing or session reset)
 *
 * Note: Called by resetTokenStats in otlp-receiver.ts
 */
export function resetStoryTokenStats() {
    tokensByStory.clear();
}
//# sourceMappingURL=story-context.js.map