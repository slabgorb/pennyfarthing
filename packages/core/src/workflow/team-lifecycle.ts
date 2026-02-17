/**
 * Phase-scoped Team Lifecycle for Story 86-10
 *
 * Manages the lifecycle of native Agent Teams within workflow phases.
 * When a workflow phase has a `team:` config block, the lead agent creates
 * a team at phase start, spawns teammates, and cleans up before handoff.
 *
 * Follows the same ProcessAdapter injection pattern as tandem-lifecycle.ts.
 */

import type { WorkflowPhase, TeamConfig, TeamMember } from './workflow-schema.js';

// =============================================================================
// Types
// =============================================================================

/** Handle to an active team for a workflow phase */
export interface TeamHandle {
  /** Team name (format: {storyId}-{phase}) */
  teamName: string;
  /** Story ID this team belongs to */
  storyId: string;
  /** Workflow phase name */
  phase: string;
  /** Active teammate handles */
  teammates: TeammateHandle[];
  /** ISO timestamp when team was created */
  createdAt: string;
}

/** Handle to an individual teammate within a team */
export interface TeammateHandle {
  /** Agent name (e.g., 'architect', 'tea') */
  agent: string;
  /** Task description from workflow YAML */
  task?: string;
  /** Current teammate status */
  status: 'spawned' | 'active' | 'idle' | 'crashed' | 'shutdown';
}

/** Parameters for creating a phase-scoped team */
export interface CreateTeamParams {
  /** Phase config (must have team block to create) */
  phase: WorkflowPhase;
  /** Current story ID */
  storyId: string;
  /** Path to .session directory */
  sessionDir: string;
  /** Process adapter for real team operations. Omit for in-memory (tests). */
  adapter?: TeamProcessAdapter;
}

/** Result of a gate check (TaskCompleted or TeammateIdle hook) */
export interface GateCheckResult {
  /** Whether the gate passed */
  passed: boolean;
  /** Gate type that was checked */
  gate: string;
  /** Reason for pass/fail */
  reason?: string;
}

/** Team activity summary for session file audit trail */
export interface TeamActivitySummary {
  /** Team name */
  teamName: string;
  /** Story ID */
  storyId: string;
  /** Phase name */
  phase: string;
  /** Member details */
  members: Array<{ agent: string; status: string; task?: string }>;
  /** Whether all teammates were cleaned up properly */
  cleanShutdown: boolean;
}

/** Sidecar lock handle */
export interface SidecarLock {
  /** Path to the lock file */
  lockPath: string;
  /** Story ID that owns the lock */
  storyId: string;
  /** Timestamp when lock was acquired */
  acquiredAt: string;
}

/** Standard result object per framework pattern */
export interface TeamResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Adapter for real team operations.
 *
 * The library module cannot call Claude Code's TeamCreate/SendMessage tools
 * directly — callers inject the real implementation.
 * Tests use the default no-op adapter.
 */
export interface TeamProcessAdapter {
  /** Create a team. Returns team name. */
  createTeam(params: {
    teamName: string;
    description?: string;
  }): Promise<{ teamName: string }>;

  /** Delete a team. */
  deleteTeam(teamName: string): Promise<void>;

  /** Spawn a teammate within a team. */
  spawnTeammate(params: {
    teamName: string;
    agent: string;
    prompt: string;
    model?: string;
  }): Promise<{ agentId: string }>;

  /** Send shutdown request to a teammate. */
  shutdownTeammate(params: {
    teamName: string;
    agent: string;
  }): Promise<void>;
}

// =============================================================================
// In-memory registries (stubs — not implemented)
// =============================================================================

/** Active teams keyed by storyId */
const activeTeams = new Map<string, TeamHandle>();

/** Sidecar locks keyed by file path */
const sidecarLocks = new Map<string, SidecarLock>();

/**
 * Reset all in-memory state. For testing only.
 */
export function _resetForTesting(): void {
  activeTeams.clear();
  sidecarLocks.clear();
}

// =============================================================================
// Stub implementations — all return not-implemented errors
// =============================================================================

/**
 * Create a phase-scoped team.
 *
 * If phase has no team config, returns success with no handle (no-op).
 * If phase has team config, creates team and returns handle.
 */
export async function createTeam(
  _params: CreateTeamParams,
): Promise<TeamResult<TeamHandle>> {
  // STUB: not implemented — tests should fail on assertions
  return { success: false, error: 'not implemented' };
}

/**
 * Spawn all teammates for a team based on workflow YAML config.
 */
export async function spawnTeammates(
  _handle: TeamHandle,
  _config: TeamConfig,
  _storyId: string,
  _phase: string,
  _adapter?: TeamProcessAdapter,
): Promise<TeamResult<TeammateHandle[]>> {
  // STUB: not implemented
  return { success: false, error: 'not implemented' };
}

/**
 * Shut down all active teammates in a team.
 */
export async function shutdownAllTeammates(
  _handle: TeamHandle,
  _adapter?: TeamProcessAdapter,
): Promise<TeamResult<{ shutdownCount: number }>> {
  // STUB: not implemented
  return { success: false, error: 'not implemented' };
}

/**
 * Clean up a team entirely (TeamDelete).
 * Must run before pf handoff.
 */
export async function cleanupTeam(
  _handle: TeamHandle,
  _adapter?: TeamProcessAdapter,
): Promise<TeamResult<{ cleaned: boolean }>> {
  // STUB: not implemented
  return { success: false, error: 'not implemented' };
}

/**
 * Check gate condition when a TaskCompleted event fires.
 */
export function checkGateOnTaskCompleted(
  _handle: TeamHandle,
  _phase: WorkflowPhase,
): GateCheckResult {
  // STUB: not implemented
  return { passed: false, gate: 'unknown', reason: 'not implemented' };
}

/**
 * Check gate condition when a TeammateIdle event fires.
 */
export function checkGateOnTeammateIdle(
  _handle: TeamHandle,
  _teammate: TeammateHandle,
  _phase: WorkflowPhase,
): GateCheckResult {
  // STUB: not implemented
  return { passed: false, gate: 'unknown', reason: 'not implemented' };
}

/**
 * Generate a team activity summary for the session file audit trail.
 */
export function generateTeamSummary(
  _handle: TeamHandle,
): TeamActivitySummary {
  // STUB: not implemented
  return {
    teamName: '',
    storyId: '',
    phase: '',
    members: [],
    cleanShutdown: false,
  };
}

/**
 * Acquire an exclusive lock for sidecar file writing.
 */
export async function acquireSidecarLock(
  _filePath: string,
  _storyId: string,
  _timeout?: number,
): Promise<TeamResult<SidecarLock>> {
  // STUB: not implemented
  return { success: false, error: 'not implemented' };
}

/**
 * Release a sidecar file lock.
 */
export function releaseSidecarLock(
  _lock: SidecarLock,
): TeamResult<void> {
  // STUB: not implemented
  return { success: false, error: 'not implemented' };
}

/**
 * Get the active team for a story, if any.
 */
export function getActiveTeam(storyId: string): TeamHandle | null {
  return activeTeams.get(storyId) ?? null;
}
