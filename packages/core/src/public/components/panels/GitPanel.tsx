/**
 * GitPanel - Display git repository status with diff drill-through
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12798 - Stacked multi-repo display with file dropdowns
 * Merge: Changed panel consolidated into Git panel with inline diff view
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useGitStatus, RepoStatusData, DirtyFile } from '../../hooks/useGitStatus';
import { useDiffs } from '../../hooks/useDiffs';
import { DiffView } from './DiffView';


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
  onFileClick: (filePath: string) => void;
}

function FileList({ files, onFileClick }: FileListProps): React.ReactElement {
  return (
    <ul className="file-list">
      {files.map((file, index) => (
        <li
          key={`${file.path}-${index}`}
          className={`file-item clickable ${getFileStatusClass(file.status)}`}
          onClick={() => onFileClick(file.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onFileClick(file.path); }}
        >
          <span className="file-status-icon">{getFileStatusLabel(file.status)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="file-path">{file.path}</span>
            </TooltipTrigger>
            <TooltipContent>{file.path}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

interface RepoStatusProps {
  repo: RepoStatusData;
  onFileClick: (filePath: string) => void;
}

function RepoStatus({ repo, onFileClick }: RepoStatusProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, branch, ahead, behind, developBehind, staged, modified, untracked, isDirty, files } = repo;
  const hasFiles = files.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className={`repo-status ${isExpanded ? 'expanded' : ''}`} data-testid={`repo-status-${name}`}>
        <div className="repo-header">
          <span className="repo-name">{name}</span>
          {isDirty && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="dirty-indicator">●</Badge>
              </TooltipTrigger>
              <TooltipContent>Uncommitted changes</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="branch-info">
          <span className="branch-icon">⎇</span>
          <span className="branch-name">{branch}</span>
        </div>

        {((ahead !== undefined && ahead > 0) || (behind !== undefined && behind > 0) || (developBehind !== undefined && developBehind > 0)) && (
          <div className="sync-status">
            {ahead !== undefined && ahead > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ahead">↑{ahead}</span>
                </TooltipTrigger>
                <TooltipContent>Commits ahead of remote</TooltipContent>
              </Tooltip>
            )}
            {behind !== undefined && behind > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="behind">↓{behind}</span>
                </TooltipTrigger>
                <TooltipContent>Commits behind remote</TooltipContent>
              </Tooltip>
            )}
            {developBehind !== undefined && developBehind > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="develop-behind">⟳{developBehind}</span>
                </TooltipTrigger>
                <TooltipContent>develop is {developBehind} commit{developBehind > 1 ? 's' : ''} ahead</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {(staged > 0 || modified > 0 || untracked > 0) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="file-status-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <span className={`toggle-icon ${isExpanded ? 'open' : ''}`}>▶</span>
                <div className="file-status">
                  {staged > 0 && (
                    <Badge variant="outline" className="status-item staged">+{staged}</Badge>
                  )}
                  {modified > 0 && (
                    <Badge variant="outline" className="status-item modified">~{modified}</Badge>
                  )}
                  {untracked > 0 && (
                    <Badge variant="outline" className="status-item untracked">?{untracked}</Badge>
                  )}
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? 'Collapse file list' : 'Expand file list'}</TooltipContent>
          </Tooltip>
        )}

        {isExpanded && hasFiles && <FileList files={files} onFileClick={onFileClick} />}
      </div>
    </TooltipProvider>
  );
}

export function GitPanel(): React.ReactElement {
  const { repos, isLoading, error } = useGitStatus();
  const { diffs, selectDiff } = useDiffs();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // Find the diff for the selected file
  const selectedDiff = selectedFilePath
    ? diffs.find(d => d.path === selectedFilePath || d.path.endsWith(selectedFilePath) || selectedFilePath.endsWith(d.path)) ?? null
    : null;

  // Handle file click — show diff inline
  const handleFileClick = useCallback((filePath: string) => {
    setSelectedFilePath(filePath);
    selectDiff(filePath);
  }, [selectDiff]);

  // Handle Escape key to go back to repo overview
  useEffect(() => {
    if (!selectedFilePath) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedFilePath(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilePath]);

  if (isLoading) {
    return (
      <div className="git-panel loading" data-testid="git-panel">
        <div className="space-y-3 p-2">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
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

  // Diff drill-through view
  if (selectedFilePath) {
    return (
      <div className="git-panel diff-drillthrough" data-testid="git-panel">
        <div className="diff-back-bar">
          <Button
            variant="ghost"
            size="sm"
            className="back-button"
            onClick={() => setSelectedFilePath(null)}
          >
            ← Back
          </Button>
          <span className="breadcrumb-path">{selectedFilePath}</span>
        </div>
        {selectedDiff ? (
          <DiffView diff={selectedDiff} />
        ) : (
          <div className="placeholder">No diff available for {selectedFilePath}</div>
        )}
      </div>
    );
  }

  return (
    <div className="git-panel stacked" data-testid="git-panel">
      {repos.map(repo => (
        <RepoStatus key={repo.name} repo={repo} onFileClick={handleFileClick} />
      ))}
    </div>
  );
}

export default GitPanel;
