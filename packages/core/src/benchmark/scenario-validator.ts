/**
 * Scenario Validator
 *
 * Story 45-1: Add gold_standard schema to scenarios
 * Validates scenario YAML data including optional gold_standard field.
 */

// ============================================================================
// Types
// ============================================================================

export interface GoldStandard {
  response: string;
  score: number;
  notes?: string;
  graded_by: string;
}

export interface ScenarioData {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  agent: string;
  version: string;
  description: string;
  instructions: string;
  gold_standard?: GoldStandard | null;
}

export interface ValidationResult {
  success: boolean;
  errors: string[];
}

// ============================================================================
// Constants
// ============================================================================

const FORBIDDEN_GRADED_BY = ['ai', 'auto', 'claude', 'agent'];

// ============================================================================
// Validation Functions
// ============================================================================

export function validateGoldStandard(goldStandard: unknown): ValidationResult {
  const errors: string[] = [];

  if (goldStandard === null || goldStandard === undefined || typeof goldStandard !== 'object') {
    return { success: false, errors: ['gold_standard must be an object'] };
  }

  const gs = goldStandard as Record<string, unknown>;

  // response: required, non-empty string
  if (typeof gs.response !== 'string') {
    errors.push('gold_standard.response must be a string');
  } else if (gs.response.length === 0) {
    errors.push('gold_standard.response must not be empty');
  }

  // score: required, integer 1-100
  if (typeof gs.score !== 'number') {
    errors.push('gold_standard.score must be a number');
  } else if (!Number.isInteger(gs.score)) {
    errors.push('gold_standard.score must be an integer');
  } else if (gs.score < 1 || gs.score > 100) {
    errors.push('gold_standard.score must be between 1 and 100');
  }

  // graded_by: required, non-empty string, human-only (ADR-0034 rule 6)
  if (typeof gs.graded_by !== 'string') {
    errors.push('gold_standard.graded_by must be a string');
  } else if (gs.graded_by.length === 0) {
    errors.push('gold_standard.graded_by must not be empty');
  } else if (FORBIDDEN_GRADED_BY.includes(gs.graded_by.toLowerCase())) {
    errors.push('gold_standard.graded_by must be a human identifier, not: ' + gs.graded_by);
  }

  // notes: optional, but must be string if present
  if (gs.notes !== undefined && typeof gs.notes !== 'string') {
    errors.push('gold_standard.notes must be a string');
  }

  return { success: errors.length === 0, errors };
}

export function validateScenario(scenario: unknown): ValidationResult {
  if (scenario === null || scenario === undefined || typeof scenario !== 'object') {
    return { success: false, errors: ['scenario must be an object'] };
  }

  const s = scenario as Record<string, unknown>;

  // gold_standard is optional — absent or null is valid
  if (s.gold_standard === undefined || s.gold_standard === null) {
    return { success: true, errors: [] };
  }

  return validateGoldStandard(s.gold_standard);
}
