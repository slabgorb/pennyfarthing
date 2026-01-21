/**
 * Workflow Executor for MSSCI-12084
 *
 * Implements /workflow start, resume, and status commands for stepped workflows.
 * Coordinates step loading, session state tracking, and progress reporting.
 */

import {
  WorkflowState,
  initWorkflowState,
  updateWorkflowState,
  parseSessionState,
  updateSessionContent,
} from './session-state.js';
import { ParsedStep, parseStepFromPath } from './step-parser.js';
import { resolveStepVariables } from './variable-resolver.js';

/**
 * Workflow definition loaded from YAML
 */
export interface WorkflowDefinition {
  /** Workflow name/identifier */
  name: string;
  /** Workflow type: stepped or phased */
  type: 'stepped' | 'phased';
  /** Optional description */
  description?: string;
  /** Step file configuration */
  steps: {
    /** Base path for step files */
    path: string;
    /** Glob pattern for step files (default: step-*.md) */
    pattern?: string;
  };
  /** Tri-modal configuration */
  modes?: {
    /** Default mode when not specified */
    default?: 'create' | 'validate' | 'edit';
    /** Available modes */
    available?: ('create' | 'validate' | 'edit')[];
  };
  /** Variables for step content resolution */
  variables?: Record<string, string>;
  /** Gate configuration */
  gates?: {
    /** Step numbers after which gates occur */
    after_steps?: number[];
  };
  /** Total number of steps in workflow */
  totalSteps?: number;
}

/**
 * Result of starting a workflow
 */
