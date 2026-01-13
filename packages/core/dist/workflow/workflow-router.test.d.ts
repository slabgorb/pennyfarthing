/**
 * Tests for Story 31-3: Story-to-workflow Routing Engine
 *
 * These tests define the contract for routing stories to workflows based on:
 * - Explicit workflow tags (highest priority)
 * - Trigger matching (tags, types, points)
 * - Default fallback workflow
 *
 * The router (workflow-router.ts) will implement these functions to pass these tests.
 *
 * Acceptance Criteria:
 * - AC1: Stories with workflow tag use specified workflow
 * - AC2: Story type mapping to workflows configurable
 * - AC3: Default workflow when no match
 * - AC4: Routing decision logged for debugging
 *
 * Run with: npm test
 */
export {};
//# sourceMappingURL=workflow-router.test.d.ts.map