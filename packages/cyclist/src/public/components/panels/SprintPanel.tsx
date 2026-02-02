/**
 * SprintPanel - Display current story/sprint info
 *
 * Story MSSCI-12717 - React Migration
 */

import React from 'react';
import { useStory } from '../../hooks/useStory';

export function SprintPanel(): React.ReactElement {
  const { story, isLoading, error } = useStory();

  if (isLoading) {
    return (
      <div className="sprint-panel loading" data-testid="sprint-panel">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sprint-panel error" data-testid="sprint-panel">
        <div className="error-message">{error.message}</div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="sprint-panel empty" data-testid="sprint-panel">
        <div className="placeholder">No active story</div>
        <p className="hint">Use /sprint work to start a story</p>
      </div>
    );
  }

  return (
    <div className="sprint-panel" data-testid="sprint-panel">
      <div className="story-header">
        <span className="story-id">{story.id}</span>
        {story.status && <span className="story-status">{story.status}</span>}
      </div>
      <h3 className="story-title">{story.title}</h3>
      {story.phase && (
        <div className="story-phase">
          Phase: <strong>{story.phase}</strong>
        </div>
      )}
      {story.workflow && (
        <div className="story-workflow">
          Workflow: {story.workflow}
        </div>
      )}
      {story.points && (
        <div className="story-points">
          Points: {story.points}
        </div>
      )}
      {story.epic && (
        <div className="story-epic">
          Epic: {story.epic}
        </div>
      )}
    </div>
  );
}

export default SprintPanel;
