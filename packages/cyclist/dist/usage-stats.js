/**
 * Usage Stats
 *
 * Tracks Claude API usage limits via ccusage CLI.
 * Extracted from main.ts for better maintainability.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
/**
 * Current usage stats state
 */
let currentUsageStats = {
    fiveHourPercent: 0,
    weeklyPercent: 0,
    fiveHourResetAt: null,
    weeklyResetAt: null,
    planType: 'unknown',
};
/**
 * Get current usage stats (for testing and IPC)
 */
export function getUsageStats() {
    return { ...currentUsageStats };
}
/**
 * Update usage stats state and broadcast if changed
 * Returns true if values changed
 */
export function updateUsageStats(stats, broadcast) {
    if (currentUsageStats.fiveHourPercent === stats.fiveHourPercent &&
        currentUsageStats.weeklyPercent === stats.weeklyPercent) {
        return false;
    }
    currentUsageStats = { ...stats };
    if (broadcast) {
        broadcast(currentUsageStats);
    }
    return true;
}
/**
 * Reset usage stats to default values
 */
export function resetUsageStats(broadcast) {
    currentUsageStats = {
        fiveHourPercent: 0,
        weeklyPercent: 0,
        fiveHourResetAt: null,
        weeklyResetAt: null,
        planType: 'unknown',
    };
    if (broadcast) {
        broadcast(currentUsageStats);
    }
}
/**
 * Usage polling interval in milliseconds
 * 60 seconds is reasonable for usage data that changes slowly
 */
export const USAGE_POLL_INTERVAL_MS = 60000;
/**
 * Timer reference for usage polling
 */
let usagePollTimer = null;
/**
 * Max tokens for rate limit calculation (Claude Max plan)
 * Empirically derived: ~217M tokens per 5-hour block based on Claude /config display
 */
const MAX_TOKENS_PER_BLOCK = 217_000_000;
/**
 * Fetch usage stats from ccusage CLI
 * Uses local JSONL files to calculate 5-hour and weekly usage
 */
export async function fetchUsageFromCcusage() {
    try {
        // Run ccusage blocks --json asynchronously to avoid blocking main process
        // Use shell: true and explicit PATH to handle Electron's limited environment
        const { stdout: output } = await execAsync('npx ccusage@latest blocks --json --offline', {
            encoding: 'utf-8',
            timeout: 30000,
            shell: '/bin/zsh',
            env: {
                ...process.env,
                PATH: `${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.nvm/versions/node/v20.18.0/bin`,
            },
        });
        if (!output || !output.trim()) {
            console.warn('[UsageStats] Empty output from ccusage');
            return null;
        }
        const data = JSON.parse(output);
        const blocks = data.blocks || [];
        // Find the active block (current 5-hour window)
        const activeBlock = blocks.find((b) => b.isActive);
        // Calculate 5-hour percentage from active block
        let fiveHourPercent = 0;
        let fiveHourResetAt = null;
        if (activeBlock) {
            fiveHourPercent = Math.round((activeBlock.totalTokens / MAX_TOKENS_PER_BLOCK) * 100);
            fiveHourResetAt = activeBlock.endTime || null;
        }
        // Calculate weekly usage from last 7 days of blocks
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Sum tokens from blocks in the last 7 days
        let weeklyTokens = 0;
        for (const block of blocks) {
            const blockStart = new Date(block.startTime);
            if (blockStart >= weekAgo) {
                weeklyTokens += block.totalTokens || 0;
            }
        }
        // Weekly limit empirically derived: ~2.85B tokens based on Claude /config display
        const weeklyMaxTokens = 2_850_000_000;
        const weeklyPercent = Math.round((weeklyTokens / weeklyMaxTokens) * 100);
        // Weekly reset is end of current week (Sunday midnight UTC)
        const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
        const weeklyReset = new Date(now);
        weeklyReset.setUTCDate(weeklyReset.getUTCDate() + daysUntilSunday);
        weeklyReset.setUTCHours(0, 0, 0, 0);
        return {
            fiveHourPercent: Math.min(fiveHourPercent, 100),
            weeklyPercent: Math.min(weeklyPercent, 100),
            fiveHourResetAt,
            weeklyResetAt: weeklyReset.toISOString(),
            planType: 'max',
        };
    }
    catch (error) {
        console.warn('[UsageStats] Failed to fetch from ccusage:', error);
        return null;
    }
}
/**
 * Start polling usage stats
 * Uses ccusage CLI to read local JSONL files for usage data
 */
export function startUsagePolling(_projectDir, broadcast) {
    // Initial fetch with error handling
    fetchUsageFromCcusage()
        .then((stats) => {
        if (stats) {
            updateUsageStats(stats, broadcast);
            console.log('[UsageStats] Initial fetch:', stats.fiveHourPercent + '% (5hr),', stats.weeklyPercent + '% (weekly)');
        }
        else {
            console.log('[UsageStats] Initial fetch: no data available');
        }
    })
        .catch((err) => {
        console.warn('[UsageStats] Initial fetch failed:', err?.message || err);
    });
    // Set up polling interval with error handling
    usagePollTimer = setInterval(async () => {
        try {
            const stats = await fetchUsageFromCcusage();
            if (stats) {
                updateUsageStats(stats, broadcast);
            }
        }
        catch (err) {
            console.warn('[UsageStats] Poll failed:', err?.message || err);
        }
    }, USAGE_POLL_INTERVAL_MS);
    console.log('[UsageStats] Polling started (every', USAGE_POLL_INTERVAL_MS / 1000, 's)');
    // Return cleanup function
    return () => {
        if (usagePollTimer) {
            clearInterval(usagePollTimer);
            usagePollTimer = null;
            console.log('[UsageStats] Polling stopped');
        }
    };
}
//# sourceMappingURL=usage-stats.js.map