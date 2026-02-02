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

// Callbacks for when cache refreshes (used by WebSocket broadcast)
type RefreshCallback = (repos: RepoGitInfo[]) => void;
const refreshCallbacks = new Set<RefreshCallback>();

// Configuration
const REFRESH_DELAY_MS = 1500; // Wait after invalidation before fetching
const STALE_THRESHOLD_MS = 30000; // Force refresh if cache older than 30s

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
      const repos = await getAllReposGitInfoAsync(projectDir);
      cache.repos = repos;
      cache.stale = false;
      cache.lastFetch = Date.now();

      // Notify listeners
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
  const cache = getOrCreateCache(projectDir);
  cache.stale = true;

  // Clear any existing refresh timer
  const existingTimer = refreshTimers.get(projectDir);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Schedule a debounced refresh
  const timer = setTimeout(async () => {
    refreshTimers.delete(projectDir);
    // Only refresh if there are listeners (WebSocket clients)
    if (refreshCallbacks.size > 0) {
      try {
        await getCachedGitStatus(projectDir);
      } catch (err) {
        console.error('[GitCache] Debounced refresh error:', err);
      }
    }
  }, REFRESH_DELAY_MS);

  refreshTimers.set(projectDir, timer);
}

/**
 * Force an immediate refresh (used for branch switches via .git/HEAD watcher)
 */
export async function forceRefreshGitCache(projectDir: string): Promise<RepoGitInfo[]> {
  const cache = getOrCreateCache(projectDir);
  cache.stale = true;

  // Clear any pending debounced refresh
  const existingTimer = refreshTimers.get(projectDir);
  if (existingTimer) {
    clearTimeout(existingTimer);
    refreshTimers.delete(projectDir);
  }

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
