/**
 * Tests for Story 31-7: Generic Workflow-Driven Handoff Subagent
 *
 * These tests define the contract for the generic handoff module that
 * replaces 5 hardcoded handoff files (sm-handoff, tea-handoff, dev-handoff,
 * reviewer-handoff-approve, reviewer-handoff-reject).
 *
 * The generic handoff reads phase requirements from workflow definitions
 * and performs gate checks based on phase gate type.
 *
 * Test categories:
 * 1. findCurrentPhase() - Locate phase by name in workflow
 * 2. getNextPhase() - Determine next phase (forward or rejection loop)
 * 3. checkGate() - Run gate-specific checks
 * 4. formatPhaseTransition() - Format session file updates
 * 5. Integration - Full handoff scenarios with TDD/trivial workflows
 *
 * Run with: npm test
 */
export {};
//# sourceMappingURL=generic-handoff.test.d.ts.map