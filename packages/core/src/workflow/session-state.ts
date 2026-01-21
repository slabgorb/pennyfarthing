/**
 * Session State Tracker for MSSCI-12082
 *
 * Extends session file format to track stepped workflow state with
 * state tracking reader/writer.
 */

/**
 * Stepped workflow state tracked in session file
 */
export interface WorkflowState {
  /** Workflow name (e.g., 'architecture', 'planning') */
  name: string;
  /** Workflow type: stepped or phased */
  type: 'stepped' | 'phased';
  /** Tri-modal mode if applicable (create, validate, edit) */
  mode?: 'create' | 'validate' | 'edit';
  /** ISO timestamp when workflow started */
  started: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Current step number (1-indexed) */
  currentStep: number;
  /** Array of completed step numbers */
  stepsCompleted: number[];
  /** Current workflow status */
  status: 'in_progress' | 'completed' | 'paused';
  /** User notes or decisions at gates */
  notes?: string;
}

/**
 * Result of parsing session file for workflow state
 */
export interface SessionStateResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Extracted workflow state (if found) */
  state?: WorkflowState;
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Result of updating session file with workflow state
 */
export interface UpdateResult {
  /** Whether update succeeded */
  success: boolean;
  /** Updated content (if successful) */
  content?: string;
  /** Error message if update failed */
  error?: string;
}

// Regex to find ## Workflow State section (captures until next ## or end)
const WORKFLOW_STATE_SECTION_REGEX = /## Workflow State\n([\s\S]*?)(?=\n## |\n*$)/;

// Regex patterns for extracting individual fields
const FIELD_PATTERNS: Record<string, RegExp> = {
  name: /\*\*Workflow Name:\*\*\s*(.+)/,
  type: /\*\*Type:\*\*\s*(stepped|phased)/,
  mode: /\*\*Mode:\*\*\s*(create|validate|edit)/,
  started: /\*\*Started:\*\*\s*(.+)/,
  lastUpdated: /\*\*Last Updated:\*\*\s*(.+)/,
  currentStep: /\*\*Current Step:\*\*\s*(\d+)/,
  stepsCompleted: /\*\*Steps Completed:\*\*\s*(\[[\d,\s]*\]|not-an-array|\S*)/,
  status: /\*\*Status:\*\*\s*(in_progress|completed|paused)/,
  notes: /\*\*Notes:\*\*\s*(.+)/,
};

/**
 * Create initial workflow state for a new stepped workflow
 *
 * @param workflowName - Name of the workflow being started
 * @param workflowType - Type of workflow (stepped or phased)
 * @param mode - Optional tri-modal mode
 * @returns Initial WorkflowState object
 */
export function initWorkflowState(
  workflowName: string,
  workflowType: 'stepped' | 'phased',
  mode?: 'create' | 'validate' | 'edit'
): WorkflowState {
  const now = new Date().toISOString();
  return {
    name: workflowName,
    type: workflowType,
    mode,
    started: now,
    lastUpdated: now,
    currentStep: 1,
    stepsCompleted: [],
    status: 'in_progress',
  };
}

/**
 * Update workflow state after step completion
 *
 * @param state - Current workflow state
 * @param completedStep - Step number that was just completed
 * @param nextStep - Step number to move to (optional, defaults to completedStep + 1)
 * @returns Updated WorkflowState object
 */
export function updateWorkflowState(
  state: WorkflowState,
  completedStep: number,
  nextStep?: number
): WorkflowState {
  // Add completed step if not already in the list
  const stepsCompleted = state.stepsCompleted.includes(completedStep)
    ? [...state.stepsCompleted]
    : [...state.stepsCompleted, completedStep];

  return {
    ...state,
    currentStep: nextStep ?? completedStep + 1,
    stepsCompleted,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Parse steps completed array from string
 */
function parseStepsCompleted(value: string): number[] {
  if (!value || value === '[]') {
    return [];
  }

  // Try to parse as JSON array
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((n) => typeof n === 'number');
    }
  } catch {
    // Not valid JSON, return empty array
  }

  return [];
}

/**
 * Parse session file content to extract workflow state
 *
 * @param content - Raw markdown content of session file
 * @returns SessionStateResult with extracted state or error
 */
