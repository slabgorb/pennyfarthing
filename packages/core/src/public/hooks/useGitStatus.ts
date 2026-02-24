/**
 * useGitStatus Hook
 *
 * React hook for subscribing to git status data.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12781 - Fixed to handle multi-repo response format
 * Story MSSCI-12798 - Expose full repo array for stacked display
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 * Story 124-3 - Refactored to use DataSource<T> pattern
 *
 * Uses DataSource via useDataSource for real-time updates (no polling).
 */

import { useState, useEffect } from 'react';
import { useDataSource } from './useDataSource.js';

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
    const indexStatus = file.status[0] || ' ';
    const workTreeStatus = file.status[1] || ' ';

    if (indexStatus !== ' ' && indexStatus !== '?') {
      staged++;
    }
    if (workTreeStatus === 'M' || workTreeStatus === 'D') {
      modified++;
    }
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
  if (!repos?.length) return [];

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
 */
function transformGitResponse(repos: RepoGitInfo[]): GitStatusData | null {
  if (!repos?.length) return null;

  const primaryRepo = repos[0];
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const repo of repos) {
    const counts = countFilesByType(repo.dirtyFiles);
    staged += counts.staged;
    modified += counts.modified;
    untracked += counts.untracked;
  }

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

  const { data, isLoading, error } = useDataSource<GitMessage, RepoGitInfo[]>({
    endpoint: '/ws/git',
    transform: (msg) => msg.repos,
  });

  useEffect(() => {
    if (data) {
      setGitStatus(transformGitResponse(data));
      setRepos(transformToRepoArray(data));
    }
  }, [data]);

  return { gitStatus, repos, isLoading, error };
}
