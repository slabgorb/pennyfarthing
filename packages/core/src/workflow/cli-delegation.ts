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
  phase: string;
  workflow: string;
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

/**
 * Route a story to the appropriate workflow via `pf workflow route --json`
 *
 * Replaces: workflow-router.ts routeStoryToWorkflow()
 */
export function routeWorkflow(
  _storyId: string,
  _projectDir: string,
): CliResult<RouteResult> {
  return { success: false, error: 'not implemented' };
}

/**
 * Resolve a gate condition via `pf handoff resolve-gate --json`
 *
 * Replaces: handoff.ts checkGate() + gate-handler.ts detectGate()
 */
export function resolveGate(
  _storyId: string,
  _workflow: string,
  _phase: string,
  _projectDir: string,
): CliResult<GateResult> {
  return { success: false, error: 'not implemented' };
}

/**
 * Get current handoff/gate status via `pf handoff status --json`
 *
 * Replaces: session-state.ts parseSessionState() for handoff context
 */
export function getHandoffStatus(
  _projectDir: string,
): CliResult<HandoffStatusResult> {
  return { success: false, error: 'not implemented' };
}

/**
 * Complete a phase transition via `pf handoff complete-phase`
 *
 * Replaces: handoff.ts formatPhaseTransition() + session-state.ts updateSessionContent()
 */
export function completePhase(
  _storyId: string,
  _workflow: string,
  _fromPhase: string,
  _toPhase: string,
  _gateType: string,
  _projectDir: string,
): CliResult<PhaseCompleteResult> {
  return { success: false, error: 'not implemented' };
}

/**
 * Emit a handoff marker via `pf handoff marker`
 *
 * Replaces: handoff.ts formatContextClearMarker()
 */
export function emitMarker(
  _agent: string,
  _projectDir: string,
): CliResult<MarkerResult> {
  return { success: false, error: 'not implemented' };
}

/**
 * Get workflow phases with status via `pf workflow phases --json`
 *
 * Replaces: workflow-executor.ts getWorkflowStatus()
 */
export function getWorkflowPhases(
  _workflow: string,
  _projectDir: string,
): CliResult<WorkflowPhasesResult> {
  return { success: false, error: 'not implemented' };
}

/**
 * Validate a workflow definition via `pf workflow show --json`
 *
 * Replaces: workflow-schema.ts validateWorkflow()
 */
export function validateWorkflowDef(
  _workflowName: string,
  _projectDir: string,
): CliResult<WorkflowValidationResult> {
  return { success: false, error: 'not implemented' };
}
