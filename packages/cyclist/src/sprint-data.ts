/**
 * Sprint Data Aggregation Service
 *
 * Thin wrapper around `pf sprint data --json` canonical CLI output.
 * Calls subprocess and transforms JSON to SprintData for WebSocket broadcast.
 *
 * Story MSSCI-15427 - Migrate Cyclist sprint panel to canonical data service
 *
 * Data sources:
 * - `pf sprint data --json` subprocess — merged sprint/epic/story data
 * - .session/*-session.md - Current active story (via story-parser)
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { getStoryInfo } from './story-parser.js';

// =============================================================================
// Types matching EnhancedSprintPanel expectations
// =============================================================================

export interface SprintStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  jiraKey: string | null;
  hasContext?: boolean;
  assignedTo?: string | null;
  completed?: string | null;
  started?: string | null;
  workflow?: string | null;
  priority?: string | null;
  description?: string | null;
}

export interface SprintEpic {
  id: string;
  title: string;
  jiraKey: string | null;
  stories: SprintStory[];
  hasContext?: boolean;
}

export interface FutureEpicChild {
  id: string;
  title: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
  jiraKey: string | null;
  storyCount: number;
}

export interface FutureEpic {
  id: string;
  title: string;
  description: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
  children: FutureEpicChild[];
}

export interface SprintMetrics {
  completed: { points: number; stories: number; epics: number };
  current: { done: number; inProgress: number; remaining: number; totalPoints: number; storiesDone: number; storiesInProgress: number; storiesRemaining: number };
  future: { totalPoints: number; initiatives: number; epics: number };
  velocity: number;
}

export interface SprintData {
  currentStory: SprintStory | null;
  nextStory: SprintStory | null;
  epics: SprintEpic[];
  completedEpics: SprintEpic[];
  futureEpics: FutureEpic[];
  sprint: {
    number: number;
    name: string;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
  metrics: SprintMetrics;
  _registry?: {
    name: string;
    type: string;
    is_default: boolean;
  };
}

// =============================================================================
// Canonical CLI Types (internal, matches `pf sprint data --json` output)
// =============================================================================

interface CanonicalStory {
  id: string;
  jira?: string;
  title: string;
  points?: number;
  priority?: string;
  status?: string;
  workflow?: string;
  assigned_to?: string;
  completed?: string;
  started?: string;
  description?: string;
}

interface CanonicalEpic {
  id: string;
  jira?: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  repos?: string;
  stories?: CanonicalStory[];
}

interface CanonicalData {
  sprint: {
    name: string;
    number?: number;
    end_date?: string;
    jira_sprint_id?: number;
    jira_sprint_name?: string;
    goal?: string;
    start_date?: string;
    status?: string;
  };
  epics: CanonicalEpic[];
  stories?: CanonicalStory[];
  standalone_stories?: CanonicalStory[];
  points?: { total: number; completed: number; in_progress: number; backlog: number };
  stories_count?: { total: number; done: number; in_progress: number; backlog: number };
  _orphans?: unknown[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapStoryStatus(status?: string): SprintStory['status'] {
  if (!status) return 'backlog';
  const normalized = status.toLowerCase();
  if (normalized === 'done' || normalized === 'completed') return 'done';
  if (normalized === 'in_progress' || normalized === 'in-progress') return 'in_progress';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'blocked') return 'blocked';
  return 'backlog';
}

function extractSprintNumber(name?: string): number {
  if (!name) return 0;
  const match = name.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getEmptySprintData(): SprintData {
  return {
    currentStory: null,
    nextStory: null,
    epics: [],
    completedEpics: [],
    futureEpics: [],
    sprint: { number: 0, name: 'Unknown Sprint', done: 0, remaining: 0, inProgress: 0, endDate: '' },
    metrics: {
      completed: { points: 0, stories: 0, epics: 0 },
      current: { done: 0, inProgress: 0, remaining: 0, totalPoints: 0, storiesDone: 0, storiesInProgress: 0, storiesRemaining: 0 },
      future: { totalPoints: 0, initiatives: 0, epics: 0 },
      velocity: 0,
    },
  };
}

function transformCanonicalStory(story: CanonicalStory): SprintStory {
  return {
    id: story.id,
    title: story.title,
    points: story.points ?? 0,
    status: mapStoryStatus(story.status),
    jiraKey: story.jira ?? null,
    assignedTo: story.assigned_to ?? null,
    completed: story.completed ?? null,
    started: story.started ?? null,
    workflow: story.workflow ?? null,
    priority: story.priority ?? null,
    description: story.description ?? null,
  };
}

function transformCanonicalEpic(epic: CanonicalEpic): SprintEpic {
  return {
    id: epic.id,
    title: epic.title,
    jiraKey: epic.jira ?? null,
    stories: (epic.stories ?? []).map(transformCanonicalStory),
  };
}

// =============================================================================
// Main Data Aggregation
// =============================================================================

/**
 * Get aggregated sprint data for EnhancedSprintPanel.
 * Calls `pf sprint data --json` subprocess and transforms output.
 */
