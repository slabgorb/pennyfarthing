/**
 * Git Diff Cache
 *
 * Caches git diff output to provide file diffs without relying on OTEL tool correlation.
 * Uses the same debounce/backoff pattern as git-cache.ts.
 *
 * Story: MSSCI-14238 - Replace OTEL-based diff extraction with git commands
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { getReposFromConfig } from './api/git.js';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export interface GitDiffData {
  path: string;
  diff: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  timestamp: number;
}

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  oldPath?: string;
}

interface DiffCacheState {
  diffs: GitDiffData[];
  stale: boolean;
  lastFetch: number;
  fetchPromise: Promise<GitDiffData[]> | null;
}

interface ToolEvent {
  toolName: string;
  status?: string;
  success?: boolean;
  toolInput?: {
    command?: string;
    file_path?: string;
  };
  input?: string;
}

// =============================================================================
// Configuration (same as git-cache.ts)
// =============================================================================

export const REFRESH_DELAY_MS = 1500;
export const MAX_INVALIDATION_DELAY_MS = 5000;
const STALE_THRESHOLD_MS = 30000;

// =============================================================================
// State
// =============================================================================

const caches = new Map<string, DiffCacheState>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const invalidationStartTimes = new Map<string, number>();

type RefreshCallback = (diffs: GitDiffData[]) => void;
const refreshCallbacks = new Set<RefreshCallback>();

// =============================================================================
// Git Status Parsing (AC1)
// =============================================================================

/**
 * Parse git status --porcelain output into file list
 */
export function getChangedFilesFromGitStatus(porcelainOutput: string): ChangedFile[] {
  if (!porcelainOutput.trim()) {
    return [];
  }

  const files: ChangedFile[] = [];
  const lines = porcelainOutput.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Git porcelain format: XY filename
    // X = index status, Y = working tree status
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const rest = line.substring(3);

    // Handle renamed files: R  old-name.ts -> new-name.ts
    if (indexStatus === 'R' || workTreeStatus === 'R') {
      const match = rest.match(/^(.+)\s+->\s+(.+)$/);
      if (match) {
        files.push({
          path: match[2],
          status: 'renamed',
          oldPath: match[1]
        });
      }
      continue;
    }

    // Handle untracked files
    if (indexStatus === '?' && workTreeStatus === '?') {
      files.push({ path: rest, status: 'untracked' });
      continue;
    }

    // Handle deleted files
    if (indexStatus === 'D' || workTreeStatus === 'D') {
      files.push({ path: rest, status: 'deleted' });
      continue;
    }

    // Handle added files (new in index)
    if (indexStatus === 'A') {
      files.push({ path: rest, status: 'added' });
      continue;
    }

    // Handle modified files
    if (indexStatus === 'M' || workTreeStatus === 'M') {
      files.push({ path: rest, status: 'modified' });
      continue;
    }

    // Catch-all for other modifications
    if (indexStatus !== ' ' || workTreeStatus !== ' ') {
      files.push({ path: rest, status: 'modified' });
    }
  }

  return files;
}

// =============================================================================
// Git Diff Parsing (AC2)
// =============================================================================

/**
 * Parse a single git diff output into GitDiffData
 */
export function parseGitDiff(gitDiffOutput: string): GitDiffData {
  const lines = gitDiffOutput.split('\n');

  // Extract file path from "diff --git a/path b/path"
  let path = '';
  const diffLine = lines.find(l => l.startsWith('diff --git'));
  if (diffLine) {
    const match = diffLine.match(/diff --git a\/(.+) b\/(.+)/);
    if (match) {
      path = match[2];
    }
  }

  // Determine status
  let status: GitDiffData['status'] = 'modified';
  if (lines.some(l => l.startsWith('new file mode'))) {
    status = 'added';
  } else if (lines.some(l => l.startsWith('deleted file mode'))) {
    status = 'deleted';
  } else if (lines.some(l => l.startsWith('rename from'))) {
    status = 'renamed';
  }

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return {
    path,
    diff: gitDiffOutput,
    status,
    additions,
    deletions,
    timestamp: Date.now()
  };
}

/**
 * Parse multiple diffs from git diff output (may contain multiple files)
 */
function parseMultipleDiffs(output: string): GitDiffData[] {
  if (!output.trim()) {
    return [];
  }

  // Split on "diff --git" but keep the delimiter
  const parts = output.split(/(?=diff --git)/);
  const diffs: GitDiffData[] = [];

  for (const part of parts) {
    if (part.trim() && part.startsWith('diff --git')) {
      diffs.push(parseGitDiff(part));
    }
  }

  return diffs;
}

