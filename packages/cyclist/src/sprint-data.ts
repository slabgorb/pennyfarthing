/**
 * Sprint Data Aggregation Service
 *
 * Parses sprint/*.yaml files and aggregates data for the EnhancedSprintPanel.
 * Story MSSCI-14189 - Enhanced Sprint Panel with story management and epic actions
 *
 * Data sources:
 * - sprint/current-sprint.yaml - Active sprint with epics and stories
 * - sprint/future.yaml - Future initiatives and backlog epics
 * - .session/*-session.md - Current active story (if any)
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
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
}

// =============================================================================
// YAML Types (internal, matches sprint/*.yaml structure)
// =============================================================================

interface YamlStory {
  id: string;
  title: string;
  points?: number;
  status?: string;
  jira?: string;
  assigned_to?: string;
  completed?: string;
  started?: string;
  workflow?: string;
  priority?: string;
  description?: string;
}

interface YamlEpic {
  id: string;
  title: string;
  jira?: string;
  stories?: YamlStory[];
  points?: number;
  status?: string;
  description?: string;
}

interface YamlSprint {
  name?: string;
  end_date?: string;
  jira_sprint_id?: number;
}

interface CurrentSprintYaml {
  sprint?: YamlSprint;
  epics?: (YamlEpic | string)[];
  stories?: YamlStory[];
}

interface FutureInitiative {
  name: string;
  description?: string;
  status?: string;
  total_points?: number;
  epics?: (YamlEpic | string)[];
}

interface FutureYaml {
  future?: {
    initiatives?: (FutureInitiative | string)[];
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map YAML status string to SprintStory status enum
 */
function mapStoryStatus(status?: string): SprintStory['status'] {
  if (!status) return 'backlog';
  const normalized = status.toLowerCase();
  if (normalized === 'done' || normalized === 'completed') return 'done';
  if (normalized === 'in_progress' || normalized === 'in-progress') return 'in_progress';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'blocked') return 'blocked';
  return 'backlog';
}

/**
 * Map initiative status to FutureEpic status
 */
function mapFutureStatus(status?: string): FutureEpic['status'] {
  if (!status) return 'planning';
  const normalized = status.toLowerCase();
  if (normalized === 'ready' || normalized === 'research_complete') return 'ready';
  if (normalized.includes('block')) return 'blocked';
  return 'planning';
}

/**
 * Extract sprint number from name like "TO Sprint 2606"
 */
