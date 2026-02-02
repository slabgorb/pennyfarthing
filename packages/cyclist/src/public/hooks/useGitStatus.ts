/**
 * useGitStatus Hook
 *
 * React hook for subscribing to git status data via electronAPI.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12781 - Fixed to handle multi-repo response format
 * Story MSSCI-12798 - Expose full repo array for stacked display
 */

import { useState, useEffect } from 'react';

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

/** Raw repo git info from main process */
interface RepoGitInfo {
  name: string;
  path: string;
  branch: string;
  clean: boolean;
  ahead: number | null;
  behind: number | null;
  dirtyFiles: DirtyFile[];
}

/** Raw response from git:get IPC call */
interface GitResponse {
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
function transformToRepoArray(response: GitResponse | null): RepoStatusData[] {
  if (!response?.repos?.length) {
    return [];
  }

  return response.repos.map(repo => {
    const counts = countFilesByType(repo.dirtyFiles);
    return {
      name: repo.name,
      path: repo.path,
      branch: repo.branch,
      ahead: repo.ahead ?? undefined,
      behind: repo.behind ?? undefined,
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
function transformGitResponse(response: GitResponse | null): GitStatusData | null {
  if (!response?.repos?.length) {
    return null;
  }

  // Use first repo as primary (usually the orchestrator or main repo)
  const primaryRepo = response.repos[0];

  // Count file types across all repos
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const repo of response.repos) {
    const counts = countFilesByType(repo.dirtyFiles);
    staged += counts.staged;
    modified += counts.modified;
    untracked += counts.untracked;
  }

  // Check if any repo is dirty
  const isDirty = response.repos.some(repo => !repo.clean);

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

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.git) {
      setError(new Error('electronAPI.git not available'));
      setIsLoading(false);
      return;
    }

    // Initial fetch
    api.git.get()
      .then((data) => {
        const response = data as GitResponse | null;
        setGitStatus(transformGitResponse(response));
        setRepos(transformToRepoArray(response));
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch git status'));
        setIsLoading(false);
      });

    // Subscribe to updates
    api.git.onUpdate((_, data) => {
      const response = data as GitResponse | null;
      setGitStatus(transformGitResponse(response));
      setRepos(transformToRepoArray(response));
    });
  }, []);

  return { gitStatus, repos, isLoading, error };
}
