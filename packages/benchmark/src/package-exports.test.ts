/**
 * Tests for Story 93-1: Package Shell and Module Migration
 *
 * These tests verify that @pennyfarthing/benchmark correctly exports
 * all functions and types from the two migrated modules:
 * - job-fair-aggregator (9 functions, 11 types)
 * - benchmark-integration (11 functions, 12 types)
 *
 * RED state: All tests fail because index.ts is an empty barrel.
 * GREEN state: Tests pass once modules are moved and re-exported.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use dynamic import + Record cast so tests compile but fail at runtime
async function loadPackageIndex(): Promise<Record<string, unknown>> {
  return await import('./index.js') as Record<string, unknown>;
}

// ============================================================================
// AC5: Barrel index.ts exports all public functions and types
// ============================================================================

describe('Package Exports: job-fair-aggregator functions', () => {
  it('should export aggregateJobFairResults', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.aggregateJobFairResults, 'function',
      'aggregateJobFairResults should be exported as a function');
  });

  it('should export getBaselineComparison', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getBaselineComparison, 'function',
      'getBaselineComparison should be exported as a function');
  });

  it('should export getRoleStatistics', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getRoleStatistics, 'function',
      'getRoleStatistics should be exported as a function');
  });

  it('should export getTopPerformers', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getTopPerformers, 'function',
      'getTopPerformers should be exported as a function');
  });

  it('should export getHistoricalTrend', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getHistoricalTrend, 'function',
      'getHistoricalTrend should be exported as a function');
  });

  it('should export saveHistoricalSnapshot', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.saveHistoricalSnapshot, 'function',
      'saveHistoricalSnapshot should be exported as a function');
  });

  it('should export aggregateByDimension', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.aggregateByDimension, 'function',
      'aggregateByDimension should be exported as a function');
  });

  it('should export getDimensionValues', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getDimensionValues, 'function',
      'getDimensionValues should be exported as a function');
  });

  it('should export generateDifferentialReport', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.generateDifferentialReport, 'function',
      'generateDifferentialReport should be exported as a function');
  });
});

describe('Package Exports: benchmark-integration functions', () => {
  it('should export loadBenchmarkData', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.loadBenchmarkData, 'function',
      'loadBenchmarkData should be exported as a function');
  });

  it('should export getBenchmarkWithFace', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getBenchmarkWithFace, 'function',
      'getBenchmarkWithFace should be exported as a function');
  });

  it('should export calculateOceanCorrelation', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.calculateOceanCorrelation, 'function',
      'calculateOceanCorrelation should be exported as a function');
  });

  it('should export generateCorrelationReport', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.generateCorrelationReport, 'function',
      'generateCorrelationReport should be exported as a function');
  });

  it('should export getOptimalProfile', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getOptimalProfile, 'function',
      'getOptimalProfile should be exported as a function');
  });

  it('should export getRoleRecommendations', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.getRoleRecommendations, 'function',
      'getRoleRecommendations should be exported as a function');
  });

  it('should export findTopPerformers', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.findTopPerformers, 'function',
      'findTopPerformers should be exported as a function');
  });

  it('should export queryBenchmarks', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.queryBenchmarks, 'function',
      'queryBenchmarks should be exported as a function');
  });

  it('should export calculateErrorTypeCorrelation', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.calculateErrorTypeCorrelation, 'function',
      'calculateErrorTypeCorrelation should be exported as a function');
  });

  it('should export generateOceanErrorHeatMap', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.generateOceanErrorHeatMap, 'function',
      'generateOceanErrorHeatMap should be exported as a function');
  });

  it('should export generateBenchmarkReport', async () => {
    const mod = await loadPackageIndex();
    assert.strictEqual(typeof mod.generateBenchmarkReport, 'function',
      'generateBenchmarkReport should be exported as a function');
  });
});

// ============================================================================
// AC1: package.json exists with correct configuration
// ============================================================================

describe('Package Configuration', () => {
  it('should have correct package name', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.strictEqual(pkg.name, '@pennyfarthing/benchmark',
      'Package name should be @pennyfarthing/benchmark');
  });

  it('should be type: module', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.strictEqual(pkg.type, 'module', 'Package should use ESM');
  });

  it('should have peer dependency on @pennyfarthing/core', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.ok(pkg.peerDependencies?.['@pennyfarthing/core'],
      'Should have peer dependency on @pennyfarthing/core');
  });

  it('should have peer dependency on @pennyfarthing/shared', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.ok(pkg.peerDependencies?.['@pennyfarthing/shared'],
      'Should have peer dependency on @pennyfarthing/shared');
  });

  it('should have exports map with types and default', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.ok(pkg.exports?.['.']?.types, 'Should have types export');
    assert.ok(pkg.exports?.['.']?.default, 'Should have default export');
  });
});

// ============================================================================
// AC2: tsconfig.json extends base with composite: true
// ============================================================================

describe('TypeScript Configuration', () => {
  it('should extend tsconfig.base.json', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    assert.strictEqual(tsconfig.extends, '../../tsconfig.base.json',
      'Should extend ../../tsconfig.base.json');
  });

  it('should have composite: true', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    assert.strictEqual(tsconfig.compilerOptions?.composite, true,
      'Should have composite: true');
  });
});

// ============================================================================
// AC3/AC4: Source files exist in new location
// ============================================================================

describe('Source Files Exist', () => {
  it('should have job-fair-aggregator.js in dist/', () => {
    const filePath = join(__dirname, 'job-fair-aggregator.js');
    assert.ok(existsSync(filePath),
      'job-fair-aggregator.js should exist in dist/ (compiled from src/)');
  });

  it('should have benchmark-integration.js in dist/', () => {
    const filePath = join(__dirname, 'benchmark-integration.js');
    assert.ok(existsSync(filePath),
      'benchmark-integration.js should exist in dist/ (compiled from src/)');
  });
});

// ============================================================================
// AC6: Test files exist alongside source
// ============================================================================

describe('Test Files Exist', () => {
  it('should have job-fair-aggregator.test.js in dist/', () => {
    const filePath = join(__dirname, 'job-fair-aggregator.test.js');
    assert.ok(existsSync(filePath),
      'job-fair-aggregator.test.js should exist in dist/');
  });

  it('should have benchmark-integration.test.js in dist/', () => {
    const filePath = join(__dirname, 'benchmark-integration.test.js');
    assert.ok(existsSync(filePath),
      'benchmark-integration.test.js should exist in dist/');
  });
});

// ============================================================================
// Export count verification
// ============================================================================

describe('Export Completeness', () => {
  it('should export at least 20 functions total', async () => {
    const mod = await loadPackageIndex();
    const exportedFunctions = Object.entries(mod)
      .filter(([, v]) => typeof v === 'function');
    assert.ok(exportedFunctions.length >= 20,
      `Should export at least 20 functions, got ${exportedFunctions.length}: ${exportedFunctions.map(([k]) => k).join(', ')}`);
  });
});
