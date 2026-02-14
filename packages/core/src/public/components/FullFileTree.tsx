/**
 * FullFileTree - Complete directory tree with changed file highlighting
 *
 * Displays the full project file tree with lazy-loaded directories.
 * Changed files are highlighted with git status colors (created/modified/deleted).
 * Uses /api/files for directory listing and /ws/git for change status.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useFileBrowser, DirectoryEntry } from '../hooks/useFileBrowser';
import type { FileStatus } from './FileTree';

// =============================================================================
// Types
// =============================================================================

export interface FullFileTreeProps {
  /** Map of file path → git status for highlighting */
  changedFiles: Map<string, FileStatus>;
  /** Callback when a file is clicked */
  onFileClick?: (entry: DirectoryEntry, status?: FileStatus) => void;
}

// =============================================================================
// File Item Component
// =============================================================================

function TreeFileItem({
  entry,
  status,
  depth,
  onFileClick,
}: {
  entry: DirectoryEntry;
  status?: FileStatus;
  depth: number;
  onFileClick?: (entry: DirectoryEntry, status?: FileStatus) => void;
}): React.ReactElement {
  const statusIcon = status === 'created' ? '+' : status === 'modified' ? '~' : status === 'deleted' ? '-' : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="treeitem"
          className={`file-item${status ? ` file-${status}` : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          tabIndex={0}
          aria-label={`${entry.name}${status ? `, ${status}` : ''}`}
          onClick={() => onFileClick?.(entry, status)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFileClick?.(entry, status);
            }
          }}
        >
          {statusIcon && (
            <span className={`status-icon status-${status}`} aria-hidden="true">
              {statusIcon}
            </span>
          )}
          <span className={`file-name${status === 'deleted' ? '' : ''}`}>{entry.name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{entry.path}</TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// Directory Node Component (recursive)
// =============================================================================

function TreeDirectoryNode({
  entry,
  depth,
  changedFiles,
  onFileClick,
  fetchDirectory,
  cache,
  loading,
}: {
  entry: DirectoryEntry;
  depth: number;
  changedFiles: Map<string, FileStatus>;
  onFileClick?: (entry: DirectoryEntry, status?: FileStatus) => void;
  fetchDirectory: (path: string) => Promise<void>;
  cache: Record<string, DirectoryEntry[]>;
  loading: Set<string>;
}): React.ReactElement {
  // Check if this directory contains any changed files
  const hasChanges = Array.from(changedFiles.keys()).some(
    (filePath) => filePath.startsWith(entry.path + '/')
  );

  const [isOpen, setIsOpen] = useState(hasChanges);
  const children = cache[entry.path];
  const isLoading = loading.has(entry.path);

  // Auto-fetch children when directory has changes and is opened by default
  useEffect(() => {
    if (hasChanges && !children && !loading.has(entry.path)) {
      fetchDirectory(entry.path);
    }
  }, [hasChanges, children, entry.path, fetchDirectory, loading]);

  // Auto-open when changes appear in this directory
  useEffect(() => {
    if (hasChanges) {
      setIsOpen(true);
    }
  }, [hasChanges]);

  const handleToggle = useCallback(() => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && !children) {
      fetchDirectory(entry.path);
    }
  }, [isOpen, children, entry.path, fetchDirectory]);

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <div
          className={`directory-header${hasChanges ? ' has-changes' : ''}`}
          style={{ paddingLeft: `${4 + depth * 16}px` }}
        >
          <span className="directory-toggle">
            <span className="toggle-icon">{isOpen ? '▼' : '▶'}</span>
          </span>
          <span className="directory-name">{entry.name}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isLoading && (
          <div
            className="tree-loading"
            style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
          >
            Loading...
          </div>
        )}
        {children?.map((child) =>
          child.type === 'directory' ? (
            <TreeDirectoryNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              changedFiles={changedFiles}
              onFileClick={onFileClick}
              fetchDirectory={fetchDirectory}
              cache={cache}
              loading={loading}
            />
          ) : (
            <TreeFileItem
              key={child.path}
              entry={child}
              status={changedFiles.get(child.path)}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// FullFileTree Component
// =============================================================================

export function FullFileTree({ changedFiles, onFileClick }: FullFileTreeProps): React.ReactElement {
  const { cache, loading, error, fetchDirectory } = useFileBrowser();

  // Load root directory on mount
  useEffect(() => {
    fetchDirectory('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rootEntries = cache['__root__'];
  const changedCount = changedFiles.size;

  return (
    <TooltipProvider delayDuration={300}>
      <div role="tree" aria-label="Project files" className="filetree full-filetree">
        {changedCount > 0 && (
          <Badge
            variant="secondary"
            data-testid="file-count-badge"
            className="file-count-badge"
            aria-label={`${changedCount} files changed`}
          >
            {changedCount}
          </Badge>
        )}
        <ScrollArea className="filetree-scroll">
          {error && <div className="tree-error">{error}</div>}
          {!rootEntries && !error && (
            <div className="tree-loading">Loading project files...</div>
          )}
          {rootEntries?.map((entry) =>
            entry.type === 'directory' ? (
              <TreeDirectoryNode
                key={entry.path}
                entry={entry}
                depth={0}
                changedFiles={changedFiles}
                onFileClick={onFileClick}
                fetchDirectory={fetchDirectory}
                cache={cache}
                loading={loading}
              />
            ) : (
              <TreeFileItem
                key={entry.path}
                entry={entry}
                status={changedFiles.get(entry.path)}
                depth={0}
                onFileClick={onFileClick}
              />
            )
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

export default FullFileTree;
