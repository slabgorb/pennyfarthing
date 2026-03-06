/**
 * Tests for dependencies API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { createDependenciesRouter } from './dependencies.js';
import { describeSingleRouteRouter } from './__test-helpers.js';

describeSingleRouteRouter('dependencies', createDependenciesRouter);
