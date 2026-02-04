/**
 * ChangedPanel - Display changed files (FileTree wrapper)
 *
 * Story MSSCI-12717 - React Migration
 * ADR-0020 - Changed to use git as source of truth instead of /ws/diffs
 */

import React, { useCallback, useMemo } from 'react';
import FileTree, { FileChange, FileStatus } from '../FileTree';
import { useGitStatus, DirtyFile } from '../../hooks/useGitStatus';

/**
 * Map git status code to FileStatus
 * Git porcelain format: XY where X=index, Y=worktree
 * ?: untracked, A: added, M: modified, D: deleted, R: renamed, C: copied
 */
function gitStatusToFileStatus(gitStatus: string): FileStatus {
  const indexStatus = gitStatus[0] || ' ';
  const workTreeStatus = gitStatus[1] || ' ';

  // Deleted in either index or worktree
  if (indexStatus === 'D' || workTreeStatus === 'D') {
    return 'deleted';
  }

  // Untracked or newly added
  if (indexStatus === '?' || indexStatus === 'A') {
    return 'created';
  }

  // Everything else is modified (M, R, C, etc.)
  return 'modified';
}

/**
 * Convert DirtyFile array to FileChange array
 */
function dirtyFilesToFileChanges(dirtyFiles: DirtyFile[]): FileChange[] {
  return dirtyFiles.map(file => ({
    path: file.path,
    status: gitStatusToFileStatus(file.status),
  }));
}

export function ChangedPanel(): React.ReactElement {
  const { repos } = useGitStatus();

  // Flatten all dirty files from all repos into FileChange array
  const files = useMemo(() => {
    const allFiles: FileChange[] = [];
    for (const repo of repos) {
      const repoFiles = dirtyFilesToFileChanges(repo.files);
      // Prefix with repo name if multiple repos
      if (repos.length > 1) {
        for (const file of repoFiles) {
          allFiles.push({
            ...file,
            path: `${repo.name}/${file.path}`,
          });
        }
      } else {
        allFiles.push(...repoFiles);
      }
    }
    return allFiles;
  }, [repos]);

  const handleFileClick = useCallback((file: FileChange) => {
    console.log('[ChangedPanel] File clicked:', file.path);
  }, []);

  return (
    <div className="changed-panel" data-testid="changed-panel">
      <FileTree files={files} onFileClick={handleFileClick} />
    </div>
  );
}

export default ChangedPanel;
