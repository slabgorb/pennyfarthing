/**
 * Tests for Story 11-8: Integrate with Benchmark Output
 *
 * These tests verify:
 * AC1: Benchmark output includes character face visualization
 * AC2: Correlation report shows OCEAN dimensions vs task performance
 * AC3: Identifies optimal personality profiles for each role type
 * AC4: Supports "find characters good at X" queries
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// AC1: Module Exists and Exports Core Functions
// ============================================================================

describe('AC1: Benchmark Integration Module Exists', () => {
  it('should export loadBenchmarkData function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.loadBenchmarkData === 'function',
      'loadBenchmarkData should be a function'
    );
  });

  it('should export getBenchmarkWithFace function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.getBenchmarkWithFace === 'function',
      'getBenchmarkWithFace should be a function'
    );
  });

  it('should export generateBenchmarkReport function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.generateBenchmarkReport === 'function',
      'generateBenchmarkReport should be a function'
    );
  });
});

describe('AC1: Benchmark Output Includes Face Visualization', () => {
  it('should include face SVG path in benchmark result', async () => {
    const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
    const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');

    assert.ok(result !== null, 'Result should not be null');
    assert.ok(result!.face, 'Result should include face property');
    assert.ok(
      result!.face.includes('.svg') || result!.face.includes('data:image/svg'),
      'Face should be SVG path or data URL'
    );
  });

  it('should include character name from theme', async () => {
    const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
    const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');

    assert.ok(result !== null, 'Result should not be null');
    assert.ok(result!.character, 'Result should include character name');
    assert.ok(result!.character.length > 0, 'Character name should not be empty');
  });

  it('should include benchmark statistics', async () => {
    const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
    const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');

    assert.ok(result !== null, 'Result should not be null');
    assert.ok(typeof result!.mean === 'number', 'Result should include mean score');
    assert.ok(typeof result!.delta === 'number', 'Result should include delta vs baseline');
  });

  it('should include OCEAN scores alongside benchmark data', async () => {
    const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
    const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');

    assert.ok(result !== null, 'Result should not be null');
    assert.ok(result!.ocean, 'Result should include OCEAN scores');
    assert.ok(typeof result!.ocean.O === 'number', 'O should be a number');
    assert.ok(typeof result!.ocean.C === 'number', 'C should be a number');
    assert.ok(typeof result!.ocean.E === 'number', 'E should be a number');
    assert.ok(typeof result!.ocean.A === 'number', 'A should be a number');
    assert.ok(typeof result!.ocean.N === 'number', 'N should be a number');
  });
});

// ============================================================================
// AC2: Correlation Report Shows OCEAN vs Task Performance
// ============================================================================

describe('AC2: Correlation Analysis Module', () => {
  it('should export calculateOceanCorrelation function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.calculateOceanCorrelation === 'function',
      'calculateOceanCorrelation should be a function'
    );
  });

  it('should export generateCorrelationReport function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.generateCorrelationReport === 'function',
      'generateCorrelationReport should be a function'
    );
  });
});

describe('AC2: OCEAN vs Performance Correlation', () => {
  it('should calculate correlation for each OCEAN dimension', async () => {
    const { calculateOceanCorrelation } = await import('./benchmark-integration.js');
    const correlation = calculateOceanCorrelation('race-condition-cache', 'dev');

    assert.ok(correlation, 'Should return correlation object');
    assert.ok('O' in correlation, 'Should include Openness correlation');
    assert.ok('C' in correlation, 'Should include Conscientiousness correlation');
    assert.ok('E' in correlation, 'Should include Extraversion correlation');
    assert.ok('A' in correlation, 'Should include Agreeableness correlation');
    assert.ok('N' in correlation, 'Should include Neuroticism correlation');
  });

  it('should return correlation strength for each dimension', async () => {
    const { calculateOceanCorrelation } = await import('./benchmark-integration.js');
    const correlation = calculateOceanCorrelation('race-condition-cache', 'dev');

    // Each dimension should have a correlation coefficient or effect size
    assert.ok(typeof correlation.O.effect === 'number', 'O should have numeric effect size');
    assert.ok(typeof correlation.C.effect === 'number', 'C should have numeric effect size');
    assert.ok(typeof correlation.E.effect === 'number', 'E should have numeric effect size');
    assert.ok(typeof correlation.A.effect === 'number', 'A should have numeric effect size');
    assert.ok(typeof correlation.N.effect === 'number', 'N should have numeric effect size');
  });

  it('should identify strongest correlating dimension', async () => {
    const { calculateOceanCorrelation } = await import('./benchmark-integration.js');
    const correlation = calculateOceanCorrelation('race-condition-cache', 'dev');

    assert.ok(
      correlation.strongest,
      'Should identify strongest correlating dimension'
    );
    assert.ok(
      ['O', 'C', 'E', 'A', 'N'].includes(correlation.strongest.dimension),
      'Strongest should be a valid OCEAN dimension'
    );
  });

  it('should generate markdown correlation report', async () => {
    const { generateCorrelationReport } = await import('./benchmark-integration.js');
    const report = generateCorrelationReport('race-condition-cache', 'dev');

    assert.ok(typeof report === 'string', 'Report should be a string');
    assert.ok(report.includes('Correlation'), 'Report should mention correlation');
    assert.ok(report.includes('|'), 'Report should include markdown table');
  });

  it('should include performance delta in correlation context', async () => {
    const { generateCorrelationReport } = await import('./benchmark-integration.js');
    const report = generateCorrelationReport('race-condition-cache', 'dev');

    // Report should show how OCEAN relates to performance delta
    assert.ok(
      report.includes('delta') || report.includes('Delta') || report.includes('+') || report.includes('-'),
      'Report should include performance delta information'
    );
  });
});

// ============================================================================
// AC3: Identifies Optimal Personality Profiles for Each Role
// ============================================================================

describe('AC3: Optimal Profile Identification Module', () => {
  it('should export getOptimalProfile function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.getOptimalProfile === 'function',
      'getOptimalProfile should be a function'
    );
  });

  it('should export getRoleRecommendations function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.getRoleRecommendations === 'function',
      'getRoleRecommendations should be a function'
    );
  });
});

describe('AC3: Optimal Profile for Role', () => {
  it('should return optimal OCEAN profile for dev role', async () => {
    const { getOptimalProfile } = await import('./benchmark-integration.js');
    const profile = getOptimalProfile('dev');

    assert.ok(profile, 'Should return a profile');
    assert.ok(profile.ocean, 'Profile should include OCEAN scores');
    assert.ok(profile.reasoning, 'Profile should include reasoning');
  });

  it('should identify top performing themes for a role', async () => {
    const { getRoleRecommendations } = await import('./benchmark-integration.js');
    const recommendations = getRoleRecommendations('dev');

    assert.ok(Array.isArray(recommendations.topThemes), 'Should return array of top themes');
    assert.ok(recommendations.topThemes.length > 0, 'Should have at least one recommendation');

    const firstRec = recommendations.topThemes[0];
    assert.ok(firstRec.theme, 'Recommendation should include theme name');
    assert.ok(typeof firstRec.score === 'number', 'Recommendation should include score');
  });

  it('should identify themes to avoid for a role', async () => {
    const { getRoleRecommendations } = await import('./benchmark-integration.js');
    const recommendations = getRoleRecommendations('dev');

    assert.ok(Array.isArray(recommendations.avoidThemes), 'Should identify themes to avoid');
  });

  it('should explain why certain profiles excel', async () => {
    const { getRoleRecommendations } = await import('./benchmark-integration.js');
    const recommendations = getRoleRecommendations('dev');

    assert.ok(recommendations.insight, 'Should provide insight about why profiles excel');
    assert.ok(recommendations.insight.length > 20, 'Insight should be substantive');
  });

  it('should work for reviewer role', async () => {
    const { getOptimalProfile } = await import('./benchmark-integration.js');
    const profile = getOptimalProfile('reviewer');

    assert.ok(profile, 'Should return profile for reviewer');
  });

  it('should work for tea role', async () => {
    const { getOptimalProfile } = await import('./benchmark-integration.js');
    const profile = getOptimalProfile('tea');

    assert.ok(profile, 'Should return profile for tea');
  });
});

// ============================================================================
// AC4: Supports "Find Characters Good at X" Queries
// ============================================================================

describe('AC4: Query Module Exports', () => {
  it('should export findTopPerformers function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.findTopPerformers === 'function',
      'findTopPerformers should be a function'
    );
  });

  it('should export queryBenchmarks function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.queryBenchmarks === 'function',
      'queryBenchmarks should be a function'
    );
  });
});

describe('AC4: Find Characters Good at X Queries', () => {
  it('should find top performers for a specific scenario', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');
    const results = findTopPerformers({
      scenario: 'race-condition-cache',
      role: 'dev',
      limit: 3,
    });

    assert.ok(Array.isArray(results), 'Should return array');
    assert.ok(results.length <= 3, 'Should respect limit');
    assert.ok(results.length > 0, 'Should find at least one performer');

    const first = results[0];
    assert.ok(first.theme, 'Result should include theme');
    assert.ok(first.character, 'Result should include character');
    assert.ok(typeof first.score === 'number', 'Result should include score');
  });

  it('should sort results by score descending', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');
    const results = findTopPerformers({
      scenario: 'race-condition-cache',
      role: 'dev',
      limit: 5,
    });

    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        'Results should be sorted by score descending'
      );
    }
  });

  it('should support filtering by minimum score', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');
    const results = findTopPerformers({
      scenario: 'race-condition-cache',
      role: 'dev',
      minScore: 80,
    });

    for (const result of results) {
      assert.ok(
        result.score >= 80,
        `Score ${result.score} should be >= 80`
      );
    }
  });

  it('should support filtering by OCEAN criteria', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');
    const results = findTopPerformers({
      scenario: 'race-condition-cache',
      role: 'dev',
      ocean: 'E<=3', // Low extraversion (per research findings)
    });

    for (const result of results) {
      assert.ok(
        result.ocean.E <= 3,
        `Extraversion ${result.ocean.E} should be <= 3`
      );
    }
  });

  it('should include face in query results', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');
    const results = findTopPerformers({
      scenario: 'race-condition-cache',
      role: 'dev',
      limit: 1,
    });

    assert.ok(results[0].face, 'Result should include face');
  });

  it('should support general query syntax', async () => {
    const { queryBenchmarks } = await import('./benchmark-integration.js');
    // Query: "find top 3 dev personas for debugging with low extraversion"
    const results = queryBenchmarks({
      role: 'dev',
      scenario: 'race-condition-cache',
      filter: 'E<=3',
      limit: 3,
      sortBy: 'score',
    });

    assert.ok(Array.isArray(results), 'Should return array');
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases: Missing Data Handling', () => {
  it('should handle missing benchmark data gracefully', async () => {
    const { getBenchmarkWithFace } = await import('./benchmark-integration.js');

    // Theme exists but has no benchmark data
    const result = getBenchmarkWithFace('minimalist', 'pm', 'nonexistent-scenario');

    assert.ok(result === null || result.benchmarkMissing === true,
      'Should return null or indicate missing benchmark');
  });

  it('should handle theme without OCEAN scores', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');

    // Should not throw, should skip themes without OCEAN
    const results = findTopPerformers({
      scenario: 'race-condition-cache',
      role: 'dev',
    });

    assert.ok(Array.isArray(results), 'Should return array even with missing data');
  });

  it('should return empty array for scenarios with no benchmark data', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');

    const results = findTopPerformers({
      scenario: 'completely-fake-scenario',
      role: 'dev',
    });

    assert.ok(Array.isArray(results), 'Should return empty array');
    assert.strictEqual(results.length, 0, 'Should have no results');
  });
});

describe('Edge Cases: Invalid Inputs', () => {
  it('should throw for invalid role', async () => {
    const { getOptimalProfile } = await import('./benchmark-integration.js');

    assert.throws(
      () => getOptimalProfile('invalid-role'),
      /invalid.*role/i,
      'Should throw for invalid role'
    );
  });

  it('should throw for invalid OCEAN filter syntax', async () => {
    const { findTopPerformers } = await import('./benchmark-integration.js');

    assert.throws(
      () => findTopPerformers({
        scenario: 'race-condition-cache',
        role: 'dev',
        ocean: 'X>=5', // Invalid dimension
      }),
      /invalid.*dimension/i,
      'Should throw for invalid OCEAN dimension'
    );
  });
});

// ============================================================================
// Integration: Full Pipeline Tests
// ============================================================================

describe('Integration: Benchmark Report Generation', () => {
  it('should generate complete benchmark report with faces and correlations', async () => {
    const { generateBenchmarkReport } = await import('./benchmark-integration.js');

    const report = generateBenchmarkReport({
      scenario: 'race-condition-cache',
      role: 'dev',
    });

    assert.ok(report.markdown, 'Should include markdown output');
    assert.ok(report.data, 'Should include structured data');

    // Should have face references
    assert.ok(
      report.markdown.includes('.svg') || report.markdown.includes('data:image'),
      'Markdown should include face visualizations'
    );

    // Should have correlation info
    assert.ok(
      report.markdown.includes('O') && report.markdown.includes('C') &&
      report.markdown.includes('E') && report.markdown.includes('A') &&
      report.markdown.includes('N'),
      'Markdown should include all OCEAN dimensions'
    );
  });

  it('should include top performers in report', async () => {
    const { generateBenchmarkReport } = await import('./benchmark-integration.js');

    const report = generateBenchmarkReport({
      scenario: 'race-condition-cache',
      role: 'dev',
    });

    assert.ok(
      report.markdown.includes('Top') || report.markdown.includes('Best') ||
      report.markdown.includes('Recommended'),
      'Report should highlight top performers'
    );
  });

  it('should include themes to avoid in report', async () => {
    const { generateBenchmarkReport } = await import('./benchmark-integration.js');

    const report = generateBenchmarkReport({
      scenario: 'race-condition-cache',
      role: 'dev',
    });

    assert.ok(
      report.markdown.includes('Avoid') || report.markdown.includes('underperform') ||
      report.markdown.includes('below'),
      'Report should indicate themes to avoid'
    );
  });
});

// ============================================================================
// Story 14-5: OCEAN × Error-Type Correlation Heat Map
// ============================================================================

describe('AC1: calculateErrorTypeCorrelation Function', () => {
  it('should export calculateErrorTypeCorrelation function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.calculateErrorTypeCorrelation === 'function',
      'calculateErrorTypeCorrelation should be a function'
    );
  });

  it('should return OceanErrorCorrelation object with 5×3 matrix', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    // Mock benchmark results with OCEAN scores
    const results = [
      { ocean: { O: 5, C: 4, E: 2, A: 3, N: 2 }, mean: 85 },
      { ocean: { O: 2, C: 5, E: 4, A: 4, N: 4 }, mean: 72 },
      { ocean: { O: 4, C: 2, E: 3, A: 2, N: 3 }, mean: 78 },
    ];

    // Mock judge scores with detection_by_type
    const judgeScores = [
      { detection_by_type: { reasoning: 0.8, planning: 0.6, execution: 0.7 } },
      { detection_by_type: { reasoning: 0.5, planning: 0.9, execution: 0.8 } },
      { detection_by_type: { reasoning: 0.7, planning: 0.7, execution: 0.6 } },
    ];

    const correlation = calculateErrorTypeCorrelation(results, judgeScores);

    assert.ok(correlation, 'Should return correlation object');
    assert.ok(correlation.matrix, 'Should have matrix property');

    // Check all 5 OCEAN dimensions present
    for (const dim of ['O', 'C', 'E', 'A', 'N']) {
      assert.ok(correlation.matrix[dim], `Matrix should have ${dim} dimension`);
      assert.ok('reasoning' in correlation.matrix[dim], `${dim} should have reasoning`);
      assert.ok('planning' in correlation.matrix[dim], `${dim} should have planning`);
      assert.ok('execution' in correlation.matrix[dim], `${dim} should have execution`);
    }
  });

  it('should calculate correlation values as numbers', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    const results = [
      { ocean: { O: 5, C: 4, E: 2, A: 3, N: 2 }, mean: 85 },
      { ocean: { O: 2, C: 5, E: 4, A: 4, N: 4 }, mean: 72 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.8, planning: 0.6, execution: 0.7 } },
      { detection_by_type: { reasoning: 0.5, planning: 0.9, execution: 0.8 } },
    ];

    const correlation = calculateErrorTypeCorrelation(results, judgeScores);

    assert.ok(
      typeof correlation.matrix.O.reasoning.correlation === 'number',
      'Correlation value should be a number'
    );
    assert.ok(
      correlation.matrix.O.reasoning.correlation >= -1 &&
      correlation.matrix.O.reasoning.correlation <= 1,
      'Correlation should be between -1 and 1'
    );
  });

  it('should identify strongest correlation', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    const results = [
      { ocean: { O: 5, C: 4, E: 2, A: 3, N: 2 }, mean: 85 },
      { ocean: { O: 2, C: 5, E: 4, A: 4, N: 4 }, mean: 72 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.8, planning: 0.6, execution: 0.7 } },
      { detection_by_type: { reasoning: 0.5, planning: 0.9, execution: 0.8 } },
    ];

    const correlation = calculateErrorTypeCorrelation(results, judgeScores);

    assert.ok(correlation.strongest, 'Should identify strongest correlation');
    assert.ok(
      ['O', 'C', 'E', 'A', 'N'].includes(correlation.strongest.dimension),
      'Strongest dimension should be valid OCEAN'
    );
    assert.ok(
      ['reasoning', 'planning', 'execution'].includes(correlation.strongest.errorType),
      'Strongest errorType should be valid'
    );
    assert.ok(
      typeof correlation.strongest.correlation === 'number',
      'Strongest correlation should be a number'
    );
  });
});

describe('AC2: generateOceanErrorHeatMap Function', () => {
  it('should export generateOceanErrorHeatMap function', async () => {
    const module = await import('./benchmark-integration.js');
    assert.ok(
      typeof module.generateOceanErrorHeatMap === 'function',
      'generateOceanErrorHeatMap should be a function'
    );
  });

  it('should produce markdown with 5×3 matrix table', async () => {
    const { generateOceanErrorHeatMap } = await import('./benchmark-integration.js');

    // Create mock correlation data
    const correlation = {
      matrix: {
        O: {
          reasoning: { correlation: 0.42, arrow: '↑' },
          planning: { correlation: 0.08, arrow: '→' },
          execution: { correlation: -0.15, arrow: '→' },
        },
        C: {
          reasoning: { correlation: 0.12, arrow: '→' },
          planning: { correlation: 0.38, arrow: '↑' },
          execution: { correlation: 0.45, arrow: '↑' },
        },
        E: {
          reasoning: { correlation: -0.22, arrow: '→' },
          planning: { correlation: 0.05, arrow: '→' },
          execution: { correlation: 0.10, arrow: '→' },
        },
        A: {
          reasoning: { correlation: 0.08, arrow: '→' },
          planning: { correlation: -0.03, arrow: '→' },
          execution: { correlation: 0.11, arrow: '→' },
        },
        N: {
          reasoning: { correlation: -0.31, arrow: '↓' },
          planning: { correlation: -0.25, arrow: '→' },
          execution: { correlation: -0.18, arrow: '→' },
        },
      },
      strongest: { dimension: 'C', errorType: 'execution', correlation: 0.45 },
    };

    const heatMap = generateOceanErrorHeatMap(correlation);

    assert.ok(typeof heatMap === 'string', 'Should return a string');
    assert.ok(heatMap.includes('|'), 'Should include markdown table separators');

    // Should have all column headers
    assert.ok(heatMap.includes('Reasoning'), 'Should have Reasoning column');
    assert.ok(heatMap.includes('Planning'), 'Should have Planning column');
    assert.ok(heatMap.includes('Execution'), 'Should have Execution column');

    // Should have all row labels
    assert.ok(heatMap.includes('O'), 'Should have O (Openness) row');
    assert.ok(heatMap.includes('C'), 'Should have C (Conscientiousness) row');
    assert.ok(heatMap.includes('E'), 'Should have E (Extraversion) row');
    assert.ok(heatMap.includes('A'), 'Should have A (Agreeableness) row');
    assert.ok(heatMap.includes('N'), 'Should have N (Neuroticism) row');
  });
});

describe('AC3: Directional Arrows and Effect Sizes', () => {
  it('should include directional arrows (↑↓→) in output', async () => {
    const { generateOceanErrorHeatMap } = await import('./benchmark-integration.js');

    const correlation = {
      matrix: {
        O: {
          reasoning: { correlation: 0.42, arrow: '↑' },
          planning: { correlation: 0.08, arrow: '→' },
          execution: { correlation: -0.35, arrow: '↓' },
        },
        C: {
          reasoning: { correlation: 0.12, arrow: '→' },
          planning: { correlation: 0.38, arrow: '↑' },
          execution: { correlation: 0.45, arrow: '↑' },
        },
        E: {
          reasoning: { correlation: -0.22, arrow: '→' },
          planning: { correlation: 0.05, arrow: '→' },
          execution: { correlation: 0.10, arrow: '→' },
        },
        A: {
          reasoning: { correlation: 0.08, arrow: '→' },
          planning: { correlation: -0.03, arrow: '→' },
          execution: { correlation: 0.11, arrow: '→' },
        },
        N: {
          reasoning: { correlation: -0.31, arrow: '↓' },
          planning: { correlation: -0.25, arrow: '→' },
          execution: { correlation: -0.18, arrow: '→' },
        },
      },
      strongest: { dimension: 'C', errorType: 'execution', correlation: 0.45 },
    };

    const heatMap = generateOceanErrorHeatMap(correlation);

    // Check for directional arrows
    assert.ok(heatMap.includes('↑'), 'Should include upward arrow for positive correlations');
    assert.ok(heatMap.includes('↓'), 'Should include downward arrow for negative correlations');
    assert.ok(heatMap.includes('→'), 'Should include neutral arrow');
  });

  it('should show effect sizes with appropriate precision', async () => {
    const { generateOceanErrorHeatMap } = await import('./benchmark-integration.js');

    const correlation = {
      matrix: {
        O: {
          reasoning: { correlation: 0.42, arrow: '↑' },
          planning: { correlation: 0.08, arrow: '→' },
          execution: { correlation: -0.15, arrow: '→' },
        },
        C: {
          reasoning: { correlation: 0.12, arrow: '→' },
          planning: { correlation: 0.38, arrow: '↑' },
          execution: { correlation: 0.45, arrow: '↑' },
        },
        E: {
          reasoning: { correlation: -0.22, arrow: '→' },
          planning: { correlation: 0.05, arrow: '→' },
          execution: { correlation: 0.10, arrow: '→' },
        },
        A: {
          reasoning: { correlation: 0.08, arrow: '→' },
          planning: { correlation: -0.03, arrow: '→' },
          execution: { correlation: 0.11, arrow: '→' },
        },
        N: {
          reasoning: { correlation: -0.31, arrow: '↓' },
          planning: { correlation: -0.25, arrow: '→' },
          execution: { correlation: -0.18, arrow: '→' },
        },
      },
      strongest: { dimension: 'C', errorType: 'execution', correlation: 0.45 },
    };

    const heatMap = generateOceanErrorHeatMap(correlation);

    // Should include numeric effect sizes
    assert.ok(heatMap.includes('0.42') || heatMap.includes('.42'), 'Should show effect sizes');
    assert.ok(heatMap.includes('0.45') || heatMap.includes('.45'), 'Should show largest effect size');
  });

  it('should use correct arrow based on correlation magnitude', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    // High O correlates with high reasoning detection
    const results = [
      { ocean: { O: 5, C: 3, E: 3, A: 3, N: 3 }, mean: 80 },
      { ocean: { O: 5, C: 3, E: 3, A: 3, N: 3 }, mean: 82 },
      { ocean: { O: 1, C: 3, E: 3, A: 3, N: 3 }, mean: 70 },
      { ocean: { O: 1, C: 3, E: 3, A: 3, N: 3 }, mean: 68 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.9, planning: 0.5, execution: 0.5 } },
      { detection_by_type: { reasoning: 0.85, planning: 0.5, execution: 0.5 } },
      { detection_by_type: { reasoning: 0.4, planning: 0.5, execution: 0.5 } },
      { detection_by_type: { reasoning: 0.35, planning: 0.5, execution: 0.5 } },
    ];

    const correlation = calculateErrorTypeCorrelation(results, judgeScores);

    // High O should positively correlate with reasoning detection
    assert.ok(
      correlation.matrix.O.reasoning.arrow === '↑',
      'High positive correlation (>=0.3) should use ↑ arrow'
    );
  });

  it('should include legend explaining arrows', async () => {
    const { generateOceanErrorHeatMap } = await import('./benchmark-integration.js');

    const correlation = {
      matrix: {
        O: { reasoning: { correlation: 0.42, arrow: '↑' }, planning: { correlation: 0.08, arrow: '→' }, execution: { correlation: -0.15, arrow: '→' } },
        C: { reasoning: { correlation: 0.12, arrow: '→' }, planning: { correlation: 0.38, arrow: '↑' }, execution: { correlation: 0.45, arrow: '↑' } },
        E: { reasoning: { correlation: -0.22, arrow: '→' }, planning: { correlation: 0.05, arrow: '→' }, execution: { correlation: 0.10, arrow: '→' } },
        A: { reasoning: { correlation: 0.08, arrow: '→' }, planning: { correlation: -0.03, arrow: '→' }, execution: { correlation: 0.11, arrow: '→' } },
        N: { reasoning: { correlation: -0.31, arrow: '↓' }, planning: { correlation: -0.25, arrow: '→' }, execution: { correlation: -0.18, arrow: '→' } },
      },
      strongest: { dimension: 'C', errorType: 'execution', correlation: 0.45 },
    };

    const heatMap = generateOceanErrorHeatMap(correlation);

    assert.ok(
      heatMap.includes('Legend') || heatMap.includes('legend') ||
      (heatMap.includes('↑') && heatMap.includes('positive')),
      'Should include legend explaining arrow meanings'
    );
  });
});

describe('AC4: Integration with generateBenchmarkReport', () => {
  it('should include error-type heat map when judge scores provided', async () => {
    const { generateBenchmarkReport } = await import('./benchmark-integration.js');

    const report = generateBenchmarkReport({
      scenario: 'race-condition-cache',
      role: 'dev',
      includeErrorTypeCorrelation: true,
    });

    // When error correlation is requested, report should include the heat map section
    assert.ok(
      report.markdown.includes('Error-Type') ||
      report.markdown.includes('error-type') ||
      report.markdown.includes('Reasoning'),
      'Report should include error-type correlation section when requested'
    );
  });

  it('should add error correlation data to report data object', async () => {
    const { generateBenchmarkReport } = await import('./benchmark-integration.js');

    const report = generateBenchmarkReport({
      scenario: 'race-condition-cache',
      role: 'dev',
      includeErrorTypeCorrelation: true,
    });

    // Report data should include error correlation when flag is set
    if (report.data.errorCorrelation) {
      assert.ok(
        report.data.errorCorrelation.matrix,
        'Error correlation data should have matrix'
      );
    }
  });
});

describe('AC5: Edge Cases - No Data', () => {
  it('should handle empty results array', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    const correlation = calculateErrorTypeCorrelation([], []);

    assert.ok(correlation !== undefined, 'Should not throw on empty input');
    // Should return null or default structure
    assert.ok(
      correlation === null ||
      (correlation.matrix && Object.keys(correlation.matrix).length === 5),
      'Should return null or default 5×3 matrix'
    );
  });

  it('should handle single entry', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    const results = [
      { ocean: { O: 4, C: 3, E: 3, A: 3, N: 3 }, mean: 75 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.7, planning: 0.6, execution: 0.5 } },
    ];

    const correlation = calculateErrorTypeCorrelation(results, judgeScores);

    // With single entry, correlation can't be calculated meaningfully
    assert.ok(correlation !== undefined, 'Should handle single entry gracefully');
  });
});

describe('AC5: Edge Cases - Partial Data', () => {
  it('should handle missing detection_by_type in judge scores', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    const results = [
      { ocean: { O: 4, C: 3, E: 3, A: 3, N: 3 }, mean: 75 },
      { ocean: { O: 2, C: 4, E: 4, A: 4, N: 4 }, mean: 80 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.7, planning: 0.6, execution: 0.5 } },
      {}, // Missing detection_by_type
    ];

    // Should not throw
    let threw = false;
    try {
      calculateErrorTypeCorrelation(results, judgeScores);
    } catch {
      threw = true;
    }

    assert.ok(!threw, 'Should handle missing detection_by_type without throwing');
  });

  it('should handle mismatched array lengths', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    const results = [
      { ocean: { O: 4, C: 3, E: 3, A: 3, N: 3 }, mean: 75 },
      { ocean: { O: 2, C: 4, E: 4, A: 4, N: 4 }, mean: 80 },
      { ocean: { O: 3, C: 3, E: 3, A: 3, N: 3 }, mean: 77 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.7, planning: 0.6, execution: 0.5 } },
    ];

    // Should not throw
    let threw = false;
    try {
      calculateErrorTypeCorrelation(results, judgeScores);
    } catch {
      threw = true;
    }

    assert.ok(!threw, 'Should handle mismatched array lengths without throwing');
  });
});

describe('AC5: Edge Cases - Single Dimension Variation', () => {
  it('should handle all same OCEAN values', async () => {
    const { calculateErrorTypeCorrelation } = await import('./benchmark-integration.js');

    // All characters have identical OCEAN scores
    const results = [
      { ocean: { O: 3, C: 3, E: 3, A: 3, N: 3 }, mean: 75 },
      { ocean: { O: 3, C: 3, E: 3, A: 3, N: 3 }, mean: 80 },
      { ocean: { O: 3, C: 3, E: 3, A: 3, N: 3 }, mean: 77 },
    ];

    const judgeScores = [
      { detection_by_type: { reasoning: 0.7, planning: 0.6, execution: 0.5 } },
      { detection_by_type: { reasoning: 0.8, planning: 0.7, execution: 0.6 } },
      { detection_by_type: { reasoning: 0.6, planning: 0.5, execution: 0.4 } },
    ];

    const correlation = calculateErrorTypeCorrelation(results, judgeScores);

    // With no variation in OCEAN, correlation should be 0 or undefined
    assert.ok(correlation !== undefined, 'Should handle identical OCEAN scores');
    if (correlation && correlation.matrix) {
      // All correlations should be 0 or neutral
      assert.ok(
        correlation.matrix.O.reasoning.correlation === 0 ||
        correlation.matrix.O.reasoning.arrow === '→',
        'No variance should result in zero or neutral correlation'
      );
    }
  });
});
