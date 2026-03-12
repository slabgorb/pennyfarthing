/**
 * Agreement Metrics Tests
 * Story 44-2: Implement Krippendorff Alpha calculation
 *
 * RED phase — these tests define the contract for inter-rater agreement
 * (Krippendorff's Alpha) and internal consistency (Cronbach's Alpha).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateKrippendorffAlpha,
  calculateCronbachAlpha,
  calculateAgreement,
  classifyAlpha,
  type AlphaResult,
  type AgreementReport,
} from './agreement.js';

// ============================================================================
// AC1: calculateKrippendorffAlpha
// ============================================================================

describe('calculateKrippendorffAlpha', () => {
  it('should return alpha = 1.0 for perfect agreement', () => {
    // All judges give identical scores across 5 items
    const judges = [
      [8, 6, 7, 9, 5],
      [8, 6, 7, 9, 5],
      [8, 6, 7, 9, 5],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.alpha, 1.0);
    assert.strictEqual(result.data!.classification, 'reliable');
    assert.strictEqual(result.data!.reliable, true);
  });

  it('should return alpha near 0 for random/no agreement', () => {
    // Judges give uncorrelated scores — alpha should be near 0
    const judges = [
      [1, 9, 3, 7, 5],
      [9, 1, 7, 3, 5],
      [5, 5, 1, 9, 3],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.ok(
      result.data!.alpha < 0.3,
      `Expected alpha < 0.3 for random data, got ${result.data!.alpha}`
    );
  });

  it('should return moderate alpha for partially correlated scores', () => {
    // Judges mostly agree but with noise
    const judges = [
      [8, 6, 7, 9, 5, 4, 8, 7],
      [7, 5, 8, 9, 6, 3, 7, 6],
      [8, 7, 7, 8, 5, 4, 9, 7],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.ok(result.data!.alpha > 0.3, `Expected alpha > 0.3, got ${result.data!.alpha}`);
    assert.ok(result.data!.alpha < 0.95, `Expected alpha < 0.95, got ${result.data!.alpha}`);
  });

  // Known value from Krippendorff (2011) — high agreement matrix
  it('should produce alpha > 0.8 for known high-agreement matrix', () => {
    const judges = [
      [1, 2, 3, 3, 2, 1, 4, 1, 2, 5, 1, 3],
      [1, 2, 3, 3, 2, 2, 4, 1, 2, 5, 1, 3],
      [1, 2, 3, 3, 2, 3, 4, 2, 2, 5, 1, 3],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.ok(result.data!.alpha > 0.8, `Expected alpha > 0.8, got ${result.data!.alpha}`);
  });

  it('should return result object with {success, data} — never throw', () => {
    const judges = [
      [5, 5, 5],
      [5, 5, 5],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(typeof result.success, 'boolean');
    assert.ok(result.data || result.error, 'Must return data or error');
  });

  it('should return {alpha, classification, reliable} in data', () => {
    const judges = [
      [8, 6, 7, 9, 5],
      [8, 6, 7, 9, 5],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.data!.alpha, 'number');
    assert.ok(['reliable', 'acceptable', 'unreliable'].includes(result.data!.classification));
    assert.strictEqual(typeof result.data!.reliable, 'boolean');
  });
});

// ============================================================================
// AC2: calculateCronbachAlpha
// ============================================================================

describe('calculateCronbachAlpha', () => {
  it('should return alpha = 1.0 for perfect agreement', () => {
    const judges = [
      [8, 6, 7, 9, 5],
      [8, 6, 7, 9, 5],
      [8, 6, 7, 9, 5],
    ];
    const result = calculateCronbachAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.alpha, 1.0);
  });

  it('should return alpha near 0 for random data', () => {
    const judges = [
      [1, 9, 3, 7, 5],
      [9, 1, 7, 3, 5],
      [5, 5, 1, 9, 3],
    ];
    const result = calculateCronbachAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.ok(
      result.data!.alpha < 0.3,
      `Expected alpha < 0.3 for random data, got ${result.data!.alpha}`
    );
  });

  it('should return {alpha, classification} in data', () => {
    const judges = [
      [8, 6, 7, 9, 5],
      [7, 5, 8, 9, 6],
    ];
    const result = calculateCronbachAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.data!.alpha, 'number');
    assert.strictEqual(typeof result.data!.classification, 'string');
  });

  it('should return result object — never throw', () => {
    const result = calculateCronbachAlpha([]);
    assert.strictEqual(typeof result.success, 'boolean');
  });
});

// ============================================================================
// AC3: Per-dimension AND overall agreement
// ============================================================================

describe('calculateAgreement', () => {
  it('should return overall and per-dimension results', () => {
    const judgeVerdicts = [
      { correctness: 8, depth: 7, quality: 9, persona: 6 },
      { correctness: 8, depth: 6, quality: 8, persona: 3 },
      { correctness: 7, depth: 7, quality: 9, persona: 4 },
    ];
    const result = calculateAgreement(judgeVerdicts);
    assert.strictEqual(result.success, true);
    assert.ok(result.data!.overall, 'Must include overall');
    assert.ok(result.data!.overall.krippendorff, 'Overall must include krippendorff');
    assert.ok(result.data!.overall.cronbach, 'Overall must include cronbach');
    assert.ok(result.data!.dimensions.correctness, 'Must include correctness dimension');
    assert.ok(result.data!.dimensions.depth, 'Must include depth dimension');
    assert.ok(result.data!.dimensions.quality, 'Must include quality dimension');
    assert.ok(result.data!.dimensions.persona, 'Must include persona dimension');
  });

  it('should show high agreement on correctness but low on persona', () => {
    // Judges perfectly agree on correctness, wildly disagree on persona
    const judgeVerdicts = [
      { correctness: 8, persona: 9 },
      { correctness: 8, persona: 2 },
      { correctness: 8, persona: 5 },
    ];
    const result = calculateAgreement(judgeVerdicts);
    assert.strictEqual(result.success, true);
    // Perfect agreement on correctness
    assert.strictEqual(result.data!.dimensions.correctness.krippendorff.alpha, 1.0);
    // Persona should be flagged as unreliable
    assert.strictEqual(result.data!.dimensions.persona.flagged, true);
  });

  it('should return error for fewer than 2 verdicts', () => {
    const result = calculateAgreement([{ correctness: 8 }]);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('should return error for empty verdicts', () => {
    const result = calculateAgreement([]);
    assert.strictEqual(result.success, false);
  });
});

// ============================================================================
// AC4: Interpretation thresholds
// ============================================================================

describe('classifyAlpha', () => {
  it('should classify alpha >= 0.80 as reliable', () => {
    const result = classifyAlpha(0.80);
    assert.strictEqual(result.classification, 'reliable');
    assert.strictEqual(result.reliable, true);
    assert.strictEqual(result.flagged, false);
  });

  it('should classify alpha = 0.95 as reliable', () => {
    const result = classifyAlpha(0.95);
    assert.strictEqual(result.classification, 'reliable');
    assert.strictEqual(result.reliable, true);
  });

  it('should classify alpha = 0.67 as acceptable', () => {
    const result = classifyAlpha(0.67);
    assert.strictEqual(result.classification, 'acceptable');
    assert.strictEqual(result.reliable, false);
    assert.strictEqual(result.flagged, false);
  });

  it('should classify alpha = 0.79 as acceptable', () => {
    const result = classifyAlpha(0.79);
    assert.strictEqual(result.classification, 'acceptable');
  });

  it('should classify alpha = 0.6699 as unreliable', () => {
    const result = classifyAlpha(0.6699);
    assert.strictEqual(result.classification, 'unreliable');
    assert.strictEqual(result.reliable, false);
    assert.strictEqual(result.flagged, true);
  });

  it('should classify alpha = 0.0 as unreliable', () => {
    const result = classifyAlpha(0.0);
    assert.strictEqual(result.classification, 'unreliable');
    assert.strictEqual(result.flagged, true);
  });

  it('should classify negative alpha as unreliable', () => {
    const result = classifyAlpha(-0.5);
    assert.strictEqual(result.classification, 'unreliable');
    assert.strictEqual(result.flagged, true);
  });
});

// ============================================================================
// AC5: Unreliable dimensions flagged with recommendation
// ============================================================================

describe('unreliable dimension flagging', () => {
  it('should flag unreliable dimensions with flagged=true', () => {
    const judgeVerdicts = [
      { correctness: 8, persona: 9 },
      { correctness: 8, persona: 2 },
      { correctness: 8, persona: 5 },
    ];
    const result = calculateAgreement(judgeVerdicts);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.dimensions.persona.flagged, true);
    assert.strictEqual(result.data!.dimensions.correctness.flagged, false);
  });

  it('should include recommendation string containing dimension name', () => {
    const judgeVerdicts = [
      { correctness: 8, depth: 7, persona: 9 },
      { correctness: 8, depth: 7, persona: 2 },
      { correctness: 8, depth: 7, persona: 5 },
    ];
    const result = calculateAgreement(judgeVerdicts);
    assert.strictEqual(result.success, true);
    for (const [dimName, dimResult] of Object.entries(result.data!.dimensions)) {
      if (dimResult.flagged) {
        assert.ok(
          dimResult.recommendation,
          `Flagged dimension "${dimName}" must have a recommendation`
        );
        assert.ok(
          dimResult.recommendation!.includes(dimName),
          `Recommendation must include dimension name "${dimName}", got: "${dimResult.recommendation}"`
        );
      }
    }
  });
});

// ============================================================================
// AC6: Edge cases
// ============================================================================

describe('edge cases', () => {
  it('should handle 2 judges (minimum)', () => {
    const judges = [
      [8, 6, 7, 9, 5],
      [7, 5, 8, 9, 6],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.data!.alpha, 'number');
  });

  it('should handle 5 judges (maximum expected)', () => {
    const judges = [
      [8, 6, 7, 9, 5],
      [7, 5, 8, 9, 6],
      [8, 7, 7, 8, 5],
      [9, 6, 6, 9, 4],
      [7, 5, 7, 8, 6],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.data!.alpha, 'number');
  });

  it('should return NaN/undefined alpha for single item (degenerate case)', () => {
    const judges = [
      [8],
      [7],
      [8],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, true);
    assert.ok(
      isNaN(result.data!.alpha) || result.data!.alpha === undefined,
      `Single item should return NaN or undefined, got ${result.data!.alpha}`
    );
  });

  it('should return error for fewer than 2 judges (Krippendorff)', () => {
    const result = calculateKrippendorffAlpha([[8, 6, 7]]);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('should return error for empty input (Krippendorff)', () => {
    const result = calculateKrippendorffAlpha([]);
    assert.strictEqual(result.success, false);
  });

  it('should return error for fewer than 2 judges (Cronbach)', () => {
    const result = calculateCronbachAlpha([[8, 6, 7]]);
    assert.strictEqual(result.success, false);
  });

  it('should return error for empty input (Cronbach)', () => {
    const result = calculateCronbachAlpha([]);
    assert.strictEqual(result.success, false);
  });

  it('should return error for mismatched judge array lengths', () => {
    const judges = [
      [8, 6, 7],
      [7, 5],
    ];
    const result = calculateKrippendorffAlpha(judges);
    assert.strictEqual(result.success, false);
  });
});

// ============================================================================
// AC7: Barrel exports from index.ts
// ============================================================================

describe('barrel exports', () => {
  it('should export all agreement functions from index', async () => {
    const barrel = await import('./index.js');
    assert.strictEqual(typeof barrel.calculateKrippendorffAlpha, 'function');
    assert.strictEqual(typeof barrel.calculateCronbachAlpha, 'function');
    assert.strictEqual(typeof barrel.calculateAgreement, 'function');
    assert.strictEqual(typeof barrel.classifyAlpha, 'function');
  });
});
