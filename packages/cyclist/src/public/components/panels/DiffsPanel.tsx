/**
 * DiffsPanel - Display file diffs
 *
 * Story MSSCI-12717 - React Migration
 */

import React from 'react';
import { useDiffs, DiffData } from '../../hooks/useDiffs';

interface DiffLineProps {
  line: string;
  type: 'added' | 'removed' | 'context';
  lineNum: number;
}

function DiffLine({ line, type, lineNum }: DiffLineProps): React.ReactElement {
  const prefix = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';
  return (
    <div className={`diff-line diff-${type}`}>
      <span className="line-num">{lineNum}</span>
      <span className="line-prefix">{prefix}</span>
      <span className="line-content">{line}</span>
    </div>
  );
}

function DiffView({ diff }: { diff: DiffData }): React.ReactElement {
  // Simple unified diff rendering
  const originalLines = diff.original.split('\n');
  const modifiedLines = diff.modified.split('\n');

  // Create a simple diff view (not a proper algorithm, just for display)
  // In production, use a proper diff library
  const lines: Array<{ line: string; type: 'added' | 'removed' | 'context'; lineNum: number }> = [];

  // Add removed lines
  originalLines.forEach((line, i) => {
    if (!modifiedLines.includes(line)) {
      lines.push({ line, type: 'removed', lineNum: i + 1 });
    }
  });

  // Add modified content with context
  modifiedLines.forEach((line, i) => {
    const type = originalLines.includes(line) ? 'context' : 'added';
    lines.push({ line, type, lineNum: i + 1 });
  });

  return (
    <div className="diff-view" data-testid="diff-view">
      <div className="diff-header">
        <span className="diff-path">{diff.path}</span>
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

export function DiffsPanel(): React.ReactElement {
  const { diffs, selectedDiff, selectDiff, clearDiffs } = useDiffs();

  if (diffs.length === 0) {
    return (
      <div className="diffs-panel empty" data-testid="diffs-panel">
        <div className="placeholder">No diffs yet</div>
        <p className="hint">Diffs appear when files are modified</p>
      </div>
    );
  }

  return (
    <div className="diffs-panel" data-testid="diffs-panel">
      <div className="panel-header">
        <span className="diff-count">{diffs.length} file(s)</span>
        <button type="button" className="clear-button" onClick={clearDiffs}>
          Clear
        </button>
      </div>

      {diffs.length > 1 && (
        <div className="diff-tabs">
          {diffs.map(diff => (
            <button
              key={diff.path}
              type="button"
              className={`diff-tab ${selectedDiff?.path === diff.path ? 'active' : ''}`}
              onClick={() => selectDiff(diff.path)}
            >
              {diff.path.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {selectedDiff && <DiffView diff={selectedDiff} />}
    </div>
  );
}

export default DiffsPanel;
