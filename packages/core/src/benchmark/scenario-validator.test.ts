/**
 * Scenario Validator Tests
 *
 * Story 45-1: Add gold_standard schema to scenarios
 * RED phase — these tests must FAIL until Dev implements the validator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateGoldStandard,
  validateScenario,
  type GoldStandard,
  type ScenarioData,
  type ValidationResult,
} from './scenario-validator.js';

// ============================================================================
// Helpers
// ============================================================================

function validGoldStandard(): GoldStandard {
  return {
    response: 'This code has a race condition in the cache invalidation logic. The mutex should be acquired before checking staleness.',
    score: 92,
    notes: 'Identifies race condition, suggests mutex pattern, covers edge cases',
    graded_by: 'keith',
  };
}

function validScenario(): ScenarioData {
  return {
    id: 'arch-001',
    name: 'Order Service Review',
    category: 'code-review',
    difficulty: 'hard',
    agent: 'reviewer',
    version: '2.0',
    description: 'Review an order service with concurrency issues',
    instructions: 'Review the following code for bugs and design issues',
  };
}

// ============================================================================
// validateGoldStandard
// ============================================================================

describe('validateGoldStandard', () => {
  // --- Happy path ---

  it('should accept a valid gold_standard object', () => {
    const result = validateGoldStandard(validGoldStandard());
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should accept gold_standard without optional notes', () => {
    const gs = validGoldStandard();
    delete (gs as Record<string, unknown>).notes;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should accept score at lower boundary (1)', () => {
    const gs = validGoldStandard();
    gs.score = 1;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should accept score at upper boundary (100)', () => {
    const gs = validGoldStandard();
    gs.score = 100;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  // --- Required field: response ---

  it('should reject gold_standard with missing response', () => {
    const gs = validGoldStandard();
    delete (gs as Record<string, unknown>).response;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some(e => e.includes('response')));
  });

  it('should reject gold_standard with empty response', () => {
    const gs = validGoldStandard();
    gs.response = '';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('response')));
  });

  it('should reject gold_standard with non-string response', () => {
    const gs = { ...validGoldStandard(), response: 42 };
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('response')));
  });

  // --- Required field: score ---

  it('should reject gold_standard with missing score', () => {
    const gs = validGoldStandard();
    delete (gs as Record<string, unknown>).score;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('score')));
  });

  it('should reject score below 1', () => {
    const gs = validGoldStandard();
    gs.score = 0;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('score')));
  });

  it('should reject score above 100', () => {
    const gs = validGoldStandard();
    gs.score = 101;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('score')));
  });

  it('should reject non-number score', () => {
    const gs = { ...validGoldStandard(), score: 'high' };
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('score')));
  });

  it('should reject fractional score', () => {
    const gs = validGoldStandard();
    gs.score = 85.5;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('score')));
  });

  // --- Required field: graded_by ---

  it('should reject gold_standard with missing graded_by', () => {
    const gs = validGoldStandard();
    delete (gs as Record<string, unknown>).graded_by;
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });

  it('should reject graded_by value "ai"', () => {
    const gs = validGoldStandard();
    gs.graded_by = 'ai';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });

  it('should reject graded_by value "auto"', () => {
    const gs = validGoldStandard();
    gs.graded_by = 'auto';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });

  it('should reject graded_by value "claude"', () => {
    const gs = validGoldStandard();
    gs.graded_by = 'claude';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });

  it('should reject graded_by value "agent"', () => {
    const gs = validGoldStandard();
    gs.graded_by = 'agent';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });

  it('should reject graded_by case-insensitively ("AI", "Claude")', () => {
    for (const val of ['AI', 'Claude', 'AUTO', 'Agent']) {
      const gs = validGoldStandard();
      gs.graded_by = val;
      const result = validateGoldStandard(gs);
      assert.strictEqual(result.success, false, `should reject graded_by="${val}"`);
    }
  });

  it('should reject empty graded_by', () => {
    const gs = validGoldStandard();
    gs.graded_by = '';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });

  // --- Optional field: notes ---

  it('should accept notes as a string', () => {
    const gs = validGoldStandard();
    gs.notes = 'Expert-level response covering all edge cases';
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, true);
  });

  it('should reject non-string notes', () => {
    const gs = { ...validGoldStandard(), notes: 123 };
    const result = validateGoldStandard(gs);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('notes')));
  });

  // --- Null / non-object input ---

  it('should reject null input', () => {
    const result = validateGoldStandard(null);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.length > 0);
  });

  it('should reject non-object input', () => {
    const result = validateGoldStandard('not an object');
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.length > 0);
  });

  // --- Multiple errors ---

  it('should report multiple validation errors at once', () => {
    const result = validateGoldStandard({ score: 200, graded_by: 'ai' });
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.length >= 2, `expected >=2 errors, got ${result.errors.length}`);
  });
});

// ============================================================================
// validateScenario — gold_standard integration
// ============================================================================

describe('validateScenario — gold_standard field', () => {
  it('should accept scenario without gold_standard (backward compat)', () => {
    const scenario = validScenario();
    const result = validateScenario(scenario);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should accept scenario with null gold_standard', () => {
    const scenario = { ...validScenario(), gold_standard: null };
    const result = validateScenario(scenario);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should accept scenario with valid gold_standard', () => {
    const scenario = { ...validScenario(), gold_standard: validGoldStandard() };
    const result = validateScenario(scenario);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should reject scenario with invalid gold_standard', () => {
    const scenario = { ...validScenario(), gold_standard: { score: 200 } };
    const result = validateScenario(scenario);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.length > 0);
  });

  it('should reject scenario with gold_standard where graded_by is ai', () => {
    const gs = validGoldStandard();
    gs.graded_by = 'ai';
    const scenario = { ...validScenario(), gold_standard: gs };
    const result = validateScenario(scenario);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors.some(e => e.includes('graded_by')));
  });
});
