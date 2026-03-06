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

/**
 * Validate a scenario object against the schema.
 * Returns {success, errors} — never throws.
 */
export function validateScenario(_scenario: ScenarioData): ValidationResult {
  // TODO: Implement validation — story 46-1
  throw new Error('not implemented');
}

/**
 * Validate the difficulty_profile field specifically.
 * Returns {success, errors} — never throws.
 */
export function validateDifficultyProfile(_profile: unknown): ValidationResult {
  // TODO: Implement validation — story 46-1
  throw new Error('not implemented');
}
