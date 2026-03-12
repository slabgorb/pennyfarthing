/**
 * Finalize Run Validator Tests
 * Story 44-3: Update finalize-run for multi-judge storage
 *
 * RED phase — these tests define the contract for multi-judge validation.
 * All tests MUST fail until Dev implements the validator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateJudgeVerdict,
  validateFinalizeRun,
  aggregateMultiJudgeScores,
  isMultiJudge,
  type FinalizeRunInput,
  type JudgeVerdict,
  type AgentData,
} from './finalize-run-validator.js';

// ============================================================================
// Test fixtures
// ============================================================================

function makeAgent(overrides?: Partial<AgentData>): AgentData {
  return {
    spec: 'west-wing:dev',
    cli_timestamp: '2026-03-06T12:00:00Z',
    response_text: 'A'.repeat(250),
    input_tokens: 1000,
    output_tokens: 500,
    ...overrides,
  };
}

function makeJudge(overrides?: Partial<JudgeVerdict>): JudgeVerdict {
  return {
    cli_timestamp: '2026-03-06T12:05:00Z',
    response_text: 'WEIGHTED_TOTAL: 78/100\n' + 'B'.repeat(150),
    input_tokens: 2000,
    output_tokens: 800,
    ...overrides,
  };
}

function makeSingleJudgeInput(overrides?: Partial<FinalizeRunInput>): FinalizeRunInput {
  return {
    type: 'solo',
    timestamp: '2026-03-06T12:00:00Z',
    scenario: { name: 'test-scenario', title: 'Test Scenario' },
    agents: [makeAgent()],
    judge: makeJudge(),
    scores: { 'west-wing:dev': 78 },
    output_path: 'results/test/run.json',
    ...overrides,
  };
}

function makeMultiJudgeInput(overrides?: Partial<FinalizeRunInput>): FinalizeRunInput {
  return {
    type: 'solo',
    timestamp: '2026-03-06T12:00:00Z',
    scenario: { name: 'test-scenario', title: 'Test Scenario' },
    agents: [makeAgent()],
    judges: [
      makeJudge({ response_text: 'WEIGHTED_TOTAL: 78/100\n' + 'B'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:06:00Z', response_text: 'WEIGHTED_TOTAL: 82/100\n' + 'C'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:07:00Z', response_text: 'WEIGHTED_TOTAL: 75/100\n' + 'D'.repeat(150) }),
    ],
    scores: [
      { 'west-wing:dev': 78 },
      { 'west-wing:dev': 82 },
      { 'west-wing:dev': 75 },
    ],
    output_path: 'results/test/run.json',
    ...overrides,
  };
}

// ============================================================================
// AC1: Accepts both single judge (legacy) and judge array (multi-judge)
// ============================================================================

describe('AC1: format detection', () => {
  it('should detect single-judge format (legacy)', () => {
    const input = makeSingleJudgeInput();
    assert.strictEqual(isMultiJudge(input), false);
  });

  it('should detect multi-judge format (judges array)', () => {
    const input = makeMultiJudgeInput();
    assert.strictEqual(isMultiJudge(input), true);
  });

  it('should validate single-judge input successfully', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true, `Expected success, got error: ${result.error}`);
    assert.strictEqual(result.data!.validated, true);
    assert.strictEqual(result.data!.judges_validated, 1);
  });

  it('should validate multi-judge input successfully', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true, `Expected success, got error: ${result.error}`);
    assert.strictEqual(result.data!.validated, true);
    assert.strictEqual(result.data!.judges_validated, 3);
  });

  it('should reject input with neither judge nor judges', () => {
    const input = makeSingleJudgeInput();
    delete input.judge;
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});

// ============================================================================
// AC2: Each judge verdict validated independently
// ============================================================================

describe('AC2: per-verdict validation', () => {
  it('should validate a single judge verdict with valid fields', () => {
    const result = validateJudgeVerdict(makeJudge());
    assert.strictEqual(result.success, true);
  });

  it('should reject verdict with missing timestamp', () => {
    const result = validateJudgeVerdict(makeJudge({ cli_timestamp: '' }));
    assert.strictEqual(result.success, false);
    assert.ok(result.error!.toLowerCase().includes('timestamp'));
  });

  it('should reject verdict with invalid ISO8601 timestamp', () => {
    const result = validateJudgeVerdict(makeJudge({ cli_timestamp: 'not-a-date' }));
    assert.strictEqual(result.success, false);
  });

  it('should reject verdict with response too short (< 100 chars)', () => {
    const result = validateJudgeVerdict(makeJudge({ response_text: 'too short' }));
    assert.strictEqual(result.success, false);
    assert.ok(result.error!.toLowerCase().includes('short') || result.error!.toLowerCase().includes('length'));
  });

  it('should reject verdict missing score marker (WEIGHTED_TOTAL or RATING:)', () => {
    const result = validateJudgeVerdict(makeJudge({ response_text: 'A'.repeat(150) }));
    assert.strictEqual(result.success, false);
    assert.ok(result.error!.toLowerCase().includes('score') || result.error!.toLowerCase().includes('marker'));
  });

  it('should reject entire multi-judge run if ANY verdict is invalid', () => {
    const input = makeMultiJudgeInput();
    // Corrupt the second judge's timestamp
    input.judges![1] = makeJudge({ cli_timestamp: '' });
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('should accept multi-judge run when ALL verdicts are valid', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.validated, true);
  });
});

// ============================================================================
// AC3: Agreement metric included in saved results
// ============================================================================

describe('AC3: agreement metrics in results', () => {
  it('should include multi_judge section for multi-judge runs', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.ok(result.data!.multi_judge, 'multi_judge section must be present');
  });

  it('should include alpha_mean in multi_judge section', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.data!.multi_judge!.alpha_mean, 'number');
    assert.ok(!isNaN(result.data!.multi_judge!.alpha_mean), 'alpha_mean must not be NaN');
  });

  it('should include alpha_min and alpha_max', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.data!.multi_judge!.alpha_min, 'number');
    assert.strictEqual(typeof result.data!.multi_judge!.alpha_max, 'number');
    assert.ok(
      result.data!.multi_judge!.alpha_min <= result.data!.multi_judge!.alpha_max,
      'alpha_min must be <= alpha_max'
    );
  });

  it('should include classification string', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.ok(
      ['reliable', 'acceptable', 'unreliable'].includes(result.data!.multi_judge!.classification),
      `classification must be reliable/acceptable/unreliable, got: ${result.data!.multi_judge!.classification}`
    );
  });

  it('should NOT include multi_judge section for single-judge runs', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.multi_judge, undefined);
  });
});

// ============================================================================
// AC4: Low-agreement warning (alpha < 0.67) does NOT block storage
// ============================================================================

describe('AC4: low-agreement warning', () => {
  it('should add warning when alpha < 0.67 but still succeed', () => {
    // Judges with wildly different scores — low agreement
    const input = makeMultiJudgeInput();
    input.judges = [
      makeJudge({ response_text: 'WEIGHTED_TOTAL: 30/100\n' + 'A'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:06:00Z', response_text: 'WEIGHTED_TOTAL: 90/100\n' + 'B'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:07:00Z', response_text: 'WEIGHTED_TOTAL: 50/100\n' + 'C'.repeat(150) }),
    ];
    input.scores = [
      { 'west-wing:dev': 30 },
      { 'west-wing:dev': 90 },
      { 'west-wing:dev': 50 },
    ];

    const result = validateFinalizeRun(input);
    // Must SUCCEED — low agreement doesn't block
    assert.strictEqual(result.success, true, `Low agreement should not block: ${result.error}`);
    assert.strictEqual(result.data!.validated, true);
    // Must include a warning
    assert.ok(
      result.data!.warnings.some(w => w.toLowerCase().includes('agreement') || w.toLowerCase().includes('alpha')),
      `Expected low-agreement warning in: ${JSON.stringify(result.data!.warnings)}`
    );
  });

  it('should NOT warn when agreement is acceptable (alpha >= 0.67)', () => {
    // Judges with very similar scores — high agreement
    const input = makeMultiJudgeInput();
    input.judges = [
      makeJudge({ response_text: 'WEIGHTED_TOTAL: 78/100\n' + 'A'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:06:00Z', response_text: 'WEIGHTED_TOTAL: 79/100\n' + 'B'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:07:00Z', response_text: 'WEIGHTED_TOTAL: 78/100\n' + 'C'.repeat(150) }),
    ];
    input.scores = [
      { 'west-wing:dev': 78 },
      { 'west-wing:dev': 79 },
      { 'west-wing:dev': 78 },
    ];

    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    const agreementWarnings = result.data!.warnings.filter(
      w => w.toLowerCase().includes('agreement') || w.toLowerCase().includes('alpha')
    );
    assert.strictEqual(
      agreementWarnings.length, 0,
      `Should have no agreement warnings for high agreement, got: ${JSON.stringify(agreementWarnings)}`
    );
  });
});

// ============================================================================
// AC5: statistics.mean uses aggregated judge means
// ============================================================================

describe('AC5: aggregated judge means', () => {
  it('should compute mean from all judges scores for multi-judge', () => {
    // 3 judges: 78, 82, 75 → mean = (78+82+75)/3 = 78.33...
    const result = aggregateMultiJudgeScores([
      { 'west-wing:dev': 78 },
      { 'west-wing:dev': 82 },
      { 'west-wing:dev': 75 },
    ]);
    assert.strictEqual(result.success, true);
    // Allow floating point tolerance
    assert.ok(
      Math.abs(result.data!.mean - 78.33) < 0.01,
      `Expected mean ~78.33, got ${result.data!.mean}`
    );
  });

  it('should use aggregated mean in validation result for multi-judge', () => {
    const input = makeMultiJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    // Mean of 78, 82, 75 = 78.33
    assert.ok(
      Math.abs(result.data!.statistics.mean - 78.33) < 0.01,
      `Expected statistics.mean ~78.33, got ${result.data!.statistics.mean}`
    );
  });

  it('should use single judge score as mean for single-judge', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.statistics.mean, 78);
  });

  it('should handle multiple agents in multi-judge (aggregate per agent)', () => {
    const result = aggregateMultiJudgeScores([
      { 'west-wing:dev': 78, 'west-wing:tea': 85 },
      { 'west-wing:dev': 82, 'west-wing:tea': 80 },
      { 'west-wing:dev': 75, 'west-wing:tea': 90 },
    ]);
    assert.strictEqual(result.success, true);
    // Overall mean = average of all spec means = ((78+82+75)/3 + (85+80+90)/3) / 2
    // = (78.33 + 85) / 2 = 81.67
    assert.ok(
      Math.abs(result.data!.mean - 81.67) < 0.01,
      `Expected mean ~81.67, got ${result.data!.mean}`
    );
  });
});

// ============================================================================
// AC6: Backward compatibility — single-judge unchanged
// ============================================================================

describe('AC6: backward compatibility', () => {
  it('should validate legacy single-judge format identically to current behavior', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.validated, true);
    assert.strictEqual(result.data!.agents_validated, 1);
    assert.strictEqual(result.data!.judges_validated, 1);
    assert.strictEqual(result.data!.scores_verified, true);
  });

  it('should not include multi_judge section in single-judge results', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.multi_judge, undefined);
  });

  it('should reject single-judge with invalid timestamp', () => {
    const input = makeSingleJudgeInput();
    input.judge = makeJudge({ cli_timestamp: 'bad' });
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should reject single-judge with response too short', () => {
    const input = makeSingleJudgeInput();
    input.judge = makeJudge({ response_text: 'short' });
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should return {success, data} result objects — never throw', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(typeof result.success, 'boolean');
    assert.ok(result.data || result.error, 'Must return data or error');
  });
});

// ============================================================================
// Edge cases — paranoid testing
// ============================================================================

describe('edge cases', () => {
  it('should handle 2 judges (minimum for agreement)', () => {
    const input = makeMultiJudgeInput();
    input.judges = [
      makeJudge({ response_text: 'WEIGHTED_TOTAL: 78/100\n' + 'A'.repeat(150) }),
      makeJudge({ cli_timestamp: '2026-03-06T12:06:00Z', response_text: 'WEIGHTED_TOTAL: 80/100\n' + 'B'.repeat(150) }),
    ];
    input.scores = [
      { 'west-wing:dev': 78 },
      { 'west-wing:dev': 80 },
    ];
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.judges_validated, 2);
  });

  it('should handle 5 judges (maximum expected)', () => {
    const input = makeMultiJudgeInput();
    input.judges = Array.from({ length: 5 }, (_, i) =>
      makeJudge({
        cli_timestamp: `2026-03-06T12:0${5 + i}:00Z`,
        response_text: `WEIGHTED_TOTAL: ${75 + i}/100\n` + String.fromCharCode(65 + i).repeat(150),
      })
    );
    input.scores = Array.from({ length: 5 }, (_, i) => ({ 'west-wing:dev': 75 + i }));
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data!.judges_validated, 5);
  });

  it('should reject when judges array is empty', () => {
    const input = makeMultiJudgeInput();
    input.judges = [];
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should reject when scores array length mismatches judges array', () => {
    const input = makeMultiJudgeInput();
    // 3 judges but only 2 score entries
    input.scores = [
      { 'west-wing:dev': 78 },
      { 'west-wing:dev': 82 },
    ];
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should reject agent with response too short (< 200 chars)', () => {
    const input = makeSingleJudgeInput();
    input.agents = [makeAgent({ response_text: 'tiny' })];
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should reject agent with zero input tokens', () => {
    const input = makeSingleJudgeInput();
    input.agents = [makeAgent({ input_tokens: 0 })];
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should reject agent with zero output tokens', () => {
    const input = makeSingleJudgeInput();
    input.agents = [makeAgent({ output_tokens: 0 })];
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, false);
  });

  it('should accept verdict with RATING: marker instead of WEIGHTED_TOTAL', () => {
    const result = validateJudgeVerdict(makeJudge({ response_text: 'RATING: 78\n' + 'A'.repeat(150) }));
    assert.strictEqual(result.success, true);
  });

  it('should return empty warnings array when no issues', () => {
    const input = makeSingleJudgeInput();
    const result = validateFinalizeRun(input);
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data!.warnings), 'warnings must be an array');
  });
});
