/**
 * CLI Delegation Layer for Story 141-18
 *
 * Thin wrappers that delegate workflow engine operations to `pf` CLI
 * subprocess calls instead of implementing logic in TypeScript.
 *
 * Replaces direct implementations in:
 * - handoff.ts (gate checking, phase advancement)
 * - session-state.ts (workflow state read/write)
 * - workflow-router.ts (story-to-workflow routing)
 * - workflow-executor.ts (stepped workflow state machine)
 * - workflow-schema.ts (YAML validation)
 * - gate-handler.ts (gate detection)
 */

import childProcess from 'node:child_process';

// Result object types (project standard: {success, data?, error?})

export interface CliResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface RouteResult {
  workflow: string;
  reason: string;
}

export interface GateResult {
  passed: boolean;
  gateType?: string;
  message?: string;
  nextPhase?: string;
  nextAgent?: string;
}

export interface HandoffStatusResult {
  storyId: string;
  phase: string | null;
  workflow: string | null;
  gateType?: string;
  nextPhase?: string;
  nextAgent?: string;
  status: string;
}

export interface PhaseCompleteResult {
  sessionFile: string;
  status: string;
}

export interface MarkerResult {
  relay: boolean;
  invoke: string;
  fallback: string;
  contextPercent?: number;
}

export interface WorkflowPhaseInfo {
  name: string;
  agent: string;
  label: string;
  status: string;
}

export interface WorkflowPhasesResult {
  workflow: string;
  storyId?: string;
  phases: WorkflowPhaseInfo[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function callPfRaw(args: string[], projectDir: string): CliResult<Record<string, unknown>> {
  try {
    const output = childProcess.execFileSync('pf', args, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 15_000,
    });
    return { success: true, data: JSON.parse(output) as Record<string, unknown> };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function optionalField(raw: Record<string, unknown>, snake: string, camel: string): string | undefined {
  if (raw[snake] != null) return String(raw[snake]);
  if (raw[camel] != null) return String(raw[camel]);
  return undefined;
}

function toHandoffStatus(raw: Record<string, unknown>): HandoffStatusResult {
  return {
    storyId: String(raw.story_id ?? raw.storyId ?? '').replace(/:$/, ''),
    phase: raw.phase == null ? null : String(raw.phase),
    workflow: raw.workflow == null ? null : String(raw.workflow),
    gateType: optionalField(raw, 'gate_type', 'gateType'),
    nextPhase: optionalField(raw, 'next_phase', 'nextPhase'),
    nextAgent: optionalField(raw, 'next_agent', 'nextAgent'),
    status: String(raw.status ?? ''),
  };
}

function toGateResult(raw: Record<string, unknown>): GateResult {
  const passed = raw.passed != null
    ? Boolean(raw.passed)
    : raw.status === 'ready';
  return {
    passed,
    gateType: optionalField(raw, 'gate_type', 'gateType'),
    message: optionalField(raw, 'message', 'message') ?? optionalField(raw, 'error', 'error'),
    nextPhase: optionalField(raw, 'next_phase', 'nextPhase'),
    nextAgent: optionalField(raw, 'next_agent', 'nextAgent'),
  };
}

/**
 * Route a story to the appropriate workflow via `pf workflow route --json`
 *
 * Replaces: workflow-router.ts routeStoryToWorkflow()
 */
export function routeWorkflow(
  storyId: string,
  projectDir: string,
): CliResult<RouteResult> {
  const result = callPfRaw(['workflow', 'route', storyId, '--json'], projectDir);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: result.data as unknown as RouteResult };
}

/**
 * Resolve a gate condition via `pf handoff resolve-gate --json`
 *
 * Replaces: handoff.ts checkGate() + gate-handler.ts detectGate()
 */
export function resolveGate(
  storyId: string,
  workflow: string,
  phase: string,
  projectDir: string,
): CliResult<GateResult> {
  const result = callPfRaw(
    ['handoff', 'resolve-gate', storyId, workflow, phase, '--json'],
    projectDir,
  );
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: toGateResult(result.data!) };
}

/**
 * Get current handoff/gate status via `pf handoff status --json`
 *
 * Replaces: session-state.ts parseSessionState() for handoff context
 */
export function getHandoffStatus(
  projectDir: string,
): CliResult<HandoffStatusResult> {
  const result = callPfRaw(['handoff', 'status', '--json'], projectDir);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: toHandoffStatus(result.data!) };
}

/**
 * Complete a phase transition via `pf handoff complete-phase`
 *
 * Replaces: handoff.ts formatPhaseTransition() + session-state.ts updateSessionContent()
 */
export function completePhase(
  storyId: string,
  workflow: string,
  fromPhase: string,
  toPhase: string,
  gateType: string,
  projectDir: string,
): CliResult<PhaseCompleteResult> {
  const result = callPfRaw(
    ['handoff', 'complete-phase', storyId, workflow, fromPhase, toPhase, gateType],
    projectDir,
  );
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: result.data as unknown as PhaseCompleteResult };
}

/**
 * Emit a handoff marker via `pf handoff marker`
 *
 * Replaces: handoff.ts formatContextClearMarker()
 */
export function emitMarker(
  agent: string,
  projectDir: string,
): CliResult<MarkerResult> {
  const result = callPfRaw(['handoff', 'marker', agent], projectDir);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: result.data as unknown as MarkerResult };
}

/**
 * Get workflow phases with status via `pf workflow phases --json`
 *
 * Replaces: workflow-executor.ts getWorkflowStatus()
 */
export function getWorkflowPhases(
  workflow: string,
  projectDir: string,
): CliResult<WorkflowPhasesResult> {
  const result = callPfRaw(['workflow', 'phases', workflow, '--json'], projectDir);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: result.data as unknown as WorkflowPhasesResult };
}

/**
 * Validate a workflow definition via `pf workflow show --json`
 *
 * Replaces: workflow-schema.ts validateWorkflow()
 */
export function validateWorkflowDef(
  workflowName: string,
  projectDir: string,
): CliResult<WorkflowValidationResult> {
  const result = callPfRaw(['workflow', 'show', workflowName, '--json'], projectDir);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: result.data as unknown as WorkflowValidationResult };
}
