/**
 * BMAD Story Exporter - Story 32-5
 *
 * Exports Pennyfarthing session data to BMAD story markdown format.
 *
 * Input: SessionData (parsed from .session/{story-id}-session.md)
 * Output: BMAD story markdown string
 *
 * Status mapping:
 * - Pennyfarthing 'backlog' → BMAD 'ready-for-dev'
 * - Pennyfarthing 'in_progress' → BMAD 'in-progress'
 * - Pennyfarthing 'needs_review' | 'approved' → BMAD 'review'
 * - Pennyfarthing 'done' → BMAD 'done'
 */

// =============================================================================
// Types
// =============================================================================

export interface AcceptanceCriterion {
  text: string;
  completed: boolean;
}

export interface Task {
  text: string;
  completed: boolean;
  subtasks?: Task[];
}

export interface SessionData {
  storyId: string;
  title: string;
  status: 'backlog' | 'in_progress' | 'needs_review' | 'approved' | 'done' | string;
  userStory: string;
  acceptanceCriteria: AcceptanceCriterion[];
  tasks?: Task[];
  devNotes?: string;
  devAgentRecord?: string;
  fileList?: string[];
}

export interface ExportError {
  field: string;
  message: string;
}

export interface ExportResult {
  success: boolean;
  markdown?: string;
  errors?: ExportError[];
}

export interface ExportOptions {
  includeEmptySections?: boolean;
}

// =============================================================================
// Status Mapping
// =============================================================================

type BmadStatus = 'ready-for-dev' | 'in-progress' | 'review' | 'done';

const STATUS_MAP: Record<string, BmadStatus> = {
  'backlog': 'ready-for-dev',
  'in_progress': 'in-progress',
  'needs_review': 'review',
  'approved': 'review',
  'done': 'done',
};

/**
 * Map Pennyfarthing status to BMAD status.
 * Case-insensitive.
 */
function mapStatus(status: string): BmadStatus | null {
  const normalized = status.toLowerCase();
  return STATUS_MAP[normalized] ?? null;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate session data and return errors for missing/invalid fields.
 */
function validateSession(session: SessionData): ExportError[] {
  const errors: ExportError[] = [];

  if (!session.title || typeof session.title !== 'string' || !session.title.trim()) {
    errors.push({ field: 'title', message: 'Title is required' });
  }

  if (!session.status || typeof session.status !== 'string') {
    errors.push({ field: 'status', message: 'Status is required' });
  } else if (!mapStatus(session.status)) {
    errors.push({
      field: 'status',
      message: `Invalid status "${session.status}". Must be one of: backlog, in_progress, needs_review, approved, done`,
    });
  }

  if (!session.userStory || typeof session.userStory !== 'string' || !session.userStory.trim()) {
    errors.push({ field: 'userStory', message: 'User story is required' });
  }

  if (!session.acceptanceCriteria || !Array.isArray(session.acceptanceCriteria)) {
    errors.push({ field: 'acceptanceCriteria', message: 'Acceptance criteria is required' });
  } else if (session.acceptanceCriteria.length === 0) {
    errors.push({ field: 'acceptanceCriteria', message: 'Acceptance criteria cannot be empty - at least one is required' });
  }

  return errors;
}

// =============================================================================
// Markdown Generation
// =============================================================================

/**
 * Format a task with checkbox.
 */
function formatTask(task: Task, indent: number = 0): string {
  const checkbox = task.completed ? '[x]' : '[ ]';
  const prefix = ' '.repeat(indent);
  let result = `${prefix}- ${checkbox} ${task.text}`;

  if (task.subtasks && task.subtasks.length > 0) {
    for (const subtask of task.subtasks) {
      result += '\n' + formatTask(subtask, indent + 2);
    }
  }

  return result;
}

/**
 * Generate BMAD markdown from session data.
 */
function generateMarkdown(session: SessionData, options: ExportOptions): string {
  const lines: string[] = [];
  const includeEmpty = options.includeEmptySections ?? false;

  // Title (required)
  lines.push(`# Story: ${session.title}`);
  lines.push('');

  // Status (required)
  const bmadStatus = mapStatus(session.status)!;
  lines.push('## Status');
  lines.push(bmadStatus);
  lines.push('');

  // Story / User Story (required)
  lines.push('## Story');
  lines.push(session.userStory);
  lines.push('');

  // Acceptance Criteria (required)
  lines.push('## Acceptance Criteria');
  for (const ac of session.acceptanceCriteria) {
    lines.push(`- ${ac.text}`);
  }
  lines.push('');

  // Tasks (optional)
  const hasTasks = session.tasks && session.tasks.length > 0;
  if (hasTasks || includeEmpty) {
    lines.push('## Tasks / Subtasks');
    if (hasTasks) {
      for (const task of session.tasks!) {
        lines.push(formatTask(task));
      }
    }
    lines.push('');
  }

  // Dev Notes (optional)
  const hasDevNotes = session.devNotes && session.devNotes.trim().length > 0;
  if (hasDevNotes || includeEmpty) {
    lines.push('## Dev Notes');
    if (hasDevNotes) {
      lines.push(session.devNotes!);
    }
    lines.push('');
  }

  // Dev Agent Record (optional)
  const hasDevAgentRecord = session.devAgentRecord && session.devAgentRecord.trim().length > 0;
  if (hasDevAgentRecord || includeEmpty) {
    lines.push('## Dev Agent Record');
    if (hasDevAgentRecord) {
      lines.push(session.devAgentRecord!);
    }
    lines.push('');
  }

  // File List (optional)
  const hasFileList = session.fileList && session.fileList.length > 0;
  if (hasFileList || includeEmpty) {
    lines.push('## File List');
    if (hasFileList) {
      for (const file of session.fileList!) {
        lines.push(`- ${file}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

// =============================================================================
// Main Export Function
// =============================================================================

/**
 * Export Pennyfarthing session data to BMAD story markdown format.
 *
 * @param session - Session data to export
 * @param options - Optional export configuration
 * @returns ExportResult with success status and either markdown or errors
 */
export function exportToBmadStory(
  session: SessionData,
  options?: ExportOptions
): ExportResult {
  // Validate required fields
  const errors = validateSession(session);
  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  // Generate markdown
  const markdown = generateMarkdown(session, options ?? {});

  return {
    success: true,
    markdown,
  };
}
