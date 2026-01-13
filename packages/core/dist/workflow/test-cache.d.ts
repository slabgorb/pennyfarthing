/**
 * Test Result Caching
 *
 * Story 31-8: Eliminate redundant test runs in subagents by caching
 * test results in the session file with git SHA validation.
 *
 * Multiple subagents independently run the full test suite during
 * a single TDD cycle, wasting ~70-110 seconds per story:
 * - reviewer-preflight runs tests (~36s)
 * - dev-handoff runs tests via quality gate (~36s)
 * - reviewer-handoff-approve could run tests (~36s)
 *
 * This module provides functions to:
 * - Parse test cache from session file markdown
 * - Validate cache freshness (timestamp + git SHA)
 * - Format test results for session file caching
 */
/**
 * Cached test result data
 */
export interface TestCacheEntry {
    /** ISO 8601 timestamp of last test run */
    lastRun: string;
    /** Git commit SHA at time of test run */
    gitSha: string;
    /** Overall result: GREEN (all pass), RED (failures), YELLOW (pass with skips) */
    result: 'GREEN' | 'RED' | 'YELLOW';
    /** Number of passing tests */
    passCount: number;
    /** Number of failing tests */
    failCount: number;
    /** Number of skipped tests */
    skipCount?: number;
    /** Test run duration in seconds */
    durationSeconds: number;
}
/**
 * Result of cache validation
 */
export interface CacheValidationResult {
    /** Whether cached result can be used */
    valid: boolean;
    /** Reason for validity/invalidity */
    reason: string;
    /** Cached entry if found */
    entry?: TestCacheEntry;
}
/**
 * Options for cache validation
 */
export interface CacheValidationOptions {
    /** Maximum age in minutes (default: 5) */
    maxAgeMinutes?: number;
    /** Current git SHA to compare against cache */
    currentGitSha: string;
    /** Current timestamp for age check (default: now) */
    currentTime?: Date;
}
/**
 * Default cache validity duration in minutes
 */
export declare const DEFAULT_CACHE_MAX_AGE_MINUTES = 5;
/**
 * Parse test cache from session file content
 *
 * Looks for a "## Test Cache" section with a markdown table containing:
 * | Field | Value |
 * |-------|-------|
 * | Last Run | {timestamp} |
 * | Git SHA | {sha} |
 * | Result | {GREEN/RED/YELLOW} |
 * | Pass | {count} |
 * | Fail | {count} |
 * | Skip | {count} |
 * | Duration | {seconds}s |
 *
 * @param sessionContent - Full content of session file
 * @returns Parsed cache entry or null if not found/invalid
 */
export declare function parseTestCache(sessionContent: string): TestCacheEntry | null;
/**
 * Validate cached test results
 *
 * Cache is valid if:
 * 1. Cache entry exists
 * 2. Git SHA matches current HEAD
 * 3. Timestamp is less than maxAgeMinutes old
 *
 * @param sessionContent - Full content of session file
 * @param options - Validation options
 * @returns Validation result with reason
 */
export declare function validateTestCache(sessionContent: string, options: CacheValidationOptions): CacheValidationResult;
/**
 * Format test results as markdown table for session file
 *
 * @param entry - Test cache entry to format
 * @returns Markdown string for Test Cache section
 */
export declare function formatTestCache(entry: TestCacheEntry): string;
/**
 * Create a cache entry from test results
 *
 * @param results - Test run results
 * @param gitSha - Current git SHA
 * @param timestamp - Optional timestamp (default: now)
 * @returns Cache entry ready for formatting
 */
export declare function createTestCacheEntry(results: {
    passCount: number;
    failCount: number;
    skipCount?: number;
    durationSeconds: number;
}, gitSha: string, timestamp?: Date): TestCacheEntry;
/**
 * Check if tests should be skipped based on cache
 *
 * Convenience function that combines validation and provides
 * a simple boolean result for subagent decision-making.
 *
 * @param sessionContent - Full content of session file
 * @param currentGitSha - Current git SHA
 * @param maxAgeMinutes - Maximum cache age (default: 5)
 * @returns Object with skip decision and reason
 */
export declare function shouldSkipTests(sessionContent: string, currentGitSha: string, maxAgeMinutes?: number): {
    skip: boolean;
    reason: string;
    cachedResult?: 'GREEN' | 'RED' | 'YELLOW';
};
//# sourceMappingURL=test-cache.d.ts.map