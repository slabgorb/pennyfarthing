/**
 * Story info resolution via pf CLI subprocess delegation.
 * Story 141-17: Replaced direct file parsing with child_process calls to pf CLI.
 */

import { callPf } from '../shared/pf-cli.js';

// ---------------------------------------------------------------------------
// Types (kept stable — same exported interfaces)
// ---------------------------------------------------------------------------

// Workflow phase with status
export interface WorkflowPhase {
  name: string;
  agent: string;
  label: string;
  status: 'done' | 'current' | 'pending';
}

// Legacy alias for backward compatibility
export type WorkflowStep = WorkflowPhase;

// Acceptance criteria item
export interface CriteriaItem {
  text: string;
  completed: boolean;
}

// Sprint story for expandable story section
export interface SprintStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled';
  jiraKey: string | null;
  jiraUrl: string | null;
}

// Epic context for expandable story section
export interface EpicContext {
  id: string;
  title: string;
  jiraKey: string | null;
  jiraUrl: string | null;
  stories: SprintStory[];
}

// Available workflow summary for discovery panel
export interface AvailableWorkflow {
  name: string;
  type: 'phased' | 'stepped';
  description: string;
  triggers?: {
    types?: string[];
    tags?: string[];
    points?: { min?: number; max?: number };
    default?: boolean;
  };
}

// Story info interface (enhanced with workflow details)
export interface StoryInfo {
  id: string | null;
  title: string | null;
  phase: string | null;
  status: string | null;
  points: number | null;
  sprint: {
    number: number;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string | null;
  } | null;
  nextAgent: string | null;
  workflow: WorkflowStep[] | null;
  pr: string | null;
  branch: string | null;
  criteria: CriteriaItem[] | null;
  workflowType: string | null;
  sprintStories: SprintStory[] | null;
  epicContext: EpicContext | null;
  jiraUrl: string | null;
  availableWorkflows: AvailableWorkflow[] | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyStoryInfo(): StoryInfo {
  return {
    id: null, title: null, phase: null, status: null, points: null,
    sprint: null, nextAgent: null, workflow: null, pr: null, branch: null,
    criteria: null, workflowType: null, sprintStories: null,
    epicContext: null, jiraUrl: null, availableWorkflows: null,
  };
}

// Result wrapper: { success: true, data } or { success: false, error }
function wrapResult<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

function wrapError(error: string): { success: false; error: string } {
  return { success: false, error };
}

// ---------------------------------------------------------------------------
// CLI-delegated functions
// ---------------------------------------------------------------------------

/**
 * Get story info by delegating to pf CLI.
 * Combines: pf sprint story show --json, pf sprint info, pf workflow list --json
 */
export function getStoryInfo(projectDir: string): StoryInfo {
  const result = emptyStoryInfo();

  // Get story details from CLI
  const storyResult = callPf<Record<string, unknown>>(['sprint', 'story', 'show', '--json'], projectDir);
  if (storyResult.success && storyResult.data) {
    const d = storyResult.data;
    result.id = (d.id as string) ?? null;
    result.title = (d.title as string) ?? null;
    result.phase = (d.phase as string) ?? null;
    result.status = (d.status as string) ?? null;
    result.points = (d.points as number) ?? null;
    result.pr = (d.pr as string) ?? null;
    result.branch = (d.branch as string) ?? null;
    result.jiraUrl = (d.jiraUrl as string) ?? null;
    result.criteria = (d.criteria as CriteriaItem[]) ?? null;
    result.workflow = (d.workflow as WorkflowStep[]) ?? null;
    result.workflowType = (d.workflowType as string) ?? null;
    result.nextAgent = (d.nextAgent as string) ?? null;
    result.sprintStories = (d.sprintStories as SprintStory[]) ?? null;
    result.epicContext = (d.epicContext as EpicContext) ?? null;
  }

  // Get sprint info
  const sprintResult = callPf<Record<string, unknown>>(['sprint', 'info'], projectDir);
  if (sprintResult.success && sprintResult.data) {
    const s = sprintResult.data;
    result.sprint = {
      number: (s.number as number) ?? 0,
      done: (s.done as number) ?? 0,
      remaining: (s.remaining as number) ?? 0,
      inProgress: (s.inProgress as number) ?? (s.in_progress as number) ?? 0,
      endDate: (s.endDate as string) ?? (s.end_date as string) ?? null,
    };
  }

  // Get available workflows
  const wfResult = callPf<AvailableWorkflow[]>(['workflow', 'list', '--json'], projectDir);
  if (wfResult.success && wfResult.data) {
    result.availableWorkflows = wfResult.data;
  }

  return result;
}

/**
 * Parse session file content for story info.
 * Delegates to CLI — content parameter kept for backward compatibility.
 */
export function parseSessionFile(_content: string, projectDir?: string): Partial<StoryInfo> {
  if (!projectDir) return {};
  const r = callPf<Partial<StoryInfo>>(['sprint', 'story', 'show', '--json'], projectDir);
  return r.success && r.data ? r.data : {};
}

/**
 * Parse acceptance criteria — now included in story show --json response.
 */
export function parseAcceptanceCriteria(_content: string): CriteriaItem[] | null {
  return null;
}

/**
 * Parse workflow progress — delegates to pf workflow phases --json.
 */
export function parseWorkflowProgress(_content: string, projectDir?: string): WorkflowPhase[] | null {
  if (!projectDir) return null;
  const r = callPf<WorkflowPhase[]>(['workflow', 'phases', '--json'], projectDir);
  return r.success && r.data ? r.data : null;
}

/**
 * Parse sprint YAML — delegates to pf sprint info.
 */
export function parseSprintYaml(_content: string): StoryInfo['sprint'] | null {
  const r = callPf<Record<string, unknown>>(['sprint', 'info']);
  if (!r.success || !r.data) return null;
  const s = r.data;
  return {
    number: (s.number as number) ?? 0,
    done: (s.done as number) ?? 0,
    remaining: (s.remaining as number) ?? 0,
    inProgress: (s.inProgress as number) ?? 0,
    endDate: (s.endDate as string) ?? null,
  };
}

/**
 * Get sprint stories — delegates to pf sprint status --json.
 */
export function getSprintStories(_sprintContent: string): SprintStory[] | null {
  const r = callPf<{ stories?: SprintStory[] }>(['sprint', 'status', '--json']);
  return r.success && r.data?.stories ? r.data.stories : null;
}

/**
 * Get epic context for a story — delegates to pf sprint epic show.
 */
export function getEpicContext(_sprintContent: string, storyId: string): EpicContext | null {
  const r = callPf<EpicContext>(['sprint', 'epic', 'show', storyId, '--json']);
  return r.success && r.data ? r.data : null;
}

/**
 * Get workflow phases — delegates to pf workflow phases --json.
 */
export function getWorkflowPhases(workflowName: string, projectDir: string): Omit<WorkflowPhase, 'status'>[] | null {
  const r = callPf<Array<Omit<WorkflowPhase, 'status'>>>(['workflow', 'phases', workflowName, '--json'], projectDir);
  return r.success && r.data ? r.data : null;
}

/**
 * Get available workflows — delegates to pf workflow list --json.
 */
export function getAvailableWorkflows(projectDir: string): AvailableWorkflow[] {
  const r = callPf<AvailableWorkflow[]>(['workflow', 'list', '--json'], projectDir);
  return r.success && r.data ? r.data : [];
}
