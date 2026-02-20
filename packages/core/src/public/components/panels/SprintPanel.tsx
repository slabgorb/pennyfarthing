/**
 * SprintPanel - Display current story/sprint info
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-14189 - Enhanced Sprint Panel with story management and epic actions
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Copy, Loader, Circle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useStory } from '../../hooks/useStory';
import { useSprint, type SprintStory, type SprintEpic, type FutureEpic, type FutureEpicChild } from '../../hooks/useSprint';

// =============================================================================
// Original SprintPanel (unchanged)
// =============================================================================

export function SprintPanel(): React.ReactElement {
  const { story, isLoading, error } = useStory();

  if (isLoading) {
    return (
      <div className="sprint-panel loading" data-testid="sprint-panel">
        <div className="space-y-2 p-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
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
 * Format email to short display name: "keith.avery@..." -> "K. Avery"
 */
function formatAssignee(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0];
  const parts = local.split('.');
  if (parts.length >= 2) {
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1);
    return `${first}. ${last}`;
  }
  return local;
}

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
  return epic.stories.length > 0 && epic.stories.every((s) => s.status === 'done' || s.status === 'cancelled');
}

/**
 * Get status badge content and class for a story status
 */
function getStatusBadgeInfo(status: SprintStory['status']): { icon: React.ReactElement; className: string } {
  const size = 12;
  switch (status) {
    case 'done':
      return { icon: <Check size={size} />, className: 'status-done' };
    case 'in_progress':
      return { icon: <Loader size={size} />, className: 'status-in-progress' };
    case 'blocked':
      return { icon: <AlertTriangle size={size} />, className: 'status-blocked' };
    case 'backlog':
    default:
      return { icon: <Circle size={size} />, className: 'status-backlog' };
  }
}

/**
 * Build Jira ticket URL
 */
function getJiraUrl(jiraKey: string): string {
  return `https://1898andco.atlassian.net/browse/${jiraKey}`;
}

/**
 * Context indicator component for epics and stories
 */
function ContextIndicator({
  hasContext,
  testIdPrefix,
  id,
}: {
  hasContext: boolean;
  testIdPrefix: 'epic' | 'story';
  id: string;
}): React.ReactElement {
  const tooltipText = hasContext ? 'Context file exists' : 'No context file';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`context-indicator ${hasContext ? 'has-context' : 'no-context'}`}
          data-testid={`${testIdPrefix}-context-indicator-${id}`}
          data-has-context={String(hasContext)}
          title={tooltipText}
        >
          {hasContext ? '📄' : ''}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Priority label component - muted text abbreviation
 */
function PriorityDot({ priority, storyId }: { priority?: string | null; storyId: string }): React.ReactElement | null {
  if (!priority) return null;
  return (
    <span
      className="priority-label"
      data-testid={`story-priority-${storyId}`}
      data-priority={priority}
      title={priority}
    >
      {priority}
    </span>
  );
}

/**
 * Status badge component for stories
 */
function StatusBadge({ status, storyId }: { status: SprintStory['status']; storyId: string }): React.ReactElement {
  const { icon, className } = getStatusBadgeInfo(status);
  return (
    <Badge
      variant={status === 'blocked' ? 'destructive' : status === 'done' ? 'default' : 'secondary'}
      className={`story-status-badge ${className}`}
      data-testid={`story-status-badge-${storyId}`}
      data-status={status}
      aria-label={`Status: ${status}`}
    >
      {icon}
    </Badge>
  );
}

/**
 * Jira link component for stories
 */
function JiraLink({ jiraKey, storyId }: { jiraKey: string; storyId: string }): React.ReactElement {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = getJiraUrl(jiraKey);
    try {
      const api = (window as any).electronAPI;
      if (api?.shell?.openExternal) {
        api.shell.openExternal(url);
        return;
      }
    } catch {
      // electronAPI not available or call failed
    }
    window.open(url, '_blank');
  };

  return (
    <a
      className="jira-link cyclist-link"
      data-testid={`story-jira-link-${storyId}`}
      href={getJiraUrl(jiraKey)}
      onClick={handleClick}
    >
      {jiraKey}
    </a>
  );
}

/**
 * CopyButton - Copy ID + title to clipboard on click
 */
