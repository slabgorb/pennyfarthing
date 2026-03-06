/**
 * Difficulty Profiler Tests
 *
 * Story 46-2: Populate difficulty profiles from baseline data
 * RED phase — these tests must FAIL until Dev implements the profiler.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeTier,
  computeDifficultyProfile,
  type DifficultyTier,
  type ControlStats,
  type DifficultyProfile,
} from './difficulty-profiler.js';

// ============================================================================
// computeTier — tier assignment algorithm
// ============================================================================

describe('computeTier', () => {
  // --- Easy tier: mean >= 80 AND stddev < 8 ---

  it('should assign easy when mean >= 80 and stddev < 8', () => {
    const tier = computeTier(85, 5);
    assert.strictEqual(tier, 'easy');
  });

  it('should assign easy at lower boundary (mean = 80, stddev = 7.99)', () => {
    const tier = computeTier(80, 7.99);
    assert.strictEqual(tier, 'easy');
  });

  // --- Medium tier: mean 65-79 AND stddev < 12 ---

  it('should assign medium when mean is 65-79 and stddev < 12', () => {
    const tier = computeTier(72, 5);
    assert.strictEqual(tier, 'medium');
  });

  it('should assign medium at lower boundary (mean = 65)', () => {
    const tier = computeTier(65, 5);
    assert.strictEqual(tier, 'medium');
  });

  it('should assign medium at upper boundary (mean = 79)', () => {
    const tier = computeTier(79, 5);
    assert.strictEqual(tier, 'medium');
  });

  // --- Hard tier: mean 50-64 OR stddev >= 12 ---

  it('should assign hard when mean is 50-64 with low stddev', () => {
    const tier = computeTier(55, 5);
    assert.strictEqual(tier, 'hard');
  });

  it('should assign hard when stddev >= 12 even with medium mean', () => {
    const tier = computeTier(72, 14);
    assert.strictEqual(tier, 'hard');
  });

  it('should assign hard when stddev >= 12 even with high mean', () => {
    const tier = computeTier(85, 12);
    assert.strictEqual(tier, 'hard');
  });

  it('should assign hard at stddev boundary (stddev = 12)', () => {
    const tier = computeTier(75, 12);
    assert.strictEqual(tier, 'hard');
  });

  it('should assign hard at lower mean boundary (mean = 50)', () => {
    const tier = computeTier(50, 5);
    assert.strictEqual(tier, 'hard');
  });

  // --- Extreme tier: mean < 50 ---

  it('should assign extreme when mean < 50', () => {
    const tier = computeTier(40, 5);
    assert.strictEqual(tier, 'extreme');
  });

  it('should assign extreme at boundary (mean = 49.99)', () => {
    const tier = computeTier(49.99, 5);
    assert.strictEqual(tier, 'extreme');
  });

  it('should assign extreme even with low stddev', () => {
    const tier = computeTier(30, 2);
    assert.strictEqual(tier, 'extreme');
  });

  // --- Known control baseline data from session notes ---

  it('should assign hard for astropy-12907 (mean=60.55, stddev=7.53)', () => {
    const tier = computeTier(60.55, 7.5255);
    assert.strictEqual(tier, 'hard');
  });

  it('should assign medium for legacy-modernization (mean=74.25, stddev=4.19)', () => {
    const tier = computeTier(74.25, 4.1904);
    assert.strictEqual(tier, 'medium');
  });

  it('should assign medium for order-service (mean=71.75, stddev=1.95)', () => {
    const tier = computeTier(71.75, 1.9519);
    assert.strictEqual(tier, 'medium');
  });

  it('should assign easy for sprint-planning-conflict (mean=81.42, stddev=4.40)', () => {
    const tier = computeTier(81.42, 4.4024);
    assert.strictEqual(tier, 'easy');
  });

  it('should assign hard for tdd-shopping-cart (mean=61.00, stddev=8.67)', () => {
    const tier = computeTier(61.00, 8.6746);
    assert.strictEqual(tier, 'hard');
  });
});

// ============================================================================
// computeDifficultyProfile — full profile generation
// ============================================================================

describe('computeDifficultyProfile', () => {
  it('should return a complete difficulty profile from control stats', () => {
    const stats: ControlStats = { mean: 72, stddev: 5, n: 10 };
    const profile = computeDifficultyProfile(stats);

    assert.strictEqual(profile.tier, 'medium');
    assert.strictEqual(profile.calibration.control_mean, 72);
    assert.strictEqual(profile.calibration.control_stddev, 5);
    assert.strictEqual(profile.calibration.n_runs, 10);
  });

  it('should include calibration data matching input stats exactly', () => {
    const stats: ControlStats = { mean: 60.55, stddev: 7.5255, n: 9 };
    const profile = computeDifficultyProfile(stats);

    assert.strictEqual(profile.calibration.control_mean, 60.55);
    assert.strictEqual(profile.calibration.control_stddev, 7.5255);
    assert.strictEqual(profile.calibration.n_runs, 9);
  });

  it('should compute correct tier for easy scenario', () => {
    const stats: ControlStats = { mean: 81.42, stddev: 4.4024, n: 7 };
    const profile = computeDifficultyProfile(stats);
    assert.strictEqual(profile.tier, 'easy');
  });

  it('should compute correct tier for hard scenario (low mean)', () => {
    const stats: ControlStats = { mean: 55, stddev: 5, n: 10 };
    const profile = computeDifficultyProfile(stats);
    assert.strictEqual(profile.tier, 'hard');
  });

  it('should compute correct tier for hard scenario (high variance)', () => {
    const stats: ControlStats = { mean: 75, stddev: 15, n: 10 };
    const profile = computeDifficultyProfile(stats);
    assert.strictEqual(profile.tier, 'hard');
  });

  it('should compute correct tier for extreme scenario', () => {
    const stats: ControlStats = { mean: 35, stddev: 10, n: 5 };
    const profile = computeDifficultyProfile(stats);
    assert.strictEqual(profile.tier, 'extreme');
  });

  it('should have dimensions as optional (undefined is valid)', () => {
    const stats: ControlStats = { mean: 72, stddev: 5, n: 10 };
    const profile = computeDifficultyProfile(stats);
    // dimensions may or may not be present — both are valid
    if (profile.dimensions !== undefined) {
      assert.strictEqual(typeof profile.dimensions, 'object');
    }
  });

  it('should return a well-typed DifficultyProfile', () => {
    const stats: ControlStats = { mean: 72, stddev: 5, n: 10 };
    const profile: DifficultyProfile = computeDifficultyProfile(stats);

    assert.ok(['easy', 'medium', 'hard', 'extreme'].includes(profile.tier));
    assert.strictEqual(typeof profile.calibration.control_mean, 'number');
    assert.strictEqual(typeof profile.calibration.control_stddev, 'number');
    assert.strictEqual(typeof profile.calibration.n_runs, 'number');
  });
});
