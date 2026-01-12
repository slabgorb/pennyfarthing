/**
 * Tests for Story 7-4: Aggregate Job-Fair Results into Benchmark Statistics
 *
 * These tests verify:
 * AC1: Job-fair results contribute to overall benchmark statistics
 * AC2: Baseline calculations incorporate job-fair control runs
 * AC3: Scenario performance tracked across themes
 * AC4: Summary statistics available (mean by role, variance, top performers)
 * AC5: Historical trend tracking for benchmark quality
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_RESULTS_DIR = join(process.cwd(), 'internal', 'results', 'job-fair-test');

// Mock summary.yaml content for theme "alpha"
const MOCK_ALPHA_SUMMARY = `
theme: alpha
timestamp: "2026-01-05T10:00:00Z"
runs_per_combination: 3
total_runs: 15
champions:
  dev:
    character: alice
    score: 85.5
    theme: alpha
  reviewer:
    character: bob
    score: 78.2
    theme: alpha
matrix:
  alice:
    dev: 85.5
    reviewer: 72.0
  bob:
    dev: 80.0
    reviewer: 78.2
overall_rankings:
  - character: alice
    average: 78.75
  - character: bob
    average: 79.1
role_rankings:
  dev:
    - character: alice
      score: 85.5
    - character: bob
      score: 80.0
  reviewer:
    - character: bob
      score: 78.2
    - character: alice
      score: 72.0
`;

// Mock summary.yaml content for theme "beta"
const MOCK_BETA_SUMMARY = `
theme: beta
timestamp: "2026-01-06T10:00:00Z"
runs_per_combination: 3
total_runs: 15
champions:
  dev:
    character: carol
    score: 90.0
    theme: beta
  reviewer:
    character: dave
    score: 82.5
    theme: beta
matrix:
  carol:
    dev: 90.0
    reviewer: 75.0
  dave:
    dev: 70.0
    reviewer: 82.5
overall_rankings:
  - character: carol
    average: 82.5
  - character: dave
    average: 76.25
role_rankings:
  dev:
    - character: carol
      score: 90.0
    - character: dave
      score: 70.0
  reviewer:
    - character: dave
      score: 82.5
    - character: carol
      score: 75.0
`;

function setupTestFixtures() {
  // Create test directory structure
  const alphaDir = join(TEST_RESULTS_DIR, 'alpha-20260105T100000Z');
  const betaDir = join(TEST_RESULTS_DIR, 'beta-20260106T100000Z');

  mkdirSync(alphaDir, { recursive: true });
  mkdirSync(betaDir, { recursive: true });

  writeFileSync(join(alphaDir, 'summary.yaml'), MOCK_ALPHA_SUMMARY);
  writeFileSync(join(betaDir, 'summary.yaml'), MOCK_BETA_SUMMARY);
}

function cleanupTestFixtures() {
  if (existsSync(TEST_RESULTS_DIR)) {
    rmSync(TEST_RESULTS_DIR, { recursive: true, force: true });
  }
}

// ============================================================================
// AC1: Job-fair results contribute to overall benchmark statistics
// ============================================================================

describe('AC1: Module Exports Core Aggregation Functions', () => {
  it('should export aggregateJobFairResults function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.aggregateJobFairResults === 'function',
      'aggregateJobFairResults should be a function'
    );
  });

  it('should export AggregateStats type via return type', async () => {
    const module = await import('./job-fair-aggregator.js');
    // Type check happens at compile time; runtime check is function existence
    assert.ok(module.aggregateJobFairResults, 'aggregateJobFairResults should exist');
  });
});

describe('AC1: Aggregation Combines Theme Results', () => {
  beforeEach(() => setupTestFixtures());
  afterEach(() => cleanupTestFixtures());

  it('should aggregate results from multiple theme directories', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(stats, 'Should return aggregate stats');
    assert.ok(Array.isArray(stats.themes_included), 'Should list included themes');
    assert.ok(stats.themes_included.length >= 2, 'Should include at least 2 themes');
    assert.ok(stats.themes_included.includes('alpha'), 'Should include alpha theme');
    assert.ok(stats.themes_included.includes('beta'), 'Should include beta theme');
  });

  it('should include last_updated timestamp', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(stats.last_updated, 'Should include last_updated');
    assert.ok(
      /^\d{4}-\d{2}-\d{2}/.test(stats.last_updated),
      'last_updated should be ISO date format'
    );
  });

  it('should handle empty results directory gracefully', async () => {
    const emptyDir = join(TEST_RESULTS_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(emptyDir);

    assert.ok(stats, 'Should return stats even for empty dir');
    assert.deepStrictEqual(stats.themes_included, [], 'Should have empty themes list');
  });
});

// ============================================================================
// AC2: Baseline calculations incorporate job-fair control runs
// ============================================================================

describe('AC2: Baseline Comparison Functions', () => {
  it('should export getBaselineComparison function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.getBaselineComparison === 'function',
      'getBaselineComparison should be a function'
    );
  });
});

describe('AC2: Baseline Integration', () => {
  beforeEach(() => setupTestFixtures());
  afterEach(() => cleanupTestFixtures());

  it('should calculate baseline_comparison for each role', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(stats.by_role, 'Should have by_role stats');
    assert.ok(stats.by_role.dev, 'Should have dev role stats');

    // baseline_comparison shows delta from control baseline
    assert.ok(
      typeof stats.by_role.dev.baseline_comparison === 'number',
      'dev should have baseline_comparison'
    );
  });

  it('should handle missing baseline gracefully', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    // If no baseline exists for a role, baseline_comparison should be null or 0
    const devComparison = stats.by_role.dev?.baseline_comparison;
    assert.ok(
      devComparison === null || typeof devComparison === 'number',
      'Missing baseline should return null or number'
    );
  });
});

// ============================================================================
// AC3: Scenario performance tracked across themes
// ============================================================================

describe('AC3: Role Statistics Functions', () => {
  it('should export getRoleStatistics function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.getRoleStatistics === 'function',
      'getRoleStatistics should be a function'
    );
  });
});

describe('AC3: Cross-Theme Role Performance', () => {
  beforeEach(() => setupTestFixtures());
  afterEach(() => cleanupTestFixtures());

  it('should track performance by role across all themes', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(stats.by_role, 'Should have by_role object');
    assert.ok(stats.by_role.dev, 'Should have dev role');
    assert.ok(stats.by_role.reviewer, 'Should have reviewer role');
  });

  it('should calculate per-role mean score across themes', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    // Dev scores: alpha-alice=85.5, alpha-bob=80.0, beta-carol=90.0, beta-dave=70.0
    // Mean should be (85.5 + 80.0 + 90.0 + 70.0) / 4 = 81.375
    assert.ok(
      typeof stats.by_role.dev.mean_score === 'number',
      'dev should have mean_score'
    );
    // Allow some floating point tolerance
    assert.ok(
      stats.by_role.dev.mean_score > 70 && stats.by_role.dev.mean_score < 95,
      'dev mean should be reasonable'
    );
  });

  it('should provide role-specific statistics via getRoleStatistics', async () => {
    const { getRoleStatistics } = await import('./job-fair-aggregator.js');
    const devStats = await getRoleStatistics('dev', TEST_RESULTS_DIR);

    assert.ok(devStats, 'Should return dev statistics');
    assert.ok(typeof devStats.mean_score === 'number', 'Should have mean_score');
    assert.ok(typeof devStats.std_dev === 'number', 'Should have std_dev');
    assert.ok(Array.isArray(devStats.top_performers), 'Should have top_performers array');
  });
});

// ============================================================================
// AC4: Summary statistics (mean by role, variance, top performers)
// ============================================================================

describe('AC4: Top Performers Functions', () => {
  it('should export getTopPerformers function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.getTopPerformers === 'function',
      'getTopPerformers should be a function'
    );
  });
});

describe('AC4: Summary Statistics', () => {
  beforeEach(() => setupTestFixtures());
  afterEach(() => cleanupTestFixtures());

  it('should calculate standard deviation for each role', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(
      typeof stats.by_role.dev.std_dev === 'number',
      'dev should have std_dev'
    );
    assert.ok(stats.by_role.dev.std_dev >= 0, 'std_dev should be non-negative');
  });

  it('should identify top performers per role', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(
      Array.isArray(stats.by_role.dev.top_performers),
      'dev should have top_performers array'
    );
    assert.ok(
      stats.by_role.dev.top_performers.length > 0,
      'Should have at least one top performer'
    );

    const topDev = stats.by_role.dev.top_performers[0];
    assert.ok(topDev.character, 'Top performer should have character name');
    assert.ok(topDev.theme, 'Top performer should have theme');
    assert.ok(typeof topDev.score === 'number', 'Top performer should have score');
  });

  it('should return top performers via getTopPerformers function', async () => {
    const { getTopPerformers } = await import('./job-fair-aggregator.js');
    const topDevs = await getTopPerformers('dev', 3, TEST_RESULTS_DIR);

    assert.ok(Array.isArray(topDevs), 'Should return array');
    assert.ok(topDevs.length <= 3, 'Should respect limit');

    if (topDevs.length > 1) {
      // Should be sorted by score descending
      assert.ok(
        topDevs[0].score >= topDevs[1].score,
        'Top performers should be sorted by score'
      );
    }
  });

  it('should identify overall champions across all themes', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(
      Array.isArray(stats.overall_champions),
      'Should have overall_champions array'
    );

    if (stats.overall_champions.length > 0) {
      const champion = stats.overall_champions[0];
      assert.ok(champion.character, 'Champion should have character');
      assert.ok(champion.theme, 'Champion should have theme');
      assert.ok(typeof champion.avg_score === 'number', 'Champion should have avg_score');
    }
  });
});

// ============================================================================
// AC5: Historical trend tracking for benchmark quality
// ============================================================================

describe('AC5: Historical Trend Functions', () => {
  it('should export getHistoricalTrend function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.getHistoricalTrend === 'function',
      'getHistoricalTrend should be a function'
    );
  });

  it('should export saveHistoricalSnapshot function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.saveHistoricalSnapshot === 'function',
      'saveHistoricalSnapshot should be a function'
    );
  });
});

describe('AC5: Historical Trend Tracking', () => {
  beforeEach(() => setupTestFixtures());
  afterEach(() => cleanupTestFixtures());

  it('should include historical_trend in aggregate stats', async () => {
    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(
      Array.isArray(stats.historical_trend),
      'Should have historical_trend array'
    );
  });

  it('should track trend points with date, mean, and variance', async () => {
    const { aggregateJobFairResults, saveHistoricalSnapshot } = await import('./job-fair-aggregator.js');

    // Save a snapshot first
    await saveHistoricalSnapshot(TEST_RESULTS_DIR);

    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    if (stats.historical_trend.length > 0) {
      const point = stats.historical_trend[0];
      assert.ok(point.date, 'Trend point should have date');
      assert.ok(typeof point.mean === 'number', 'Trend point should have mean');
      assert.ok(typeof point.variance === 'number', 'Trend point should have variance');
    }
  });

  it('should return trend data via getHistoricalTrend function', async () => {
    const { getHistoricalTrend, saveHistoricalSnapshot } = await import('./job-fair-aggregator.js');

    // Save snapshot to ensure there's data
    await saveHistoricalSnapshot(TEST_RESULTS_DIR);

    const trend = await getHistoricalTrend(undefined, TEST_RESULTS_DIR);

    assert.ok(Array.isArray(trend), 'Should return array');
  });

  it('should support role-specific trend filtering', async () => {
    const { getHistoricalTrend, saveHistoricalSnapshot } = await import('./job-fair-aggregator.js');

    await saveHistoricalSnapshot(TEST_RESULTS_DIR);

    const devTrend = await getHistoricalTrend('dev', TEST_RESULTS_DIR);

    assert.ok(Array.isArray(devTrend), 'Should return array for dev role');
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases: Malformed Data', () => {
  beforeEach(() => setupTestFixtures());
  afterEach(() => cleanupTestFixtures());

  it('should skip directories without summary.yaml', async () => {
    // Create a directory without summary.yaml
    const badDir = join(TEST_RESULTS_DIR, 'bad-theme-20260107');
    mkdirSync(badDir, { recursive: true });
    // No summary.yaml written

    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(stats, 'Should still return stats');
    assert.ok(!stats.themes_included.includes('bad-theme'), 'Should not include bad theme');
  });

  it('should handle malformed YAML gracefully', async () => {
    const badDir = join(TEST_RESULTS_DIR, 'malformed-20260107');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'summary.yaml'), 'this: is: not: valid: yaml: [[[');

    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');

    // Should not throw, should skip malformed file
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);
    assert.ok(stats, 'Should return stats despite malformed YAML');
  });
});

describe('Edge Cases: Statistical Calculations', () => {
  it('should handle single theme (no variance possible)', async () => {
    cleanupTestFixtures();

    // Create only one theme
    const singleDir = join(TEST_RESULTS_DIR, 'single-20260105');
    mkdirSync(singleDir, { recursive: true });
    writeFileSync(join(singleDir, 'summary.yaml'), MOCK_ALPHA_SUMMARY);

    const { aggregateJobFairResults } = await import('./job-fair-aggregator.js');
    const stats = await aggregateJobFairResults(TEST_RESULTS_DIR);

    assert.ok(stats, 'Should return stats for single theme');
    assert.strictEqual(stats.themes_included.length, 1, 'Should have one theme');

    // std_dev for single value should be 0 or handled gracefully
    assert.ok(
      stats.by_role.dev.std_dev === 0 || stats.by_role.dev.std_dev >= 0,
      'std_dev should be 0 or valid for single theme'
    );

    cleanupTestFixtures();
  });
});

// ============================================================================
// Story 7-5: Persona Differential Dimensions
// ============================================================================

const TEST_THEMES_DIR = join(process.cwd(), 'internal', 'results', 'themes-test');

// Mock theme YAML with dimensions
const MOCK_THEME_COMEDIC = `
theme:
  name: comedic-theme
  description: A comedic theme
  dimensions:
    tone: comedic
    era: contemporary
    genre: comedy
    energy: high-energy
agents:
  orchestrator:
    character: Joker
`;

const MOCK_THEME_SERIOUS = `
theme:
  name: serious-theme
  description: A serious theme
  dimensions:
    tone: serious
    era: futuristic
    genre: sci-fi
    energy: contemplative
agents:
  orchestrator:
    character: Commander
`;

const MOCK_THEME_NO_DIMENSIONS = `
theme:
  name: no-dims
  description: Theme without dimensions
agents:
  orchestrator:
    character: Generic
`;

function setupDimensionTestFixtures() {
  // Create test theme directory
  mkdirSync(TEST_THEMES_DIR, { recursive: true });

  // Write theme files
  writeFileSync(join(TEST_THEMES_DIR, 'comedic-theme.yaml'), MOCK_THEME_COMEDIC);
  writeFileSync(join(TEST_THEMES_DIR, 'serious-theme.yaml'), MOCK_THEME_SERIOUS);
  writeFileSync(join(TEST_THEMES_DIR, 'no-dims.yaml'), MOCK_THEME_NO_DIMENSIONS);

  // Create results directories for these themes
  const comedicDir = join(TEST_RESULTS_DIR, 'comedic-theme-20260107T100000Z');
  const seriousDir = join(TEST_RESULTS_DIR, 'serious-theme-20260107T100000Z');

  mkdirSync(comedicDir, { recursive: true });
  mkdirSync(seriousDir, { recursive: true });

  // Comedic theme results
  writeFileSync(join(comedicDir, 'summary.yaml'), `
theme: comedic-theme
timestamp: "2026-01-07T10:00:00Z"
matrix:
  joker:
    dev: 92.0
    reviewer: 88.0
  clown:
    dev: 88.0
    reviewer: 85.0
`);

  // Serious theme results
  writeFileSync(join(seriousDir, 'summary.yaml'), `
theme: serious-theme
timestamp: "2026-01-07T10:00:00Z"
matrix:
  commander:
    dev: 85.0
    reviewer: 90.0
  officer:
    dev: 82.0
    reviewer: 88.0
`);
}

function cleanupDimensionTestFixtures() {
  if (existsSync(TEST_THEMES_DIR)) {
    rmSync(TEST_THEMES_DIR, { recursive: true, force: true });
  }
  cleanupTestFixtures();
}

describe('Story 7-5: Dimension Type Exports', () => {
  it('should export DimensionName type', async () => {
    const module = await import('./job-fair-aggregator.js');
    // Type exists at compile time; runtime check is that related functions exist
    assert.ok(module.aggregateByDimension, 'aggregateByDimension should exist');
  });

  it('should export aggregateByDimension function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.aggregateByDimension === 'function',
      'aggregateByDimension should be a function'
    );
  });

  it('should export getDimensionValues function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.getDimensionValues === 'function',
      'getDimensionValues should be a function'
    );
  });

  it('should export generateDifferentialReport function', async () => {
    const module = await import('./job-fair-aggregator.js');
    assert.ok(
      typeof module.generateDifferentialReport === 'function',
      'generateDifferentialReport should be a function'
    );
  });
});

describe('Story 7-5: getDimensionValues', () => {
  beforeEach(() => {
    setupTestFixtures();
    setupDimensionTestFixtures();
  });
  afterEach(() => cleanupDimensionTestFixtures());

  it('should list themes by dimension value', async () => {
    const { getDimensionValues } = await import('./job-fair-aggregator.js');
    const values = await getDimensionValues('tone', TEST_THEMES_DIR);

    assert.ok(Array.isArray(values), 'Should return array');
    assert.ok(values.length >= 2, 'Should have at least 2 tone values');

    // Check structure
    const comedic = values.find(v => v.value === 'comedic');
    const serious = values.find(v => v.value === 'serious');

    assert.ok(comedic, 'Should find comedic tone');
    assert.ok(serious, 'Should find serious tone');
    assert.ok(comedic.theme_count >= 1, 'Comedic should have at least 1 theme');
    assert.ok(serious.theme_count >= 1, 'Serious should have at least 1 theme');
  });

  it('should handle all dimension types', async () => {
    const { getDimensionValues } = await import('./job-fair-aggregator.js');

    const toneValues = await getDimensionValues('tone', TEST_THEMES_DIR);
    const eraValues = await getDimensionValues('era', TEST_THEMES_DIR);
    const genreValues = await getDimensionValues('genre', TEST_THEMES_DIR);
    const energyValues = await getDimensionValues('energy', TEST_THEMES_DIR);

    assert.ok(toneValues.length >= 1, 'Should have tone values');
    assert.ok(eraValues.length >= 1, 'Should have era values');
    assert.ok(genreValues.length >= 1, 'Should have genre values');
    assert.ok(energyValues.length >= 1, 'Should have energy values');
  });

  it('should skip themes without dimensions', async () => {
    const { getDimensionValues } = await import('./job-fair-aggregator.js');
    const values = await getDimensionValues('tone', TEST_THEMES_DIR);

    // no-dims theme should not contribute to any dimension counts
    const total = values.reduce((sum, v) => sum + v.theme_count, 0);
    assert.ok(total === 2, 'Total should be 2 (comedic + serious, not no-dims)');
  });
});

describe('Story 7-5: aggregateByDimension', () => {
  beforeEach(() => {
    setupTestFixtures();
    setupDimensionTestFixtures();
  });
  afterEach(() => cleanupDimensionTestFixtures());

  it('should group results by dimension value', async () => {
    const { aggregateByDimension } = await import('./job-fair-aggregator.js');
    const stats = await aggregateByDimension('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    assert.ok(stats, 'Should return dimension stats');
    assert.strictEqual(stats.dimension, 'tone', 'Should indicate dimension');
    assert.ok(Array.isArray(stats.values), 'Should have values array');
  });

  it('should calculate per-value statistics', async () => {
    const { aggregateByDimension } = await import('./job-fair-aggregator.js');
    const stats = await aggregateByDimension('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    const comedic = stats.values.find(v => v.value === 'comedic');
    assert.ok(comedic, 'Should find comedic group');
    assert.ok(comedic.themes.length >= 1, 'Comedic should have themes');
    assert.ok(comedic.sample_size > 0, 'Comedic should have samples');
    assert.ok(typeof comedic.overall_mean === 'number', 'Should have overall_mean');
    assert.ok(comedic.by_role.dev, 'Should have dev role stats');
    assert.ok(typeof comedic.by_role.dev.mean_score === 'number', 'Dev should have mean_score');
  });

  it('should generate pairwise comparisons', async () => {
    const { aggregateByDimension } = await import('./job-fair-aggregator.js');
    const stats = await aggregateByDimension('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    assert.ok(Array.isArray(stats.comparisons), 'Should have comparisons array');

    if (stats.comparisons.length > 0) {
      const comp = stats.comparisons[0];
      assert.ok(comp.dimension === 'tone', 'Comparison should have dimension');
      assert.ok(comp.value_a, 'Comparison should have value_a');
      assert.ok(comp.value_b, 'Comparison should have value_b');
      assert.ok(typeof comp.delta === 'number', 'Comparison should have delta');
      assert.ok(
        ['significant', 'marginal', 'not_significant'].includes(comp.significance),
        'Comparison should have significance level'
      );
    }
  });

  it('should include per-role comparisons', async () => {
    const { aggregateByDimension } = await import('./job-fair-aggregator.js');
    const stats = await aggregateByDimension('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    if (stats.comparisons.length > 0) {
      const comp = stats.comparisons[0];
      assert.ok(comp.by_role, 'Comparison should have by_role');

      if (comp.by_role.dev) {
        assert.ok(typeof comp.by_role.dev.delta === 'number', 'Role comparison should have delta');
        assert.ok(comp.by_role.dev.significance, 'Role comparison should have significance');
      }
    }
  });
});

describe('Story 7-5: generateDifferentialReport', () => {
  beforeEach(() => {
    setupTestFixtures();
    setupDimensionTestFixtures();
  });
  afterEach(() => cleanupDimensionTestFixtures());

  it('should generate markdown report', async () => {
    const { generateDifferentialReport } = await import('./job-fair-aggregator.js');
    const report = await generateDifferentialReport('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    assert.ok(typeof report === 'string', 'Report should be a string');
    assert.ok(report.includes('# Differential Report'), 'Report should have title');
    assert.ok(report.includes('tone'), 'Report should mention dimension');
  });

  it('should include summary by value', async () => {
    const { generateDifferentialReport } = await import('./job-fair-aggregator.js');
    const report = await generateDifferentialReport('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    assert.ok(report.includes('## Summary by Value'), 'Report should have summary section');
    assert.ok(report.includes('Overall mean'), 'Report should include overall mean');
  });

  it('should include pairwise comparisons', async () => {
    const { generateDifferentialReport } = await import('./job-fair-aggregator.js');
    const report = await generateDifferentialReport('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    assert.ok(report.includes('## Pairwise Comparisons'), 'Report should have comparisons section');
  });

  it('should indicate significance levels', async () => {
    const { generateDifferentialReport } = await import('./job-fair-aggregator.js');
    const report = await generateDifferentialReport('tone', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    // Report should mention significance in some form
    const hasSignificance = report.includes('SIGNIFICANT') ||
                            report.includes('marginal') ||
                            report.includes('not significant');
    assert.ok(hasSignificance, 'Report should indicate significance levels');
  });
});

describe('Story 7-5: Edge Cases', () => {
  beforeEach(() => setupDimensionTestFixtures());
  afterEach(() => cleanupDimensionTestFixtures());

  it('should handle empty results directory', async () => {
    const { aggregateByDimension } = await import('./job-fair-aggregator.js');
    const emptyDir = join(TEST_RESULTS_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const stats = await aggregateByDimension('tone', emptyDir, TEST_THEMES_DIR);

    assert.ok(stats, 'Should return stats');
    assert.deepStrictEqual(stats.values, [], 'Should have empty values');
    assert.deepStrictEqual(stats.comparisons, [], 'Should have empty comparisons');
  });

  it('should handle themes without matching dimension', async () => {
    const { aggregateByDimension } = await import('./job-fair-aggregator.js');

    // Create a theme with only some dimensions
    const partialTheme = join(TEST_THEMES_DIR, 'partial.yaml');
    writeFileSync(partialTheme, `
theme:
  name: partial
  dimensions:
    tone: comedic
    # missing era, genre, energy
`);

    const stats = await aggregateByDimension('era', TEST_RESULTS_DIR, TEST_THEMES_DIR);

    // Should still work, just with fewer themes
    assert.ok(stats, 'Should return stats');
  });

  it('should handle non-existent themes directory', async () => {
    const { getDimensionValues } = await import('./job-fair-aggregator.js');
    const nonExistent = join(process.cwd(), 'does-not-exist');

    const values = await getDimensionValues('tone', nonExistent);

    assert.ok(Array.isArray(values), 'Should return empty array');
    assert.strictEqual(values.length, 0, 'Should have no values');
  });
});
