/**
 * useGitStatus Hook
 *
 * React hook for subscribing to git status data via electronAPI.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12781 - Fixed to handle multi-repo response format
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

/** Raw dirty file from git status --porcelain */
interface DirtyFile {
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
 * Transform raw git response to GitStatusData for display
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
    for (const file of repo.dirtyFiles) {
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
  isLoading: boolean;
  error: Error | null;
}

export function useGitStatus(): UseGitStatusResult {
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);
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
        const transformed = transformGitResponse(data as GitResponse | null);
        setGitStatus(transformed);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch git status'));
        setIsLoading(false);
      });

    // Subscribe to updates
    api.git.onUpdate((_, data) => {
      const transformed = transformGitResponse(data as GitResponse | null);
      setGitStatus(transformed);
    });
  }, []);

  return { gitStatus, isLoading, error };
}
