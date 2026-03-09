/**
 * Workflow-Driven Handoff
 *
 * Replaces hardcoded handoff files with workflow-driven logic.
 * Reads phase requirements from workflow definitions.
 *
 * Provides functions to:
 * - Find current phase in a workflow
 * - Determine next phase (forward or rejection loop)
 * - Check gate conditions based on gate type
 * - Format session file updates for phase transitions
 */

import { existsSync, readFileSync } from 'fs';
import type { WorkflowDefinition, WorkflowPhase } from './workflow-schema.js';

/**
 * Context for gate checks - provides test results, verdicts, etc.
 */
export interface GateContext {
  /** For tests_fail gate: are tests currently failing? */
  testsRed?: boolean;
  /** For tests_pass gate: are all tests passing? */
  testsGreen?: boolean;
  /** Number of passing tests */
  testPassCount?: number;
  /** Number of failing tests */
  testFailCount?: number;
  /** For approval gate: approved or rejected */
  verdict?: 'approved' | 'rejected';
}

/**
 * Options for getNextPhase to handle rejection loops
 */
export interface NextPhaseOptions {
  /** For approval gates: determines forward vs loop-back */
  verdict?: 'approved' | 'rejected';
}

/**
 * Result of checking a gate condition
 */
export interface GateCheckResult {
  /** Whether the gate check passed */
  passed: boolean;
  /** Gate type that was checked (undefined if phase has no gate) */
  gateType?: string;
  /** Human-readable message (especially on failure) */
  message?: string;
}

/**
 * Context for handoff operations
 */
export interface HandoffContext {
  /** Story ID being worked on */
  storyId: string;
  /** Current workflow name */
  workflowName: string;
  /** Current phase name */
  currentPhase: string;
  /** Session file path */
  sessionFile: string;
}

/**
 * Result of a handoff operation
 */
