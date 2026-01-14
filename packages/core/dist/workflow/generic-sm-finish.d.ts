/**
 * Generic SM Finish - Combines finish-bookkeeping + finish-execution
 *
 * Story 31-11: Consolidate SM bookkeeping subagents
 *
 * This module provides two phases:
 * 1. Preflight: PR check, lint fix, Jira status → JSON report
 * 2. Execute: Archive, Jira transition, cleanup → completion flags
 *
 * TODO: Dev will implement the logic to pass the tests
 */
/**
 * Issue found during preflight
 */
export interface PreflightIssue {
    type: 'critical' | 'warning' | 'info';
    message: string;
    field?: string;
}
/**
 * Acceptance criteria status
 */
export interface AcceptanceCriteriaStatus {
    total: number;
    checked: number;
    complete: boolean;
}
/**
 * Preflight result - JSON report of readiness checks
 */
export interface PreflightResult {
    prStatus: Record<string, 'merged' | 'open' | 'NO_PR'>;
    lintStatus: Record<string, 'clean' | 'fixed' | 'failed'>;
    jiraStatus?: string;
    acceptanceCriteria: AcceptanceCriteriaStatus;
    readyToFinish: boolean;
    issues: PreflightIssue[];
    warnings?: string[];
}
/**
 * Execute result - completion flags
 */
export interface ExecuteResult {
    success: boolean;
    archived: boolean;
    sessionCleared: boolean;
    archivePath?: string;
    summaryPath?: string;
    error?: string;
}
/**
 * Preflight check parameters
 */
export interface PreflightParams {
    storyId: string;
    repos: string;
    branch: string;
    jiraKey?: string;
    projectRoot: string;
    _mockPrStatus?: 'merged' | 'open' | 'NO_PR';
}
/**
 * Execute finish parameters
 */
export interface ExecuteParams {
    storyId: string;
    storyTitle: string;
    sessionDir: string;
    archiveDir: string;
    contextDir?: string;
    summaryContent: string;
}
/**
 * Run preflight checks before finishing a story
 *
 * Checks PR status, lint status, Jira readiness, and acceptance criteria.
 * Returns a JSON report for SM to evaluate.
 *
 * @param params - Preflight parameters
 * @returns Preflight result with status and issues
 */
export declare function preflightCheck(params: PreflightParams): Promise<PreflightResult>;
/**
 * Execute finish steps after SM approval
 *
 * Archives session file, writes summary, cleans up.
 * Returns completion flags.
 *
 * @param params - Execute parameters
 * @returns Execute result with completion flags
 */
export declare function executeFinish(params: ExecuteParams): Promise<ExecuteResult>;
//# sourceMappingURL=generic-sm-finish.d.ts.map