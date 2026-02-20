/**
 * DiffsPanel - Display file diffs
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-14238 - Git-based diffs (renders raw unified diff format)
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { useDiffs } from '../../hooks/useDiffs';
import { DiffView } from './DiffView';

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
        <Button variant="ghost" size="sm" type="button" className="clear-button" onClick={clearDiffs}>
          Clear
        </Button>
      </div>

      {diffs.length > 1 && (
        <div className="diff-tabs">
          {diffs.map(diff => (
            <Button
              variant={selectedDiff?.path === diff.path ? 'secondary' : 'ghost'}
              size="sm"
              key={diff.path}
              type="button"
              className={`diff-tab ${selectedDiff?.path === diff.path ? 'active' : ''}`}
              onClick={() => selectDiff(diff.path)}
            >
              {diff.path.split('/').pop()}
            </Button>
          ))}
        </div>
      )}

      {selectedDiff && <DiffView diff={selectedDiff} />}
    </div>
  );
}

export default DiffsPanel;
