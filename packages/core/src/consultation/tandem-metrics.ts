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
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalResponseTimeMs = 0;
  let metricsCount = 0;

  const outcomeDistribution: Record<string, number> = {
    applied: 0,
    deferred: 0,
    rejected: 0,
    pending: 0,
  };

  for (const ex of exchanges) {
    if (ex.metrics) {
      totalInputTokens += ex.metrics.inputTokens;
      totalOutputTokens += ex.metrics.outputTokens;
      totalResponseTimeMs += ex.metrics.responseTimeMs;
      metricsCount++;
    }
    const outcome = ex.outcome ?? 'pending';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] ?? 0) + 1;
  }

  return {
    consultationCount: exchanges.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    avgResponseTimeMs: metricsCount > 0 ? Math.round(totalResponseTimeMs / metricsCount) : 0,
    outcomeDistribution,
    overheadPercent: null,
  };
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
  if (baselineTokens === 0) return null;
  return Math.round((tandemTokens / baselineTokens) * 1000) / 10;
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
  if (overheadPercent === null) return true;
  const limit = threshold ?? 25;
  return overheadPercent < limit;
}

// =============================================================================
// Summary Formatting
// =============================================================================

/**
 * Format a TandemMetricsSummary as markdown lines for the dialogue file summary section.
 * Returns an array of markdown bullet lines (without the ## Summary header).
 */
export function formatMetricsSummary(metrics: TandemMetricsSummary): string[] {
  const lines: string[] = [];
  lines.push(`- **Consultations:** ${metrics.consultationCount}`);
  lines.push(`- **Tokens:** ${metrics.totalTokens} (input: ${metrics.totalInputTokens}, output: ${metrics.totalOutputTokens})`);
  lines.push(`- **Avg Response Time:** ${metrics.avgResponseTimeMs}ms`);

  const dist = metrics.outcomeDistribution;
  const parts = ['applied', 'deferred', 'rejected', 'pending']
    .map(k => `${k}: ${dist[k] ?? 0}`)
    .join(', ');
  lines.push(`- **Outcomes:** ${parts}`);

  if (metrics.overheadPercent !== null) {
    lines.push(`- **Overhead:** ${metrics.overheadPercent}%`);
  } else {
    lines.push(`- **Overhead:** N/A`);
  }

  return lines;
}

/**
 * Parse metrics fields from an existing dialogue file summary section.
 * Returns null if no metrics are found in the summary.
 */
export function parseMetricsFromSummary(summaryContent: string): TandemMetricsSummary | null {
  const consultMatch = summaryContent.match(/\*\*Consultations:\*\*\s*(\d+)/);
  const tokensMatch = summaryContent.match(/\*\*Tokens:\*\*\s*(\d+)\s*\(input:\s*(\d+),\s*output:\s*(\d+)\)/);
  const responseMatch = summaryContent.match(/\*\*Avg Response Time:\*\*\s*(\d+)ms/);

  if (!consultMatch || !tokensMatch) return null;

  const outcomesMatch = summaryContent.match(/\*\*Outcomes:\*\*\s*(.+)/);
  const outcomeDistribution: Record<string, number> = { applied: 0, deferred: 0, rejected: 0, pending: 0 };
  if (outcomesMatch) {
    for (const part of outcomesMatch[1].split(',')) {
      const [key, val] = part.trim().split(':').map(s => s.trim());
      if (key && val !== undefined) {
        outcomeDistribution[key] = parseInt(val, 10);
      }
    }
  }

  const overheadMatch = summaryContent.match(/\*\*Overhead:\*\*\s*([\d.]+)%/);
  const overheadPercent = overheadMatch ? parseFloat(overheadMatch[1]) : null;

  return {
    consultationCount: parseInt(consultMatch[1], 10),
    totalTokens: parseInt(tokensMatch[1], 10),
    totalInputTokens: parseInt(tokensMatch[2], 10),
    totalOutputTokens: parseInt(tokensMatch[3], 10),
    avgResponseTimeMs: responseMatch ? parseInt(responseMatch[1], 10) : 0,
    outcomeDistribution,
    overheadPercent,
  };
}
