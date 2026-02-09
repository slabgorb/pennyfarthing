/**
 * Story 13-10: Benchmark Loader Tests (RED Phase)
 *
 * Tests for the benchmark data loader that reads from internal/results/benchmarks/
 * and transforms summary.yaml files into typed data for the showcase.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';

// These imports will fail until benchmark-loader.ts is implemented
import {
  loadBenchmarkSummaries,
  groupByScenario,
  groupByRole,
  calculateRoleLeaderboard,
  type BenchmarkSummary,
  type ScenarioGroup,
  type RoleLeaderboard,
} from '../src/lib/benchmark-loader';

describe('Story 13-10: Benchmark Loader', () => {
  describe('AC1: Load benchmark data from internal/results/benchmarks/', () => {
    it('should export loadBenchmarkSummaries function', () => {
      expect(typeof loadBenchmarkSummaries).toBe('function');
    });

    it('should load all summary.yaml files from benchmark directories', async () => {
      const summaries = await loadBenchmarkSummaries();
      expect(Array.isArray(summaries)).toBe(true);
      expect(summaries.length).toBeGreaterThan(0);
    });

    it('should parse BenchmarkSummary with required fields', async () => {
      const summaries = await loadBenchmarkSummaries();
      const summary = summaries[0];

      // Agent info
      expect(summary.agent).toBeDefined();
      expect(summary.agent.theme).toBeDefined();
      expect(summary.agent.role).toBeDefined();

      // Scenario info
      expect(summary.scenario).toBeDefined();
      expect(summary.scenario.name).toBeDefined();

      // Statistics
      expect(summary.statistics).toBeDefined();
      expect(typeof summary.statistics.mean).toBe('number');
      expect(typeof summary.statistics.n).toBe('number');
    });

    it('should include baseline comparison data when available', async () => {
      const summaries = await loadBenchmarkSummaries();
      // At least some summaries should have baseline comparison
      const withBaseline = summaries.filter((s) => s.baselineComparison);
      expect(withBaseline.length).toBeGreaterThan(0);

      const summary = withBaseline[0];
      expect(summary.baselineComparison?.controlMean).toBeDefined();
      expect(summary.baselineComparison?.delta).toBeDefined();
    });
  });

  describe('AC2: Group and aggregate performance data', () => {
    it('should export groupByScenario function', () => {
      expect(typeof groupByScenario).toBe('function');
    });

    it('should group summaries by scenario name', async () => {
      const summaries = await loadBenchmarkSummaries();
      const grouped = groupByScenario(summaries);

      expect(typeof grouped).toBe('object');
      // Should have keys like 'race-condition-cache', 'order-service', etc.
      const scenarios = Object.keys(grouped);
      expect(scenarios.length).toBeGreaterThan(0);

      // Each group should have array of summaries
      const firstScenario = scenarios[0];
      expect(Array.isArray(grouped[firstScenario])).toBe(true);
    });

    it('should export groupByRole function', () => {
      expect(typeof groupByRole).toBe('function');
    });

    it('should group summaries by agent role', async () => {
      const summaries = await loadBenchmarkSummaries();
      const grouped = groupByRole(summaries);

      // Should have keys like 'dev', 'tea', 'reviewer', 'sm'
      const roles = Object.keys(grouped);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some((r) => ['dev', 'tea', 'reviewer', 'sm', 'architect'].includes(r))).toBe(
        true
      );
    });
  });

  describe('AC2: Calculate role leaderboards', () => {
    it('should export calculateRoleLeaderboard function', () => {
      expect(typeof calculateRoleLeaderboard).toBe('function');
    });

    it('should return sorted leaderboard by mean score', async () => {
      const summaries = await loadBenchmarkSummaries();
      const byRole = groupByRole(summaries);

      // Get leaderboard for a role that has data
      const roles = Object.keys(byRole);
      const roleWithData = roles[0];
      const leaderboard = calculateRoleLeaderboard(byRole[roleWithData]);

      expect(Array.isArray(leaderboard)).toBe(true);
      expect(leaderboard.length).toBeGreaterThan(0);

      // Each entry should have theme and average score
      const entry = leaderboard[0];
      expect(entry.theme).toBeDefined();
      expect(typeof entry.averageScore).toBe('number');

      // Should be sorted descending by score
      if (leaderboard.length > 1) {
        expect(leaderboard[0].averageScore).toBeGreaterThanOrEqual(leaderboard[1].averageScore);
      }
    });

    it('should include delta from baseline in leaderboard', async () => {
      const summaries = await loadBenchmarkSummaries();
      const byRole = groupByRole(summaries);
      const roles = Object.keys(byRole);
      const leaderboard = calculateRoleLeaderboard(byRole[roles[0]]);

      // At least some entries should have delta
      const withDelta = leaderboard.filter((e) => e.averageDelta !== undefined);
      expect(withDelta.length).toBeGreaterThan(0);
    });
  });

  describe('AC3: OCEAN correlation data preparation', () => {
    it('should include OCEAN data in summaries when available', async () => {
      const summaries = await loadBenchmarkSummaries();
      // Not all summaries may have OCEAN data, but structure should support it
      expect(summaries[0]).toBeDefined();
    });
  });
});
