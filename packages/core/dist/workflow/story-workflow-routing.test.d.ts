/**
 * Tests for Story 38-9: SM Workflow Routing from Story Tags
 *
 * These tests define the contract for SM reading and honoring
 * the `workflow:` tag on stories in sprint YAML.
 *
 * Acceptance Criteria:
 * - AC1: SM reads workflow tag from story in sprint YAML
 * - AC2: SM loads correct workflow definition from pennyfarthing-dist/workflows/
 * - AC3: SM follows workflow's phase sequence (agent-docs → Orchestrator)
 * - AC4: Fallback to TDD if no tag or unknown workflow
 * - AC5: Session file records which workflow is active
 *
 * Run with: npm test
 */
export {};
//# sourceMappingURL=story-workflow-routing.test.d.ts.map