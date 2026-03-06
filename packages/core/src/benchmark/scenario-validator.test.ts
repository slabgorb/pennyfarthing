// scenario-validator.test.ts — Tests for difficulty_profile schema validation
// Story 46-1: Add difficulty_profile schema to scenarios

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateScenario,
  validateDifficultyProfile,
  type ScenarioData,
  type DifficultyProfile,
} from './scenario-validator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides: Partial<ScenarioData> = {}): ScenarioData {
  return {
    name: 'test-scenario',
    title: 'Test Scenario',
    category: 'code-review',
    difficulty: 'medium',
    prompt: 'Review this code.',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<DifficultyProfile> = {}): DifficultyProfile {
  return {
    tier: 'medium',
    dimensions: {
      code_complexity: 6,
      domain_knowledge: 4,
      red_herring_count: 2,
      issue_subtlety: 5,
    },
    calibration: {
      control_mean: 72.5,
      control_stddev: 8.3,
      n_runs: 4,
    },
    ...overrides,
  };
}

// ===========================================================================
// AC: Schema accepts difficulty_profile with valid tier, dimensions, calibration
// ===========================================================================

describe('validateScenario — difficulty_profile acceptance', () => {
  it('accepts a scenario with a complete difficulty_profile', () => {
    const scenario = makeScenario({ difficulty_profile: makeProfile() });
    const result = validateScenario(scenario);
    assert.equal(result.success, true, 'Expected validation to pass');
    assert.equal(result.errors.length, 0, 'Expected no errors');
  });

  it('accepts all valid tier values', () => {
    for (const tier of ['easy', 'medium', 'hard', 'extreme'] as const) {
      const scenario = makeScenario({
        difficulty_profile: makeProfile({ tier }),
      });
      const result = validateScenario(scenario);
      assert.equal(result.success, true, `Expected tier "${tier}" to be valid`);
    }
  });

  it('accepts dimension values at boundaries (1 and 10)', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({
        dimensions: {
          code_complexity: 1,
          domain_knowledge: 10,
          red_herring_count: 1,
          issue_subtlety: 10,
        },
      }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, true, 'Expected boundary values to be valid');
  });
});

// ===========================================================================
// AC: Scenario without difficulty_profile still validates (backward compat)
// ===========================================================================

describe('validateScenario — backward compatibility', () => {
  it('accepts a scenario without difficulty_profile', () => {
    const scenario = makeScenario();
    const result = validateScenario(scenario);
    assert.equal(result.success, true, 'Expected validation to pass without difficulty_profile');
    assert.equal(result.errors.length, 0);
  });

  it('accepts a scenario with difficulty_profile explicitly undefined', () => {
    const scenario = makeScenario({ difficulty_profile: undefined });
    const result = validateScenario(scenario);
    assert.equal(result.success, true);
  });
});

// ===========================================================================
// AC: Invalid tier value rejects
// ===========================================================================

describe('validateScenario — invalid tier rejection', () => {
  it('rejects an invalid tier value', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({ tier: 'impossible' as any }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false, 'Expected invalid tier to fail');
    assert.ok(
      result.errors.some((e) => e.includes('tier')),
      'Expected error message to mention tier'
    );
  });

  it('rejects empty string as tier', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({ tier: '' as any }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false);
  });

  it('rejects numeric tier', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({ tier: 3 as any }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false);
  });
});

// ===========================================================================
// AC: Dimension value outside 1-10 rejects
// ===========================================================================

describe('validateScenario — dimension value validation', () => {
  it('rejects dimension value below 1', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({
        dimensions: { code_complexity: 0 },
      }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false, 'Expected value 0 to fail');
    assert.ok(result.errors.some((e) => e.includes('code_complexity')));
  });

  it('rejects dimension value above 10', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({
        dimensions: { domain_knowledge: 11 },
      }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false, 'Expected value 11 to fail');
    assert.ok(result.errors.some((e) => e.includes('domain_knowledge')));
  });

  it('rejects negative dimension value', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({
        dimensions: { issue_subtlety: -1 },
      }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false);
  });

  it('rejects non-numeric dimension value', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({
        dimensions: { code_complexity: 'high' as any },
      }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false);
  });

  it('rejects fractional dimension value', () => {
    const scenario = makeScenario({
      difficulty_profile: makeProfile({
        dimensions: { code_complexity: 5.5 },
      }),
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, false, 'Expected fractional values to fail');
  });
});

// ===========================================================================
// AC: Partial profile (tier only, no dimensions) validates
// ===========================================================================

describe('validateScenario — partial profiles', () => {
  it('accepts tier only (no dimensions, no calibration)', () => {
    const scenario = makeScenario({
      difficulty_profile: { tier: 'hard' },
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, true, 'Expected tier-only profile to be valid');
  });

  it('accepts tier with empty dimensions object', () => {
    const scenario = makeScenario({
      difficulty_profile: { tier: 'easy', dimensions: {} },
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, true);
  });

  it('accepts tier with partial dimensions (only some fields)', () => {
    const scenario = makeScenario({
      difficulty_profile: {
        tier: 'medium',
        dimensions: { code_complexity: 7 },
      },
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, true);
  });

  it('accepts tier with calibration but no dimensions', () => {
    const scenario = makeScenario({
      difficulty_profile: {
        tier: 'extreme',
        calibration: { control_mean: 45.2, control_stddev: 12.1, n_runs: 10 },
      },
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, true);
  });

  it('accepts calibration with partial fields', () => {
    const scenario = makeScenario({
      difficulty_profile: {
        tier: 'medium',
        calibration: { control_mean: 72.5 },
      },
    });
    const result = validateScenario(scenario);
    assert.equal(result.success, true);
  });
});

// ===========================================================================
// validateDifficultyProfile — standalone validation
// ===========================================================================

describe('validateDifficultyProfile', () => {
  it('validates a complete profile', () => {
    const result = validateDifficultyProfile(makeProfile());
    assert.equal(result.success, true);
  });

  it('rejects null', () => {
    const result = validateDifficultyProfile(null);
    assert.equal(result.success, false);
  });

  it('rejects non-object', () => {
    const result = validateDifficultyProfile('not an object');
    assert.equal(result.success, false);
  });

  it('rejects profile without tier (tier is required)', () => {
    const result = validateDifficultyProfile({ dimensions: { code_complexity: 5 } });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => e.includes('tier')));
  });

  it('rejects unknown dimension keys', () => {
    const result = validateDifficultyProfile({
      tier: 'medium',
      dimensions: { unknown_field: 5 },
    });
    assert.equal(result.success, false);
  });

  it('rejects negative calibration values', () => {
    const result = validateDifficultyProfile({
      tier: 'medium',
      calibration: { n_runs: -1 },
    });
    assert.equal(result.success, false);
  });
});
