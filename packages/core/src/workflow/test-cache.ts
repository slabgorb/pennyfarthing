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
export const DEFAULT_CACHE_MAX_AGE_MINUTES = 5;

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
export function parseTestCache(sessionContent: string): TestCacheEntry | null {
  // Find the Test Cache section
  const cacheMatch = sessionContent.match(
    /## Test Cache\s*\n\s*\|[^\n]+\|\s*\n\s*\|[-|\s]+\|\s*\n((?:\|[^\n]+\|\s*\n?)+)/i
  );

  if (!cacheMatch) {
    return null;
  }

  const tableContent = cacheMatch[1];
  const rows = tableContent.trim().split('\n');

  // Parse table rows into key-value map
  const values: Record<string, string> = {};
  for (const row of rows) {
    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 2) {
      values[cells[0].toLowerCase()] = cells[1];
    }
  }

  // Validate required fields
  const lastRun = values['last run'];
  const gitSha = values['git sha'];
  const result = values['result'];
  const passStr = values['pass'];
  const failStr = values['fail'];
  const durationStr = values['duration'];

  if (!lastRun || !gitSha || !result || !passStr || !failStr || !durationStr) {
    return null;
  }

  // Parse result enum
  const resultUpper = result.toUpperCase();
  if (resultUpper !== 'GREEN' && resultUpper !== 'RED' && resultUpper !== 'YELLOW') {
    return null;
  }

  // Parse duration (e.g., "36s" -> 36)
  const durationMatch = durationStr.match(/^(\d+)s?$/);
  if (!durationMatch) {
    return null;
  }

  const entry: TestCacheEntry = {
    lastRun,
    gitSha,
    result: resultUpper as 'GREEN' | 'RED' | 'YELLOW',
    passCount: parseInt(passStr, 10),
    failCount: parseInt(failStr, 10),
    durationSeconds: parseInt(durationMatch[1], 10)
  };

  // Parse optional skip count
  const skipStr = values['skip'];
  if (skipStr) {
    entry.skipCount = parseInt(skipStr, 10);
  }

  return entry;
}

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
export function validateTestCache(
  sessionContent: string,
  options: CacheValidationOptions
): CacheValidationResult {
  const entry = parseTestCache(sessionContent);

  if (!entry) {
    return {
      valid: false,
      reason: 'No test cache found in session file'
    };
  }

  // Check git SHA
  if (entry.gitSha !== options.currentGitSha) {
    return {
      valid: false,
      reason: `Code changed since last test run (cache: ${entry.gitSha.slice(0, 7)}, current: ${options.currentGitSha.slice(0, 7)})`,
      entry
    };
  }

  // Check age
  const maxAge = options.maxAgeMinutes ?? DEFAULT_CACHE_MAX_AGE_MINUTES;
  const currentTime = options.currentTime ?? new Date();
  const cacheTime = new Date(entry.lastRun);

  if (isNaN(cacheTime.getTime())) {
    return {
      valid: false,
      reason: 'Invalid timestamp in cache',
      entry
    };
  }

  const ageMinutes = (currentTime.getTime() - cacheTime.getTime()) / (1000 * 60);

  if (ageMinutes > maxAge) {
    return {
      valid: false,
      reason: `Cache too old (${Math.round(ageMinutes)}m > ${maxAge}m limit)`,
      entry
    };
  }

  return {
    valid: true,
    reason: `Valid cache: ${entry.result} (${entry.passCount} pass, ${entry.failCount} fail) from ${Math.round(ageMinutes)}m ago`,
    entry
  };
}

/**
 * Format test results as markdown table for session file
 *
 * @param entry - Test cache entry to format
 * @returns Markdown string for Test Cache section
 */
export function formatTestCache(entry: TestCacheEntry): string {
  const lines = [
    '## Test Cache',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Last Run | ${entry.lastRun} |`,
    `| Git SHA | ${entry.gitSha} |`,
    `| Result | ${entry.result} |`,
    `| Pass | ${entry.passCount} |`,
    `| Fail | ${entry.failCount} |`
  ];

  if (entry.skipCount !== undefined) {
    lines.push(`| Skip | ${entry.skipCount} |`);
  }

  lines.push(`| Duration | ${entry.durationSeconds}s |`);

  return lines.join('\n');
}

/**
 * Create a cache entry from test results
 *
 * @param results - Test run results
 * @param gitSha - Current git SHA
 * @param timestamp - Optional timestamp (default: now)
 * @returns Cache entry ready for formatting
 */
export function createTestCacheEntry(
  results: {
    passCount: number;
    failCount: number;
    skipCount?: number;
    durationSeconds: number;
  },
  gitSha: string,
  timestamp?: Date
): TestCacheEntry {
  const time = timestamp ?? new Date();

  // Determine result status
  let result: 'GREEN' | 'RED' | 'YELLOW';
  if (results.failCount > 0) {
    result = 'RED';
  } else if (results.skipCount && results.skipCount > 0) {
    result = 'YELLOW';
  } else {
    result = 'GREEN';
  }

  return {
    lastRun: time.toISOString(),
    gitSha,
    result,
    passCount: results.passCount,
    failCount: results.failCount,
    skipCount: results.skipCount,
    durationSeconds: results.durationSeconds
  };
}

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
export function shouldSkipTests(
  sessionContent: string,
  currentGitSha: string,
  maxAgeMinutes?: number
): { skip: boolean; reason: string; cachedResult?: 'GREEN' | 'RED' | 'YELLOW' } {
  const validation = validateTestCache(sessionContent, {
    currentGitSha,
    maxAgeMinutes
  });

  if (validation.valid && validation.entry) {
    return {
      skip: true,
      reason: validation.reason,
      cachedResult: validation.entry.result
    };
  }

  return {
    skip: false,
    reason: validation.reason
  };
}
