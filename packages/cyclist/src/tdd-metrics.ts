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

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// State
// =============================================================================

/** Current TDD metrics (null if not initialized) */
let currentMetrics: TDDMetrics | null = null;

/** Track current phase to detect same-phase re-recording */
let currentPhase: TDDPhase | null = null;

// =============================================================================
// Session Parsing
// =============================================================================

/**
 * Parse TDD phase from session file content
 *
 * Looks for markdown table row: `| Phase | VALUE |`
 * Returns the first valid phase found, normalized to uppercase.
 *
 * @param sessionContent - Raw markdown content of session file
 * @returns The phase value or null if not found/invalid
 */
export function parsePhaseFromSession(sessionContent: string): TDDPhase | null {
  if (!sessionContent) {
    return null;
  }

  // Match markdown table row: | Phase | VALUE |
  // Handles whitespace around values
  const phaseRegex = /\|\s*Phase\s*\|\s*(\w+)\s*\|/i;
  const match = sessionContent.match(phaseRegex);

  if (!match) {
    return null;
  }

  const phaseValue = match[1].toUpperCase();

  // Validate against known phases
  const validPhases: TDDPhase[] = ['RED', 'GREEN', 'REFACTOR', 'REVIEW'];
  if (validPhases.includes(phaseValue as TDDPhase)) {
    return phaseValue as TDDPhase;
  }

  return null;
}

// =============================================================================
// Duration Calculation
// =============================================================================

/**
 * Calculate phase durations from timestamps
 *
 * @param phases - Object containing phase start/end timestamps
 * @returns Object with calculated durations in milliseconds
 */
export function calculatePhaseDurations(phases: PhaseTimestamps): PhaseDurations {
  const durations: PhaseDurations = {};

  // RED phase duration
  if (phases.redStart !== undefined && phases.redEnd !== undefined) {
    durations.redPhaseDurationMs = phases.redEnd - phases.redStart;
  }

  // GREEN phase duration
  if (phases.greenStart !== undefined && phases.greenEnd !== undefined) {
    durations.greenPhaseDurationMs = phases.greenEnd - phases.greenStart;
  }

  // REVIEW phase duration
  if (phases.reviewStart !== undefined && phases.reviewEnd !== undefined) {
    durations.reviewPhaseDurationMs = phases.reviewEnd - phases.reviewStart;
  }

  // Total cycle duration (from first phase start to last phase end)
  const starts = [phases.redStart, phases.greenStart, phases.reviewStart].filter(
    (t): t is number => t !== undefined
  );
  const ends = [phases.redEnd, phases.greenEnd, phases.reviewEnd].filter(
    (t): t is number => t !== undefined
  );

  if (starts.length > 0 && ends.length > 0) {
    const earliestStart = Math.min(...starts);
    const latestEnd = Math.max(...ends);
    durations.totalCycleDurationMs = latestEnd - earliestStart;
  }

  return durations;
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Initialize TDD metrics for a new story
 *
 * Resets any existing metrics and prepares for a new tracking session.
 *
 * @param storyId - The story ID to track (e.g., '19-6')
 */
export function initializeTDDMetrics(storyId: string): void {
  currentMetrics = {
    storyId,
    phases: {},
  };
  currentPhase = null;
}

/**
 * Record a phase transition
 *
 * Records the timestamp when a phase starts. Transitioning to a new phase
 * automatically ends the previous phase at the same timestamp.
 *
 * @param phase - The phase being entered
 * @param timestamp - Optional custom timestamp (defaults to Date.now())
 */
export function recordPhaseTransition(phase: TDDPhase, timestamp?: number): void {
  if (!currentMetrics) {
    // No-op if not initialized
    return;
  }

  const now = timestamp ?? Date.now();

  // If recording the same phase, do nothing
  if (currentPhase === phase) {
    return;
  }

  // End the current phase if transitioning
  if (currentPhase) {
    switch (currentPhase) {
      case 'RED':
        currentMetrics.phases.redEnd = now;
        break;
      case 'GREEN':
        currentMetrics.phases.greenEnd = now;
        break;
      case 'REFACTOR':
        // REFACTOR doesn't have explicit end tracking in current type
        break;
      case 'REVIEW':
        currentMetrics.phases.reviewEnd = now;
        break;
    }
  }

  // Start the new phase
  switch (phase) {
    case 'RED':
      currentMetrics.phases.redStart = now;
      break;
    case 'GREEN':
      currentMetrics.phases.greenStart = now;
      break;
    case 'REFACTOR':
      // REFACTOR doesn't have explicit tracking in current type
      break;
    case 'REVIEW':
      currentMetrics.phases.reviewStart = now;
      break;
  }

  currentPhase = phase;

  // Recalculate durations
  updateDurations();
}

/**
 * Update duration fields based on current phase timestamps
 */
function updateDurations(): void {
  if (!currentMetrics) {
    return;
  }

  const durations = calculatePhaseDurations(currentMetrics.phases);

  currentMetrics.redPhaseDurationMs = durations.redPhaseDurationMs;
  currentMetrics.greenPhaseDurationMs = durations.greenPhaseDurationMs;
  currentMetrics.reviewPhaseDurationMs = durations.reviewPhaseDurationMs;
  currentMetrics.totalCycleDurationMs = durations.totalCycleDurationMs;
}

/**
 * Get current TDD metrics
 *
 * @returns The current metrics or null if not initialized
 */
export function getTDDMetrics(): TDDMetrics | null {
  return currentMetrics;
}

/**
 * Reset TDD metrics
 *
 * Clears all tracking state. Call when starting a new story or session.
 */
export function resetTDDMetrics(): void {
  currentMetrics = null;
  currentPhase = null;
}
