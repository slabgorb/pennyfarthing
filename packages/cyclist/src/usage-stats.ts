/**
 * Usage Stats
 *
 * Tracks Claude API usage limits via ccusage CLI.
 * Uses two ccusage commands:
 * - `ccusage weekly` for billing week usage (with account-specific rollover day)
 * - `ccusage blocks --active` for current 5-hour block usage
 */

/**
 * Feature flag: Disable ccusage polling
 * Set to true to disable usage stats polling (ccusage is unreliable)
 */
export const CCUSAGE_DISABLED = true;

import { exec } from 'child_process';
import { promisify } from 'util';
import { getBillingRolloverDay, type BillingDay } from './settings.js';

const execAsync = promisify(exec);

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
 * Current usage stats state
 */
let currentUsageStats: UsageStats = {
  fiveHourPercent: 0,
  weeklyPercent: 0,
  fiveHourResetAt: null,
  weeklyResetAt: null,
  planType: 'unknown',
};

/**
 * Current user email (set from OTEL)
 */
let currentUserEmail: string | null = null;

/**
 * Set the current user email (called when discovered from OTEL)
 */
export function setUserEmail(email: string): void {
  currentUserEmail = email;
}

/**
 * Get current usage stats (for testing and IPC)
 */
export function getUsageStats(): UsageStats {
  return { ...currentUsageStats };
}

/**
 * Update usage stats state and broadcast if changed
 * Returns true if values changed
 */
export function updateUsageStats(stats: UsageStats, broadcast?: (stats: UsageStats) => void): boolean {
  if (
    currentUsageStats.fiveHourPercent === stats.fiveHourPercent &&
    currentUsageStats.weeklyPercent === stats.weeklyPercent
  ) {
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
export function resetUsageStats(broadcast?: (stats: UsageStats) => void): void {
  currentUsageStats = {
    fiveHourPercent: 0,
    weeklyPercent: 0,
    fiveHourResetAt: null,
    weeklyResetAt: null,
    planType: 'unknown',
  };
  currentUserEmail = null;
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
let usagePollTimer: NodeJS.Timeout | null = null;

/**
 * Max tokens for rate limit calculation (Claude Max plan)
 * Empirically derived: ~217M tokens per 5-hour block based on Claude /config display
 */
const MAX_TOKENS_PER_BLOCK = 217_000_000;

/**
 * Weekly limit empirically derived: ~2.85B tokens based on Claude /config display
 */
const WEEKLY_MAX_TOKENS = 2_850_000_000;

/**
 * Exec options for ccusage commands
 * Uses shell and explicit PATH to handle Electron's limited environment
 */
const EXEC_OPTIONS = {
  encoding: 'utf-8' as const,
  timeout: 30000,
  shell: '/bin/zsh',
  env: {
    ...process.env,
    PATH: `${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.nvm/versions/node/v20.18.0/bin`,
  },
};

/**
 * Fetch active 5-hour block stats from ccusage
 */
async function fetchActiveBlock(): Promise<{
  totalTokens: number;
  endTime: string | null;
} | null> {
  try {
    const { stdout } = await execAsync('npx ccusage@latest blocks -O -j --no-color --active', EXEC_OPTIONS);

    if (!stdout || !stdout.trim()) {
      return null;
    }

    const data = JSON.parse(stdout);
    const blocks = data.blocks || [];
    const activeBlock = blocks.find((b: { isActive?: boolean }) => b.isActive);

    if (!activeBlock) {
      return null;
    }

    return {
      totalTokens: activeBlock.totalTokens || 0,
      endTime: activeBlock.endTime || null,
    };
  } catch (error) {
    console.warn('[UsageStats] Failed to fetch active block:', error);
    return null;
  }
}

/**
 * Fetch weekly usage stats from ccusage
 * Uses account-specific billing rollover day
 */
async function fetchWeeklyUsage(rolloverDay: BillingDay): Promise<{
  totalTokens: number;
  weekEnd: string | null;
} | null> {
  try {
    const { stdout } = await execAsync(
      `npx ccusage@latest weekly -O -j --no-color -w ${rolloverDay}`,
      EXEC_OPTIONS
    );

    if (!stdout || !stdout.trim()) {
      return null;
    }

    const data = JSON.parse(stdout);
    const weeks = data.weekly || [];

    // Get the most recent week (current billing period)
    // ccusage returns weeks sorted by date, most recent last
    const currentWeek = weeks[weeks.length - 1];

    if (!currentWeek) {
      return { totalTokens: 0, weekEnd: null };
    }

    // Calculate week end from the rollover day
    const now = new Date();
    const dayMap: Record<BillingDay, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDay = dayMap[rolloverDay];
    const currentDay = now.getUTCDay();
    const daysUntilRollover = (targetDay - currentDay + 7) % 7 || 7;
    const weekEnd = new Date(now);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + daysUntilRollover);
    weekEnd.setUTCHours(0, 0, 0, 0);

    return {
      totalTokens: currentWeek.totalTokens || 0,
      weekEnd: weekEnd.toISOString(),
    };
  } catch (error) {
    console.warn('[UsageStats] Failed to fetch weekly usage:', error);
    return null;
  }
}

/**
 * Fetch usage stats from ccusage CLI
 * Combines weekly and active block data
 */
export async function fetchUsageFromCcusage(): Promise<UsageStats | null> {
  try {
    // Get billing rollover day for current user
    const rolloverDay = getBillingRolloverDay(currentUserEmail);

    // Fetch both in parallel for efficiency
    const [activeBlock, weeklyUsage] = await Promise.all([
      fetchActiveBlock(),
      fetchWeeklyUsage(rolloverDay),
    ]);

    // Calculate 5-hour percentage from active block
    let fiveHourPercent = 0;
    let fiveHourResetAt: string | null = null;

    if (activeBlock) {
      fiveHourPercent = Math.round((activeBlock.totalTokens / MAX_TOKENS_PER_BLOCK) * 100);
      fiveHourResetAt = activeBlock.endTime;
    }

    // Calculate weekly percentage
    let weeklyPercent = 0;
    let weeklyResetAt: string | null = null;

    if (weeklyUsage) {
      weeklyPercent = Math.round((weeklyUsage.totalTokens / WEEKLY_MAX_TOKENS) * 100);
      weeklyResetAt = weeklyUsage.weekEnd;
    }

    return {
      fiveHourPercent: Math.min(fiveHourPercent, 100),
      weeklyPercent: Math.min(weeklyPercent, 100),
      fiveHourResetAt,
      weeklyResetAt,
      planType: 'max',
    };
  } catch (error) {
    console.warn('[UsageStats] Failed to fetch from ccusage:', error);
    return null;
  }
}

/**
 * Start polling usage stats
 * Uses ccusage CLI to read local JSONL files for usage data
 */
export function startUsagePolling(
  _projectDir: string,
  broadcast: (stats: UsageStats) => void
): () => void {
  // Feature flag check - skip polling if disabled
  if (CCUSAGE_DISABLED) {
    console.log('[UsageStats] ccusage polling disabled via feature flag');
    return () => {}; // Return no-op cleanup
  }

  // Initial fetch with error handling
  fetchUsageFromCcusage()
    .then((stats) => {
      if (stats) {
        updateUsageStats(stats, broadcast);
        console.log('[UsageStats] Initial fetch:', stats.fiveHourPercent + '% (5hr),', stats.weeklyPercent + '% (weekly)');
      } else {
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
    } catch (err) {
      console.warn('[UsageStats] Poll failed:', (err as Error)?.message || err);
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