/**
 * Get diff for a specific file
 * Handles repo-prefixed paths (e.g., "pennyfarthing/src/file.ts")
 */
export async function getGitDiffForFile(projectDir: string, filePath: string): Promise<GitDiffData> {
  try {
    const repos = getReposFromConfig(projectDir);
    let repoPath = projectDir;
    let relativeFilePath = filePath;

    // Check if filePath has a repo prefix (multi-repo case)
    if (repos.length > 1) {
      for (const repo of repos) {
        if (filePath.startsWith(`${repo.name}/`)) {
          repoPath = join(projectDir, repo.path);
          relativeFilePath = filePath.substring(repo.name.length + 1);
          break;
        }
      }
    }

    const { stdout } = await execAsync(`git diff HEAD -- "${relativeFilePath}"`, {
      cwd: repoPath,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
    });

    if (!stdout.trim()) {
      // No diff - file might be untracked or unchanged
      return {
        path: filePath,
        diff: '',
        status: 'modified',
        additions: 0,
        deletions: 0,
        timestamp: Date.now()
      };
    }

    const diff = parseGitDiff(stdout);
    diff.path = filePath; // Preserve the prefixed path
    return diff;
  } catch (err) {
    console.error('[GitDiff] Error getting diff for file:', filePath, err);
    return {
      path: filePath,
      diff: '',
      status: 'modified',
      additions: 0,
      deletions: 0,
      timestamp: Date.now()
    };
  }
}

/**
 * Get all diffs using git diff HEAD across all configured repos
 */
