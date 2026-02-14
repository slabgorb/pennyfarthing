/**
 * useGitStatus Hook
 *
 * React hook for subscribing to git status data.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12781 - Fixed to handle multi-repo response format
 * Story MSSCI-12798 - Expose full repo array for stacked display
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 *
 * Uses WebSocket /ws/git for real-time updates (no polling).
 */

import { useState, useEffect, useRef } from 'react';

export interface GitStatusData {
  branch: string;
  ahead?: number;
  behind?: number;
  staged?: number;
  modified?: number;
  untracked?: number;
  isDirty?: boolean;
}

/** Per-repo status data for stacked display */
export interface RepoStatusData {
  name: string;
  path: string;
  branch: string;
  ahead?: number;
  behind?: number;
  /** Commits origin/develop has that this branch doesn't (needs pull/rebase) */
  developBehind?: number;
  staged: number;
  modified: number;
  untracked: number;
  isDirty: boolean;
  files: DirtyFile[];
}

/** Dirty file from git status --porcelain */
export interface DirtyFile {
  status: string;  // M, A, D, ?, etc.
  path: string;
}

/** Raw repo git info from server */
interface RepoGitInfo {
  name: string;
  path: string;
  branch: string;
  clean: boolean;
  ahead: number | null;
  behind: number | null;
  developBehind: number | null;
  dirtyFiles: DirtyFile[];
}

/** WebSocket message format from /ws/git */
interface GitMessage {
  type: 'init' | 'update';
  repos: RepoGitInfo[];
}

/**
 * Count files by type from dirty files array
 */
function countFilesByType(dirtyFiles: DirtyFile[]): { staged: number; modified: number; untracked: number } {
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const file of dirtyFiles) {
    // Git status codes:
    // First char = staging area, Second char = working tree
    // M = modified, A = added (staged), D = deleted, ? = untracked
    const indexStatus = file.status[0] || ' ';
    const workTreeStatus = file.status[1] || ' ';

    // Staged files (anything in the index that's not space or ?)
    if (indexStatus !== ' ' && indexStatus !== '?') {
      staged++;
    }

    // Modified in working tree (not staged)
    if (workTreeStatus === 'M' || workTreeStatus === 'D') {
      modified++;
    }

    // Untracked files
    if (indexStatus === '?' && workTreeStatus === '?') {
      untracked++;
    }
  }

  return { staged, modified, untracked };
}

/**
 * Transform raw git response to per-repo status array for stacked display
 */
function transformToRepoArray(repos: RepoGitInfo[]): RepoStatusData[] {
  if (!repos?.length) {
    return [];
  }

  return repos.map(repo => {
    const counts = countFilesByType(repo.dirtyFiles);
    return {
      name: repo.name,
      path: repo.path,
      branch: repo.branch,
      ahead: repo.ahead ?? undefined,
      behind: repo.behind ?? undefined,
      developBehind: repo.developBehind ?? undefined,
      staged: counts.staged,
      modified: counts.modified,
      untracked: counts.untracked,
      isDirty: !repo.clean,
      files: repo.dirtyFiles,
    };
  });
}

/**
 * Transform raw git response to GitStatusData for display (legacy aggregated view)
 * Uses first repo for branch info, aggregates file counts across all repos
 */
function transformGitResponse(repos: RepoGitInfo[]): GitStatusData | null {
  if (!repos?.length) {
    return null;
  }

  // Use first repo as primary (usually the orchestrator or main repo)
  const primaryRepo = repos[0];

  // Count file types across all repos
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const repo of repos) {
    const counts = countFilesByType(repo.dirtyFiles);
    staged += counts.staged;
    modified += counts.modified;
    untracked += counts.untracked;
  }

  // Check if any repo is dirty
  const isDirty = repos.some(repo => !repo.clean);

  return {
    branch: primaryRepo.branch,
    ahead: primaryRepo.ahead ?? undefined,
    behind: primaryRepo.behind ?? undefined,
    staged: staged > 0 ? staged : undefined,
    modified: modified > 0 ? modified : undefined,
    untracked: untracked > 0 ? untracked : undefined,
    isDirty,
  };
}

interface UseGitStatusResult {
  gitStatus: GitStatusData | null;
  repos: RepoStatusData[];
  isLoading: boolean;
  error: Error | null;
}

export function useGitStatus(): UseGitStatusResult {
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);
  const [repos, setRepos] = useState<RepoStatusData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/git`;

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[useGitStatus] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as GitMessage;
            if (msg.type === 'init' || msg.type === 'update') {
              setGitStatus(transformGitResponse(msg.repos));
              setRepos(transformToRepoArray(msg.repos));
              setIsLoading(false);
              setError(null);
            }
          } catch (err) {
            console.error('[useGitStatus] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[useGitStatus] WebSocket closed, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[useGitStatus] WebSocket error:', err);
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        console.error('[useGitStatus] WebSocket init failed:', err);
        setError(err instanceof Error ? err : new Error('Failed to connect'));
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { gitStatus, repos, isLoading, error };
}
