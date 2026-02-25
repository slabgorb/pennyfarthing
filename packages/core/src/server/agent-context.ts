/**
 * Agent Context — per-agent token aggregation for BikeRack standalone mode.
 *
 * Tracks which Pennyfarthing agent (SM, TEA, Dev, Reviewer) is active
 * and provides per-agent token aggregation for cost tracking.
 *
 * Story 124-2: Moved from Cyclist to BikeRack.
 */

import type { TokenStats } from './otlp-receiver.js';

// =============================================================================
// Agent Context State
// =============================================================================

let currentAgent: string | undefined;
const tokensByAgent: Map<string, TokenStats> = new Map();

// =============================================================================
// Agent Context Functions
// =============================================================================

export function setAgentContext(agent?: string): void {
  if (agent !== undefined) {
    currentAgent = agent;
  } else {
    const envAgent = process.env.PENNYFARTHING_AGENT;
    currentAgent = envAgent && envAgent.length > 0 ? envAgent : undefined;
  }
}

export function getAgentContext(): string | undefined {
  return currentAgent;
}

export function resetAgentContext(): void {
  currentAgent = undefined;
  tokensByAgent.clear();
}

// =============================================================================
// Per-Agent Token Aggregation
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

export function aggregateTokensForAgent(tokens: Partial<TokenStats>): void {
  const agent = currentAgent ?? 'unknown';

  let agentStats = tokensByAgent.get(agent);
  if (!agentStats) {
    agentStats = createEmptyTokenStats();
    tokensByAgent.set(agent, agentStats);
  }

  if (tokens.inputTokens !== undefined) {
    agentStats.inputTokens += tokens.inputTokens as number;
  }
  if (tokens.outputTokens !== undefined) {
    agentStats.outputTokens += tokens.outputTokens as number;
  }
  if (tokens.cacheReadTokens !== undefined) {
    agentStats.cacheReadTokens += tokens.cacheReadTokens as number;
  }
  if (tokens.cacheCreationTokens !== undefined) {
    agentStats.cacheCreationTokens += tokens.cacheCreationTokens as number;
  }
}

export function getTokenStatsByAgent(): Record<string, TokenStats> {
  const result: Record<string, TokenStats> = {};
  for (const [agent, stats] of tokensByAgent.entries()) {
    result[agent] = { ...stats };
  }
  return result;
}

export function resetAgentTokenStats(): void {
  tokensByAgent.clear();
}
