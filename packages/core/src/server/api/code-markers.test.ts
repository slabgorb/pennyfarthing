/**
 * Tests for code-markers API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { createCodeMarkersRouter } from './code-markers.js';
import { describeSingleRouteRouter } from './__test-helpers.js';

describeSingleRouteRouter('code-markers', createCodeMarkersRouter);
