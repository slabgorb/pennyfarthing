/**
 * GitPanel - Display git repository status
 *
 * Story MSSCI-12717 - React Migration
 */

import React from 'react';
import { useGitStatus } from '../../hooks/useGitStatus';

export function GitPanel(): React.ReactElement {
  const { gitStatus, isLoading, error } = useGitStatus();

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

  if (!gitStatus) {
    return (
      <div className="git-panel empty" data-testid="git-panel">
        <div className="placeholder">No git status</div>
      </div>
    );
  }

  const { branch, ahead, behind, staged, modified, untracked, isDirty } = gitStatus;

  return (
    <div className="git-panel" data-testid="git-panel">
      <div className="branch-info">
        <span className="branch-icon">*</span>
        <span className="branch-name">{branch}</span>
        {isDirty && <span className="dirty-indicator" title="Uncommitted changes">*</span>}
      </div>

      {(ahead !== undefined || behind !== undefined) && (
        <div className="sync-status">
          {ahead !== undefined && ahead > 0 && (
            <span className="ahead" title="Commits ahead">{ahead} ahead</span>
          )}
          {behind !== undefined && behind > 0 && (
            <span className="behind" title="Commits behind">{behind} behind</span>
          )}
        </div>
      )}

      <div className="file-status">
        {staged !== undefined && staged > 0 && (
          <div className="status-item staged">
            <span className="count">{staged}</span>
            <span className="label">staged</span>
          </div>
        )}
        {modified !== undefined && modified > 0 && (
          <div className="status-item modified">
            <span className="count">{modified}</span>
            <span className="label">modified</span>
          </div>
        )}
        {untracked !== undefined && untracked > 0 && (
          <div className="status-item untracked">
            <span className="count">{untracked}</span>
            <span className="label">untracked</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default GitPanel;
