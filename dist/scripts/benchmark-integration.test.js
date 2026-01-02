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
        assert.ok(typeof module.loadBenchmarkData === 'function', 'loadBenchmarkData should be a function');
    });
    it('should export getBenchmarkWithFace function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.getBenchmarkWithFace === 'function', 'getBenchmarkWithFace should be a function');
    });
    it('should export generateBenchmarkReport function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.generateBenchmarkReport === 'function', 'generateBenchmarkReport should be a function');
    });
});
describe('AC1: Benchmark Output Includes Face Visualization', () => {
    it('should include face SVG path in benchmark result', async () => {
        const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
        const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');
        assert.ok(result !== null, 'Result should not be null');
        assert.ok(result.face, 'Result should include face property');
        assert.ok(result.face.includes('.svg') || result.face.includes('data:image/svg'), 'Face should be SVG path or data URL');
    });
    it('should include character name from theme', async () => {
        const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
        const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');
        assert.ok(result !== null, 'Result should not be null');
        assert.ok(result.character, 'Result should include character name');
        assert.ok(result.character.length > 0, 'Character name should not be empty');
    });
    it('should include benchmark statistics', async () => {
        const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
        const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');
        assert.ok(result !== null, 'Result should not be null');
        assert.ok(typeof result.mean === 'number', 'Result should include mean score');
        assert.ok(typeof result.delta === 'number', 'Result should include delta vs baseline');
    });
    it('should include OCEAN scores alongside benchmark data', async () => {
        const { getBenchmarkWithFace } = await import('./benchmark-integration.js');
        const result = getBenchmarkWithFace('discworld', 'dev', 'race-condition-cache');
        assert.ok(result !== null, 'Result should not be null');
        assert.ok(result.ocean, 'Result should include OCEAN scores');
        assert.ok(typeof result.ocean.O === 'number', 'O should be a number');
        assert.ok(typeof result.ocean.C === 'number', 'C should be a number');
        assert.ok(typeof result.ocean.E === 'number', 'E should be a number');
        assert.ok(typeof result.ocean.A === 'number', 'A should be a number');
        assert.ok(typeof result.ocean.N === 'number', 'N should be a number');
    });
});
// ============================================================================
// AC2: Correlation Report Shows OCEAN vs Task Performance
// ============================================================================
describe('AC2: Correlation Analysis Module', () => {
    it('should export calculateOceanCorrelation function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.calculateOceanCorrelation === 'function', 'calculateOceanCorrelation should be a function');
    });
    it('should export generateCorrelationReport function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.generateCorrelationReport === 'function', 'generateCorrelationReport should be a function');
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
        assert.ok(correlation.strongest, 'Should identify strongest correlating dimension');
        assert.ok(['O', 'C', 'E', 'A', 'N'].includes(correlation.strongest.dimension), 'Strongest should be a valid OCEAN dimension');
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
        assert.ok(report.includes('delta') || report.includes('Delta') || report.includes('+') || report.includes('-'), 'Report should include performance delta information');
    });
});
// ============================================================================
// AC3: Identifies Optimal Personality Profiles for Each Role
// ============================================================================
describe('AC3: Optimal Profile Identification Module', () => {
    it('should export getOptimalProfile function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.getOptimalProfile === 'function', 'getOptimalProfile should be a function');
    });
    it('should export getRoleRecommendations function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.getRoleRecommendations === 'function', 'getRoleRecommendations should be a function');
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
        assert.ok(typeof module.findTopPerformers === 'function', 'findTopPerformers should be a function');
    });
    it('should export queryBenchmarks function', async () => {
        const module = await import('./benchmark-integration.js');
        assert.ok(typeof module.queryBenchmarks === 'function', 'queryBenchmarks should be a function');
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
            assert.ok(results[i - 1].score >= results[i].score, 'Results should be sorted by score descending');
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
            assert.ok(result.score >= 80, `Score ${result.score} should be >= 80`);
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
            assert.ok(result.ocean.E <= 3, `Extraversion ${result.ocean.E} should be <= 3`);
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
        assert.ok(result === null || result.benchmarkMissing === true, 'Should return null or indicate missing benchmark');
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
        assert.throws(() => getOptimalProfile('invalid-role'), /invalid.*role/i, 'Should throw for invalid role');
    });
    it('should throw for invalid OCEAN filter syntax', async () => {
        const { findTopPerformers } = await import('./benchmark-integration.js');
        assert.throws(() => findTopPerformers({
            scenario: 'race-condition-cache',
            role: 'dev',
            ocean: 'X>=5', // Invalid dimension
        }), /invalid.*dimension/i, 'Should throw for invalid OCEAN dimension');
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
        assert.ok(report.markdown.includes('.svg') || report.markdown.includes('data:image'), 'Markdown should include face visualizations');
        // Should have correlation info
        assert.ok(report.markdown.includes('O') && report.markdown.includes('C') &&
            report.markdown.includes('E') && report.markdown.includes('A') &&
            report.markdown.includes('N'), 'Markdown should include all OCEAN dimensions');
    });
    it('should include top performers in report', async () => {
        const { generateBenchmarkReport } = await import('./benchmark-integration.js');
        const report = generateBenchmarkReport({
            scenario: 'race-condition-cache',
            role: 'dev',
        });
        assert.ok(report.markdown.includes('Top') || report.markdown.includes('Best') ||
            report.markdown.includes('Recommended'), 'Report should highlight top performers');
    });
    it('should include themes to avoid in report', async () => {
        const { generateBenchmarkReport } = await import('./benchmark-integration.js');
        const report = generateBenchmarkReport({
            scenario: 'race-condition-cache',
            role: 'dev',
        });
        assert.ok(report.markdown.includes('Avoid') || report.markdown.includes('underperform') ||
            report.markdown.includes('below'), 'Report should indicate themes to avoid');
    });
});
//# sourceMappingURL=benchmark-integration.test.js.map