export interface HandoffResult {
  /** Whether handoff succeeded */
  success: boolean;
  /** Next phase to transition to */
  nextPhase?: string;
  /** Next agent to invoke */
  nextAgent?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Parameters for formatting phase transition
 */
export interface PhaseTransitionParams {
  workflowName: string;
  fromPhase: string;
  toPhase: string;
  startedAt: string;
  endedAt: string;
  isRejection?: boolean;
}

/**
 * Find a phase by name in a workflow definition
 *
 * @param workflow - The workflow definition to search
 * @param phaseName - Name of the phase to find
 * @returns The phase definition or null if not found
 *
 * @example
 * ```typescript
 * const phase = findCurrentPhase(workflow, 'red');
 * if (phase) {
 *   console.log(`Found phase: ${phase.name}, agent: ${phase.agent}`);
 * }
 * ```
 */
export function findCurrentPhase(
  workflow: WorkflowDefinition,
  phaseName: string
): WorkflowPhase | null {
  if (!workflow.phases) {
    return null;
  }
  return workflow.phases.find(phase => phase.name === phaseName) ?? null;
}

/**
 * Get the next phase in the workflow
 *
 * For normal progression, returns the next phase in sequence.
 * For rejection (verdict='rejected'), returns the phase to loop back to
 * (typically the most recent phase with a tests_pass gate).
 *
 * @param workflow - The workflow definition
 * @param currentPhaseName - Name of the current phase
 * @param options - Options for handling rejection loops
 * @returns The next phase or null if at end/not found
 *
 * @example
 * ```typescript
 * // Normal progression
 * const next = getNextPhase(workflow, 'red');
 *
 * // Rejection loop
 * const next = getNextPhase(workflow, 'review', { verdict: 'rejected' });
 * ```
 */
export function getNextPhase(
  workflow: WorkflowDefinition,
  currentPhaseName: string,
  options?: NextPhaseOptions
): WorkflowPhase | null {
  if (!workflow.phases) {
    return null;
  }

  const currentIndex = workflow.phases.findIndex(
    phase => phase.name === currentPhaseName
  );

  if (currentIndex === -1) {
    return null;
  }

  // Handle rejection: loop back to previous phase with tests_pass gate
  if (options?.verdict === 'rejected') {
    // Search backwards for a phase with tests_pass gate
    for (let i = currentIndex - 1; i >= 0; i--) {
      const phase = workflow.phases[i];
      if (phase.gate?.type === 'tests_pass') {
        return phase;
      }
    }
    // Fallback: return the phase immediately before current
    if (currentIndex > 0) {
      return workflow.phases[currentIndex - 1];
    }
    return null;
  }

  // Forward progression: return next phase in sequence
  if (currentIndex < workflow.phases.length - 1) {
    return workflow.phases[currentIndex + 1];
  }

  // At final phase - no next
  return null;
}

/**
 * Check if a gate condition is satisfied
 *
 * Gate types:
 * - tests_fail: testsRed must be true
 * - tests_pass: testsGreen must be true
 * - approval: verdict must be provided (approved or rejected)
 * - manual: always passes
 * - (none): always passes
 *
 * @param workflow - The workflow definition
 * @param phaseName - Name of the phase to check
 * @param context - Gate check context with test results, verdicts, etc.
 * @returns Gate check result
 *
 * @example
 * ```typescript
 * const result = checkGate(workflow, 'red', { testsRed: true });
 * if (result.passed) {
 *   // Proceed with handoff
 * }
 * ```
 */
export function checkGate(
  workflow: WorkflowDefinition,
  phaseName: string,
  context: GateContext
): GateCheckResult {
  const phase = findCurrentPhase(workflow, phaseName);

  if (!phase) {
    return {
      passed: false,
      message: `Phase "${phaseName}" not found in workflow`
    };
  }

  // No gate defined - always passes
  if (!phase.gate) {
    return { passed: true };
  }

  const gateType = phase.gate.type;

  switch (gateType) {
    case 'tests_fail':
      // RED phase: tests must be failing
      if (context.testsRed === true) {
        return { passed: true, gateType };
      }
      return {
        passed: false,
        gateType,
        message: 'Tests must be failing (RED) to proceed from this phase'
      };

    case 'tests_pass':
      // GREEN phase: tests must be passing
      if (context.testsGreen === true) {
        return { passed: true, gateType };
      }
      return {
        passed: false,
        gateType,
        message: `Tests must be passing (GREEN) to proceed. Currently ${context.testFailCount ?? 0} failing.`
      };

    case 'approval':
      // Review phase: verdict must be provided
      if (context.verdict === 'approved' || context.verdict === 'rejected') {
        return { passed: true, gateType };
      }
      return {
        passed: false,
        gateType,
        message: 'Verdict (approved or rejected) is required to proceed from this phase'
      };

    case 'manual':
      // Manual gate: always passes
      return { passed: true, gateType };

    default:
      // Unknown gate type - reject (single code path enforcement)
      return { passed: false, gateType, message: `Unknown gate type "${gateType}" — only tests_fail, tests_pass, approval, and manual are supported` };
  }
}

/**
 * Format the workflow tracking section for a session file update
 *
 * @param params - Phase transition parameters
 * @returns Markdown string for the workflow tracking section
 *
 * @example
 * ```typescript
 * const markdown = formatPhaseTransition({
 *   workflowName: 'tdd',
 *   fromPhase: 'red',
 *   toPhase: 'green',
 *   startedAt: '2026-01-13T14:00:00Z',
 *   endedAt: '2026-01-13T14:30:00Z'
 * });
 * ```
 */
export function formatPhaseTransition(params: PhaseTransitionParams): string {
  const { workflowName, fromPhase, toPhase, startedAt, endedAt } = params;
  const duration = calculateDuration(startedAt, endedAt);
  const now = new Date().toISOString();

  // Build markdown for the workflow tracking section
  const lines: string[] = [
    `**Workflow:** ${workflowName}`,
    `**Phase:** ${toPhase}`,
    `**Phase Started:** ${now}`,
    '',
    '### Phase History',
    '| Phase | Started | Ended | Duration |',
    '|-------|---------|-------|----------|',
    `| ${fromPhase} | ${startedAt} | ${endedAt} | ${duration} |`
  ];

  return lines.join('\n');
}

/**
 * Calculate duration between two ISO 8601 timestamps
 *
 * @param startedAt - Start timestamp
 * @param endedAt - End timestamp
 * @returns Formatted duration string (e.g., "30m", "2h 30m", "45s")
 */
export function calculateDuration(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);

  // Handle invalid timestamps
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return '0m';
  }

  const diffMs = Math.abs(end.getTime() - start.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  // Format based on duration length
  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  if (diffHours === 0) {
    return `${diffMinutes}m`;
  }

  const remainingMinutes = diffMinutes % 60;
  if (remainingMinutes === 0) {
    return `${diffHours}h`;
  }

  return `${diffHours}h ${remainingMinutes}m`;
}

// =============================================================================
// Handoff Mode Settings (Story 31-13)
// =============================================================================