export interface StartResult {
  success: boolean;
  /** Initialized workflow state */
  state?: WorkflowState;
  /** First step content (resolved) */
  step?: ParsedStep;
  /** Updated session content */
  sessionContent?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of resuming a workflow
 */
export interface ResumeResult {
  success: boolean;
  /** Current workflow state */
  state?: WorkflowState;
  /** Next step to execute */
  step?: ParsedStep;
  /** Whether workflow is already complete */
  isComplete?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Workflow status information
 */
export interface WorkflowStatus {
  /** Workflow name */
  name: string;
  /** Workflow type */
  type: 'stepped' | 'phased';
  /** Current mode if tri-modal */
  mode?: 'create' | 'validate' | 'edit';
  /** Current step number */
  currentStep: number;
  /** Total steps in workflow */
  totalSteps: number;
  /** Array of completed step numbers */
  stepsCompleted: number[];
  /** Completion percentage (0-100) */
  completionPercent: number;
  /** Workflow status */
  status: 'in_progress' | 'completed' | 'paused';
  /** When workflow started */
  started: string;
  /** Last update timestamp */
  lastUpdated: string;
}

/**
 * Result of getting workflow status
 */
export interface StatusResult {
  success: boolean;
  /** Workflow status if found */
  status?: WorkflowStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Start a new stepped workflow
 *
 * @param workflow - Workflow definition
 * @param sessionContent - Current session file content (or empty for new)
 * @param mode - Optional tri-modal mode (default: workflow default or 'create')
 * @returns StartResult with state, first step, and updated session
 */
export async function startWorkflow(
  workflow: WorkflowDefinition,
  sessionContent: string,
  mode?: 'create' | 'validate' | 'edit'
): Promise<StartResult> {
  // Determine mode: explicit > workflow default > 'create'
  const effectiveMode = mode ?? workflow.modes?.default ?? 'create';

  // Initialize workflow state
  const state = initWorkflowState(workflow.name, workflow.type, effectiveMode);

  // Update session content with workflow state
  const updateResult = updateSessionContent(sessionContent, state);
  if (!updateResult.success || !updateResult.content) {
    return {
      success: false,
      error: updateResult.error ?? 'Failed to update session content',
    };
  }

  // Try to load step 1 (may fail if step file doesn't exist)
  const step = await loadStep(workflow, 1, workflow.variables);

  return {
    success: true,
    state,
    step: step ?? undefined,
    sessionContent: updateResult.content,
  };
}

/**
 * Resume an existing stepped workflow from last completed step
 *
 * @param workflow - Workflow definition
 * @param sessionContent - Current session file content with state
 * @returns ResumeResult with state and next step
 */
export async function resumeWorkflow(
  workflow: WorkflowDefinition,
  sessionContent: string
): Promise<ResumeResult> {
  // Parse existing state from session
  const parseResult = parseSessionState(sessionContent);

  if (!parseResult.success || !parseResult.state) {
    return {
      success: false,
      error: 'No workflow state found in session',
    };
  }

  const state = parseResult.state;

  // Check if workflow is already complete
  if (state.status === 'completed') {
    return {
      success: true,
      state,
      isComplete: true,
    };
  }

  // Try to load the current step
  const step = await loadStep(workflow, state.currentStep, workflow.variables);

  return {
    success: true,
    state,
    step: step ?? undefined,
  };
}

/**
 * Get current workflow status from session
 *
 * @param sessionContent - Session file content
 * @param totalSteps - Total number of steps in workflow
 * @returns StatusResult with progress information
 */
export function getWorkflowStatus(
  sessionContent: string,
  totalSteps: number
): StatusResult {
  // Parse state from session
  const parseResult = parseSessionState(sessionContent);

  if (!parseResult.success || !parseResult.state) {
    return {
      success: false,
      error: 'No workflow state found in session',
    };
  }

  const state = parseResult.state;

  // Calculate completion percentage
  const completedCount = state.stepsCompleted.length;
  const completionPercent = totalSteps > 0
    ? Math.round((completedCount / totalSteps) * 100)
    : 0;

  const status: WorkflowStatus = {
    name: state.name,
    type: state.type,
    mode: state.mode,
    currentStep: state.currentStep,
    totalSteps,
    stepsCompleted: state.stepsCompleted,
    completionPercent,
    status: state.status,
    started: state.started,
    lastUpdated: state.lastUpdated,
  };

  return {
    success: true,
    status,
  };
}

/**
 * Load step file for a specific step number
 *
 * @param workflow - Workflow definition
 * @param stepNumber - Step number to load
 * @param variables - Variables for content resolution
 * @returns ParsedStep with resolved content
 */
export async function loadStep(
  workflow: WorkflowDefinition,
  stepNumber: number,
  variables?: Record<string, string>
): Promise<ParsedStep | null> {
  // Build step file path
  const pattern = workflow.steps.pattern ?? 'step-*.md';
  const paddedNum = String(stepNumber).padStart(2, '0');
  // Replace * in pattern with padded step number
  const filename = pattern.replace('*', paddedNum);
  const stepPath = `${workflow.steps.path}/${filename}`;

  try {
    const parseResult = await parseStepFromPath(stepPath);

    if (!parseResult.success || !parseResult.step) {
      return null;
    }

    // Resolve variables in step content if provided
    if (variables && Object.keys(variables).length > 0) {
      const resolveResult = resolveStepVariables(parseResult.step.content, {
        workflowVars: variables,
      });
      parseResult.step.content = resolveResult.content;
    }

    return parseResult.step;
  } catch {
    // Step file doesn't exist or can't be read
    return null;
  }
}

/**
 * Complete current step and advance workflow state
 *
 * @param sessionContent - Current session content
 * @param stepNumber - Step number being completed
 * @param nextStep - Optional specific next step (for skip scenarios)
 * @returns Updated session content
 */
export function completeStep(
  sessionContent: string,
  stepNumber: number,
  nextStep?: number
): string {
  // Parse existing state
  const parseResult = parseSessionState(sessionContent);

  if (!parseResult.success || !parseResult.state) {
    return sessionContent; // Return unchanged if no state
  }

  // Update state with completed step
  const updatedState = updateWorkflowState(parseResult.state, stepNumber, nextStep);

  // Update session content
  const updateResult = updateSessionContent(sessionContent, updatedState);

  return updateResult.content ?? sessionContent;
}

/**
 * Check if workflow has an in-progress state in session
 *
 * @param sessionContent - Session file content
 * @returns true if workflow is in progress
 */
export function hasActiveWorkflow(sessionContent: string): boolean {
  const parseResult = parseSessionState(sessionContent);

  if (!parseResult.success || !parseResult.state) {
    return false;
  }

  // Active means in_progress or paused (not completed)
  return parseResult.state.status === 'in_progress' || parseResult.state.status === 'paused';
}

/**
 * Detect incomplete workflow from session and return name
 *
 * @param sessionContent - Session file content
 * @returns Workflow name if incomplete workflow found, undefined otherwise
 */
export function detectIncompleteWorkflow(sessionContent: string): string | undefined {
  const parseResult = parseSessionState(sessionContent);

  if (!parseResult.success || !parseResult.state) {
    return undefined;
  }

  // Only return name if workflow is not completed
  if (parseResult.state.status === 'completed') {
    return undefined;
  }

  return parseResult.state.name;
}
