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
/**
 * Set the current agent context
 *
 * If called without argument, reads from PENNYFARTHING_AGENT env var.
 * Empty string is treated as no agent (undefined).
 *
 * @param agent - Agent name to set, or undefined to read from env
 */
export declare function setAgentContext(agent?: string): void;
/**
 * Get the current agent context
 *
 * @returns Current agent name or undefined if not set
 */
export declare function getAgentContext(): string | undefined;
/**
 * Reset agent context (for testing or session reset)
 */
export declare function resetAgentContext(): void;
/**
 * Aggregate tokens for the current agent
 *
 * Called by aggregateTokenStats in otlp-receiver.ts to track per-agent usage.
 *
 * @param tokens - Partial token stats to aggregate
 */
export declare function aggregateTokensForAgent(tokens: Partial<TokenStats>): void;
/**
 * Get token stats broken down by agent
 *
 * @returns Object mapping agent names to their TokenStats
 */
export declare function getTokenStatsByAgent(): Record<string, TokenStats>;
/**
 * Reset per-agent token stats (for testing or session reset)
 *
 * Note: Called by resetTokenStats in otlp-receiver.ts
 */
export declare function resetAgentTokenStats(): void;
//# sourceMappingURL=agent-context.d.ts.map