/**
 * Telemetry API Router - Story 19-6
 *
 * REST API for TDD telemetry data. Currently exposes TDD phase metrics.
 * Future stories (19-7) will add more endpoints here.
 */

import { Router } from 'express';
import { getTDDMetrics } from '../tdd-metrics.js';

/**
 * Create telemetry API router
 *
 * Endpoints:
 * - GET /tdd - Returns current TDD phase metrics
 */
export function createTelemetryRouter(): Router {
  const router = Router();

  /**
   * GET /api/telemetry/tdd
   *
   * Returns TDD phase timing metrics for the current story.
   *
   * Response 200:
   *   {
   *     storyId: string,
   *     phases: { redStart?, redEnd?, greenStart?, greenEnd?, reviewStart?, reviewEnd? },
   *     redPhaseDurationMs?: number,
   *     greenPhaseDurationMs?: number,
   *     reviewPhaseDurationMs?: number,
   *     totalCycleDurationMs?: number
   *   }
   *
   * Response 404:
   *   { error: 'No TDD metrics available' }
   */
  router.get('/tdd', (_req, res) => {
    const metrics = getTDDMetrics();

    if (!metrics) {
      return res.status(404).json({ error: 'No TDD metrics available' });
    }

    res.json(metrics);
  });

  return router;
}