function CopyButton({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <button
      className={`copy-id-button ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      aria-label={`Copy ${text}`}
      title="Copy ID + title"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

/**
 * EpicGroup - Renders a single epic with its stories
 */
function EpicGroup({
  epic,
  isExpanded,
  isArchiving,
  onToggle,
  onKeyDown,
  onArchive,
}: {
  epic: SprintEpic;
  isExpanded: boolean;
  isArchiving: boolean;
  onToggle: (id: string) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent) => void;
  onArchive: (id: string) => void;
}): React.ReactElement {
  const { done, total } = calculateEpicProgress(epic);
  const completed = isEpicCompleted(epic);

  return (
    <div
      className={`epic-group ${completed ? 'epic-completed' : ''}`}
      data-testid={`epic-group-${epic.id}`}
    >
      {/* Epic Header */}
      <div className="epic-header">
        <Button
          variant="ghost"
          size="icon"
          className="epic-toggle"
          data-testid={`epic-toggle-${epic.id}`}
          onClick={() => onToggle(epic.id)}
          onKeyDown={(e) => onKeyDown(epic.id, e)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? '▼' : '▶'}
        </Button>
        <span className="epic-title">{epic.title}</span>
        {epic.jiraKey && <span className="epic-jira">{epic.jiraKey}</span>}
        <CopyButton text={`${epic.id} ${epic.title}`} />
        <ContextIndicator hasContext={epic.hasContext ?? false} testIdPrefix="epic" id={epic.id} />
        {completed && epic.hasContext && (
          <Badge variant="default" className="epic-ready-badge" data-testid={`epic-ready-badge-${epic.id}`}>
            Ready
          </Badge>
        )}

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
            <Button
              variant="outline"
              size="sm"
              className="archive-button"
              data-testid={`archive-button-${epic.id}`}
              aria-label={`Archive ${epic.id}`}
              disabled={isArchiving}
              onClick={() => onArchive(epic.id)}
            >
              Archive
            </Button>
          </>
        )}
      </div>

      {/* Stories list (collapsible) */}
      {isExpanded && (
        <div className="epic-stories">
          {epic.stories.map((story) => {
            const hasContext = story.hasContext ?? false;
            const isBlocked = story.status === 'blocked';
            const assigneeDisplay = formatAssignee(story.assignedTo);
            return (
              <div
                key={story.id}
                className={`story-item ${!hasContext ? 'missing-context' : ''} ${isBlocked ? 'story-blocked' : ''}`}
                data-testid={`story-item-${story.id}`}
                data-status={story.status}
                data-story-id={story.id}
                aria-label={`${story.id}: ${story.title}`}
              >
                <PriorityDot priority={story.priority} storyId={story.id} />
                <StatusBadge status={story.status} storyId={story.id} />
                {story.jiraKey && <JiraLink jiraKey={story.jiraKey} storyId={story.id} />}
                <CopyButton text={`${story.id} ${story.title}`} />
                <div className="story-info">
                  <span className="story-title">{story.title}</span>
                  <span className="story-meta">
                    {assigneeDisplay && (
                      <span
                        className="story-assignee"
                        data-testid={`story-assignee-${story.id}`}
                      >
                        {assigneeDisplay}
                      </span>
                    )}
                    {story.workflow && (
                      <span
                        className="story-workflow-badge"
                        data-testid={`story-workflow-${story.id}`}
                      >
                        {story.workflow}
                      </span>
                    )}
                    {story.status === 'done' && story.completed && (
                      <span
                        className="story-completed-date"
                        data-testid={`story-completed-${story.id}`}
                      >
                        {story.completed}
                      </span>
                    )}
                  </span>
                </div>
                <ContextIndicator hasContext={hasContext} testIdPrefix="story" id={story.id} />
                <span
                  className="story-points"
                  data-testid={`story-points-${story.id}`}
                >
                  {story.points}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * EnhancedSprintPanel - Full sprint management with epic actions
 */
export function EnhancedSprintPanel(): React.ReactElement {
  // Use the sprint hook for data fetching via WebSocket
  const { data, isLoading, error } = useSprint();
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  // Split epics into active (has non-done stories) vs completed (all stories done)
  const activeEpics = data?.epics.filter((e) => !isEpicCompleted(e)) ?? [];
  const completedEpics = data?.epics.filter((e) => isEpicCompleted(e)) ?? [];

  // Expand only active epics by default when data first loads (once only)
  // Completed epics start collapsed
  const hasInitializedExpansion = useRef(false);
  useEffect(() => {
    if (data?.epics && !hasInitializedExpansion.current) {
      hasInitializedExpansion.current = true;
      setExpandedEpics(new Set(activeEpics.map((e) => e.id)));
    }
  }, [data?.epics]);

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
      setLoadingActions((prev) => new Set(prev).add(`archive-${epicId}`));
      setConfirmArchive(null);
      setActionError(null); // Clear any previous errors

      try {
        // Use electronAPI if available (Electron mode), otherwise REST endpoint (web mode)
        if (typeof window !== 'undefined' && (window as any).electronAPI?.sprint?.archiveEpic) {
          await (window as any).electronAPI.sprint.archiveEpic(epicId);
        } else {
          const response = await fetch(`/api/sprint/archive-epic/${epicId}`, { method: 'POST' });
          if (!response.ok) throw new Error('Archive failed');
        }
        // Success - error already cleared at start
      } catch (err) {
        setActionError(err instanceof Error ? err : new Error('Archive failed'));
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(`archive-${epicId}`);
          return next;
        });
      }
    },
    []
  );

  // Promote epic action
  const handlePromote = useCallback(
    async (epicId: string) => {
      setLoadingActions((prev) => new Set(prev).add(`promote-${epicId}`));
      setActionError(null); // Clear any previous errors

      try {
        // Use electronAPI if available (Electron mode), otherwise REST endpoint (web mode)
        if (typeof window !== 'undefined' && (window as any).electronAPI?.sprint?.promoteEpic) {
          await (window as any).electronAPI.sprint.promoteEpic(epicId);
        } else {
          const response = await fetch(`/api/sprint/promote-epic/${epicId}`, { method: 'POST' });
          if (!response.ok) throw new Error('Promote failed');
        }
        // Success - error already cleared at start
      } catch (err) {
        setActionError(err instanceof Error ? err : new Error('Promote failed'));
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(`promote-${epicId}`);
          return next;
        });
      }
    },
    []
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="enhanced-sprint-panel" data-testid="enhanced-sprint-panel">
        <div className="loading-state space-y-3 p-2" data-testid="sprint-panel-loading">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Separator className="my-2" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Separator className="my-2" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </div>
    );
  }

  // Error toast (show either WebSocket error or action error)
  const displayError = error || actionError;
  const errorToast = displayError ? (
    <div className="error-toast" data-testid="error-toast">
      {displayError.message}
    </div>
  ) : null;

  // Confirmation dialog
  const confirmDialog = confirmArchive ? (
    <div className="confirm-dialog" data-testid="confirm-archive-dialog">
      <p>Are you sure you want to archive this epic?</p>
      <Button variant="destructive" size="sm" data-testid="confirm-archive-yes" onClick={() => handleArchive(confirmArchive)}>
        Yes
      </Button>
      <Button variant="outline" size="sm" data-testid="confirm-archive-no" onClick={() => setConfirmArchive(null)}>
        No
      </Button>
    </div>
  ) : null;

  return (
    <TooltipProvider delayDuration={300}>
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

      <Separator className="my-2" />

      {/* Section 2: Active Epics */}
      <section data-section="epics">
        <h2>Current Epics</h2>
        <div data-testid="epic-tree-view">
          {(!data?.epics || data.epics.length === 0) && (
            <div className="empty-state" data-testid="no-epics-section">
              <span>No epics in current sprint</span>
              <p className="hint">Promote an epic from Future Initiatives to get started</p>
            </div>
          )}
          {activeEpics.map((epic) => (
            <EpicGroup
              key={epic.id}
              epic={epic}
              isExpanded={expandedEpics.has(epic.id)}
              isArchiving={loadingActions.has(`archive-${epic.id}`)}
              onToggle={toggleEpic}
              onKeyDown={handleEpicKeyDown}
              onArchive={setConfirmArchive}
            />
          ))}
        </div>
      </section>

      {/* Section 2b: Completed Epics */}
      {completedEpics.length > 0 && (
        <>
          <Separator className="my-2" />
          <section data-section="completed-epics">
            <h2>Completed Epics</h2>
            <div data-testid="completed-epics-section">
              {completedEpics.map((epic) => (
                <EpicGroup
                  key={epic.id}
                  epic={epic}
                  isExpanded={expandedEpics.has(epic.id)}
                  isArchiving={loadingActions.has(`archive-${epic.id}`)}
                  onToggle={toggleEpic}
                  onKeyDown={handleEpicKeyDown}
                  onArchive={setConfirmArchive}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <Separator className="my-2" />

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
                <Badge
                  variant={epic.status === 'ready' ? 'default' : 'secondary'}
                  className="future-epic-status"
                  data-testid={`future-epic-status-${epic.id}`}
                  data-status={epic.status}
                >
                  {epic.status}
                </Badge>
                {canPromote && (
                  <Button
                    variant="default"
                    size="sm"
                    className="promote-button"
                    data-testid={`promote-button-${epic.id}`}
                    aria-label={`Promote ${epic.id} to current sprint`}
                    disabled={isPromoting}
                    onClick={() => handlePromote(epic.id)}
                  >
                    Promote
                  </Button>
                )}
                {epic.children && epic.children.length > 0 && (
                  <div className="future-epic-children" data-testid={`future-children-${epic.id}`}>
                    {epic.children.map((child: FutureEpicChild) => (
                      <div
                        key={child.id}
                        className="future-epic-child"
                        data-testid={`future-child-${child.id}`}
                      >
                        <span className="future-child-title">{child.title}</span>
                        <span className="future-child-points">{child.estimatedPoints} pts</span>
                        <span className="future-child-stories">{child.storyCount} stories</span>
                        <Badge
                          variant={child.status === 'blocked' ? 'destructive' : 'secondary'}
                          className="future-child-status"
                          data-status={child.status}
                        >
                          {child.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
    </TooltipProvider>
  );
}

export default SprintPanel;
