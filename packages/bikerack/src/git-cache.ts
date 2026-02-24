/**
 * Git Status Cache
 *
 * Caches git status to prevent lock conflicts from frequent polling.
 * Cache is invalidated on PostToolUse events (via OTLP receiver), not on
 * .git/index file changes which cause race conditions with Claude's git ops.
 *
 * Story: Interactive Debug Session - Git Lock Fix
 */

import { getAllReposGitInfoAsync, type RepoGitInfo } from './api/git.js';

// Cache state
interface GitCacheState {
  repos: RepoGitInfo[];
  stale: boolean;
  lastFetch: number;
  fetchPromise: Promise<RepoGitInfo[]> | null;
}

// Per-project cache (keyed by projectDir)
const caches = new Map<string, GitCacheState>();

// Debounce timer for refresh after invalidation
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Track when invalidation started (for max delay enforcement)
const invalidationStartTimes = new Map<string, number>();

// Callbacks for when cache refreshes (used by WebSocket broadcast)
type RefreshCallback = (repos: RepoGitInfo[]) => void;
const refreshCallbacks = new Set<RefreshCallback>();

// Configuration — tighter timings now that reads use --no-optional-locks (lock-free)
const REFRESH_DELAY_MS = 500; // Wait after invalidation before reading status
const MAX_INVALIDATION_DELAY_MS = 3000; // Force refresh after this time even if events keep coming
const STALE_THRESHOLD_MS = 5000; // Force refresh if cache older than 5s (Story 121-4)
const POLL_INTERVAL_MS = 5000; // Periodic polling interval when clients are connected (Story 121-4)

/**
 * Get or create cache state for a project
 */
function getOrCreateCache(projectDir: string): GitCacheState {
  let cache = caches.get(projectDir);
  if (!cache) {
    cache = {
      repos: [],
      stale: true,
      lastFetch: 0,
      fetchPromise: null,
    };
    caches.set(projectDir, cache);
  }
  return cache;
}

/**
 * Get git status, using cache if available and not stale
 * Deduplicates concurrent requests to prevent lock conflicts
 */
export async function getCachedGitStatus(projectDir: string): Promise<RepoGitInfo[]> {
  const cache = getOrCreateCache(projectDir);
  const now = Date.now();

  // If cache is fresh and not stale, return it
  if (!cache.stale && cache.repos.length > 0 && (now - cache.lastFetch) < STALE_THRESHOLD_MS) {
    return cache.repos;
  }

  // If a fetch is already in progress, wait for it (dedup)
  if (cache.fetchPromise) {
    return cache.fetchPromise;
  }

  // Start a new fetch
  cache.fetchPromise = (async () => {
    try {
      console.log('[GitCache] Fetching git status for', projectDir);
      const repos = await getAllReposGitInfoAsync(projectDir);
      console.log('[GitCache] Got', repos.length, 'repos:', repos.map(r => `${r.name}(clean=${r.clean})`).join(', '));
      cache.repos = repos;
      cache.stale = false;
      cache.lastFetch = Date.now();

      // Notify listeners
      console.log('[GitCache] Notifying', refreshCallbacks.size, 'callbacks');
      for (const callback of refreshCallbacks) {
        try {
          callback(repos);
        } catch (err) {
          console.error('[GitCache] Refresh callback error:', err);
        }
      }

      return repos;
    } finally {
      cache.fetchPromise = null;
    }
  })();

  return cache.fetchPromise;
}

/**
 * Invalidate the cache (mark as stale)
 * Does NOT immediately fetch - waits for REFRESH_DELAY_MS to batch invalidations
 */