export function parseSessionState(content: string): SessionStateResult {
  // Find the Workflow State section
  const sectionMatch = content.match(WORKFLOW_STATE_SECTION_REGEX);

  if (!sectionMatch) {
    // No workflow state section - success but no state
    return { success: true };
  }

  const sectionContent = sectionMatch[1];

  // Extract required fields
  const nameMatch = sectionContent.match(FIELD_PATTERNS.name);
  const typeMatch = sectionContent.match(FIELD_PATTERNS.type);
  const startedMatch = sectionContent.match(FIELD_PATTERNS.started);
  const lastUpdatedMatch = sectionContent.match(FIELD_PATTERNS.lastUpdated);
  const currentStepMatch = sectionContent.match(FIELD_PATTERNS.currentStep);
  const stepsCompletedMatch = sectionContent.match(FIELD_PATTERNS.stepsCompleted);
  const statusMatch = sectionContent.match(FIELD_PATTERNS.status);

  // Check required fields
  if (!nameMatch || !typeMatch || !startedMatch || !lastUpdatedMatch || !currentStepMatch || !statusMatch) {
    return { success: true }; // Missing required fields, treat as no state
  }

  // Extract optional fields
  const modeMatch = sectionContent.match(FIELD_PATTERNS.mode);
  const notesMatch = sectionContent.match(FIELD_PATTERNS.notes);

  const state: WorkflowState = {
    name: nameMatch[1].trim(),
    type: typeMatch[1] as 'stepped' | 'phased',
    started: startedMatch[1].trim(),
    lastUpdated: lastUpdatedMatch[1].trim(),
    currentStep: parseInt(currentStepMatch[1], 10),
    stepsCompleted: parseStepsCompleted(stepsCompletedMatch?.[1] || '[]'),
    status: statusMatch[1] as 'in_progress' | 'completed' | 'paused',
  };

  // Add optional fields if present
  if (modeMatch) {
    state.mode = modeMatch[1] as 'create' | 'validate' | 'edit';
  }
  if (notesMatch) {
    state.notes = notesMatch[1].trim();
  }

  return { success: true, state };
}

/**
 * Format workflow state as markdown section
 *
 * @param state - WorkflowState to format
 * @returns Formatted markdown string for ## Workflow State section
 */
export function formatWorkflowState(state: WorkflowState): string {
  const lines = ['## Workflow State'];
  lines.push(`- **Workflow Name:** ${state.name}`);
  lines.push(`- **Type:** ${state.type}`);

  if (state.mode) {
    lines.push(`- **Mode:** ${state.mode}`);
  }

  lines.push(`- **Started:** ${state.started}`);
  lines.push(`- **Last Updated:** ${state.lastUpdated}`);
  lines.push(`- **Current Step:** ${state.currentStep}`);

  // Format stepsCompleted with spaces after commas for readability
  const stepsStr =
    state.stepsCompleted.length > 0
      ? `[${state.stepsCompleted.join(', ')}]`
      : '[]';
  lines.push(`- **Steps Completed:** ${stepsStr}`);
  lines.push(`- **Status:** ${state.status}`);

  if (state.notes) {
    lines.push(`- **Notes:** ${state.notes}`);
  }

  return lines.join('\n');
}

/**
 * Update session file content with new workflow state
 *
 * @param content - Current session file content
 * @param state - Workflow state to write
 * @returns UpdateResult with updated content or error
 */
export function updateSessionContent(
  content: string,
  state: WorkflowState
): UpdateResult {
  const formatted = formatWorkflowState(state);

  // Check if section already exists
  const sectionMatch = content.match(WORKFLOW_STATE_SECTION_REGEX);

  if (sectionMatch) {
    // Replace existing section
    const newContent = content.replace(
      WORKFLOW_STATE_SECTION_REGEX,
      formatted + '\n'
    );
    return { success: true, content: newContent };
  }

  // Insert new section - find best location
  // Preferred: after ## Story Overview, before ## Technical Context or ## Acceptance Criteria
  const storyOverviewMatch = content.match(/## Story Overview[\s\S]*?(?=\n## )/);
  if (storyOverviewMatch) {
    const insertPoint = storyOverviewMatch.index! + storyOverviewMatch[0].length;
    const newContent =
      content.slice(0, insertPoint) +
      '\n' +
      formatted +
      '\n' +
      content.slice(insertPoint);
    return { success: true, content: newContent };
  }

  // Fallback: insert after first heading or at end
  const firstHeadingMatch = content.match(/^# .+\n/m);
  if (firstHeadingMatch) {
    const insertPoint = firstHeadingMatch.index! + firstHeadingMatch[0].length;
    const newContent =
      content.slice(0, insertPoint) +
      '\n' +
      formatted +
      '\n' +
      content.slice(insertPoint);
    return { success: true, content: newContent };
  }

  // Last resort: append to content
  const newContent = content + '\n' + formatted + '\n';
  return { success: true, content: newContent };
}
