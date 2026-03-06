/**
 * Difficulty Profiler
 *
 * Story 46-2: Populate difficulty profiles from baseline data
 * Computes difficulty tier and profile from control baseline statistics.
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
// Functions
// ============================================================================

/**
 * Compute difficulty tier from control baseline statistics.
 *
 * Algorithm:
 *   extreme: mean < 50
 *   hard:    mean 50-64 OR stddev >= 12
 *   medium:  mean 65-79, stddev < 12
 *   easy:    mean >= 80, stddev < 8
 */
export function computeTier(mean: number, stddev: number): DifficultyTier {
  if (mean < 50) return 'extreme';
  if (stddev >= 12) return 'hard';
  if (mean < 65) return 'hard';
  if (mean < 80) return 'medium';
  return 'easy';
}

export function computeDifficultyProfile(stats: ControlStats): DifficultyProfile {
  return {
    tier: computeTier(stats.mean, stats.stddev),
    calibration: {
      control_mean: stats.mean,
      control_stddev: stats.stddev,
      n_runs: stats.n,
    },
  };
}
