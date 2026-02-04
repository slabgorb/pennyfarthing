/**
 * SprintPanel - Display current story/sprint info
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-14189 - Enhanced Sprint Panel with story management and epic actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useStory } from '../../hooks/useStory';

// =============================================================================
// Types for Enhanced Sprint Panel
// =============================================================================

interface SprintStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled';
  jiraKey: string | null;
}

interface SprintEpic {
  id: string;
  title: string;
  jiraKey: string | null;
  stories: SprintStory[];
}

interface FutureEpic {
  id: string;
  title: string;
  description: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
}

interface SprintData {
  currentStory: SprintStory | null;
  nextStory: SprintStory | null;
  epics: SprintEpic[];
  futureEpics: FutureEpic[];
  sprint: {
    number: number;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
}

// Declare the electronAPI type
declare global {
  interface Window {
    electronAPI?: {
      sprint?: {
        getStatus: () => Promise<SprintData>;
        getFuture: () => Promise<FutureEpic[]>;
        archiveEpic: (epicId: string) => Promise<{ success: boolean }>;
        promoteEpic: (epicId: string) => Promise<{ success: boolean }>;
      };
    };
  }
}

// =============================================================================
// Original SprintPanel (unchanged)
// =============================================================================

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

// =============================================================================
// Enhanced Sprint Panel (MSSCI-14189)
// =============================================================================

/**
 * Calculate epic progress (done points / total points)
 */
function calculateEpicProgress(epic: SprintEpic): { done: number; total: number } {
  const total = epic.stories.reduce((sum, s) => sum + s.points, 0);
  const done = epic.stories
    .filter((s) => s.status === 'done')
    .reduce((sum, s) => sum + s.points, 0);
  return { done, total };
}

/**
 * Check if epic is fully completed (all stories done)
 */
function isEpicCompleted(epic: SprintEpic): boolean {
  return epic.stories.length > 0 && epic.stories.every((s) => s.status === 'done');
}

/**
 * EnhancedSprintPanel - Full sprint management with epic actions
 */
