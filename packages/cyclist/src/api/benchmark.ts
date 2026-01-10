/**
 * Benchmark API Router
 *
 * Story 7-5: API endpoint for dimension-filtered queries
 *
 * Provides REST endpoints for accessing benchmark statistics
 * with dimension-based filtering and differential reports.
 */

import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  aggregateByDimension,
  getDimensionValues,
  generateDifferentialReport,
  aggregateJobFairResults,
  type DimensionName,
  type DimensionValueStats,
  type DimensionComparison,
} from '@pennyfarthing/core';

// Default paths - can be overridden via getProjectDir
const DEFAULT_RESULTS_DIR = 'internal/results/job-fair';
const DEFAULT_THEMES_DIR = 'pennyfarthing-dist/personas/themes';

/** Valid dimension names */
const VALID_DIMENSIONS: DimensionName[] = ['tone', 'era', 'genre', 'energy'];

/**
 * Create benchmark API router
 *
 * @param getProjectDir - Function to get current project directory
 */
export function createBenchmarkRouter(getProjectDir: () => string): Router {
  const router = Router();

  /**
   * GET /api/benchmark/dimensions
   * List all available dimensions and their value counts
   */
  router.get('/dimensions', async (_req, res) => {
    try {
      const projectDir = getProjectDir();
      const themesDir = join(projectDir, DEFAULT_THEMES_DIR);

      const result: Record<string, Array<{ value: string; theme_count: number }>> = {};

      for (const dimension of VALID_DIMENSIONS) {
        result[dimension] = await getDimensionValues(dimension, themesDir);
      }

      res.json({
        dimensions: VALID_DIMENSIONS,
        values: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/benchmark/dimensions/:dimension
   * Get aggregated stats for a specific dimension
   *
   * Query params:
   *   - role: Filter to specific role (optional)
   */
  router.get('/dimensions/:dimension', async (req, res) => {
    try {
      const dimension = req.params.dimension as DimensionName;

      if (!VALID_DIMENSIONS.includes(dimension)) {
        res.status(400).json({
          error: `Invalid dimension: ${dimension}. Valid dimensions: ${VALID_DIMENSIONS.join(', ')}`,
        });
        return;
      }

      const projectDir = getProjectDir();
      const resultsDir = join(projectDir, DEFAULT_RESULTS_DIR);
      const themesDir = join(projectDir, DEFAULT_THEMES_DIR);

      if (!existsSync(resultsDir)) {
        res.status(404).json({
          error: 'No benchmark results found. Run job-fair benchmarks first.',
        });
        return;
      }

      const stats = await aggregateByDimension(dimension, resultsDir, themesDir);

      // Optional role filter
      const roleFilter = req.query.role as string | undefined;
      if (roleFilter) {
        // Filter stats to only include the requested role
        const filteredValues = stats.values.map((v: DimensionValueStats) => ({
          ...v,
          by_role: v.by_role[roleFilter] ? { [roleFilter]: v.by_role[roleFilter] } : {},
        }));

        const filteredComparisons = stats.comparisons.map((c: DimensionComparison) => ({
          ...c,
          by_role: c.by_role[roleFilter] ? { [roleFilter]: c.by_role[roleFilter] } : {},
        }));

        res.json({
          ...stats,
          values: filteredValues,
          comparisons: filteredComparisons,
          filter: { role: roleFilter },
        });
        return;
      }

      res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/benchmark/dimensions/:dimension/report
   * Get a markdown differential report for a dimension
   */
  router.get('/dimensions/:dimension/report', async (req, res) => {
    try {
      const dimension = req.params.dimension as DimensionName;

      if (!VALID_DIMENSIONS.includes(dimension)) {
        res.status(400).json({
          error: `Invalid dimension: ${dimension}. Valid dimensions: ${VALID_DIMENSIONS.join(', ')}`,
        });
        return;
      }

      const projectDir = getProjectDir();
      const resultsDir = join(projectDir, DEFAULT_RESULTS_DIR);
      const themesDir = join(projectDir, DEFAULT_THEMES_DIR);

      if (!existsSync(resultsDir)) {
        res.status(404).json({
          error: 'No benchmark results found. Run job-fair benchmarks first.',
        });
        return;
      }

      const report = await generateDifferentialReport(dimension, resultsDir, themesDir);

      // Return as markdown or JSON based on Accept header
      const acceptsMarkdown = req.accepts(['text/markdown', 'application/json']) === 'text/markdown';

      if (acceptsMarkdown) {
        res.type('text/markdown').send(report);
      } else {
        res.json({ dimension, report });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/benchmark/aggregate
   * Get overall aggregated benchmark stats (from story 7-4)
   */
  router.get('/aggregate', async (_req, res) => {
    try {
      const projectDir = getProjectDir();
      const resultsDir = join(projectDir, DEFAULT_RESULTS_DIR);

      if (!existsSync(resultsDir)) {
        res.status(404).json({
          error: 'No benchmark results found. Run job-fair benchmarks first.',
        });
        return;
      }

      const stats = await aggregateJobFairResults(resultsDir);
      res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
