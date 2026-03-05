/**
 * Tests for dead-code API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { createDeadCodeRouter } from './dead-code.js';
import { describeSingleRouteRouter } from './__test-helpers.js';

describeSingleRouteRouter('dead-code', createDeadCodeRouter);
