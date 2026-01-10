/**
 * Agent Context - Story 19-4
 *
 * Tracks which Pennyfarthing agent (SM, TEA, Dev, Reviewer) is active
 * and provides per-agent token aggregation for cost tracking.
 *
 * The active agent is set via PENNYFARTHING_AGENT environment variable
 * (exported by agent-session.sh) or programmatically via setAgentContext().
 *
 * @see telemetry-types.ts for AgentSpanAttributes['pennyfarthing.agent']
 */

import type { TokenStats } from './otlp-receiver.js';

// =============================================================================
// Agent Context State
// =============================================================================

/** Current agent context (undefined if no agent active) */
let currentAgent: string | undefined;

/** Per-agent token accumulation */
const tokensByAgent: Map<string, TokenStats> = new Map();

// =============================================================================
// Agent Context Functions
// =============================================================================

/**
 * Set the current agent context
 *
 * If called without argument, reads from PENNYFARTHING_AGENT env var.
 * Empty string is treated as no agent (undefined).
 *
 * @param agent - Agent name to set, or undefined to read from env
 */
export function setAgentContext(agent?: string): void {
  if (agent !== undefined) {
    // Explicit agent provided
    currentAgent = agent;
  } else {
    // Read from environment
    const envAgent = process.env.PENNYFARTHING_AGENT;
    currentAgent = envAgent && envAgent.length > 0 ? envAgent : undefined;
  }
}

/**
 * Get the current agent context
 *
 * @returns Current agent name or undefined if not set
 */
export function getAgentContext(): string | undefined {
  return currentAgent;
}

/**
 * Reset agent context (for testing or session reset)
 */
export function resetAgentContext(): void {
  currentAgent = undefined;
  tokensByAgent.clear();
}

// =============================================================================
// Per-Agent Token Aggregation
// =============================================================================

/**
 * Create an empty TokenStats object
 */
function createEmptyTokenStats(): TokenStats {
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
 * Aggregate tokens for the current agent
 *
 * Called by aggregateTokenStats in otlp-receiver.ts to track per-agent usage.
 *
 * @param tokens - Partial token stats to aggregate
 */
export function aggregateTokensForAgent(tokens: Partial<TokenStats>): void {
  const agent = currentAgent ?? 'unknown';

  let agentStats = tokensByAgent.get(agent);
  if (!agentStats) {
    agentStats = createEmptyTokenStats();
    tokensByAgent.set(agent, agentStats);
  }

  if (tokens.inputTokens !== undefined) {
    agentStats.inputTokens += tokens.inputTokens;
  }
  if (tokens.outputTokens !== undefined) {
    agentStats.outputTokens += tokens.outputTokens;
  }
  if (tokens.cacheReadTokens !== undefined) {
    agentStats.cacheReadTokens += tokens.cacheReadTokens;
  }
  if (tokens.cacheCreationTokens !== undefined) {
    agentStats.cacheCreationTokens += tokens.cacheCreationTokens;
  }

  agentStats.lastUpdated = Date.now();
}

/**
 * Get token stats broken down by agent
 *
 * @returns Object mapping agent names to their TokenStats
 */
export function getTokenStatsByAgent(): Record<string, TokenStats> {
  const result: Record<string, TokenStats> = {};

  for (const [agent, stats] of tokensByAgent.entries()) {
    result[agent] = { ...stats };
  }

  return result;
}

/**
 * Reset per-agent token stats (for testing or session reset)
 *
 * Note: Called by resetTokenStats in otlp-receiver.ts
 */
export function resetAgentTokenStats(): void {
  tokensByAgent.clear();
}
