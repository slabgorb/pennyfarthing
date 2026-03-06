/**
 * DiffViewer - Display file diffs with syntax highlighting
 *
 * Story MSSCI-12711 - DiffViewer Component (Epic 71: Codebase Awareness)
 *
 * Features:
 * - Side-by-side or unified diff view with toggle
 * - Syntax highlighting per file type
 * - Green additions, red deletions
 * - Keyboard navigation between hunks
 * - Toggle partial/full file view
 */

import React, { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';

// =============================================================================
// Types
// =============================================================================

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export type ViewMode = 'unified' | 'side-by-side';

export type FileViewMode = 'partial' | 'full';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffData {
  filePath: string;
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
}

interface DiffViewerPropsBase {
  viewMode?: ViewMode;
  fileViewMode?: FileViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  onHunkNavigate?: (hunkIndex: number) => void;
}

interface DiffViewerPropsWithData extends DiffViewerPropsBase {
  data: DiffData;
  filePath?: never;
  oldContent?: never;
  newContent?: never;
}

interface DiffViewerPropsWithContent extends DiffViewerPropsBase {
  data?: never;
  filePath: string;
  oldContent: string;
  newContent: string;
}

export type DiffViewerProps = DiffViewerPropsWithData | DiffViewerPropsWithContent;

/**
 * Generate hunks from content differences for simple add/remove cases
 */
function generateSimpleHunks(oldContent: string, newContent: string): DiffHunk[] {
  const isNew = oldContent === '' && newContent !== '';
  const isDeleted = oldContent !== '' && newContent === '';

  if (isNew) {
    const lines = newContent.split('\n');
    return [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: lines.length,
      lines: lines.map((content, i) => ({
        type: 'added' as DiffLineType,
        content,
        newLineNumber: i + 1,
      })),
    }];
  }

  if (isDeleted) {
    const lines = oldContent.split('\n');
    return [{
      oldStart: 1,
      oldCount: lines.length,
      newStart: 0,
      newCount: 0,
      lines: lines.map((content, i) => ({
        type: 'removed' as DiffLineType,
        content,
        oldLineNumber: i + 1,
      })),
    }];
  }

  // If both have content, treat as full modification
  return [];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get file extension from path
 */
function getFileExtension(filePath: string): string {
  const filename = filePath.split('/').pop() || '';
  if (filename.startsWith('.')) {
    return filename.slice(1); // .gitignore -> gitignore
  }
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts.pop() || '';
}

/**
 * Get CSS language class for syntax highlighting
 */
function getLanguageClass(ext: string): string {
  const langMap: Record<string, string> = {
    ts: 'lang-typescript',
    tsx: 'lang-typescript',
    js: 'lang-javascript',
    jsx: 'lang-javascript',
    css: 'lang-css',
    html: 'lang-html',
    json: 'lang-json',
    md: 'lang-markdown',
    py: 'lang-python',
    gitignore: 'lang-gitignore',
  };
  return langMap[ext] || 'lang-plain';
}

/**
 * Generate hidden lines between two hunks
 */
function generateHiddenLines(
  oldContent: string,
  startLine: number,
  endLine: number
): DiffLine[] {
  const lines = oldContent.split('\n');
  const result: DiffLine[] = [];
  for (let i = startLine; i < endLine && i < lines.length; i++) {
    result.push({
      type: 'unchanged',
      content: lines[i],
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
    });
  }
  return result;
}

// =============================================================================
// DiffLine Component
// =============================================================================

interface DiffLineProps {
  line: DiffLine;
}

function DiffLineComponent({ line }: DiffLineProps): React.ReactElement {
  // Use non-breaking space for unchanged lines to preserve whitespace in HTML
  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '\u00A0';
  const ariaLabel = `Line ${line.oldLineNumber || line.newLineNumber}, ${line.type}: ${line.content}`;

  return (
    <div
      data-testid={`diff-line-${line.type}`}
      className={`diff-line diff-line-${line.type}`}
      aria-label={ariaLabel}
    >
      <span
        data-testid="diff-line-number-old"
        className="diff-line-number diff-line-number-old"
      >
        {line.oldLineNumber ?? ''}
      </span>
      <span
        data-testid="diff-line-number-new"
        className="diff-line-number diff-line-number-new"
      >
        {line.newLineNumber ?? ''}
      </span>
      <span
        data-testid={`diff-line-prefix-${line.type}`}
        className="diff-line-prefix"
      >
        {prefix}
      </span>
      <span className="diff-line-content">{line.content}</span>
    </div>
  );
}

// =============================================================================
// DiffHunk Component
// =============================================================================

interface DiffHunkProps {
  hunk: DiffHunk;
  index: number;
  isFocused: boolean;
  tabIndex: number;
}

function DiffHunkComponent({ hunk, index, isFocused, tabIndex }: DiffHunkProps): React.ReactElement {
  const hunkRef = useRef<HTMLDivElement>(null);
  const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;

  useEffect(() => {
    if (isFocused && hunkRef.current) {
      hunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocused]);

  return (
    <div
      ref={hunkRef}
      data-testid="diff-hunk"
      className={`diff-hunk${isFocused ? ' diff-hunk-focused' : ''}`}
      tabIndex={tabIndex}
    >
      <div data-testid="diff-hunk-header" className="diff-hunk-header">
        {header}
      </div>
      {hunk.lines.map((line, lineIndex) => (
        <DiffLineComponent key={`${index}-${lineIndex}`} line={line} />
      ))}
    </div>
  );
}

// =============================================================================
// Unified View Component
// =============================================================================

interface UnifiedViewProps {
  hunks: DiffHunk[];
  focusedHunk: number;
  fileViewMode: FileViewMode;
  oldContent: string;
  expandedSections: Set<number>;
  onExpandSection: (index: number) => void;
}

function UnifiedView({
  hunks,
  focusedHunk,
  fileViewMode,
  oldContent,
  expandedSections,
  onExpandSection,
}: UnifiedViewProps): React.ReactElement {
  if (fileViewMode === 'full') {
    // Show all lines, not just hunks
    const allLines = oldContent.split('\n').map((content, i) => ({
      type: 'unchanged' as DiffLineType,
      content,
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
    }));

    // Merge hunks with unchanged lines
    const mergedLines: DiffLine[] = [];
    let lineIndex = 0;

    for (const hunk of hunks) {
      // Add unchanged lines before this hunk
      while (lineIndex < hunk.oldStart - 1) {
        mergedLines.push(allLines[lineIndex]);
        lineIndex++;
      }
      // Add hunk lines
      for (const line of hunk.lines) {
        mergedLines.push(line);
        if (line.type !== 'added') {
          lineIndex++;
        }
      }
    }
    // Add remaining unchanged lines
    while (lineIndex < allLines.length) {
      mergedLines.push(allLines[lineIndex]);
      lineIndex++;
    }

    return (
      <div data-testid="diff-full-view" className="diff-full-view">
        {mergedLines.map((line, i) => (
          <DiffLineComponent key={i} line={line} />
        ))}
      </div>
    );
  }

  // Partial view - show only hunks with expand buttons between
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];

    // Add expand button between hunks
    if (i > 0) {
      const prevHunk = hunks[i - 1];
      const prevEnd = prevHunk.oldStart + prevHunk.oldCount - 1;
      const currentStart = hunk.oldStart - 1;
      const hiddenCount = currentStart - prevEnd;

      if (hiddenCount > 0) {
        if (expandedSections.has(i)) {
          // Show the expanded lines
          const hiddenLines = generateHiddenLines(oldContent, prevEnd, currentStart);
          elements.push(
            <div key={`expanded-${i}`} className="diff-expanded-section">
              {hiddenLines.map((line, j) => (
                <DiffLineComponent key={`exp-${i}-${j}`} line={line} />
              ))}
            </div>
          );
        } else {
          elements.push(
            <Button
              variant="ghost"
              size="sm"
              key={`expand-${i}`}
              type="button"
              className="diff-expand-button"
              aria-label="Expand hidden lines"
              onClick={() => onExpandSection(i)}
            >
              {hiddenCount} lines hidden ···
            </Button>
          );
        }
      }
    }

    elements.push(
      <DiffHunkComponent
        key={`hunk-${i}`}
        hunk={hunk}
        index={i}
        isFocused={focusedHunk === i}
        tabIndex={i === 0 ? 0 : -1}
      />
    );
  }

  return (
    <div data-testid="diff-partial-view" className="diff-partial-view">
      {elements}
    </div>
  );
}