export async function getAllGitDiffs(projectDir: string): Promise<GitDiffData[]> {
  const repos = getReposFromConfig(projectDir);
  const allDiffs: GitDiffData[] = [];

  for (const repo of repos) {
    try {
      const repoPath = join(projectDir, repo.path);
      const { stdout } = await execAsync('git diff HEAD', {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const diffs = parseMultipleDiffs(stdout);

      // Prefix paths with repo name when multiple repos
      if (repos.length > 1) {
        for (const diff of diffs) {
          diff.path = `${repo.name}/${diff.path}`;
        }
      }

      allDiffs.push(...diffs);
    } catch (err) {
      console.error('[GitDiff] Error getting diffs for repo:', repo.name, err);
    }
  }

  return allDiffs;
}

// =============================================================================
// Cache Management (AC3, AC5)
// =============================================================================

function getOrCreateCache(projectDir: string): DiffCacheState {
  let cache = caches.get(projectDir);
  if (!cache) {
    cache = {
      diffs: [],
      stale: true,
      lastFetch: 0,
      fetchPromise: null
    };
    caches.set(projectDir, cache);
  }
  return cache;
}

/**
 * Get cached diffs, fetching if stale
 */
async function getCachedDiffs(projectDir: string): Promise<GitDiffData[]> {
  const cache = getOrCreateCache(projectDir);
  const now = Date.now();

  // If cache is fresh and not stale, return it
  if (!cache.stale && cache.diffs.length >= 0 && (now - cache.lastFetch) < STALE_THRESHOLD_MS) {
    return cache.diffs;
  }

  // If a fetch is already in progress, wait for it
  if (cache.fetchPromise) {
    return cache.fetchPromise;
  }

  // Start a new fetch
  cache.fetchPromise = (async () => {
    try {
      console.log('[GitDiff] Fetching diffs for', projectDir);
      const diffs = await getAllGitDiffs(projectDir);
      console.log('[GitDiff] Got', diffs.length, 'diffs');
      cache.diffs = diffs;
      cache.stale = false;
      cache.lastFetch = Date.now();

      // Notify listeners
      for (const callback of refreshCallbacks) {
        try {
          callback(diffs);
        } catch (err) {
          console.error('[GitDiff] Refresh callback error:', err);
        }
      }

      return diffs;
    } finally {
      cache.fetchPromise = null;
    }
  })();

  return cache.fetchPromise;
}

/**
 * Get diff cache state (for testing)
 */
export function getDiffCacheState(projectDir: string): { stale: boolean; diffs: GitDiffData[] } {
  const cache = getOrCreateCache(projectDir);
  return { stale: cache.stale, diffs: cache.diffs };
}

/**
 * Invalidate the diff cache with debouncing
 */
export function invalidateDiffCache(projectDir: string): void {
  console.log('[GitDiff] invalidateDiffCache called for:', projectDir);
  const cache = getOrCreateCache(projectDir);
  cache.stale = true;

  const now = Date.now();

  // Track when this invalidation sequence started
  if (!invalidationStartTimes.has(projectDir)) {
    invalidationStartTimes.set(projectDir, now);
  }

  // Clear any existing refresh timer
  const existingTimer = refreshTimers.get(projectDir);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Calculate delay with max cap
  const invalidationStart = invalidationStartTimes.get(projectDir)!;
  const timeSinceStart = now - invalidationStart;
  const remainingMaxDelay = Math.max(0, MAX_INVALIDATION_DELAY_MS - timeSinceStart);
  const actualDelay = Math.min(REFRESH_DELAY_MS, remainingMaxDelay);

  // If we've hit the max delay, refresh immediately
  if (actualDelay === 0) {
    console.log('[GitDiff] Max delay reached, forcing immediate refresh');
    invalidationStartTimes.delete(projectDir);
    refreshTimers.delete(projectDir);
    if (refreshCallbacks.size > 0) {
      getCachedDiffs(projectDir).catch(err => {
        console.error('[GitDiff] Max delay refresh error:', err);
      });
    }
    return;
  }

  // Schedule a debounced refresh
  const timer = setTimeout(async () => {
    refreshTimers.delete(projectDir);
    invalidationStartTimes.delete(projectDir);
    if (refreshCallbacks.size > 0) {
      try {
        await getCachedDiffs(projectDir);
      } catch (err) {
        console.error('[GitDiff] Debounced refresh error:', err);
      }
    }
  }, actualDelay);

  refreshTimers.set(projectDir, timer);
}

/**
 * Force an immediate refresh (used for branch switches)
 */
export async function forceRefreshDiffCache(projectDir: string): Promise<GitDiffData[]> {
  const cache = getOrCreateCache(projectDir);
  cache.stale = true;

  // Clear any pending debounced refresh
  const existingTimer = refreshTimers.get(projectDir);
  if (existingTimer) {
    clearTimeout(existingTimer);
    refreshTimers.delete(projectDir);
  }
  invalidationStartTimes.delete(projectDir);

  return getCachedDiffs(projectDir);
}

/**
 * Register a callback to be notified when cache refreshes
 */
export function onDiffCacheRefresh(callback: RefreshCallback): () => void {
  refreshCallbacks.add(callback);
  return () => refreshCallbacks.delete(callback);
}

// =============================================================================
// Cache Invalidation Logic (AC4, AC7)
// =============================================================================

/**
 * Determine if a tool event should trigger diff cache invalidation.
 * Same logic as shouldInvalidateGitCache in websocket.ts
 */
export function shouldInvalidateDiffCache(event: ToolEvent): boolean {
  // Check for success (handle both 'success' string and boolean)
  const isSuccess = event.success === true || event.status === 'success';
  if (!isSuccess) {
    return false;
  }

  // Edit/Write always modify files when successful
  if (event.toolName === 'Edit' || event.toolName === 'Write') {
    return true;
  }

  // Bash: check if it's a git command or file-modifying command
  if (event.toolName === 'Bash') {
    const cmd = event.toolInput?.command || event.input || '';

    // Git commands that change state
    // Handles: git add, git -C <path> add, cd foo && git commit, etc.
    if (/\bgit\s+(?:-[A-Za-z]\s+\S+\s+)*(?:add|commit|checkout|reset|stash|merge|rebase|cherry-pick|revert|pull|fetch|push|branch\s+-[dD]|rm|mv|restore|switch|clean)\b/i.test(cmd)) {
      return true;
    }

    // File-modifying commands (can appear after && or ;)
    if (/(?:^|[;&|]\s*)(rm|mv|cp|touch|mkdir|rmdir|chmod|chown)\s/i.test(cmd)) {
      return true;
    }

    // Redirections that create/modify files
    if (/[>|]/.test(cmd) && !/^\s*(cat|echo|printf)\s.*\|\s*(grep|awk|sed|head|tail|wc|sort|uniq)/.test(cmd)) {
      if (/>\s*[^|&]/.test(cmd)) {
        return true;
      }
    }

    // npm/pnpm install can modify package-lock.json (can appear after && or ;)
    if (/(?:^|[;&|]\s*)(npm|pnpm|yarn)\s+(install|add|remove|uninstall)/i.test(cmd)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Diff Source Indicator (AC8)
// =============================================================================

/**
 * Returns the source of diff data
 */
export function getDiffSource(): 'git' | 'otel' {
  return 'git';
}
