/**
 * Generic Workflow-Driven Handoff
 *
 * Story 31-7: Replace 5 hardcoded handoff files with one generic handoff
 * that reads phase requirements from workflow definitions.
 *
 * This module provides functions to:
 * - Find current phase in a workflow
 * - Determine next phase (forward or rejection loop)
 * - Check gate conditions based on gate type
 * - Format session file updates for phase transitions
 *
 * TODO: Dev will implement the logic to pass the tests
 */
import type { WorkflowDefinition, WorkflowPhase } from './workflow-schema.js';
/**
 * Context for gate checks - provides test results, verdicts, etc.
 */
export interface GateContext {
    /** For tests_fail gate: are tests currently failing? */
    testsRed?: boolean;
    /** For tests_pass gate: are all tests passing? */
    testsGreen?: boolean;
    /** Number of passing tests */
    testPassCount?: number;
    /** Number of failing tests */
    testFailCount?: number;
    /** For approval gate: approved or rejected */
    verdict?: 'approved' | 'rejected';
}
/**
 * Options for getNextPhase to handle rejection loops
 */
export interface NextPhaseOptions {
    /** For approval gates: determines forward vs loop-back */
    verdict?: 'approved' | 'rejected';
}
/**
 * Result of checking a gate condition
 */
export interface GateCheckResult {
    /** Whether the gate check passed */
    passed: boolean;
    /** Gate type that was checked (undefined if phase has no gate) */
    gateType?: string;
    /** Human-readable message (especially on failure) */
    message?: string;
}
/**
 * Context for handoff operations
 */
export interface HandoffContext {
    /** Story ID being worked on */
    storyId: string;
    /** Current workflow name */
    workflowName: string;
    /** Current phase name */
    currentPhase: string;
    /** Session file path */
    sessionFile: string;
}
/**
 * Result of a handoff operation
 */
export interface HandoffResult {
    /** Whether handoff succeeded */
    success: boolean;
    /** Next phase to transition to */
    nextPhase?: string;
    /** Next agent to invoke */
    nextAgent?: string;
    /** Error message if failed */
    error?: string;
}
/**
 * Parameters for formatting phase transition
 */
export interface PhaseTransitionParams {
    workflowName: string;
    fromPhase: string;
    toPhase: string;
    startedAt: string;
    endedAt: string;
    isRejection?: boolean;
}
/**
 * Find a phase by name in a workflow definition
 *
 * @param workflow - The workflow definition to search
 * @param phaseName - Name of the phase to find
 * @returns The phase definition or null if not found
 *
 * @example
 * ```typescript
 * const phase = findCurrentPhase(workflow, 'red');
 * if (phase) {
 *   console.log(`Found phase: ${phase.name}, agent: ${phase.agent}`);
 * }
 * ```
 */
export declare function findCurrentPhase(workflow: WorkflowDefinition, phaseName: string): WorkflowPhase | null;
/**
 * Get the next phase in the workflow
 *
 * For normal progression, returns the next phase in sequence.
 * For rejection (verdict='rejected'), returns the phase to loop back to
 * (typically the most recent phase with a tests_pass gate).
 *
 * @param workflow - The workflow definition
 * @param currentPhaseName - Name of the current phase
 * @param options - Options for handling rejection loops
 * @returns The next phase or null if at end/not found
 *
 * @example
 * ```typescript
 * // Normal progression
 * const next = getNextPhase(workflow, 'red');
 *
 * // Rejection loop
 * const next = getNextPhase(workflow, 'review', { verdict: 'rejected' });
 * ```
 */
export declare function getNextPhase(workflow: WorkflowDefinition, currentPhaseName: string, options?: NextPhaseOptions): WorkflowPhase | null;
/**
 * Check if a gate condition is satisfied
 *
 * Gate types:
 * - tests_fail: testsRed must be true
 * - tests_pass: testsGreen must be true
 * - approval: verdict must be provided (approved or rejected)
 * - manual: always passes
 * - (none): always passes
 *
 * @param workflow - The workflow definition
 * @param phaseName - Name of the phase to check
 * @param context - Gate check context with test results, verdicts, etc.
 * @returns Gate check result
 *
 * @example
 * ```typescript
 * const result = checkGate(workflow, 'red', { testsRed: true });
 * if (result.passed) {
 *   // Proceed with handoff
 * }
 * ```
 */
export declare function checkGate(workflow: WorkflowDefinition, phaseName: string, context: GateContext): GateCheckResult;
/**
 * Format the workflow tracking section for a session file update
 *
 * @param params - Phase transition parameters
 * @returns Markdown string for the workflow tracking section
 *
 * @example
 * ```typescript
 * const markdown = formatPhaseTransition({
 *   workflowName: 'tdd',
 *   fromPhase: 'red',
 *   toPhase: 'green',
 *   startedAt: '2026-01-13T14:00:00Z',
 *   endedAt: '2026-01-13T14:30:00Z'
 * });
 * ```
 */
export declare function formatPhaseTransition(params: PhaseTransitionParams): string;
/**
 * Calculate duration between two ISO 8601 timestamps
 *
 * @param startedAt - Start timestamp
 * @param endedAt - End timestamp
 * @returns Formatted duration string (e.g., "30m", "2h 30m", "45s")
 */
export declare function calculateDuration(startedAt: string, endedAt: string): string;
//# sourceMappingURL=generic-handoff.d.ts.map