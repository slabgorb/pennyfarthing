/**
 * Tandem Metrics and Token Tracking for Story 86-6
 *
 * Tracks consultation token usage, frequency, and outcomes for overhead analysis.
 * Extends the dialogue manager (86-3) with metrics collection and summary generation.
 *
 * All functions are pure or use simple computation — no external dependencies.
 */

import type { Outcome } from './dialogue-manager.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Token and timing metrics for a single consultation exchange.
 * These are tracked separately from leader session tokens (AC1).
 */
export interface ExchangeMetrics {
  /** Tokens sent to the consultation partner (request) */
  inputTokens: number;
  /** Tokens received from the consultation partner (response) */
  outputTokens: number;
  /** Time in milliseconds for the partner to respond */
  responseTimeMs: number;
}

/**
 * A dialogue exchange extended with metrics fields.
 * Mirrors DialogueExchange from dialogue-manager but adds token tracking.
 */
export interface MetricsExchange {
  number: number;
  timestamp: string;
  leader: string;
  partner: string;
  question: string;
  recommendation: string;
  confidence: string;
  outcome?: Outcome;
  outcomeNote?: string;
  /** Consultation-specific metrics (absent for exchanges without tracking) */
  metrics?: ExchangeMetrics;
}

/**
 * Aggregated metrics across all consultation exchanges in a dialogue.
 */
export interface TandemMetricsSummary {
  /** Number of consultation exchanges */
  consultationCount: number;
  /** Total input tokens across all exchanges */
  totalInputTokens: number;
  /** Total output tokens across all exchanges */
  totalOutputTokens: number;
  /** Combined total tokens (input + output) */
  totalTokens: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** Distribution of outcomes: { applied: N, deferred: N, rejected: N, pending: N } */
  outcomeDistribution: Record<string, number>;
  /** Tandem overhead as percentage of baseline, or null if baseline not provided */
  overheadPercent: number | null;
}

// =============================================================================
// Metrics Calculation
// =============================================================================

/**
 * Aggregate metrics from a list of exchanges with metrics data.
 * Exchanges without metrics are counted but excluded from token/timing calculations.
 */
export function aggregateMetrics(exchanges: MetricsExchange[]): TandemMetricsSummary {
  throw new Error('not implemented');
}

/**
 * Calculate tandem overhead as a percentage of baseline token cost.
 * Returns the percentage (e.g., 12.5 for 12.5%).
 *
 * @param tandemTokens - Total tokens used by tandem consultations
 * @param baselineTokens - Total tokens used by the leader session (non-tandem)
 * @returns Overhead percentage, or null if baselineTokens is zero
 */
export function calculateOverheadPercent(
  tandemTokens: number,
  baselineTokens: number,
): number | null {
  throw new Error('not implemented');
}

/**
 * Check whether tandem overhead is within the acceptable budget threshold.
 * Default threshold is 25% per story AC5.
 *
 * @param overheadPercent - The calculated overhead percentage
 * @param threshold - Maximum acceptable overhead percentage (default: 25)
 * @returns true if within budget, false if over
 */
export function isWithinBudget(
  overheadPercent: number | null,
  threshold?: number,
): boolean {
  throw new Error('not implemented');
}

// =============================================================================
// Summary Formatting
// =============================================================================

/**
 * Format a TandemMetricsSummary as markdown lines for the dialogue file summary section.
 * Returns an array of markdown bullet lines (without the ## Summary header).
 */
export function formatMetricsSummary(metrics: TandemMetricsSummary): string[] {
  throw new Error('not implemented');
}

/**
 * Parse metrics fields from an existing dialogue file summary section.
 * Returns null if no metrics are found in the summary.
 */
export function parseMetricsFromSummary(summaryContent: string): TandemMetricsSummary | null {
  throw new Error('not implemented');
}
