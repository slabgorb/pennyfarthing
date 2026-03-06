/**
 * Tests for complexity API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { createComplexityRouter } from './complexity.js';
import { describeSingleRouteRouter } from './__test-helpers.js';

describeSingleRouteRouter('complexity', createComplexityRouter);
