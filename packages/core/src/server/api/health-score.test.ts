/**
 * Tests for health-score API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 *
 * Tests router factory shape only — does not spawn Python subprocess.
 */
import { createHealthScoreRouter } from './health-score.js';
import { describeSingleRouteRouter } from './__test-helpers.js';

describeSingleRouteRouter('health-score', createHealthScoreRouter);
