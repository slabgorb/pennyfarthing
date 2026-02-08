/**
 * Health Score API Router — STUB
 *
 * Story 84-2: To be implemented by Dev.
 * GET /api/health-score — shells out to Python healthscore module.
 */

import { Router } from 'express';

export function createHealthScoreRouter(getProjectDir: () => string): Router {
  const router = Router();
  // TODO: Implement GET / handler that calls python3 -m pennyfarthing_scripts.healthscore
  return router;
}