// =============================================================================
// Side-by-Side View Component
// =============================================================================

interface SideBySideViewProps {
  hunks: DiffHunk[];
  focusedHunk: number;
}

function SideBySideView({ hunks, focusedHunk: _focusedHunk }: SideBySideViewProps): React.ReactElement {
  // Separate lines into old (removed/unchanged) and new (added/unchanged)
  const oldLines: DiffLine[] = [];
  const newLines: DiffLine[] = [];

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'removed') {
        oldLines.push(line);
      } else if (line.type === 'added') {
        newLines.push(line);
      } else {
        oldLines.push(line);
        newLines.push(line);
      }
    }
  }

  return (
    <div data-testid="diff-side-by-side" className="diff-side-by-side">
      <div data-testid="diff-panel-old" className="diff-panel diff-panel-old">
        {oldLines.map((line, i) => (
          <DiffLineComponent key={`old-${i}`} line={line} />
        ))}
      </div>
      <div data-testid="diff-panel-new" className="diff-panel diff-panel-new">
        {newLines.map((line, i) => (
          <DiffLineComponent key={`new-${i}`} line={line} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// DiffViewer Component
// =============================================================================

export function DiffViewer(props: DiffViewerProps): React.ReactElement {
  const {
    viewMode = 'unified',
    fileViewMode = 'partial',
    onViewModeChange,
    onFileViewModeChange,
    onHunkNavigate,
  } = props;

  // Support both data prop and direct props
  const data: DiffData = 'data' in props && props.data
    ? props.data
    : {
        filePath: (props as DiffViewerPropsWithContent).filePath,
        oldContent: (props as DiffViewerPropsWithContent).oldContent,
        newContent: (props as DiffViewerPropsWithContent).newContent,
        hunks: generateSimpleHunks(
          (props as DiffViewerPropsWithContent).oldContent,
          (props as DiffViewerPropsWithContent).newContent
        ),
      };

  const [focusedHunk, setFocusedHunk] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const viewerRef = useRef<HTMLDivElement>(null);

  const ext = getFileExtension(data.filePath);
  const langClass = getLanguageClass(ext);

  const isNewFile = data.oldContent === '' && data.newContent !== '';
  const isDeletedFile = data.oldContent !== '' && data.newContent === '';
  const hasNoChanges = data.hunks.length === 0;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const nextKeys = ['j', 'ArrowDown', 'n'];
      const prevKeys = ['k', 'ArrowUp'];

      if (nextKeys.includes(e.key) || (e.key === 'n' && !e.shiftKey)) {
        const nextIndex = focusedHunk + 1;
        if (nextIndex < data.hunks.length) {
          setFocusedHunk(nextIndex);
          onHunkNavigate?.(nextIndex);
        }
      } else if (prevKeys.includes(e.key) || (e.key === 'N' && e.shiftKey)) {
        const prevIndex = focusedHunk - 1;
        if (prevIndex >= 0) {
          setFocusedHunk(prevIndex);
          onHunkNavigate?.(prevIndex);
        }
      }
    },
    [focusedHunk, data.hunks.length, onHunkNavigate]
  );

  const handleViewModeToggle = useCallback(() => {
    const newMode = viewMode === 'unified' ? 'side-by-side' : 'unified';
    onViewModeChange?.(newMode);
  }, [viewMode, onViewModeChange]);

  const handleFileViewModeToggle = useCallback(() => {
    const newMode = fileViewMode === 'partial' ? 'full' : 'partial';
    onFileViewModeChange?.(newMode);
  }, [fileViewMode, onFileViewModeChange]);

  const handleExpandSection = useCallback((index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  // Empty/special states
  if (hasNoChanges && !isNewFile && !isDeletedFile) {
    return (
      <div
        ref={viewerRef}
        role="region"
        aria-label="Diff viewer"
        data-testid="diff-viewer"
        className={`diff-viewer ${langClass}`}
      >
        <div className="diff-header">
          <span className="diff-file-path">{data.filePath}</span>
        </div>
        <div className="diff-empty">No changes</div>
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      role="region"
      aria-label="Diff viewer"
      data-testid="diff-viewer"
      className={`diff-viewer ${langClass}`}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="diff-header">
        <span className="diff-file-path">{data.filePath}</span>
        <div className="diff-controls">
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-label="Toggle view mode"
            onClick={handleViewModeToggle}
            className="diff-view-toggle"
          >
            {viewMode === 'unified' ? 'Side-by-side' : 'Unified'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-label={fileViewMode === 'partial' ? 'Show full file' : 'Show changes only'}
            onClick={handleFileViewModeToggle}
            className="diff-file-view-toggle"
          >
            {fileViewMode === 'partial' ? 'Show full file' : 'Show changes only'}
          </Button>
        </div>
      </div>

      {/* New/Deleted file indicators */}
      {isNewFile && <div data-testid="diff-new-file-indicator" className="diff-new-file">New file</div>}
      {isDeletedFile && <div data-testid="diff-deleted-file-indicator" className="diff-deleted-file">File deleted</div>}

      {/* Hunk position indicator (for accessibility) */}
      {data.hunks.length > 1 && (
        <div className="diff-hunk-position" aria-live="polite">
          Hunk {focusedHunk + 1} of {data.hunks.length}
        </div>
      )}

      {/* Content */}
      {viewMode === 'unified' ? (
        <UnifiedView
          hunks={data.hunks}
          focusedHunk={focusedHunk}
          fileViewMode={fileViewMode}
          oldContent={data.oldContent}
          expandedSections={expandedSections}
          onExpandSection={handleExpandSection}
        />
      ) : (
        <SideBySideView hunks={data.hunks} focusedHunk={focusedHunk} />
      )}

      {/* Unified view marker */}
      {viewMode === 'unified' && fileViewMode === 'partial' && (
        <div data-testid="diff-unified" style={{ display: 'none' }} />
      )}
      {viewMode === 'unified' && fileViewMode === 'full' && (
        <div data-testid="diff-unified" style={{ display: 'none' }} />
      )}
    </div>
  );
}

export default DiffViewer;
