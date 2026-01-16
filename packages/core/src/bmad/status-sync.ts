/**
 * BMAD Status Sync - Story 32-6
 *
 * Bidirectional sync between Pennyfarthing sprint YAML and BMAD sprint-status.yaml.
 *
 * Features:
 * - Parse BMAD sprint-status.yaml format
 * - Import BMAD status into Pennyfarthing format
 * - Export Pennyfarthing status to BMAD format
 * - Detect conflicts when both have changed
 *
 * Story ID Conversion:
 * - BMAD uses dot notation: "1.1", "32.6"
 * - Pennyfarthing uses dash notation: "1-1", "32-6"
 *
 * Status Mapping:
 * - BMAD 'ready-for-dev' ↔ Pennyfarthing 'backlog'
 * - BMAD 'in-progress' ↔ Pennyfarthing 'in_progress'
 * - BMAD 'review' ↔ Pennyfarthing 'needs_review'
 * - BMAD 'done' ↔ Pennyfarthing 'done'
 * - BMAD 'blocked' → Pennyfarthing 'backlog' (with blocked_reason)
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// =============================================================================
// Types - BMAD Format
// =============================================================================

export type BmadStatus = 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'blocked';

export interface BmadSprintInfo {
  number: number;
  goal: string;
  start_date: string;
  end_date: string;
}

export interface BmadStoryStatus {
  id: string;              // Dot notation: "1.1", "32.6"
  title: string;
  epic?: string;
  status: BmadStatus;
  assignee?: string;
  points: number;
  priority: 'P0' | 'P1' | 'P2';
  started?: string;
  completed?: string;
  blockers?: string[];
}

export interface BmadMetrics {
  total_points: number;
  completed_points: number;
  in_progress_points?: number;
  velocity?: number;
  burndown?: Array<{ date: string; remaining: number }>;
}

export interface BmadSprintStatus {
  sprint: BmadSprintInfo;
  stories: BmadStoryStatus[];
  metrics: BmadMetrics;
}

// =============================================================================
// Types - Pennyfarthing Format
// =============================================================================

export type PennyStatus = 'backlog' | 'in_progress' | 'needs_review' | 'approved' | 'done';

export interface PennyStoryStatus {
  id: string;              // Dash notation: "1-1", "32-6"
  title: string;
  status: PennyStatus;
  points: number;
  priority: string;
  assigned_to?: string;
  started?: string;
  completed?: string;
  blocked_reason?: string; // Set when importing BMAD 'blocked' status
}

export interface PennySprintSummary {
  total_points: number;
  completed_points: number;
  remaining_points: number;
}

// =============================================================================
// Types - Sync Results
// =============================================================================

export interface SyncError {
  field: string;
  message: string;
  storyId?: string;
}

export interface ParseResult {
  success: boolean;
  data?: BmadSprintStatus;
  errors?: SyncError[];
}

export interface ExportResult {
  success: boolean;
  yaml?: string;
  errors?: SyncError[];
}

export interface Conflict {
  storyId: string;
  field: string;
  bmadValue: string | number | undefined;
  pennyValue: string | number | undefined;
  message: string;
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

export interface ImportResult {
  success: boolean;
  updatedStories?: Array<{ id: string; field: string; oldValue: unknown; newValue: unknown }>;
  errors?: SyncError[];
}

// =============================================================================
// Story ID Conversion
// =============================================================================

/**
 * Convert BMAD story ID (dot notation) to Pennyfarthing (dash notation).
 * Example: "32.6" → "32-6"
 */
export function bmadIdToPenny(bmadId: string): string {
  return bmadId.replace(/\./g, '-');
}

/**
 * Convert Pennyfarthing story ID (dash notation) to BMAD (dot notation).
 * Example: "32-6" → "32.6"
 */
export function pennyIdToBmad(pennyId: string): string {
  return pennyId.replace(/-/g, '.');
}

/**
 * Validate BMAD story ID format (N.M where N and M are positive integers).
 */
export function isValidBmadStoryId(id: string): boolean {
  return /^\d+\.\d+$/.test(id);
}

/**
 * Validate Pennyfarthing story ID format (N-M where N and M are positive integers).
 */
export function isValidPennyStoryId(id: string): boolean {
  return /^\d+-\d+$/.test(id);
}

// =============================================================================
// Status Mapping
// =============================================================================

const BMAD_TO_PENNY: Record<BmadStatus, PennyStatus> = {
  'ready-for-dev': 'backlog',
  'in-progress': 'in_progress',
  'review': 'needs_review',
  'done': 'done',
  'blocked': 'backlog', // Map blocked to backlog with reason preserved
};

