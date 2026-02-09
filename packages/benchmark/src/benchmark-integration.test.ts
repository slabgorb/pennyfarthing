/**
 * Benchmark Integration Tests
 * Migrated to @pennyfarthing/benchmark (Story 93-1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  loadBenchmarkData,
  getBenchmarkWithFace,
  calculateOceanCorrelation,
  generateCorrelationReport,
  getOptimalProfile,
  getRoleRecommendations,
  findTopPerformers,
  queryBenchmarks,
  calculateErrorTypeCorrelation,
  generateOceanErrorHeatMap,
  generateBenchmarkReport,
} from './benchmark-integration.js';

describe('benchmark-integration', () => {
  it('should export all 11 functions', () => {
    assert.strictEqual(typeof loadBenchmarkData, 'function');
    assert.strictEqual(typeof getBenchmarkWithFace, 'function');
    assert.strictEqual(typeof calculateOceanCorrelation, 'function');
    assert.strictEqual(typeof generateCorrelationReport, 'function');
    assert.strictEqual(typeof getOptimalProfile, 'function');
    assert.strictEqual(typeof getRoleRecommendations, 'function');
    assert.strictEqual(typeof findTopPerformers, 'function');
    assert.strictEqual(typeof queryBenchmarks, 'function');
    assert.strictEqual(typeof calculateErrorTypeCorrelation, 'function');
    assert.strictEqual(typeof generateOceanErrorHeatMap, 'function');
    assert.strictEqual(typeof generateBenchmarkReport, 'function');
  });

  it('should return empty results for non-existent scenario', () => {
    const results = loadBenchmarkData('nonexistent-scenario', 'dev');
    assert.deepStrictEqual(results, []);
  });

  it('should return empty correlation for no data', () => {
    const correlation = calculateOceanCorrelation('nonexistent-scenario', 'dev');
    assert.strictEqual(correlation.strongest.effect, 0);
  });

  it('should calculate error type correlation with empty inputs', () => {
    const result = calculateErrorTypeCorrelation([], []);
    assert.ok(result.matrix);
    assert.strictEqual(result.strongest.correlation, 0);
  });

  it('should generate heat map from empty correlation', () => {
    const correlation = calculateErrorTypeCorrelation([], []);
    const heatMap = generateOceanErrorHeatMap(correlation);
    assert.ok(heatMap.includes('OCEAN'));
  });
});
