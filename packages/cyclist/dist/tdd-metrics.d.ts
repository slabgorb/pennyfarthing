/**
 * TDD Phase Metrics - Story 19-6
 *
 * Tracks time spent in each TDD phase (RED/GREEN/REFACTOR/REVIEW)
 * for efficiency analysis. Parses session files for phase changes
 * and calculates duration metrics.
 *
 * Pattern: In-memory state management following otlp-receiver.ts
 */
import type { TDDMetrics } from './telemetry-types.js';
/** Valid TDD phase values */
export type TDDPhase = 'RED' | 'GREEN' | 'REFACTOR' | 'REVIEW';
/** Phase timestamps structure */
interface PhaseTimestamps {
    redStart?: number;
    redEnd?: number;
    greenStart?: number;
    greenEnd?: number;
    reviewStart?: number;
    reviewEnd?: number;
}
/** Duration calculation result */
interface PhaseDurations {
    redPhaseDurationMs?: number;
    greenPhaseDurationMs?: number;
    reviewPhaseDurationMs?: number;
    totalCycleDurationMs?: number;
}
/**
 * Parse TDD phase from session file content
 *
 * Looks for markdown table row: `| Phase | VALUE |`
 * Returns the first valid phase found, normalized to uppercase.
 *
 * @param sessionContent - Raw markdown content of session file
 * @returns The phase value or null if not found/invalid
 */
export declare function parsePhaseFromSession(sessionContent: string): TDDPhase | null;
/**
 * Calculate phase durations from timestamps
 *
 * @param phases - Object containing phase start/end timestamps
 * @returns Object with calculated durations in milliseconds
 */
export declare function calculatePhaseDurations(phases: PhaseTimestamps): PhaseDurations;
/**
 * Initialize TDD metrics for a new story
 *
 * Resets any existing metrics and prepares for a new tracking session.
 *
 * @param storyId - The story ID to track (e.g., '19-6')
 */
export declare function initializeTDDMetrics(storyId: string): void;
/**
 * Record a phase transition
 *
 * Records the timestamp when a phase starts. Transitioning to a new phase
 * automatically ends the previous phase at the same timestamp.
 *
 * @param phase - The phase being entered
 * @param timestamp - Optional custom timestamp (defaults to Date.now())
 */
export declare function recordPhaseTransition(phase: TDDPhase, timestamp?: number): void;
/**
 * Get current TDD metrics
 *
 * @returns The current metrics or null if not initialized
 */
export declare function getTDDMetrics(): TDDMetrics | null;
/**
 * Reset TDD metrics
 *
 * Clears all tracking state. Call when starting a new story or session.
 */
export declare function resetTDDMetrics(): void;
export {};
//# sourceMappingURL=tdd-metrics.d.ts.map