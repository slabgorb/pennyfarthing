/**
 * DiffView - Shared diff rendering components
 *
 * Extracted from DiffsPanel for reuse by GitPanel (diff drill-through).
 * Story MSSCI-14238 - Git-based diffs (renders raw unified diff format)
 */

import React from 'react';
import type { DiffData } from '../../hooks/useDiffs';

export interface DiffLineProps {
  line: string;
  type: 'added' | 'removed' | 'context' | 'header' | 'hunk';
  lineNum?: number;
}

export function DiffLine({ line, type, lineNum }: DiffLineProps): React.ReactElement {
  return (
    <div className={`diff-line diff-${type}`}>
      {lineNum !== undefined && <span className="line-num">{lineNum}</span>}
      <span className="line-content">{line}</span>
    </div>
  );
}

/**
 * Parse raw git diff output into renderable lines
 */
export function parseGitDiffLines(rawDiff: string): Array<{ line: string; type: DiffLineProps['type']; lineNum?: number }> {
  const lines = rawDiff.split('\n');
  const result: Array<{ line: string; type: DiffLineProps['type']; lineNum?: number }> = [];
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('index ') ||
        line.startsWith('---') || line.startsWith('+++')) {
      result.push({ line, type: 'header' });
    } else if (line.startsWith('@@')) {
      // Hunk header - extract starting line number
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) {
        lineNum = parseInt(match[1], 10) - 1;
      }
      result.push({ line, type: 'hunk' });
    } else if (line.startsWith('+')) {
      lineNum++;
      result.push({ line: line.substring(1), type: 'added', lineNum });
    } else if (line.startsWith('-')) {
      result.push({ line: line.substring(1), type: 'removed' });
    } else if (line.startsWith(' ') || line === '') {
      lineNum++;
      result.push({ line: line.substring(1) || '', type: 'context', lineNum });
    } else {
      // Binary file notice or other content
      result.push({ line, type: 'context' });
    }
  }

  return result;
}

export function DiffView({ diff }: { diff: DiffData }): React.ReactElement {
  // MSSCI-14238: Prefer raw git diff if available
  const hasGitDiff = diff.diff && diff.diff.trim().length > 0;

  let lines: Array<{ line: string; type: DiffLineProps['type']; lineNum?: number }>;

  if (hasGitDiff) {
    // Use git diff output directly
    lines = parseGitDiffLines(diff.diff!);
  } else {
    // Fallback to legacy original/modified comparison (deprecated)
    const originalLines = (diff.original || '').split('\n');
    const modifiedLines = (diff.modified || '').split('\n');
    lines = [];

    originalLines.forEach((line, i) => {
      if (!modifiedLines.includes(line)) {
        lines.push({ line, type: 'removed', lineNum: i + 1 });
      }
    });

    modifiedLines.forEach((line, i) => {
      const type = originalLines.includes(line) ? 'context' : 'added';
      lines.push({ line, type, lineNum: i + 1 });
    });
  }

  // Stats display for git diffs
  const statsDisplay = diff.additions !== undefined && diff.deletions !== undefined
    ? `+${diff.additions} -${diff.deletions}`
    : null;

  return (
    <div className="diff-view" data-testid="diff-view">
      <div className="diff-header">
        <span className="diff-path">{diff.path}</span>
        {diff.status && <span className={`diff-status diff-status-${diff.status}`}>{diff.status}</span>}
        {statsDisplay && <span className="diff-stats">{statsDisplay}</span>}
        <span className="diff-tool">{diff.toolName}</span>
      </div>
      <div className="diff-content">
        {lines.map((l, i) => (
          <DiffLine key={i} line={l.line} type={l.type} lineNum={l.lineNum} />
        ))}
      </div>
    </div>
  );
}