const PENNY_TO_BMAD: Record<PennyStatus, BmadStatus> = {
  'backlog': 'ready-for-dev',
  'in_progress': 'in-progress',
  'needs_review': 'review',
  'approved': 'review', // approved also maps to review
  'done': 'done',
};

/**
 * Map BMAD status to Pennyfarthing status.
 */
export function mapBmadToPennyStatus(bmadStatus: BmadStatus): PennyStatus {
  return BMAD_TO_PENNY[bmadStatus] ?? 'backlog';
}

/**
 * Map Pennyfarthing status to BMAD status.
 */
export function mapPennyToBmadStatus(pennyStatus: PennyStatus): BmadStatus {
  return PENNY_TO_BMAD[pennyStatus] ?? 'ready-for-dev';
}

// =============================================================================
// AC1: Parse BMAD Sprint Status
// =============================================================================

/**
 * Parse BMAD sprint-status.yaml content.
 *
 * Validates the schema and returns structured data or errors.
 */
export function parseBmadSprintStatus(yamlContent: string): ParseResult {
  const errors: SyncError[] = [];

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (e) {
    return {
      success: false,
      errors: [{ field: 'yaml', message: `Invalid YAML: ${(e as Error).message}` }],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      errors: [{ field: 'root', message: 'YAML must be an object' }],
    };
  }

  const doc = parsed as Record<string, unknown>;

  // Validate sprint section
  if (!doc.sprint || typeof doc.sprint !== 'object') {
    errors.push({ field: 'sprint', message: 'Sprint section is required' });
  } else {
    const sprint = doc.sprint as Record<string, unknown>;
    if (typeof sprint.number !== 'number') {
      errors.push({ field: 'sprint.number', message: 'Sprint number is required and must be a number' });
    }
    if (typeof sprint.goal !== 'string') {
      errors.push({ field: 'sprint.goal', message: 'Sprint goal is required and must be a string' });
    }
    if (typeof sprint.start_date !== 'string') {
      errors.push({ field: 'sprint.start_date', message: 'Sprint start_date is required' });
    }
    if (typeof sprint.end_date !== 'string') {
      errors.push({ field: 'sprint.end_date', message: 'Sprint end_date is required' });
    }
  }

  // Validate stories section
  if (!doc.stories || !Array.isArray(doc.stories)) {
    errors.push({ field: 'stories', message: 'Stories section is required and must be an array' });
  } else {
    for (let i = 0; i < doc.stories.length; i++) {
      const story = doc.stories[i] as Record<string, unknown>;
      const storyId = String(story.id ?? `[${i}]`);

      if (!story.id || typeof story.id !== 'string') {
        errors.push({ field: `stories[${i}].id`, message: 'Story ID is required', storyId });
      } else if (!isValidBmadStoryId(story.id)) {
        errors.push({ field: `stories[${i}].id`, message: `Invalid BMAD story ID format: ${story.id}`, storyId });
      }

      if (!story.title || typeof story.title !== 'string') {
        errors.push({ field: `stories[${i}].title`, message: 'Story title is required', storyId });
      }

      if (!story.status || typeof story.status !== 'string') {
        errors.push({ field: `stories[${i}].status`, message: 'Story status is required', storyId });
      } else if (!['ready-for-dev', 'in-progress', 'review', 'done', 'blocked'].includes(story.status)) {
        errors.push({ field: `stories[${i}].status`, message: `Invalid status: ${story.status}`, storyId });
      }

      if (typeof story.points !== 'number') {
        errors.push({ field: `stories[${i}].points`, message: 'Story points is required and must be a number', storyId });
      }

      if (!story.priority || typeof story.priority !== 'string') {
        errors.push({ field: `stories[${i}].priority`, message: 'Story priority is required', storyId });
      }
    }
  }

  // Validate metrics section
  if (!doc.metrics || typeof doc.metrics !== 'object') {
    errors.push({ field: 'metrics', message: 'Metrics section is required' });
  } else {
    const metrics = doc.metrics as Record<string, unknown>;
    if (typeof metrics.total_points !== 'number') {
      errors.push({ field: 'metrics.total_points', message: 'Total points is required and must be a number' });
    }
    if (typeof metrics.completed_points !== 'number') {
      errors.push({ field: 'metrics.completed_points', message: 'Completed points is required and must be a number' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build typed result
  const sprintSection = doc.sprint as Record<string, unknown>;
  const metricsSection = doc.metrics as Record<string, unknown>;

  const result: BmadSprintStatus = {
    sprint: {
      number: sprintSection.number as number,
      goal: sprintSection.goal as string,
      start_date: sprintSection.start_date as string,
      end_date: sprintSection.end_date as string,
    },
    stories: (doc.stories as Array<Record<string, unknown>>).map((s) => ({
      id: s.id as string,
      title: s.title as string,
      epic: s.epic as string | undefined,
      status: s.status as BmadStatus,
      assignee: s.assignee as string | undefined,
      points: s.points as number,
      priority: s.priority as 'P0' | 'P1' | 'P2',
      started: s.started as string | undefined,
      completed: s.completed as string | undefined,
      blockers: s.blockers as string[] | undefined,
    })),
    metrics: {
      total_points: metricsSection.total_points as number,
      completed_points: metricsSection.completed_points as number,
      in_progress_points: metricsSection.in_progress_points as number | undefined,
      velocity: metricsSection.velocity as number | undefined,
      burndown: metricsSection.burndown as Array<{ date: string; remaining: number }> | undefined,
    },
  };

  return { success: true, data: result };
}

// =============================================================================
// AC2: Import BMAD Status to Pennyfarthing Format
// =============================================================================

/**
 * Convert a BMAD story to Pennyfarthing format.
 */
export function convertBmadStoryToPenny(bmadStory: BmadStoryStatus): PennyStoryStatus {
  const result: PennyStoryStatus = {
    id: bmadIdToPenny(bmadStory.id),
    title: bmadStory.title,
    status: mapBmadToPennyStatus(bmadStory.status),
    points: bmadStory.points,
    priority: bmadStory.priority,
  };

  if (bmadStory.assignee) {
    result.assigned_to = bmadStory.assignee;
  }
  if (bmadStory.started) {
    result.started = bmadStory.started;
  }
  if (bmadStory.completed) {
    result.completed = bmadStory.completed;
  }

  // Preserve blocked reason when status is blocked
  if (bmadStory.status === 'blocked' && bmadStory.blockers && bmadStory.blockers.length > 0) {
    result.blocked_reason = bmadStory.blockers.join('; ');
  }

  return result;
}

/**
 * Import BMAD sprint status and merge into Pennyfarthing story list.
 *
 * Updates existing stories, adds new ones from BMAD.
 * Preserves Pennyfarthing-only fields.
 */
export function importFromBmadStatus(
  bmadStatus: BmadSprintStatus,
  existingStories: PennyStoryStatus[]
): ImportResult {
  const updates: Array<{ id: string; field: string; oldValue: unknown; newValue: unknown }> = [];
  const storyMap = new Map(existingStories.map((s) => [s.id, s]));

  for (const bmadStory of bmadStatus.stories) {
    const pennyId = bmadIdToPenny(bmadStory.id);
    const existing = storyMap.get(pennyId);
    const converted = convertBmadStoryToPenny(bmadStory);

    if (existing) {
      // Update existing story, track changes
      if (existing.status !== converted.status) {
        updates.push({
          id: pennyId,
          field: 'status',
          oldValue: existing.status,
          newValue: converted.status,
        });
        existing.status = converted.status;
      }
      if (existing.assigned_to !== converted.assigned_to) {
        updates.push({
          id: pennyId,
          field: 'assigned_to',
          oldValue: existing.assigned_to,
          newValue: converted.assigned_to,
        });
        existing.assigned_to = converted.assigned_to;
      }
      if (existing.started !== converted.started) {
        updates.push({
          id: pennyId,
          field: 'started',
          oldValue: existing.started,
          newValue: converted.started,
        });
        existing.started = converted.started;
      }
      if (existing.completed !== converted.completed) {
        updates.push({
          id: pennyId,
          field: 'completed',
          oldValue: existing.completed,
          newValue: converted.completed,
        });
        existing.completed = converted.completed;
      }
      if (converted.blocked_reason) {
        updates.push({
          id: pennyId,
          field: 'blocked_reason',
          oldValue: existing.blocked_reason,
          newValue: converted.blocked_reason,
        });
        existing.blocked_reason = converted.blocked_reason;
      }
    } else {
      // Add new story
      storyMap.set(pennyId, converted);
      updates.push({
        id: pennyId,
        field: '_new',
        oldValue: undefined,
        newValue: converted,
      });
    }
  }

  return {
    success: true,
    updatedStories: updates,
  };
}

// =============================================================================
// AC3: Export Pennyfarthing Status to BMAD Format
// =============================================================================

/**
 * Convert a Pennyfarthing story to BMAD format.
 */
export function convertPennyStoryToBmad(pennyStory: PennyStoryStatus): BmadStoryStatus {
  const result: BmadStoryStatus = {
    id: pennyIdToBmad(pennyStory.id),
    title: pennyStory.title,
    status: mapPennyToBmadStatus(pennyStory.status),
    points: pennyStory.points,
    priority: pennyStory.priority as 'P0' | 'P1' | 'P2',
  };

  if (pennyStory.assigned_to) {
    result.assignee = pennyStory.assigned_to;
  }
  if (pennyStory.started) {
    result.started = pennyStory.started;
  }
  if (pennyStory.completed) {
    result.completed = pennyStory.completed;
  }

  // Convert blocked_reason to blockers array
  if (pennyStory.blocked_reason) {
    result.status = 'blocked';
    result.blockers = [pennyStory.blocked_reason];
  }

  return result;
}

/**
 * Calculate metrics from story list.
 */
function calculateMetrics(stories: BmadStoryStatus[]): BmadMetrics {
  let totalPoints = 0;
  let completedPoints = 0;
  let inProgressPoints = 0;

  for (const story of stories) {
    totalPoints += story.points;
    if (story.status === 'done') {
      completedPoints += story.points;
    } else if (story.status === 'in-progress') {
      inProgressPoints += story.points;
    }
  }

  return {
    total_points: totalPoints,
    completed_points: completedPoints,
    in_progress_points: inProgressPoints,
  };
}

/**
 * Export Pennyfarthing sprint to BMAD sprint-status.yaml format.
 */
export function exportToSprintStatus(
  sprintInfo: {
    number: number;
    goal: string;
    start_date: string;
    end_date: string;
  },
  stories: PennyStoryStatus[]
): ExportResult {
  const errors: SyncError[] = [];

  // Validate sprint info
  if (typeof sprintInfo.number !== 'number') {
    errors.push({ field: 'sprint.number', message: 'Sprint number is required' });
  }
  if (!sprintInfo.goal) {
    errors.push({ field: 'sprint.goal', message: 'Sprint goal is required' });
  }
  if (!sprintInfo.start_date) {
    errors.push({ field: 'sprint.start_date', message: 'Sprint start_date is required' });
  }
  if (!sprintInfo.end_date) {
    errors.push({ field: 'sprint.end_date', message: 'Sprint end_date is required' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Convert stories
  const bmadStories = stories.map(convertPennyStoryToBmad);

  // Build output
  const output: BmadSprintStatus = {
    sprint: sprintInfo,
    stories: bmadStories,
    metrics: calculateMetrics(bmadStories),
  };

  return {
    success: true,
    yaml: stringifyYaml(output),
  };
}

// =============================================================================
// AC5: Conflict Detection
// =============================================================================

/**
 * Detect conflicts between BMAD and Pennyfarthing story statuses.
 *
 * A conflict occurs when both have changes for the same story
 * (detected by comparing against a baseline or timestamp).
 */
export function detectConflicts(
  bmadStories: BmadStoryStatus[],
  pennyStories: PennyStoryStatus[]
): ConflictResult {
  const conflicts: Conflict[] = [];

  // Build lookup maps
  const bmadMap = new Map(bmadStories.map((s) => [bmadIdToPenny(s.id), s]));
  const pennyMap = new Map(pennyStories.map((s) => [s.id, s]));

  // Check each story that exists in both
  for (const [id, pennyStory] of pennyMap) {
    const bmadStory = bmadMap.get(id);
    if (!bmadStory) continue;

    // Check for status conflict
    const expectedPennyStatus = mapBmadToPennyStatus(bmadStory.status);
    const expectedBmadStatus = mapPennyToBmadStatus(pennyStory.status);

    // Status conflict: neither matches the other's expected mapping
    if (
      pennyStory.status !== expectedPennyStatus &&
      bmadStory.status !== expectedBmadStatus
    ) {
      conflicts.push({
        storyId: id,
        field: 'status',
        bmadValue: bmadStory.status,
        pennyValue: pennyStory.status,
        message: `Status conflict: BMAD has '${bmadStory.status}', Pennyfarthing has '${pennyStory.status}'`,
      });
    }

    // Assignee conflict
    const bmadAssignee = bmadStory.assignee ?? undefined;
    const pennyAssignee = pennyStory.assigned_to ?? undefined;
    if (bmadAssignee && pennyAssignee && bmadAssignee !== pennyAssignee) {
      conflicts.push({
        storyId: id,
        field: 'assignee',
        bmadValue: bmadAssignee,
        pennyValue: pennyAssignee,
        message: `Assignee conflict: BMAD has '${bmadAssignee}', Pennyfarthing has '${pennyAssignee}'`,
      });
    }

    // Completed date conflict
    const bmadCompleted = bmadStory.completed ?? undefined;
    const pennyCompleted = pennyStory.completed ?? undefined;
    if (bmadCompleted && pennyCompleted && bmadCompleted !== pennyCompleted) {
      conflicts.push({
        storyId: id,
        field: 'completed',
        bmadValue: bmadCompleted,
        pennyValue: pennyCompleted,
        message: `Completion date conflict: BMAD has '${bmadCompleted}', Pennyfarthing has '${pennyCompleted}'`,
      });
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}
