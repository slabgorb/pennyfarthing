/**
 * Scenario Schema
 * Story 43-1: Add red_herrings schema to scenarios
 *
 * Defines the scenario YAML schema with optional red_herrings field
 * for false positive trap testing in benchmarks.
 */

export interface RedHerring {
  description: string;
  location: string;
  trap_type: string;
}

export interface Scenario {
  name: string;
  title: string;
  red_herrings?: RedHerring[];
}

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a scenario object including optional red_herrings field.
 * Returns {valid, errors} — does not throw.
 */
export function validateScenario(_scenario: unknown): ValidationResult {
  // Stub: not yet implemented — tests should fail
  throw new Error('not implemented');
}
