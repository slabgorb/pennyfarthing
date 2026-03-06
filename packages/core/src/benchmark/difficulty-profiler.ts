/**
 * Difficulty Profiler
 *
 * Story 46-2: Populate difficulty profiles from baseline data
 * Stub — not yet implemented. Tests should FAIL.
 */

// ============================================================================
// Types
// ============================================================================

export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'extreme';

export interface ControlStats {
  mean: number;
  stddev: number;
  n: number;
}

export interface DifficultyDimensions {
  code_complexity?: number;
  domain_knowledge?: number;
  red_herring_count?: number;
  issue_subtlety?: number;
}

export interface DifficultyCalibration {
  control_mean: number;
  control_stddev: number;
  n_runs: number;
}

export interface DifficultyProfile {
  tier: DifficultyTier;
  dimensions?: DifficultyDimensions;
  calibration: DifficultyCalibration;
}

// ============================================================================
// Functions — stubs, not implemented
// ============================================================================

export function computeTier(_mean: number, _stddev: number): DifficultyTier {
  throw new Error('not implemented');
}

export function computeDifficultyProfile(_stats: ControlStats): DifficultyProfile {
  throw new Error('not implemented');
}