export function invalidateGitCache(projectDir: string): void {
  console.log('[GitCache] invalidateGitCache called for:', projectDir);
  const cache = getOrCreateCache(projectDir);
  cache.stale = true;

  const now = Date.now();

  // Track when this invalidation sequence started
  // (only set if not already tracking - prevents resetting on each event)
  if (!invalidationStartTimes.has(projectDir)) {
    invalidationStartTimes.set(projectDir, now);
    console.log('[GitCache] Started new invalidation sequence');
  }

  // Clear any existing refresh timer
  const existingTimer = refreshTimers.get(projectDir);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Calculate delay: use normal debounce, but cap at max delay from first invalidation
  const invalidationStart = invalidationStartTimes.get(projectDir)!;
  const timeSinceStart = now - invalidationStart;
  const remainingMaxDelay = Math.max(0, MAX_INVALIDATION_DELAY_MS - timeSinceStart);
  const actualDelay = Math.min(REFRESH_DELAY_MS, remainingMaxDelay);

  // If we've hit the max delay, refresh immediately
  if (actualDelay === 0) {
    console.log('[GitCache] Max delay reached, forcing immediate refresh');
    invalidationStartTimes.delete(projectDir);
    refreshTimers.delete(projectDir);
    if (refreshCallbacks.size > 0) {
      console.log('[GitCache] Triggering refresh, callbacks registered:', refreshCallbacks.size);
      getCachedGitStatus(projectDir).catch(err => {
        console.error('[GitCache] Max delay refresh error:', err);
      });
    } else {
      console.log('[GitCache] No refresh callbacks registered, skipping refresh');
    }
    return;
  }

  // Schedule a debounced refresh
  console.log('[GitCache] Scheduling debounced refresh in', actualDelay, 'ms');
  const timer = setTimeout(async () => {
    console.log('[GitCache] Debounce timer fired');
    refreshTimers.delete(projectDir);
    invalidationStartTimes.delete(projectDir);
    // Only refresh if there are listeners (WebSocket clients)
    if (refreshCallbacks.size > 0) {
      console.log('[GitCache] Triggering refresh, callbacks registered:', refreshCallbacks.size);
      try {
        await getCachedGitStatus(projectDir);
        console.log('[GitCache] Refresh complete');
      } catch (err) {
        console.error('[GitCache] Debounced refresh error:', err);
      }
    } else {
      console.log('[GitCache] No refresh callbacks registered, skipping refresh');
    }
  }, actualDelay);

  refreshTimers.set(projectDir, timer);
}

/**
 * Force an immediate refresh (used for branch switches via .git/HEAD watcher)
 */
export async function forceRefreshGitCache(projectDir: string): Promise<RepoGitInfo[]> {
  const cache = getOrCreateCache(projectDir);
  cache.stale = true;

  // Clear any pending debounced refresh and invalidation tracking
  const existingTimer = refreshTimers.get(projectDir);
  if (existingTimer) {
    clearTimeout(existingTimer);
    refreshTimers.delete(projectDir);
  }
  invalidationStartTimes.delete(projectDir);

  return getCachedGitStatus(projectDir);
}


/**
 * Register a callback to be notified when cache refreshes
 * Returns unsubscribe function
 */
export function onGitCacheRefresh(callback: RefreshCallback): () => void {
  refreshCallbacks.add(callback);
  return () => refreshCallbacks.delete(callback);
}

/**
 * Get current cached value without triggering refresh (for initial connection)
 * Returns empty array if no cache exists
 */
export function getCachedGitStatusSync(projectDir: string): RepoGitInfo[] {
  const cache = caches.get(projectDir);
  return cache?.repos ?? [];
}

/**
 * Check if cache exists and is reasonably fresh
 */
export function hasFreshCache(projectDir: string): boolean {
  const cache = caches.get(projectDir);
  if (!cache || cache.stale || cache.repos.length === 0) {
    return false;
  }
  return (Date.now() - cache.lastFetch) < STALE_THRESHOLD_MS;
}

// Periodic polling timer reference
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic git status polling as a safety net.
 * Catches working tree changes that don't trigger .git/ file watchers
 * (e.g., file edits without git add) and missed OTLP events.
 * Only refreshes when the cache is stale (age-based), so cost is minimal
 * when event-driven invalidation is already working.
 * Story 121-4
 *
 * @param getProjectDir Function to get current project directory
 * @param hasClients Function that returns true when git WS clients are connected
 */
export function startPeriodicPoll(
  getProjectDir: () => string,
  hasClients: () => boolean,
): void {
  if (pollTimer) return; // Already running

  pollTimer = setInterval(async () => {
    if (!hasClients()) return;

    const projectDir = getProjectDir();
    if (!hasFreshCache(projectDir)) {
      try {
        await getCachedGitStatus(projectDir);
      } catch (err) {
        console.error('[GitCache] Periodic poll error:', err);
      }
    }
  }, POLL_INTERVAL_MS);

  console.log('[GitCache] Periodic polling started (every', POLL_INTERVAL_MS / 1000, 's)');
}
