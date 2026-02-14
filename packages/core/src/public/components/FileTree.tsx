/**
 * FileTree - Display modified files in a tree structure
 *
 * Story MSSCI-12710 - FileTree Component
 *
 * Features:
 * - Display modified files with paths and status indicators
 * - Group files by directory with collapsible sections
 * - Click to open file in DiffViewer
 * - Badge showing count of modified files
 * - Real-time updates as files change
 */

import React, { useState, useCallback, useMemo, useRef, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// =============================================================================
// Types
// =============================================================================

export type FileStatus = 'created' | 'modified' | 'deleted';

export interface FileChange {
  path: string;
  status: FileStatus;
}

export interface FileTreeProps {
  files: FileChange[];
  onFileClick?: (file: FileChange) => void;
}

// =============================================================================
// Utility Functions
// =============================================================================

function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return 'root';
  return path.substring(0, lastSlash);
}

function getFileName(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return path;
  return path.substring(lastSlash + 1);
}

function groupFilesByDirectory(files: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();

  for (const file of files) {
    const dir = getDirectory(file.path);
    const existing = groups.get(dir) || [];
    existing.push(file);
    groups.set(dir, existing);
  }

  return groups;
}

function countByStatus(files: FileChange[]): { created: number; modified: number; deleted: number } {
  return files.reduce(
    (acc, file) => {
      const status = file.status || 'modified';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { created: 0, modified: 0, deleted: 0 }
  );
}

function formatStatusBreakdown(counts: { created: number; modified: number; deleted: number }): string {
  const parts: string[] = [];
  if (counts.created > 0) parts.push(`${counts.created} created`);
  if (counts.modified > 0) parts.push(`${counts.modified} modified`);
  if (counts.deleted > 0) parts.push(`${counts.deleted} deleted`);
  return parts.join(', ');
}

// =============================================================================
// Status Icon Component
// =============================================================================

interface StatusIconProps {
  status: FileStatus | undefined;
}

function StatusIcon({ status }: StatusIconProps): React.ReactElement {
  const safeStatus = status || 'modified';

  return (
    <span
      data-testid={`status-${safeStatus}`}
      className={`status-icon status-${safeStatus}`}
      aria-hidden="true"
    >
      {safeStatus === 'created' && '+'}
      {safeStatus === 'modified' && '~'}
      {safeStatus === 'deleted' && '-'}
    </span>
  );
}

// =============================================================================
// File Item Component
// =============================================================================

interface FileItemProps {
  file: FileChange;
  onFileClick?: (file: FileChange) => void;
  isFocused: boolean;
  onFocus: () => void;
}

function FileItem({ file, onFileClick, isFocused, onFocus }: FileItemProps): React.ReactElement {
  const status = file.status || 'modified';
  const fileName = getFileName(file.path);
  const [hasFocus, setHasFocus] = useState(false);

  const handleClick = useCallback(() => {
    onFileClick?.(file);
  }, [file, onFileClick]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onFileClick?.(file);
      }
    },
    [file, onFileClick]
  );

  const handleFocus = useCallback(() => {
    setHasFocus(true);
    onFocus();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setHasFocus(false);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="treeitem"
          data-testid="file-item"
          className={`file-item file-${status}${isFocused || hasFocus ? ' focused' : ''}`}
          tabIndex={0}
          aria-label={`${fileName}, ${status}`}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          <StatusIcon status={file.status} />
          <span className="file-name">{fileName}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{file.path}</TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// Directory Section Component
// =============================================================================

interface DirectorySectionProps {
  directory: string;
  files: FileChange[];
  isExpanded: boolean;
  onToggle: () => void;
  onFileClick?: (file: FileChange) => void;
  focusedPath: string | null;
  onFileFocus: (path: string) => void;
}

function DirectorySection({
  directory,
  files,
  isExpanded,
  onToggle,
  onFileClick,
  focusedPath,
  onFileFocus,
}: DirectorySectionProps): React.ReactElement {
  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={() => onToggle()}
      asChild
    >
      <div
        role="group"
        data-testid={`directory-${directory}`}
        className="directory-section"
      >
        <CollapsibleTrigger asChild>
          <div className="directory-header">
            <span
              className="directory-toggle"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
            </span>
            <span className="directory-name">{directory === 'root' ? '/' : directory}</span>
            <span className="directory-count">{files.length}</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="directory-files">
            {files.map((file, index) => (
              <FileItem
                key={`${file.path}-${index}`}
                file={file}
                onFileClick={onFileClick}
                isFocused={focusedPath === file.path}
                onFocus={() => onFileFocus(file.path)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// FileTree Component
// =============================================================================

export function FileTree({ files, onFileClick }: FileTreeProps): React.ReactElement {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const previousFocusedRef = useRef<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  // Group files by directory
  const groupedFiles = useMemo(() => groupFilesByDirectory(files), [files]);

  // Calculate status counts
  const statusCounts = useMemo(() => countByStatus(files), [files]);
  const statusTooltip = useMemo(() => formatStatusBreakdown(statusCounts), [statusCounts]);

  // Get sorted directory names
  const directories = useMemo(() => {
    const dirs = Array.from(groupedFiles.keys()).sort();
    // Move 'root' to the end for display
    const rootIndex = dirs.indexOf('root');
    if (rootIndex > -1) {
      dirs.splice(rootIndex, 1);
      dirs.push('root');
    }
    return dirs;
  }, [groupedFiles]);

  // Preserve focus when files update
  useEffect(() => {
    if (focusedPath) {
      previousFocusedRef.current = focusedPath;
    }
  }, [focusedPath]);

  useEffect(() => {
    // If the previously focused file still exists, try to refocus it
    if (previousFocusedRef.current) {
      const stillExists = files.some((f) => f.path === previousFocusedRef.current);
      if (stillExists) {
        // The focus will be maintained by the DOM if the element still exists
        setFocusedPath(previousFocusedRef.current);
      }
    }
  }, [files]);

  const handleToggle = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }, []);

  const handleFileFocus = useCallback((path: string) => {
    setFocusedPath(path);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    e.preventDefault();

    // Get all visible tree items
    const treeItems = treeRef.current?.querySelectorAll('[role="treeitem"]');
    if (!treeItems || treeItems.length === 0) return;

    const items = Array.from(treeItems) as HTMLElement[];
    const currentIndex = items.findIndex(item => document.activeElement === item);

    let nextIndex: number;
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    }

    items[nextIndex]?.focus();
  }, []);

  // Empty state
  if (files.length === 0) {
    return (
      <TooltipProvider delayDuration={300}>
        <div role="tree" aria-label="Changed files" className="filetree">
          <Badge
            variant="secondary"
            data-testid="file-count-badge"
            className="file-count-badge"
            aria-label="0 files changed"
          >
            0
          </Badge>
          <div className="empty-state">No files changed</div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={treeRef}
        role="tree"
        aria-label="Changed files"
        className="filetree"
        onKeyDown={handleKeyDown}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              data-testid="file-count-badge"
              className="file-count-badge"
              aria-label={`${files.length} files changed`}
            >
              {files.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{statusTooltip}</TooltipContent>
        </Tooltip>
        {directories.map((dir) => (
          <DirectorySection
            key={dir}
            directory={dir}
            files={groupedFiles.get(dir) || []}
            isExpanded={!collapsedDirs.has(dir)}
            onToggle={() => handleToggle(dir)}
            onFileClick={onFileClick}
            focusedPath={focusedPath}
            onFileFocus={handleFileFocus}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

export default FileTree;
