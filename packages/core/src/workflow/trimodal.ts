/**
 * Tri-Modal Support for MSSCI-12086
 *
 * Provides mode selection and path resolution for stepped workflows
 * supporting create/validate/edit modes.
 */

import type { WorkflowDefinition } from './workflow-schema.js';

/**
 * Valid tri-modal mode values
 */
export type TrimodalMode = 'create' | 'validate' | 'edit';

/**
 * Result of parsing --mode flag from arguments
 */
export interface TrimodalParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed mode (undefined if no flag provided) */
  mode?: TrimodalMode;
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Result of validating a mode against a workflow
 */
export interface ModeValidationResult {
  /** Whether the mode is valid for this workflow */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Result of resolving steps path for a mode
 */
export interface StepsPathResult {
  /** Whether resolution succeeded */
  success: boolean;
  /** Resolved steps path */
  path?: string;
  /** Step file pattern */
  pattern?: string;
  /** Error message if resolution failed */
  error?: string;
}

/** Valid mode values */
const VALID_MODES: readonly TrimodalMode[] = ['create', 'validate', 'edit'];

/**
 * Parse --mode flag from command line arguments
 *
 * Supports:
 * - --mode create
 * - --mode validate
 * - --mode edit
 * - --mode=create (equals syntax)
 * - -m create (shorthand)
 *
 * @param args - Command line arguments
 * @returns Parse result with mode or error
 */
export function parseTrimodalFlag(args: string[]): TrimodalParseResult {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --mode=value syntax
    if (arg.startsWith('--mode=')) {
      const value = arg.slice(7);
      if (!VALID_MODES.includes(value as TrimodalMode)) {
        return { success: false, error: `Invalid mode "${value}". Must be one of: create, validate, edit` };
      }
      return { success: true, mode: value as TrimodalMode };
    }

    // Handle --mode value or -m value syntax
    if (arg === '--mode' || arg === '-m') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        return { success: false, error: '--mode flag requires a value (create, validate, or edit)' };
      }
      if (!VALID_MODES.includes(value as TrimodalMode)) {
        return { success: false, error: `Invalid mode "${value}". Must be one of: create, validate, edit` };
      }
      return { success: true, mode: value as TrimodalMode };
    }
  }

  // No mode flag found - that's okay, return success with undefined mode
  return { success: true };
}

/**
 * Validate that a mode is supported by a workflow
 *
 * @param mode - Mode to validate
 * @param workflow - Workflow definition to check against
 * @returns Validation result
 */
export function validateMode(
  mode: TrimodalMode,
  workflow: WorkflowDefinition
): ModeValidationResult {
  // If workflow has no modes config, any mode is valid (uses steps.path fallback)
  if (!workflow.modes) {
    return { valid: true };
  }

  // Check if the mode has a path defined in workflow.modes
  const modePath = workflow.modes[mode];
  if (modePath) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Mode "${mode}" is not defined in workflow "${workflow.name}". Available modes: ${Object.keys(workflow.modes).filter(k => k !== 'default').join(', ')}`
  };
}

/**
 * Resolve the steps path for a given mode
 *
 * Priority:
 * 1. workflow.modes[mode] if defined
 * 2. workflow.steps.path as fallback
 *
 * @param workflow - Workflow definition
 * @param mode - Selected mode
 * @returns Steps path result
 */
export function resolveStepsPath(
  workflow: WorkflowDefinition,
  mode: TrimodalMode
): StepsPathResult {
  // Stepped workflows require steps config
  if (!workflow.steps) {
    return {
      success: false,
      error: `Workflow "${workflow.name}" is not a stepped workflow (no steps configuration)`
    };
  }

  const pattern = workflow.steps.pattern;

  // Try mode-specific path first
  if (workflow.modes) {
    const modePath = workflow.modes[mode];
    if (modePath) {
      return { success: true, path: modePath, pattern };
    }
  }

  // Fall back to steps.path
  return { success: true, path: workflow.steps.path, pattern };
}

/**
 * Get the default mode for a workflow
 *
 * @param workflow - Workflow definition
 * @returns Default mode ('create' if not specified, undefined for phased workflows)
 */
export function getDefaultMode(workflow: WorkflowDefinition): TrimodalMode | undefined {
  // Phased workflows don't use modes
  if (workflow.type === 'phased' || !workflow.steps) {
    return undefined;
  }

  // If modes config exists with a default, use it
  if (workflow.modes?.default) {
    return workflow.modes.default;
  }

  // Default to 'create' for stepped workflows without explicit default
  return 'create';
}