export function getSprintData(projectDir: string, _userEmail?: string | null): SprintData {
  // Call canonical CLI subprocess
  let canonical: CanonicalData;
  try {
    const pfScript = join(projectDir, '.pennyfarthing', 'scripts', 'core', 'pf.sh');
    const raw = execSync(
      `"${pfScript}" sprint data --json`,
      { cwd: projectDir, encoding: 'utf-8', timeout: 10000 },
    );
    canonical = JSON.parse(raw.trim());
  } catch {
    return getEmptySprintData();
  }

  // Transform epics
  const epics: SprintEpic[] = (canonical.epics ?? []).map(transformCanonicalEpic);

  // Add standalone stories as pseudo-epic
  const standaloneStories = (canonical.standalone_stories ?? []).map(transformCanonicalStory);
  if (standaloneStories.length > 0) {
    epics.push({
      id: 'standalone',
      title: 'Standalone Stories',
      jiraKey: null,
      stories: standaloneStories,
    });
  }

  // Get current story from session
  const storyInfo = getStoryInfo(projectDir);
  let currentStory: SprintStory | null = null;
  let nextStory: SprintStory | null = null;

  if (storyInfo.id) {
    for (const epic of epics) {
      const found = epic.stories.find(s => s.id === storyInfo.id);
      if (found) {
        currentStory = found;
        break;
      }
    }
  }

  // Find next backlog story (prefer assigned to current user)
  if (!currentStory) {
    let userEmail: string | null = null;
    try {
      userEmail = execSync('git config user.email', { cwd: projectDir, encoding: 'utf-8' }).trim() || null;
    } catch {
      // No git config available
    }

    if (userEmail) {
      for (const epic of epics) {
        const assigned = epic.stories.find(s => s.status === 'backlog' && s.assignedTo === userEmail);
        if (assigned) {
          nextStory = assigned;
          break;
        }
      }
    }

    if (!nextStory) {
      for (const epic of epics) {
        const unassigned = epic.stories.find(s => s.status === 'backlog' && !s.assignedTo);
        if (unassigned) {
          nextStory = unassigned;
          break;
        }
      }
    }
  }

  // Use canonical points/counts for metrics
  const pts = canonical.points ?? { completed: 0, in_progress: 0, backlog: 0, total: 0 };
  const counts = canonical.stories_count ?? { done: 0, in_progress: 0, backlog: 0, total: 0 };

  return {
    currentStory,
    nextStory,
    epics,
    completedEpics: [],
    futureEpics: [],
    sprint: {
      number: canonical.sprint.number ?? extractSprintNumber(canonical.sprint.name),
      name: canonical.sprint.name ?? 'Unknown Sprint',
      done: pts.completed,
      remaining: pts.backlog,
      inProgress: pts.in_progress,
      endDate: canonical.sprint.end_date ?? '',
    },
    metrics: {
      completed: { points: pts.completed, stories: counts.done, epics: 0 },
      current: {
        done: pts.completed,
        inProgress: pts.in_progress,
        remaining: pts.backlog,
        totalPoints: pts.total,
        storiesDone: counts.done,
        storiesInProgress: counts.in_progress,
        storiesRemaining: counts.backlog,
      },
      future: { totalPoints: 0, initiatives: 0, epics: 0 },
      velocity: pts.completed,
    },
  };
}

/**
 * Archive a completed epic
 * Returns true if successful, throws on error
 */
export async function archiveEpic(projectDir: string, epicId: string): Promise<boolean> {
  console.log(`[sprint-data] Archive epic ${epicId} requested (not yet implemented)`);
  throw new Error('Archive epic not yet implemented');
}

/**
 * Promote a future epic to current sprint
 * Returns true if successful, throws on error
 */
export async function promoteEpic(projectDir: string, epicId: string): Promise<boolean> {
  console.log(`[sprint-data] Promote epic ${epicId} requested (not yet implemented)`);
  throw new Error('Promote epic not yet implemented');
}
