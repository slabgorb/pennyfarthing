/**
 * ChangedPanel - Full file tree with changed file highlighting
 *
 * Story MSSCI-12717 - React Migration
 * ADR-0020 - Changed to use git as source of truth instead of /ws/diffs
 *
 * Shows full project directory tree with changed files highlighted.
 * Uses /api/files for tree structure and /ws/git for change status.
 */

import React, { useCallback, useMemo } from 'react';
import { FullFileTree } from '../FullFileTree';
import { useGitStatus } from '../../hooks/useGitStatus';
import type { FileStatus } from '../FileTree';
import type { DirectoryEntry } from '../../hooks/useFileBrowser';

/**
 * Map git status code to FileStatus
 */
function gitStatusToFileStatus(gitStatus: string): FileStatus {
  const indexStatus = gitStatus[0] || ' ';
  const workTreeStatus = gitStatus[1] || ' ';

  if (indexStatus === 'D' || workTreeStatus === 'D') return 'deleted';
  if (indexStatus === '?' || indexStatus === 'A') return 'created';
  return 'modified';
}

export function ChangedPanel(): React.ReactElement {
  const { repos } = useGitStatus();

  // Build a Map<filePath, FileStatus> from all dirty files
  const changedFiles = useMemo(() => {
    const map = new Map<string, FileStatus>();
    for (const repo of repos) {
      for (const file of repo.files) {
        // Use full path from repo for matching against /api/files paths
        const fullPath = repos.length > 1
          ? `${repo.path}/${file.path}`
          : `${repo.path}/${file.path}`;
        map.set(fullPath, gitStatusToFileStatus(file.status));
        // Also store relative path for fallback matching
        map.set(file.path, gitStatusToFileStatus(file.status));
      }
    }
    return map;
  }, [repos]);

  const handleFileClick = useCallback((entry: DirectoryEntry, status?: FileStatus) => {
    // Open file in editor via API
    fetch('/api/files/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: entry.path }),
    }).catch(err => console.error('[ChangedPanel] Failed to open file:', err));
  }, []);

  return (
    <div className="changed-panel" data-testid="changed-panel">
      <FullFileTree changedFiles={changedFiles} onFileClick={handleFileClick} />
    </div>
  );
}

export default ChangedPanel;
