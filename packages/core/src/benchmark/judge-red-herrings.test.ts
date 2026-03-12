/**
 * Judge Red Herring Detection Tests
 * Story 43-2: Update judge for red herring detection
 *
 * RED phase: Tests define expected behavior for judge red herring handling.
 * Covers all ACs: prompt section building, precision scoring, backward compat.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { RedHerring } from './scenario-schema.js';
import {
  buildRedHerringPromptSection,
  evaluateRedHerringPrecision,
  calculateCorrectnessAdjustment,
} from './judge-red-herrings.js';

// ============================================================================
// Test fixtures
// ============================================================================

const sampleRedHerrings: RedHerring[] = [
  {
    description: 'Unused import that is actually used via reflection',
    location: 'line 12',
    trap_type: 'false-unused',
  },
  {
    description: 'Magic number that is actually a well-known HTTP status',
    location: 'line 45',
    trap_type: 'false-magic-number',
  },
];

const singleRedHerring: RedHerring[] = [
  {
    description: 'Variable shadowing that is intentional for scoping',
    location: 'line 30',
    trap_type: 'false-shadow',
  },
];

// ============================================================================
// AC: Judge receives red_herrings in scenario context
// ============================================================================

describe('buildRedHerringPromptSection', () => {
  describe('scenarios with red herrings', () => {
    it('should include red herring descriptions in prompt section', () => {
      const result = buildRedHerringPromptSection(sampleRedHerrings);
      assert.strictEqual(result.hasRedHerrings, true);
      assert.ok(result.section.includes('Unused import that is actually used via reflection'));
      assert.ok(result.section.includes('Magic number that is actually a well-known HTTP status'));
    });

    it('should include red herring locations in prompt section', () => {
      const result = buildRedHerringPromptSection(sampleRedHerrings);
      assert.ok(result.section.includes('line 12'));
      assert.ok(result.section.includes('line 45'));
    });

    it('should include red herring trap types in prompt section', () => {
      const result = buildRedHerringPromptSection(sampleRedHerrings);
      assert.ok(result.section.includes('false-unused'));
      assert.ok(result.section.includes('false-magic-number'));
    });

    it('should format single red herring correctly', () => {
      const result = buildRedHerringPromptSection(singleRedHerring);
      assert.strictEqual(result.hasRedHerrings, true);
      assert.ok(result.section.includes('Variable shadowing'));
    });

    it('should include scoring guidance in the prompt section', () => {
      const result = buildRedHerringPromptSection(sampleRedHerrings);
      // The prompt must tell the judge how to score red herrings
      assert.ok(
        result.section.toLowerCase().includes('penalty') ||
        result.section.toLowerCase().includes('penaliz'),
        'Should mention penalty for flagging red herrings',
      );
      assert.ok(
        result.section.toLowerCase().includes('bonus') ||
        result.section.toLowerCase().includes('credit'),
        'Should mention bonus for explicitly dismissing red herrings',
      );
    });
  });

  describe('backward compatibility — no red herrings', () => {
    it('should return empty section when red_herrings is undefined', () => {
      const result = buildRedHerringPromptSection(undefined);
      assert.strictEqual(result.hasRedHerrings, false);
      assert.strictEqual(result.section, '');
    });

    it('should return empty section when red_herrings is empty array', () => {
      const result = buildRedHerringPromptSection([]);
      assert.strictEqual(result.hasRedHerrings, false);
      assert.strictEqual(result.section, '');
    });
  });
});

// ============================================================================
// AC: Precision scoring in correctness dimension
// ============================================================================

describe('evaluateRedHerringPrecision', () => {
  describe('agent flags red herring as real issue — penalty', () => {
    it('should detect when agent flags a red herring', () => {
      const findings = [
        { description: 'Unused import at line 12 should be removed', location: 'line 12' },
      ];
      const result = evaluateRedHerringPrecision(sampleRedHerrings, findings);
      assert.strictEqual(result.flagged.length, 1);
      assert.strictEqual(result.flagged[0].redHerring.trap_type, 'false-unused');
      assert.ok(result.precisionPenalty > 0, 'Should have a precision penalty');
    });

    it('should detect multiple flagged red herrings', () => {
      const findings = [
        { description: 'Unused import at line 12', location: 'line 12' },
        { description: 'Magic number 404 at line 45 should be a constant', location: 'line 45' },
      ];
      const result = evaluateRedHerringPrecision(sampleRedHerrings, findings);
      assert.strictEqual(result.flagged.length, 2);
      assert.ok(result.precisionPenalty > 0);
    });

    it('should penalize more for flagging more red herrings', () => {
      const oneFlagged = evaluateRedHerringPrecision(
        sampleRedHerrings,
        [{ description: 'Unused import at line 12', location: 'line 12' }],
      );
      const twoFlagged = evaluateRedHerringPrecision(
        sampleRedHerrings,
        [
          { description: 'Unused import at line 12', location: 'line 12' },
          { description: 'Magic number at line 45', location: 'line 45' },
        ],
      );
      assert.ok(
        twoFlagged.precisionPenalty > oneFlagged.precisionPenalty,
        'More flagged herrings should mean higher penalty',
      );
    });
  });

  describe('agent ignores red herring — neutral', () => {
    it('should track ignored red herrings (no penalty, no bonus)', () => {
      // Agent found a real issue but didn't mention either red herring
      const findings = [
        { description: 'Missing null check in processOrder', location: 'line 88' },
      ];
      const result = evaluateRedHerringPrecision(sampleRedHerrings, findings);
      assert.strictEqual(result.ignored.length, 2);
      assert.strictEqual(result.flagged.length, 0);
      assert.strictEqual(result.precisionPenalty, 0);
      assert.strictEqual(result.precisionBonus, 0);
    });

    it('should handle mixed: one flagged, one ignored', () => {
      const findings = [
        { description: 'Unused import at line 12', location: 'line 12' },
        { description: 'Missing null check in processOrder', location: 'line 88' },
      ];
      const result = evaluateRedHerringPrecision(sampleRedHerrings, findings);
      assert.strictEqual(result.flagged.length, 1);
      assert.strictEqual(result.ignored.length, 1);
    });
  });

  describe('agent explicitly dismisses red herring — bonus', () => {
    it('should give bonus for explicit dismissal with reasoning', () => {
      const dismissals = [
        {
          description: 'The import at line 12 appears unused but is used via reflection — not an issue',
          location: 'line 12',
        },
      ];
      const result = evaluateRedHerringPrecision(sampleRedHerrings, [], dismissals);
      assert.strictEqual(result.dismissed.length, 1);
      assert.ok(result.precisionBonus > 0, 'Should get a bonus for dismissal');
    });

    it('should give more bonus for dismissing more red herrings', () => {
      const oneDismissed = evaluateRedHerringPrecision(
        sampleRedHerrings,
        [],
        [{ description: 'Import at line 12 is used via reflection', location: 'line 12' }],
      );
      const twoDismissed = evaluateRedHerringPrecision(
        sampleRedHerrings,
        [],
        [
          { description: 'Import at line 12 is used via reflection', location: 'line 12' },
          { description: '404 at line 45 is a standard HTTP status code', location: 'line 45' },
        ],
      );
      assert.ok(
        twoDismissed.precisionBonus > oneDismissed.precisionBonus,
        'More dismissed herrings should mean higher bonus',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty red herrings list', () => {
      const result = evaluateRedHerringPrecision([], [{ description: 'Some finding' }]);
      assert.strictEqual(result.flagged.length, 0);
      assert.strictEqual(result.ignored.length, 0);
      assert.strictEqual(result.dismissed.length, 0);
      assert.strictEqual(result.precisionPenalty, 0);
      assert.strictEqual(result.precisionBonus, 0);
    });

    it('should handle empty findings list', () => {
      const result = evaluateRedHerringPrecision(sampleRedHerrings, []);
      assert.strictEqual(result.flagged.length, 0);
      assert.strictEqual(result.ignored.length, 2);
    });

    it('should handle no dismissals parameter', () => {
      const result = evaluateRedHerringPrecision(sampleRedHerrings, []);
      assert.strictEqual(result.dismissed.length, 0);
    });
  });
});

// ============================================================================
// AC: Correctness dimension adjustment
// ============================================================================

describe('calculateCorrectnessAdjustment', () => {
  it('should return negative adjustment when agent flagged red herrings', () => {
    const evaluation = {
      flagged: [{
        redHerring: sampleRedHerrings[0],
        finding: { description: 'Unused import', location: 'line 12' },
      }],
      ignored: [sampleRedHerrings[1]],
      dismissed: [],
      precisionPenalty: 1,
      precisionBonus: 0,
      netAdjustment: -1,
    };
    const adjustment = calculateCorrectnessAdjustment(evaluation);
    assert.ok(adjustment < 0, 'Should be negative for flagged herrings');
  });

  it('should return positive adjustment when agent dismissed red herrings', () => {
    const evaluation = {
      flagged: [],
      ignored: [],
      dismissed: [{
        redHerring: sampleRedHerrings[0],
        finding: { description: 'Import is used via reflection', location: 'line 12' },
        reasoning: 'Used via reflection',
      }],
      precisionPenalty: 0,
      precisionBonus: 0.5,
      netAdjustment: 0.5,
    };
    const adjustment = calculateCorrectnessAdjustment(evaluation);
    assert.ok(adjustment > 0, 'Should be positive for dismissed herrings');
  });

  it('should return zero adjustment when agent simply ignored red herrings', () => {
    const evaluation = {
      flagged: [],
      ignored: sampleRedHerrings,
      dismissed: [],
      precisionPenalty: 0,
      precisionBonus: 0,
      netAdjustment: 0,
    };
    const adjustment = calculateCorrectnessAdjustment(evaluation);
    assert.strictEqual(adjustment, 0, 'Should be zero for ignored herrings');
  });

  it('should produce net adjustment: penalty outweighs bonus', () => {
    const evaluation = {
      flagged: [{
        redHerring: sampleRedHerrings[0],
        finding: { description: 'Unused import', location: 'line 12' },
      }],
      ignored: [],
      dismissed: [{
        redHerring: sampleRedHerrings[1],
        finding: { description: '404 is HTTP standard', location: 'line 45' },
        reasoning: 'Standard HTTP code',
      }],
      precisionPenalty: 1,
      precisionBonus: 0.5,
      netAdjustment: -0.5,
    };
    const adjustment = calculateCorrectnessAdjustment(evaluation);
    assert.ok(adjustment < 0, 'Penalty should outweigh bonus');
  });
});

// ============================================================================
// AC: Two responses score differently on correctness
// ============================================================================

describe('differential scoring', () => {
  it('should score response flagging herring worse than one ignoring it', () => {
    const flaggingResponse = evaluateRedHerringPrecision(
      sampleRedHerrings,
      [{ description: 'Unused import at line 12', location: 'line 12' }],
    );
    const ignoringResponse = evaluateRedHerringPrecision(
      sampleRedHerrings,
      [{ description: 'Real bug: null pointer at line 88', location: 'line 88' }],
    );

    const flaggingAdj = calculateCorrectnessAdjustment(flaggingResponse);
    const ignoringAdj = calculateCorrectnessAdjustment(ignoringResponse);

    assert.ok(
      flaggingAdj < ignoringAdj,
      `Flagging response (${flaggingAdj}) should score worse than ignoring (${ignoringAdj})`,
    );
  });

  it('should score response dismissing herring better than one ignoring it', () => {
    const dismissingResponse = evaluateRedHerringPrecision(
      singleRedHerring,
      [],
      [{ description: 'Shadowing at line 30 is intentional for scoping', location: 'line 30' }],
    );
    const ignoringResponse = evaluateRedHerringPrecision(
      singleRedHerring,
      [],
    );

    const dismissingAdj = calculateCorrectnessAdjustment(dismissingResponse);
    const ignoringAdj = calculateCorrectnessAdjustment(ignoringResponse);

    assert.ok(
      dismissingAdj > ignoringAdj,
      `Dismissing response (${dismissingAdj}) should score better than ignoring (${ignoringAdj})`,
    );
  });
});