/**
 * Handoff mode type - auto triggers immediately, manual prompts first
 */
export type HandoffMode = 'auto' | 'manual';

/**
 * Handoff behavior based on mode
 */
export interface HandoffBehavior {
  /** What action to take */
  action: 'immediate' | 'prompt';
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
  /** Message to show user (for prompt action) */
  message?: string;
}

/**
 * Entry for handoff history tracking
 */
export interface HandoffHistoryEntry {
  phase: string;
  agent: string;
  timestamp: string;
  handoffMode: HandoffMode;
}

/**
 * Read handoff mode from Cyclist settings file
 * Returns 'manual' as default if file doesn't exist or is invalid
 *
 * @param settingsPath - Path to the settings file (JSON or YAML)
 * @returns The handoff mode setting
 */
export function readHandoffMode(settingsPath: string): HandoffMode {
  try {
    if (!existsSync(settingsPath)) {
      return 'manual';
    }
    const content = readFileSync(settingsPath, 'utf-8');

    // Try JSON first, then YAML
    if (settingsPath.endsWith('.json') || content.trim().startsWith('{')) {
      return parseHandoffModeFromJson(content);
    } else {
      return parseHandoffModeFromYaml(content);
    }
  } catch {
    return 'manual';
  }
}

/**
 * Parse handoff mode from JSON string
 * Handles both new format (handoff_mode) and legacy format (auto_handoff boolean)
 *
 * @param jsonContent - JSON string containing settings
 * @returns The handoff mode setting
 */
export function parseHandoffModeFromJson(jsonContent: string): HandoffMode {
  try {
    const parsed = JSON.parse(jsonContent);
    const workflow = parsed?.workflow;

    if (!workflow) {
      return 'manual';
    }

    // New format: handoff_mode
    if (workflow.handoff_mode === 'auto' || workflow.handoff_mode === 'manual') {
      return workflow.handoff_mode;
    }

    // Legacy format: auto_handoff boolean
    if ('auto_handoff' in workflow) {
      return workflow.auto_handoff === true ? 'auto' : 'manual';
    }

    return 'manual';
  } catch {
    return 'manual';
  }
}

/**
 * Parse handoff mode from YAML string
 * Handles both new format (handoff_mode) and legacy format (auto_handoff boolean)
 *
 * @param yamlContent - YAML string containing settings
 * @returns The handoff mode setting
 */
export function parseHandoffModeFromYaml(yamlContent: string): HandoffMode {
  try {
    // Simple YAML parsing for handoff_mode - look for the pattern
    // workflow:
    //   handoff_mode: auto|manual

    const lines = yamlContent.split('\n');
    let inWorkflow = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'workflow:') {
        inWorkflow = true;
        continue;
      }

      if (inWorkflow) {
        // Check for new format
        const modeMatch = trimmed.match(/^handoff_mode:\s*['"]?(auto|manual)['"]?$/);
        if (modeMatch) {
          return modeMatch[1] as HandoffMode;
        }

        // Check for legacy format
        const autoMatch = trimmed.match(/^auto_handoff:\s*(true|false)$/i);
        if (autoMatch) {
          return autoMatch[1].toLowerCase() === 'true' ? 'auto' : 'manual';
        }

        // Exit workflow section when we hit a non-indented line
        if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed !== '') {
          inWorkflow = false;
        }
      }
    }

    return 'manual';
  } catch {
    return 'manual';
  }
}

/**
 * Get handoff behavior based on mode
 *
 * @param mode - The handoff mode setting
 * @returns Behavior configuration for the mode
 */
export function getHandoffBehavior(mode: HandoffMode): HandoffBehavior {
  if (mode === 'auto') {
    return {
      action: 'immediate',
      requiresConfirmation: false,
    };
  }

  return {
    action: 'prompt',
    requiresConfirmation: true,
    message: 'Ready for handoff. Confirm to proceed to next agent.',
  };
}

/**
 * Format handoff history entry for session file
 * Creates a markdown section with table row for the handoff
 *
 * @param entry - Handoff history entry to format
 * @returns Markdown string for the handoff history section
 */
export function formatHandoffHistory(entry: HandoffHistoryEntry): string {
  const lines: string[] = [
    '## Handoff History',
    '',
    '| Phase | Agent | Timestamp | Mode |',
    '|-------|-------|-----------|------|',
    `| ${entry.phase} | ${entry.agent} | ${entry.timestamp} | ${entry.handoffMode} |`,
  ];

  return lines.join('\n');
}

