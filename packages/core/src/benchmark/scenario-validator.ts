// scenario-validator.ts — Validates scenario YAML against schema
// Story 46-1: Add difficulty_profile schema to scenarios

export interface DifficultyDimensions {
  code_complexity?: number;
  domain_knowledge?: number;
  red_herring_count?: number;
  issue_subtlety?: number;
}

export interface DifficultyCalibration {
  control_mean?: number;
  control_stddev?: number;
  n_runs?: number;
}

export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'extreme';

export interface DifficultyProfile {
  tier: DifficultyTier;
  dimensions?: DifficultyDimensions;
  calibration?: DifficultyCalibration;
}

export interface ScenarioData {
  name: string;
  title: string;
  category: string;
  difficulty: string;
  prompt: string;
  difficulty_profile?: DifficultyProfile;
  [key: string]: unknown;
}

export interface ValidationResult {
  success: boolean;
  errors: string[];
}

const VALID_TIERS: readonly string[] = ['easy', 'medium', 'hard', 'extreme'];
const VALID_DIMENSION_KEYS: readonly string[] = [
  'code_complexity',
  'domain_knowledge',
  'red_herring_count',
  'issue_subtlety',
];

/**
 * Validate a scenario object against the schema.
 * Returns {success, errors} — never throws.
 */
export function validateScenario(scenario: ScenarioData): ValidationResult {
  if (scenario.difficulty_profile == null) {
    return { success: true, errors: [] };
  }
  return validateDifficultyProfile(scenario.difficulty_profile);
}

/**
 * Validate the difficulty_profile field specifically.
 * Returns {success, errors} — never throws.
 */
export function validateDifficultyProfile(profile: unknown): ValidationResult {
  const errors: string[] = [];

  if (profile == null || typeof profile !== 'object') {
    return { success: false, errors: ['difficulty_profile must be an object'] };
  }

  const p = profile as Record<string, unknown>;

  // tier is required and must be a valid enum value
  if (!p.tier || typeof p.tier !== 'string' || !VALID_TIERS.includes(p.tier)) {
    errors.push(`Invalid tier: expected one of ${VALID_TIERS.join(', ')}, got ${String(p.tier)}`);
  }

  // dimensions — optional object, but if present validate keys and values
  if (p.dimensions != null) {
    if (typeof p.dimensions !== 'object') {
      errors.push('dimensions must be an object');
    } else {
      const dims = p.dimensions as Record<string, unknown>;
      for (const [key, value] of Object.entries(dims)) {
        if (!VALID_DIMENSION_KEYS.includes(key)) {
          errors.push(`Unknown dimension key: ${key}`);
          continue;
        }
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
          errors.push(`${key} must be an integer between 1 and 10, got ${String(value)}`);
        }
      }
    }
  }

  // calibration — optional object, but if present validate numeric non-negative values
  if (p.calibration != null) {
    if (typeof p.calibration !== 'object') {
      errors.push('calibration must be an object');
    } else {
      const cal = p.calibration as Record<string, unknown>;
      for (const [key, value] of Object.entries(cal)) {
        if (typeof value !== 'number' || value < 0) {
          errors.push(`calibration.${key} must be a non-negative number, got ${String(value)}`);
        }
      }
    }
  }

  return { success: errors.length === 0, errors };
}