export function EnhancedSprintPanel(): React.ReactElement {
  const [data, setData] = useState<SprintData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      if (window.electronAPI?.sprint) {
        const sprintData = await window.electronAPI.sprint.getStatus();
        setData(sprintData);
        // Expand all epics by default
        setExpandedEpics(new Set(sprintData.epics.map((e) => e.id)));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load sprint data'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    loadData();

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sprint`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        // Connection established
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'init' || message.type === 'update') {
            const { type, ...updates } = message;
            // Merge updates with existing data (for partial updates)
            setData((prev) => {
              if (!prev) return updates as SprintData;
              return { ...prev, ...updates } as SprintData;
            });
            if (message.type === 'init' && updates.epics) {
              setExpandedEpics(new Set((updates as SprintData).epics.map((e: SprintEpic) => e.id)));
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        // Attempt to reconnect after 2 seconds
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [loadData]);

  // Toggle epic expansion
  const toggleEpic = useCallback((epicId: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }, []);

  // Handle epic toggle via keyboard
  const handleEpicKeyDown = useCallback(
    (epicId: string, event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleEpic(epicId);
      }
    },
    [toggleEpic]
  );

  // Archive epic action
  const handleArchive = useCallback(
    async (epicId: string) => {
      if (!window.electronAPI?.sprint) return;

      setLoadingActions((prev) => new Set(prev).add(`archive-${epicId}`));
      setConfirmArchive(null);

      try {
        await window.electronAPI.sprint.archiveEpic(epicId);
        await loadData(); // Refresh after archive
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Archive failed'));
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(`archive-${epicId}`);
          return next;
        });
      }
    },
    [loadData]
  );

  // Promote epic action
  const handlePromote = useCallback(
    async (epicId: string) => {
      if (!window.electronAPI?.sprint) return;

      setLoadingActions((prev) => new Set(prev).add(`promote-${epicId}`));

      try {
        await window.electronAPI.sprint.promoteEpic(epicId);
        await loadData(); // Refresh after promote
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Promote failed'));
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(`promote-${epicId}`);
          return next;
        });
      }
    },
    [loadData]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="enhanced-sprint-panel" data-testid="enhanced-sprint-panel">
        <div className="loading-state" data-testid="sprint-panel-loading">
          Loading...
        </div>
      </div>
    );
  }

  // Error toast
  const errorToast = error ? (
    <div className="error-toast" data-testid="error-toast">
      {error.message}
    </div>
  ) : null;

  // Confirmation dialog
  const confirmDialog = confirmArchive ? (
    <div className="confirm-dialog" data-testid="confirm-archive-dialog">
      <p>Are you sure you want to archive this epic?</p>
      <button data-testid="confirm-archive-yes" onClick={() => handleArchive(confirmArchive)}>
        Yes
      </button>
      <button data-testid="confirm-archive-no" onClick={() => setConfirmArchive(null)}>
        No
      </button>
    </div>
  ) : null;

  return (
    <div className="enhanced-sprint-panel" data-testid="enhanced-sprint-panel">
      {errorToast}
      {confirmDialog}

      {/* Section 1: Current Story */}
      <section data-section="current-story">
        <h2>Current Story</h2>
        {data?.currentStory ? (
          <div data-testid="current-story-section">
            <span className="story-id">{data.currentStory.id}</span>
            <span className="story-title">{data.currentStory.title}</span>
            <span className="story-status">{data.currentStory.status}</span>
            <span className="story-points" data-testid="current-story-points">
              {data.currentStory.points} pts
            </span>
          </div>
        ) : data?.nextStory ? (
          <div data-testid="next-up-section">
            <span className="next-up-label">Next up:</span>
            <span className="story-id">{data.nextStory.id}</span>
            <span className="story-title">{data.nextStory.title}</span>
          </div>
        ) : (
          <div data-testid="no-stories-section">
            <span>No active story</span>
          </div>
        )}
      </section>

      {/* Section 2: Epic Tree View */}
      <section data-section="epics">
        <h2>Sprint Stories</h2>
        <div data-testid="epic-tree-view">
          {data?.epics.map((epic) => {
            const { done, total } = calculateEpicProgress(epic);
            const completed = isEpicCompleted(epic);
            const isExpanded = expandedEpics.has(epic.id);
            const isArchiving = loadingActions.has(`archive-${epic.id}`);

            return (
              <div
                key={epic.id}
                className={`epic-group ${completed ? 'epic-completed' : ''}`}
                data-testid={`epic-group-${epic.id}`}
              >
                {/* Epic Header */}
                <div className="epic-header">
                  <button
                    className="epic-toggle"
                    data-testid={`epic-toggle-${epic.id}`}
                    onClick={() => toggleEpic(epic.id)}
                    onKeyDown={(e) => handleEpicKeyDown(epic.id, e)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  <span className="epic-title">{epic.title}</span>
                  {epic.jiraKey && <span className="epic-jira">{epic.jiraKey}</span>}

                  {/* Progress bar */}
                  <div
                    className="epic-progress"
                    data-testid={`epic-progress-${epic.id}`}
                    data-done={String(done)}
                    data-total={String(total)}
                  >
                    <div
                      className="progress-bar"
                      style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                  </div>
                  <span
                    className="epic-progress-label"
                    data-testid={`epic-progress-label-${epic.id}`}
                  >
                    {done}/{total} pts
                  </span>

                  {/* Archive button for completed epics */}
                  {completed && (
                    <>
                      {isArchiving && (
                        <span data-testid={`archive-loading-${epic.id}`}>...</span>
                      )}
                      <button
                        className="archive-button"
                        data-testid={`archive-button-${epic.id}`}
                        aria-label={`Archive ${epic.id}`}
                        disabled={isArchiving}
                        onClick={() => setConfirmArchive(epic.id)}
                      >
                        Archive
                      </button>
                    </>
                  )}
                </div>

                {/* Stories list (collapsible) */}
                {isExpanded && (
                  <div className="epic-stories">
                    {epic.stories.map((story) => (
                      <div
                        key={story.id}
                        className="story-item"
                        data-testid={`story-item-${story.id}`}
                        data-status={story.status}
                        data-story-id={story.id}
                        aria-label={`${story.id}: ${story.title}`}
                      >
                        <span className="story-title">{story.title}</span>
                        <span
                          className="story-points"
                          data-testid={`story-points-${story.id}`}
                        >
                          {story.points}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Future Initiatives */}
      <section data-section="future">
        <h2>Future Initiatives</h2>
        <div data-testid="future-initiatives-section">
          {data?.futureEpics.map((epic) => {
            const isPromoting = loadingActions.has(`promote-${epic.id}`);
            const canPromote = epic.status === 'ready';

            return (
              <div
                key={epic.id}
                className="future-epic"
                data-testid={`future-epic-${epic.id}`}
              >
                <span className="future-epic-title">{epic.title}</span>
                <span className="future-epic-points">{epic.estimatedPoints} pts</span>
                <span
                  className="future-epic-status"
                  data-testid={`future-epic-status-${epic.id}`}
                >
                  {epic.status}
                </span>
                {canPromote && (
                  <button
                    className="promote-button"
                    data-testid={`promote-button-${epic.id}`}
                    aria-label={`Promote ${epic.id} to current sprint`}
                    disabled={isPromoting}
                    onClick={() => handlePromote(epic.id)}
                  >
                    Promote
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default SprintPanel;