function extractSprintNumber(name?: string): number {
  if (!name) return 0;
  const match = name.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check if epic context file exists
 */
function checkEpicContext(projectDir: string, epicId: string): boolean {
  // Extract numeric part from epic ID (e.g., "epic-76" -> "76")
  const match = epicId.match(/epic-(\d+)/i);
  if (!match) return false;
  const contextPath = join(projectDir, 'sprint', 'context', `context-epic-${match[1]}.md`);
  return existsSync(contextPath);
}

/**
 * Check if story context file exists
 */
function checkStoryContext(projectDir: string, storyId: string): boolean {
  const contextPath = join(projectDir, 'sprint', 'context', `${storyId}-context.md`);
  return existsSync(contextPath);
}

/**
 * Transform YAML story to SprintStory
 */
function transformStory(yamlStory: YamlStory, projectDir: string): SprintStory {
  return {
    id: yamlStory.id,
    title: yamlStory.title,
    points: yamlStory.points ?? 0,
    status: mapStoryStatus(yamlStory.status),
    jiraKey: yamlStory.jira ?? null,
    hasContext: checkStoryContext(projectDir, yamlStory.id),
    assignedTo: yamlStory.assigned_to ?? null,
    completed: yamlStory.completed ?? null,
    started: yamlStory.started ?? null,
    workflow: yamlStory.workflow ?? null,
    priority: yamlStory.priority ?? null,
    description: yamlStory.description ?? null,
  };
}

/**
 * Transform YAML epic to SprintEpic
 */
function transformEpic(yamlEpic: YamlEpic, projectDir: string): SprintEpic {
  return {
    id: yamlEpic.id,
    title: yamlEpic.title.replace(/^Epic:\s*/i, ''), // Clean "Epic: " prefix
    jiraKey: yamlEpic.jira ?? null,
    stories: (yamlEpic.stories ?? []).map((s) => transformStory(s, projectDir)),
    hasContext: checkEpicContext(projectDir, yamlEpic.id),
  };
}

/**
 * Merge sharded epic references into full epic objects.
 * When current-sprint.yaml contains string references (e.g. "MSSCI-14298"),
 * load each epic-{ref}.yaml shard and replace the string with parsed content.
 * Handles both bare refs ("42", "MSSCI-14298") and prefixed refs ("epic-42").
 */
function mergeEpicShards(epics: (YamlEpic | string)[], sprintDir: string): YamlEpic[] {
  return epics.reduce<YamlEpic[]>((merged, entry) => {
    if (typeof entry !== 'string') {
      merged.push(entry);
      return merged;
    }
    // Strip "epic-" prefix if present to avoid double-prefix (epic-epic-42.yaml)
    const ref = entry.startsWith('epic-') ? entry.slice(5) : entry;
    const shardPath = join(sprintDir, `epic-${ref}.yaml`);
    if (existsSync(shardPath)) {
      try {
        const content = readFileSync(shardPath, 'utf-8');
        const epic = parseYaml(content) as YamlEpic;
        if (epic && epic.id) {
          merged.push(epic);
        } else {
          console.warn(`[sprint-data] Shard epic-${entry}.yaml missing id, skipped`);
        }
      } catch (err) {
        console.error(`[sprint-data] Failed to parse epic-${entry}.yaml:`, err);
      }
    } else {
      console.warn(`[sprint-data] Epic shard not found: ${shardPath}`);
    }
    return merged;
  }, []);
}

/**
 * Merge sharded initiative references into full initiative objects.
 * When future.yaml contains string references (e.g. "benchmark-reliability"),
 * load each initiative-{ref}.yaml shard and replace the string with parsed content.
 */
function mergeInitiativeShards(initiatives: (FutureInitiative | string)[], sprintDir: string): FutureInitiative[] {
  return initiatives.reduce<FutureInitiative[]>((merged, entry) => {
    if (typeof entry !== 'string') {
      merged.push(entry);
      return merged;
    }
    const shardPath = join(sprintDir, `initiative-${entry}.yaml`);
    if (existsSync(shardPath)) {
      try {
        const content = readFileSync(shardPath, 'utf-8');
        const initiative = parseYaml(content) as FutureInitiative;
        if (initiative && initiative.name) {
          merged.push(initiative);
        } else {
          console.warn(`[sprint-data] Shard initiative-${entry}.yaml missing name, skipped`);
        }
      } catch (err) {
        console.error(`[sprint-data] Failed to parse initiative-${entry}.yaml:`, err);
      }
    } else {
      console.warn(`[sprint-data] Initiative shard not found: ${shardPath}`);
    }
    return merged;
  }, []);
}

// =============================================================================
// Main Data Aggregation
// =============================================================================

/**
 * Get aggregated sprint data for EnhancedSprintPanel
 */
export function getSprintData(projectDir: string, _userEmail?: string | null): SprintData {
  const currentSprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
  const futurePath = join(projectDir, 'sprint', 'future.yaml');

  // Parse current sprint
  let currentSprint: CurrentSprintYaml = {};
  let parseError: string | null = null;
  if (existsSync(currentSprintPath)) {
    try {
      const content = readFileSync(currentSprintPath, 'utf-8');
      currentSprint = parseYaml(content) as CurrentSprintYaml;
    } catch (err) {
      // Provide actionable error message for YAML parse failures
      const yamlErr = err as { message?: string; linePos?: Array<{ line: number; col: number }> };
      const lineInfo = yamlErr.linePos?.[0] ? ` at line ${yamlErr.linePos[0].line}` : '';
      parseError = `YAML parse error${lineInfo}: ${yamlErr.message || 'Unknown error'}`;
      console.error('[sprint-data] Failed to parse current-sprint.yaml:', parseError);
      console.error('[sprint-data] TIP: Single-quoted strings cannot contain blank lines. Use literal block scalars (|) instead.');
    }
  }

  // Parse future.yaml
  let future: FutureYaml = {};
  if (existsSync(futurePath)) {
    try {
      const content = readFileSync(futurePath, 'utf-8');
      future = parseYaml(content) as FutureYaml;
    } catch (err) {
      console.error('[sprint-data] Failed to parse future.yaml:', err);
    }
  }

  // Get current story from session
  const storyInfo = getStoryInfo(projectDir);

  // Merge sharded epics (string refs → full objects) then transform
  const sprintDir = join(projectDir, 'sprint');
  const resolvedEpics = mergeEpicShards(currentSprint.epics ?? [], sprintDir);
  const epics: SprintEpic[] = resolvedEpics.map((e) => transformEpic(e, projectDir));

  // Load archived epics for metrics only — do NOT add to epics array
  // Archived epics contribute to completed counts but are not rendered in the sprint panel
  let completedEpicCount = 0;
  let archivedDonePoints = 0;
  let archivedDoneStories = 0;
  const sprintNumber = extractSprintNumber(currentSprint.sprint?.name);
  if (sprintNumber > 0) {
    const completedPath = join(sprintDir, 'archive', `sprint-${sprintNumber}-completed.yaml`);
    if (existsSync(completedPath)) {
      try {
        const completedContent = readFileSync(completedPath, 'utf-8');
        const completedData = parseYaml(completedContent) as { completed_epics?: string[] };
        const epicRefs = completedData.completed_epics ?? [];

        for (const ref of epicRefs) {
          const shardPath = join(sprintDir, 'archive', `epic-${ref}.yaml`);
          if (existsSync(shardPath)) {
            try {
              const shardContent = readFileSync(shardPath, 'utf-8');
              const epicData = parseYaml(shardContent) as YamlEpic;
              if (epicData && epicData.id) {
                const transformed = transformEpic(epicData, projectDir);
                completedEpicCount++;
                for (const story of transformed.stories) {
                  archivedDonePoints += story.points;
                  archivedDoneStories++;
                }
              } else {
                console.warn(`[sprint-data] Archive shard epic-${ref}.yaml missing id, skipped`);
              }
            } catch (err) {
              console.error(`[sprint-data] Failed to parse archive epic-${ref}.yaml:`, err);
            }
          } else {
            console.warn(`[sprint-data] Archive shard not found: ${shardPath}`);
          }
        }
      } catch (err) {
        console.error('[sprint-data] Failed to parse completed sprint YAML:', err);
      }
    }
  }

  // Include top-level standalone stories from current-sprint.yaml
  const standaloneStories = (currentSprint.stories ?? []).map((s) => transformStory(s, projectDir));
  if (standaloneStories.length > 0) {
    epics.push({
      id: 'standalone',
      title: 'Standalone Stories',
      jiraKey: null,
      stories: standaloneStories,
    });
  }

  // Calculate sprint metrics from active + standalone epics (archived handled separately above)
  // Note: blocked stories are NOT counted in remaining - they're blocked, not available
  let done = 0;
  let inProgress = 0;
  let remaining = 0;
  let storiesDone = 0;
  let storiesInProgress = 0;
  let storiesRemaining = 0;

  for (const epic of epics) {
    for (const story of epic.stories) {
      if (story.status === 'done') {
        done += story.points;
        storiesDone++;
      } else if (story.status === 'in_progress') {
        inProgress += story.points;
        storiesInProgress++;
      } else if (story.status === 'backlog') {
        remaining += story.points;
        storiesRemaining++;
      }
      // blocked stories intentionally not counted in remaining
    }
  }

  // Find current story in epics
  let currentStory: SprintStory | null = null;
  let nextStory: SprintStory | null = null;

  if (storyInfo.id) {
    // We have an active session - find the story
    for (const epic of epics) {
      const found = epic.stories.find(s => s.id === storyInfo.id);
      if (found) {
        currentStory = found;
        break;
      }
    }
  }

  // Find next backlog story (prefer assigned to current user, skip others' stories)
  if (!currentStory) {
    let userEmail: string | null = null;
    try {
      userEmail = execSync('git config user.email', { cwd: projectDir, encoding: 'utf-8' }).trim() || null;
    } catch {
      // No git config available
    }

    // First pass: backlog stories assigned to current user
    if (userEmail) {
      for (const epic of epics) {
        const assigned = epic.stories.find(s => s.status === 'backlog' && s.assignedTo === userEmail);
        if (assigned) {
          nextStory = assigned;
          break;
        }
      }
    }

    // Second pass: unassigned backlog stories (skip stories assigned to others)
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

  // Transform future initiatives to FutureEpic[]
  // Resolve initiative string refs (e.g. "benchmark-reliability" → initiative-benchmark-reliability.yaml)
  const futureEpics: FutureEpic[] = [];
  const rawInitiatives = future.future?.initiatives ?? [];
  const initiatives = mergeInitiativeShards(rawInitiatives, sprintDir);

  let futureEpicCount = 0;
  for (const initiative of initiatives) {
    // Skip completed initiatives
    if (initiative.status === 'complete') continue;

    // Resolve child epics from initiative's epics refs
    const rawEpics = initiative.epics ?? [];
    const resolvedChildEpics = mergeEpicShards(rawEpics, sprintDir);
    const children: FutureEpicChild[] = resolvedChildEpics.map((epic) => {
      const storyPoints = (epic.stories ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
      return {
        id: String(epic.id),
        title: epic.title.replace(/^Epic:\s*/i, ''),
        estimatedPoints: storyPoints,
        status: mapFutureStatus(epic.status),
        jiraKey: epic.jira ?? null,
        storyCount: (epic.stories ?? []).length,
      };
    });
    futureEpicCount += children.length;

    // Add the initiative itself as a promotable epic
    futureEpics.push({
      id: initiative.name.toLowerCase().replace(/\s+/g, '-'),
      title: initiative.name,
      description: initiative.description ?? '',
      estimatedPoints: initiative.total_points ?? 0,
      status: mapFutureStatus(initiative.status),
      children,
    });
  }

  // Compute future metrics from resolved initiatives
  let futureTotalPoints = 0;
  for (const fe of futureEpics) {
    futureTotalPoints += fe.estimatedPoints;
  }

  return {
    currentStory,
    nextStory,
    epics,
    futureEpics,
    sprint: {
      number: extractSprintNumber(currentSprint.sprint?.name),
      name: currentSprint.sprint?.name ?? 'Unknown Sprint',
      done: done + archivedDonePoints,
      remaining,
      inProgress,
      endDate: currentSprint.sprint?.end_date ?? '',
    },
    metrics: {
      completed: { points: archivedDonePoints, stories: archivedDoneStories, epics: completedEpicCount },
      current: { done, inProgress, remaining, totalPoints: done + inProgress + remaining, storiesDone, storiesInProgress, storiesRemaining },
      future: { totalPoints: futureTotalPoints, initiatives: futureEpics.length, epics: futureEpicCount },
      velocity: done + archivedDonePoints,
    },
  };
}

/**
 * Archive a completed epic
 * Returns true if successful, throws on error
 */
export async function archiveEpic(projectDir: string, epicId: string): Promise<boolean> {
  // TODO: Implement by calling archive_epic.py script
  console.log(`[sprint-data] Archive epic ${epicId} requested (not yet implemented)`);
  throw new Error('Archive epic not yet implemented');
}

/**
 * Promote a future epic to current sprint
 * Returns true if successful, throws on error
 */
export async function promoteEpic(projectDir: string, epicId: string): Promise<boolean> {
  // TODO: Implement by calling promote-epic.sh script
  console.log(`[sprint-data] Promote epic ${epicId} requested (not yet implemented)`);
  throw new Error('Promote epic not yet implemented');
}
