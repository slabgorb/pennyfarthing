/**
 * Tests for Story 31-11: Consolidate SM Bookkeeping Subagents
 *
 * These tests define the contract for consolidating 6 SM subagents into 3:
 *
 * 1. generic-sm-setup - Combines sm-story-setup + sm-work-research
 *    - Mode: 'research' | 'setup'
 *    - Research: scan backlog, batch Jira query, recommend stories
 *    - Setup: claim Jira, create branches, write session file
 *
 * 2. generic-sm-finish - Combines sm-finish-bookkeeping + sm-finish-execution
 *    - Phase: 'preflight' | 'execute'
 *    - Preflight: PR check, lint fix, Jira status → JSON report
 *    - Execute: archive, Jira transition, cleanup → completion flags
 *
 * 3. generic-handoff with setup phase support
 *    - Add setup→red transition to generic-handoff
 *    - Gate type: manual (verifies context exists)
 *
 * Run with: npm test
 */
export {};
//# sourceMappingURL=sm-subagents.test.d.ts.map