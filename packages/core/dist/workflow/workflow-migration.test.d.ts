/**
 * Tests for Story 31-4: Migrate TDD Flow to Workflow Definition
 *
 * These tests verify that the workflow YAML files correctly capture
 * the hardcoded TDD flow from the SM agent. This is a migration verification
 * test suite - it ensures the YAML definitions match expected behavior.
 *
 * Acceptance Criteria:
 * - AC1: tdd.yaml workflow exists in pennyfarthing-dist/workflows/
 * - AC2: Defines SM → TEA → Dev → Reviewer → SM phases
 * - AC3: Scale routing (1-2 pts skip TEA) preserved via trivial.yaml
 * - AC4: Existing /new-work behavior unchanged (regression tested)
 *
 * Run with: npm test
 */
export {};
//# sourceMappingURL=workflow-migration.test.d.ts.map