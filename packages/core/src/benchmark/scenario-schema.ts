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
export function validateScenario(scenario: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof scenario !== 'object' || scenario === null) {
    return { valid: false, errors: [{ field: 'scenario', message: 'must be an object' }] };
  }

  const s = scenario as Record<string, unknown>;

  if (typeof s.name !== 'string' || s.name === '') {
    errors.push({ field: 'name', message: 'required string' });
  }
  if (typeof s.title !== 'string' || s.title === '') {
    errors.push({ field: 'title', message: 'required string' });
  }

  if (s.red_herrings !== undefined) {
    if (!Array.isArray(s.red_herrings)) {
      errors.push({ field: 'red_herrings', message: 'must be an array' });
    } else {
      for (let i = 0; i < s.red_herrings.length; i++) {
        const entry = s.red_herrings[i];
        if (typeof entry !== 'object' || entry === null) {
          errors.push({ field: `red_herrings[${i}]`, message: 'must be an object' });
          continue;
        }
        const e = entry as Record<string, unknown>;
        for (const field of ['description', 'location', 'trap_type'] as const) {
          if (typeof e[field] !== 'string' || e[field] === '') {
            errors.push({ field: `red_herrings[${i}].${field}`, message: 'required non-empty string' });
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
