/**
 * Story Context — per-story token aggregation for BikeRack standalone mode.
 *
 * Tracks which Pennyfarthing story is active and provides per-story
 * token aggregation for cost tracking.
 *
 * Story 124-2: Moved from Cyclist to BikeRack.
 */

import type { TokenStats } from './otlp-receiver.js';

// =============================================================================
// Story Context State
// =============================================================================

let currentStory: string | undefined;
const tokensByStory: Map<string, TokenStats> = new Map();

// =============================================================================
// Story Context Functions
// =============================================================================

export function setStoryContext(storyId?: string): void {
  if (storyId !== undefined) {
    currentStory = storyId;
  } else {
    const envStory = process.env.PENNYFARTHING_STORY_ID;
    currentStory = envStory && envStory.length > 0 ? envStory : undefined;
  }
}

export function getStoryContext(): string | undefined {
  return currentStory;
}

export function resetStoryContext(): void {
  currentStory = undefined;
  tokensByStory.clear();
}

// =============================================================================
// Per-Story Token Aggregation
// =============================================================================

function createEmptyTokenStats(): TokenStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCost: 0,
  };
}

export function aggregateTokensForStory(tokens: Partial<TokenStats>): void {
  const story = currentStory ?? 'unknown';

  let storyStats = tokensByStory.get(story);
  if (!storyStats) {
    storyStats = createEmptyTokenStats();
    tokensByStory.set(story, storyStats);
  }

  if (tokens.inputTokens !== undefined) {
    storyStats.inputTokens += tokens.inputTokens as number;
  }
  if (tokens.outputTokens !== undefined) {
    storyStats.outputTokens += tokens.outputTokens as number;
  }
  if (tokens.cacheReadTokens !== undefined) {
    storyStats.cacheReadTokens += tokens.cacheReadTokens as number;
  }
  if (tokens.cacheCreationTokens !== undefined) {
    storyStats.cacheCreationTokens += tokens.cacheCreationTokens as number;
  }
}

export function getTokenStatsByStory(): Record<string, TokenStats> {
  const result: Record<string, TokenStats> = {};
  for (const [story, stats] of tokensByStory.entries()) {
    result[story] = { ...stats };
  }
  return result;
}

export function resetStoryTokenStats(): void {
  tokensByStory.clear();
}
