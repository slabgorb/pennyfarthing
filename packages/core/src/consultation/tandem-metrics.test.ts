/**
 * Tests for Story 86-6: Tandem Metrics and Token Tracking
 *
 * RED state tests for consultation token usage, frequency, and outcome metrics.
 * These metrics are tracked separately from leader session tokens and written
 * to the dialogue file summary section.
 *
 * ACs covered:
 *   AC1: Consultation tokens logged separately from leader session tokens
 *   AC2: Metrics captured: count, total tokens, avg response time, outcome distribution
 *   AC3: Metrics written to dialogue file summary section
 *   AC4: Session summary includes tandem overhead percentage
 *   AC5: Target: consultation overhead < 25% of baseline story token cost
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  aggregateMetrics,
  calculateOverheadPercent,
  isWithinBudget,
  formatMetricsSummary,
  parseMetricsFromSummary,
} from './tandem-metrics.js';

import type {
  MetricsExchange,
  TandemMetricsSummary,
} from './tandem-metrics.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const EXCHANGE_WITH_METRICS: MetricsExchange = {
  number: 1,
  timestamp: '10:05',
  leader: 'dev',
  partner: 'architect',
  question: 'Should we use a class or functional approach?',
  recommendation: 'Use pure functions',
  confidence: 'high',
  outcome: 'applied',
  outcomeNote: 'Adopted functional approach',
  metrics: {
    inputTokens: 150,
    outputTokens: 85,
    responseTimeMs: 2300,
  },
};

const SECOND_EXCHANGE_WITH_METRICS: MetricsExchange = {
  number: 2,
  timestamp: '10:20',
  leader: 'dev',
  partner: 'architect',
  question: 'Shell wrapper: Node.js or pure bash?',
  recommendation: 'Pure bash for dependency-free scripts',
  confidence: 'medium',
  outcome: 'deferred',
  outcomeNote: 'Revisit after prototype',
  metrics: {
    inputTokens: 200,
    outputTokens: 120,
    responseTimeMs: 3100,
  },
};

const THIRD_EXCHANGE_WITH_METRICS: MetricsExchange = {
  number: 3,
  timestamp: '10:35',
  leader: 'dev',
  partner: 'architect',
  question: 'Error handling: result objects or exceptions?',
  recommendation: 'Result objects per framework convention',
  confidence: 'high',
  outcome: 'applied',
  outcomeNote: 'Used {success, data?, error?} pattern',
  metrics: {
    inputTokens: 180,
    outputTokens: 95,
    responseTimeMs: 1800,
  },
};

const EXCHANGE_NO_METRICS: MetricsExchange = {
  number: 4,
  timestamp: '10:50',
  leader: 'dev',
  partner: 'architect',
  question: 'Legacy exchange without tracking',
  recommendation: 'N/A',
  confidence: 'low',
};

const EXCHANGE_REJECTED: MetricsExchange = {
  number: 5,
  timestamp: '11:00',
  leader: 'dev',
  partner: 'tea',
  question: 'Should we add integration tests here?',
  recommendation: 'Yes, add container-based tests',
  confidence: 'high',
  outcome: 'rejected',
  outcomeNote: 'Unit tests sufficient for this scope',
  metrics: {
    inputTokens: 130,
    outputTokens: 70,
    responseTimeMs: 1500,
  },
};

const EXCHANGE_PENDING: MetricsExchange = {
  number: 6,
  timestamp: '11:10',
  leader: 'dev',
  partner: 'architect',
  question: 'Pending decision',
  recommendation: 'Still thinking',
  confidence: 'low',
  metrics: {
    inputTokens: 100,
    outputTokens: 50,
    responseTimeMs: 900,
  },
};

// =============================================================================
// AC1: Consultation tokens logged separately from leader session tokens
// =============================================================================

describe('86-6: Tandem Metrics and Token Tracking', () => {

  describe('AC1: Consultation tokens tracked per exchange', () => {

    it('should track input and output tokens separately per exchange', () => {
      const exchanges = [EXCHANGE_WITH_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.totalInputTokens, 150,
        'Must track input tokens from consultation request');
      assert.strictEqual(metrics.totalOutputTokens, 85,
        'Must track output tokens from consultation response');
    });

    it('should sum tokens across multiple exchanges', () => {
      const exchanges = [EXCHANGE_WITH_METRICS, SECOND_EXCHANGE_WITH_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.totalInputTokens, 350,
        'Must sum input tokens: 150 + 200');
      assert.strictEqual(metrics.totalOutputTokens, 205,
        'Must sum output tokens: 85 + 120');
      assert.strictEqual(metrics.totalTokens, 555,
        'Must sum total tokens: 350 + 205');
    });

    it('should exclude exchanges without metrics from token totals', () => {
      const exchanges = [EXCHANGE_WITH_METRICS, EXCHANGE_NO_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.totalInputTokens, 150,
        'Must only count exchanges with metrics');
      assert.strictEqual(metrics.totalOutputTokens, 85,
        'Must only count exchanges with metrics');
    });

    it('should still count exchanges without metrics in consultationCount', () => {
      const exchanges = [EXCHANGE_WITH_METRICS, EXCHANGE_NO_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.consultationCount, 2,
        'All exchanges count toward consultation count regardless of metrics');
    });

    it('should handle empty exchange list', () => {
      const metrics = aggregateMetrics([]);

      assert.strictEqual(metrics.consultationCount, 0);
      assert.strictEqual(metrics.totalInputTokens, 0);
      assert.strictEqual(metrics.totalOutputTokens, 0);
      assert.strictEqual(metrics.totalTokens, 0);
    });
  });

  // =============================================================================
  // AC2: Metrics captured: count, total tokens, avg response time, outcome dist
  // =============================================================================

  describe('AC2: Aggregate metrics calculation', () => {

    it('should calculate average response time across exchanges', () => {
      const exchanges = [EXCHANGE_WITH_METRICS, SECOND_EXCHANGE_WITH_METRICS];
      const metrics = aggregateMetrics(exchanges);

      // (2300 + 3100) / 2 = 2700
      assert.strictEqual(metrics.avgResponseTimeMs, 2700,
        'Must calculate average response time from exchanges with metrics');
    });

    it('should exclude exchanges without metrics from response time average', () => {
      const exchanges = [EXCHANGE_WITH_METRICS, EXCHANGE_NO_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.avgResponseTimeMs, 2300,
        'Average must only consider exchanges with metrics data');
    });

    it('should return 0 avg response time for no metrics', () => {
      const exchanges = [EXCHANGE_NO_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.avgResponseTimeMs, 0,
        'No metrics data means 0 average response time');
    });

    it('should calculate outcome distribution', () => {
      const exchanges = [
        EXCHANGE_WITH_METRICS,        // applied
        SECOND_EXCHANGE_WITH_METRICS, // deferred
        THIRD_EXCHANGE_WITH_METRICS,  // applied
        EXCHANGE_REJECTED,            // rejected
        EXCHANGE_PENDING,             // pending (no outcome)
      ];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.outcomeDistribution['applied'], 2,
        'Must count applied outcomes');
      assert.strictEqual(metrics.outcomeDistribution['deferred'], 1,
        'Must count deferred outcomes');
      assert.strictEqual(metrics.outcomeDistribution['rejected'], 1,
        'Must count rejected outcomes');
      assert.strictEqual(metrics.outcomeDistribution['pending'], 1,
        'Must count exchanges with no outcome as pending');
    });

    it('should include all outcome types even when count is zero', () => {
      const exchanges = [EXCHANGE_WITH_METRICS]; // only applied
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.outcomeDistribution['applied'], 1);
      assert.strictEqual(metrics.outcomeDistribution['deferred'], 0,
        'Must include deferred even when zero');
      assert.strictEqual(metrics.outcomeDistribution['rejected'], 0,
        'Must include rejected even when zero');
      assert.strictEqual(metrics.outcomeDistribution['pending'], 0,
        'Must include pending even when zero');
    });

    it('should handle all-pending exchanges', () => {
      const exchanges = [EXCHANGE_PENDING, EXCHANGE_NO_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.outcomeDistribution['pending'], 2);
      assert.strictEqual(metrics.outcomeDistribution['applied'], 0);
    });

    it('should calculate metrics across three exchanges correctly', () => {
      const exchanges = [
        EXCHANGE_WITH_METRICS,
        SECOND_EXCHANGE_WITH_METRICS,
        THIRD_EXCHANGE_WITH_METRICS,
      ];
      const metrics = aggregateMetrics(exchanges);

      assert.strictEqual(metrics.consultationCount, 3);
      assert.strictEqual(metrics.totalInputTokens, 530,
        'Must sum: 150 + 200 + 180');
      assert.strictEqual(metrics.totalOutputTokens, 300,
        'Must sum: 85 + 120 + 95');
      assert.strictEqual(metrics.totalTokens, 830);
      // (2300 + 3100 + 1800) / 3 = 2400
      assert.strictEqual(metrics.avgResponseTimeMs, 2400);
    });
  });

  // =============================================================================
  // AC3: Metrics written to dialogue file summary section
  // =============================================================================

  describe('AC3: Metrics formatted for dialogue summary', () => {

    it('should format consultation token totals', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 3,
        totalInputTokens: 530,
        totalOutputTokens: 300,
        totalTokens: 830,
        avgResponseTimeMs: 2400,
        outcomeDistribution: { applied: 2, deferred: 1, rejected: 0, pending: 0 },
        overheadPercent: null,
      };

      const lines = formatMetricsSummary(metrics);
      const text = lines.join('\n');

      assert.ok(text.includes('830'),
        'Must include total token count');
      assert.ok(text.includes('530') || text.includes('input'),
        'Must include input token breakdown');
      assert.ok(text.includes('300') || text.includes('output'),
        'Must include output token breakdown');
    });

    it('should format average response time', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 2,
        totalInputTokens: 350,
        totalOutputTokens: 205,
        totalTokens: 555,
        avgResponseTimeMs: 2700,
        outcomeDistribution: { applied: 1, deferred: 1, rejected: 0, pending: 0 },
        overheadPercent: null,
      };

      const lines = formatMetricsSummary(metrics);
      const text = lines.join('\n');

      assert.ok(text.includes('2700') || text.includes('2,700'),
        'Must include average response time in ms');
    });

    it('should format outcome distribution', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 5,
        totalInputTokens: 760,
        totalOutputTokens: 420,
        totalTokens: 1180,
        avgResponseTimeMs: 1920,
        outcomeDistribution: { applied: 2, deferred: 1, rejected: 1, pending: 1 },
        overheadPercent: 15.0,
      };

      const lines = formatMetricsSummary(metrics);
      const text = lines.join('\n');

      assert.ok(text.includes('applied'),
        'Must include applied in distribution');
      assert.ok(text.includes('deferred'),
        'Must include deferred in distribution');
      assert.ok(text.includes('rejected'),
        'Must include rejected in distribution');
    });

    it('should format overhead percentage when present', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 3,
        totalInputTokens: 530,
        totalOutputTokens: 300,
        totalTokens: 830,
        avgResponseTimeMs: 2400,
        outcomeDistribution: { applied: 2, deferred: 1, rejected: 0, pending: 0 },
        overheadPercent: 12.5,
      };

      const lines = formatMetricsSummary(metrics);
      const text = lines.join('\n');

      assert.ok(text.includes('12.5%') || text.includes('12.5'),
        'Must include overhead percentage');
    });

    it('should handle null overhead percentage gracefully', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 1,
        totalInputTokens: 150,
        totalOutputTokens: 85,
        totalTokens: 235,
        avgResponseTimeMs: 2300,
        outcomeDistribution: { applied: 1, deferred: 0, rejected: 0, pending: 0 },
        overheadPercent: null,
      };

      const lines = formatMetricsSummary(metrics);
      const text = lines.join('\n');

      // Should either show "N/A" or omit the overhead line — not crash
      assert.ok(typeof text === 'string',
        'Must format without crashing on null overhead');
      assert.ok(!text.includes('null'),
        'Must not display literal "null" in summary');
    });

    it('should return an array of markdown bullet lines', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 2,
        totalInputTokens: 350,
        totalOutputTokens: 205,
        totalTokens: 555,
        avgResponseTimeMs: 2700,
        outcomeDistribution: { applied: 1, deferred: 1, rejected: 0, pending: 0 },
        overheadPercent: 10.0,
      };

      const lines = formatMetricsSummary(metrics);

      assert.ok(Array.isArray(lines), 'Must return an array');
      assert.ok(lines.length > 0, 'Must return at least one line');
      for (const line of lines) {
        assert.ok(line.startsWith('- '),
          `Each line must be a markdown bullet: "${line}"`);
      }
    });

    it('should include consultation count in summary', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 4,
        totalInputTokens: 600,
        totalOutputTokens: 400,
        totalTokens: 1000,
        avgResponseTimeMs: 2000,
        outcomeDistribution: { applied: 2, deferred: 1, rejected: 0, pending: 1 },
        overheadPercent: null,
      };

      const lines = formatMetricsSummary(metrics);
      const text = lines.join('\n');

      assert.ok(text.includes('4'),
        'Must include consultation count');
    });
  });

  // =============================================================================
  // AC3 (continued): Parse metrics back from summary
  // =============================================================================

  describe('AC3: Parse metrics from summary', () => {

    it('should round-trip metrics through format and parse', () => {
      const original: TandemMetricsSummary = {
        consultationCount: 3,
        totalInputTokens: 530,
        totalOutputTokens: 300,
        totalTokens: 830,
        avgResponseTimeMs: 2400,
        outcomeDistribution: { applied: 2, deferred: 1, rejected: 0, pending: 0 },
        overheadPercent: 12.5,
      };

      const formatted = formatMetricsSummary(original);
      const parsed = parseMetricsFromSummary(formatted.join('\n'));

      assert.ok(parsed, 'Must parse formatted metrics');
      assert.strictEqual(parsed!.consultationCount, 3);
      assert.strictEqual(parsed!.totalTokens, 830);
      assert.strictEqual(parsed!.avgResponseTimeMs, 2400);
    });

    it('should return null for summary without metrics', () => {
      const plainSummary = `- **Total exchanges:** 2
- **Key decisions:** None
- **Time in tandem:** 15m`;

      const parsed = parseMetricsFromSummary(plainSummary);

      assert.strictEqual(parsed, null,
        'Must return null when no metrics fields are present');
    });
  });

  // =============================================================================
  // AC4: Session summary includes tandem overhead percentage
  // =============================================================================

  describe('AC4: Overhead percentage calculation', () => {

    it('should calculate overhead as percentage of baseline', () => {
      // 830 tandem tokens, 10000 baseline = 8.3%
      const result = calculateOverheadPercent(830, 10000);

      assert.strictEqual(result, 8.3,
        'Must calculate: (830 / 10000) * 100 = 8.3');
    });

    it('should return null when baseline is zero', () => {
      const result = calculateOverheadPercent(500, 0);

      assert.strictEqual(result, null,
        'Must return null for zero baseline (cannot divide by zero)');
    });

    it('should handle zero tandem tokens', () => {
      const result = calculateOverheadPercent(0, 10000);

      assert.strictEqual(result, 0,
        'Zero tandem tokens means 0% overhead');
    });

    it('should round to one decimal place', () => {
      // 333 / 10000 = 3.33 → 3.3
      const result = calculateOverheadPercent(333, 10000);

      assert.strictEqual(result, 3.3,
        'Must round to one decimal place');
    });

    it('should handle large overhead values', () => {
      // 5000 / 10000 = 50%
      const result = calculateOverheadPercent(5000, 10000);

      assert.strictEqual(result, 50.0,
        'Must handle overhead > 25% target');
    });

    it('should handle very small overhead values', () => {
      // 1 / 100000 = 0.001 → 0.0
      const result = calculateOverheadPercent(1, 100000);

      assert.strictEqual(result, 0.0,
        'Must handle very small percentages');
    });

    it('should include overhead in aggregated metrics when baseline provided', () => {
      const exchanges = [EXCHANGE_WITH_METRICS, SECOND_EXCHANGE_WITH_METRICS];
      const metrics = aggregateMetrics(exchanges);

      // totalTokens = 555, test with baseline of 5000
      const overhead = calculateOverheadPercent(metrics.totalTokens, 5000);

      assert.strictEqual(overhead, 11.1,
        'Must calculate: (555 / 5000) * 100 = 11.1');
    });
  });

  // =============================================================================
  // AC5: Target: consultation overhead < 25% of baseline story token cost
  // =============================================================================

  describe('AC5: Budget threshold validation', () => {

    it('should pass when overhead is below 25% threshold', () => {
      const result = isWithinBudget(12.5);

      assert.strictEqual(result, true,
        '12.5% is below 25% threshold');
    });

    it('should fail when overhead exceeds 25% threshold', () => {
      const result = isWithinBudget(30.0);

      assert.strictEqual(result, false,
        '30% exceeds 25% threshold');
    });

    it('should fail when overhead exactly equals 25%', () => {
      const result = isWithinBudget(25.0);

      assert.strictEqual(result, false,
        '25% is not strictly less than 25% — must be under');
    });

    it('should pass when overhead is zero', () => {
      const result = isWithinBudget(0);

      assert.strictEqual(result, true,
        '0% overhead is within any threshold');
    });

    it('should pass when overhead is null (no baseline available)', () => {
      const result = isWithinBudget(null);

      assert.strictEqual(result, true,
        'Null overhead (no baseline) should not block — pass by default');
    });

    it('should use custom threshold when provided', () => {
      assert.strictEqual(isWithinBudget(15.0, 10), false,
        '15% exceeds custom 10% threshold');
      assert.strictEqual(isWithinBudget(8.0, 10), true,
        '8% is within custom 10% threshold');
    });

    it('should default to 25% when no threshold specified', () => {
      assert.strictEqual(isWithinBudget(24.9), true,
        '24.9% is just under default 25%');
      assert.strictEqual(isWithinBudget(25.1), false,
        '25.1% is over default 25%');
    });
  });

  // =============================================================================
  // Result format compliance (framework pattern)
  // =============================================================================

  describe('Result format compliance', () => {

    it('should return TandemMetricsSummary with all required fields', () => {
      const exchanges = [EXCHANGE_WITH_METRICS];
      const metrics = aggregateMetrics(exchanges);

      assert.ok('consultationCount' in metrics, 'Must have consultationCount');
      assert.ok('totalInputTokens' in metrics, 'Must have totalInputTokens');
      assert.ok('totalOutputTokens' in metrics, 'Must have totalOutputTokens');
      assert.ok('totalTokens' in metrics, 'Must have totalTokens');
      assert.ok('avgResponseTimeMs' in metrics, 'Must have avgResponseTimeMs');
      assert.ok('outcomeDistribution' in metrics, 'Must have outcomeDistribution');
      assert.ok('overheadPercent' in metrics, 'Must have overheadPercent');
    });

    it('should return formatMetricsSummary as string array', () => {
      const metrics: TandemMetricsSummary = {
        consultationCount: 1,
        totalInputTokens: 150,
        totalOutputTokens: 85,
        totalTokens: 235,
        avgResponseTimeMs: 2300,
        outcomeDistribution: { applied: 1, deferred: 0, rejected: 0, pending: 0 },
        overheadPercent: 5.0,
      };

      const result = formatMetricsSummary(metrics);

      assert.ok(Array.isArray(result), 'Must return array');
      for (const line of result) {
        assert.strictEqual(typeof line, 'string', 'Each element must be a string');
      }
    });
  });
});
