/**
 * Job-Fair Aggregator Tests
 * Migrated to @pennyfarthing/benchmark (Story 93-1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  aggregateJobFairResults,
  getBaselineComparison,
  getRoleStatistics,
  getTopPerformers,
  getHistoricalTrend,
  saveHistoricalSnapshot,
  aggregateByDimension,
  getDimensionValues,
  generateDifferentialReport,
} from './job-fair-aggregator.js';

describe('job-fair-aggregator', () => {
  it('should export all 9 functions', () => {
    assert.strictEqual(typeof aggregateJobFairResults, 'function');
    assert.strictEqual(typeof getBaselineComparison, 'function');
    assert.strictEqual(typeof getRoleStatistics, 'function');
    assert.strictEqual(typeof getTopPerformers, 'function');
    assert.strictEqual(typeof getHistoricalTrend, 'function');
    assert.strictEqual(typeof saveHistoricalSnapshot, 'function');
    assert.strictEqual(typeof aggregateByDimension, 'function');
    assert.strictEqual(typeof getDimensionValues, 'function');
    assert.strictEqual(typeof generateDifferentialReport, 'function');
  });

  it('should return empty stats for non-existent directory', async () => {
    const stats = await aggregateJobFairResults('/tmp/nonexistent-benchmark-dir');
    assert.deepStrictEqual(stats.themes_included, []);
    assert.deepStrictEqual(stats.by_role, {});
    assert.deepStrictEqual(stats.overall_champions, []);
  });

  it('should return null baseline for unknown role', async () => {
    const result = await getBaselineComparison('unknown-role', '/tmp/nonexistent-benchmark-dir');
    assert.strictEqual(result, null);
  });

  it('should return empty trend for non-existent directory', async () => {
    const trend = await getHistoricalTrend(undefined, '/tmp/nonexistent-benchmark-dir');
    assert.deepStrictEqual(trend, []);
  });
});
