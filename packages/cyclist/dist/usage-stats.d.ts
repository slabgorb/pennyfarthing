/**
 * Usage Stats
 *
 * Tracks Claude API usage limits via ccusage CLI.
 * Extracted from main.ts for better maintainability.
 */
/**
 * Usage stats structure - tracks Claude API usage limits
 */
export interface UsageStats {
    fiveHourPercent: number;
    weeklyPercent: number;
    fiveHourResetAt: string | null;
    weeklyResetAt: string | null;
    planType: 'pro' | 'max' | 'unknown';
}
/**
 * Get current usage stats (for testing and IPC)
 */
export declare function getUsageStats(): UsageStats;
/**
 * Update usage stats state and broadcast if changed
 * Returns true if values changed
 */
export declare function updateUsageStats(stats: UsageStats, broadcast?: (stats: UsageStats) => void): boolean;
/**
 * Reset usage stats to default values
 */
export declare function resetUsageStats(broadcast?: (stats: UsageStats) => void): void;
/**
 * Usage polling interval in milliseconds
 * 60 seconds is reasonable for usage data that changes slowly
 */
export declare const USAGE_POLL_INTERVAL_MS = 60000;
/**
 * Fetch usage stats from ccusage CLI
 * Uses local JSONL files to calculate 5-hour and weekly usage
 */
export declare function fetchUsageFromCcusage(): Promise<UsageStats | null>;
/**
 * Start polling usage stats
 * Uses ccusage CLI to read local JSONL files for usage data
 */
export declare function startUsagePolling(_projectDir: string, broadcast: (stats: UsageStats) => void): () => void;
//# sourceMappingURL=usage-stats.d.ts.map