/**
 * GitPanel - Display git repository status
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12798 - Stacked multi-repo display with file dropdowns
 */

import React, { useState } from 'react';
import { useGitStatus, RepoStatusData, DirtyFile } from '../../hooks/useGitStatus';

/** Get CSS class for file status */
function getFileStatusClass(status: string): string {
  const indexStatus = status[0] || ' ';
  const workTreeStatus = status[1] || ' ';

  if (indexStatus === '?' && workTreeStatus === '?') return 'untracked';
  if (indexStatus !== ' ' && indexStatus !== '?') return 'staged';
  if (workTreeStatus === 'M' || workTreeStatus === 'D') return 'modified';
  return 'modified';
}

/** Get display label for file status */
function getFileStatusLabel(status: string): string {
  const indexStatus = status[0] || ' ';
  const workTreeStatus = status[1] || ' ';

  if (indexStatus === '?' && workTreeStatus === '?') return '?';
  if (indexStatus === 'A') return '+';
  if (indexStatus === 'D' || workTreeStatus === 'D') return '-';
  if (indexStatus === 'M' || workTreeStatus === 'M') return '~';
  if (indexStatus === 'R') return 'R';
  return status.trim() || '~';
}

interface FileListProps {
  files: DirtyFile[];
}

function FileList({ files }: FileListProps): React.ReactElement {
  return (
    <ul className="file-list">
      {files.map((file, index) => (
        <li key={`${file.path}-${index}`} className={`file-item ${getFileStatusClass(file.status)}`}>
          <span className="file-status-icon">{getFileStatusLabel(file.status)}</span>
          <span className="file-path" title={file.path}>{file.path}</span>
        </li>
      ))}
    </ul>
  );
}

interface RepoStatusProps {
  repo: RepoStatusData;
}

function RepoStatus({ repo }: RepoStatusProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, branch, ahead, behind, staged, modified, untracked, isDirty, files } = repo;
  const hasFiles = files.length > 0;

  return (
    <div className={`repo-status ${isExpanded ? 'expanded' : ''}`} data-testid={`repo-status-${name}`}>
      <div className="repo-header">
        <span className="repo-name">{name}</span>
        {isDirty && <span className="dirty-indicator" title="Uncommitted changes">●</span>}
      </div>

      <div className="branch-info">
        <span className="branch-icon">⎇</span>
        <span className="branch-name">{branch}</span>
      </div>

      {(ahead !== undefined && ahead > 0) || (behind !== undefined && behind > 0) ? (
        <div className="sync-status">
          {ahead !== undefined && ahead > 0 && (
            <span className="ahead" title="Commits ahead">↑{ahead}</span>
          )}
          {behind !== undefined && behind > 0 && (
            <span className="behind" title="Commits behind">↓{behind}</span>
          )}
        </div>
      ) : null}

      {(staged > 0 || modified > 0 || untracked > 0) && (
        <button
          className="file-status-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? 'Collapse file list' : 'Expand file list'}
        >
          <span className={`toggle-icon ${isExpanded ? 'open' : ''}`}>▶</span>
          <div className="file-status">
            {staged > 0 && (
              <span className="status-item staged" title="Staged files">+{staged}</span>
            )}
            {modified > 0 && (
              <span className="status-item modified" title="Modified files">~{modified}</span>
            )}
            {untracked > 0 && (
              <span className="status-item untracked" title="Untracked files">?{untracked}</span>
            )}
          </div>
        </button>
      )}

      {isExpanded && hasFiles && <FileList files={files} />}
    </div>
  );
}

export function GitPanel(): React.ReactElement {
  const { repos, isLoading, error } = useGitStatus();

  if (isLoading) {
    return (
      <div className="git-panel loading" data-testid="git-panel">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="git-panel error" data-testid="git-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="git-panel empty" data-testid="git-panel">
        <div className="placeholder">No git repos</div>
      </div>
    );
  }

  return (
    <div className="git-panel stacked" data-testid="git-panel">
      {repos.map(repo => (
        <RepoStatus key={repo.name} repo={repo} />
      ))}
    </div>
  );
}

export default GitPanel;
