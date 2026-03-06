/**
 * Tests for hotspots API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 *
 * Tests router factory shape only — does not spawn Python subprocess.
 */
import { createHotspotsRouter } from './hotspots.js';
import { describeSingleRouteRouter } from './__test-helpers.js';

describeSingleRouteRouter('hotspots', createHotspotsRouter);
