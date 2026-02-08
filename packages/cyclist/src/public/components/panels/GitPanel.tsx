/**
 * GitPanel - Display git repository status
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12798 - Stacked multi-repo display with file dropdowns
 */

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useGitStatus, RepoStatusData, DirtyFile } from '../../hooks/useGitStatus';
import { useClaudeContext } from '../../contexts/ClaudeContext';

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
  onPullDevelop?: (repoName: string, repoPath: string) => void;
}

function RepoStatus({ repo, onPullDevelop }: RepoStatusProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, path, branch, ahead, behind, developBehind, staged, modified, untracked, isDirty, files } = repo;
  const hasFiles = files.length > 0;
  const hasDevelopUpdates = developBehind !== undefined && developBehind > 0;

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

        {((ahead !== undefined && ahead > 0) || (behind !== undefined && behind > 0) || hasDevelopUpdates) && (
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
            {hasDevelopUpdates && onPullDevelop && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="sync-develop-btn"
                    onClick={() => onPullDevelop(name, path)}
                    aria-label={`Pull ${developBehind} commits from develop`}
                  >
                    <RefreshCw size={12} />
                    <span>{developBehind}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>develop is {developBehind} commit{developBehind > 1 ? 's' : ''} ahead — click to pull</TooltipContent>
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

        {isExpanded && hasFiles && <FileList files={files} />}
      </div>
    </TooltipProvider>
  );
}

export function GitPanel(): React.ReactElement {
  const { repos, isLoading, error } = useGitStatus();
  const { send } = useClaudeContext();

  const handlePullDevelop = (repoName: string, repoPath: string) => {
    const prompt = repoPath === '.'
      ? `pull develop`
      : `cd ${repoPath} && git pull origin develop`;
    send(prompt);
  };

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

  return (
    <div className="git-panel stacked" data-testid="git-panel">
      {repos.map(repo => (
        <RepoStatus key={repo.name} repo={repo} onPullDevelop={handlePullDevelop} />
      ))}
    </div>
  );
}

export default GitPanel;
