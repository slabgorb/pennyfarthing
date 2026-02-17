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
// In-memory registries
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
// Implementations
// =============================================================================

/**
 * Create a phase-scoped team.
 *
 * If phase has no team config, returns success with no handle (no-op).
 * If phase has team config, creates team and returns handle.
 */
export async function createTeam(
  params: CreateTeamParams,
): Promise<TeamResult<TeamHandle>> {
  const { phase, storyId, adapter } = params;

  if (!phase.team) {
    return { success: true };
  }

  const teamName = `${storyId}-${phase.name}`;

  // Clean up existing team for same story
  const existing = activeTeams.get(storyId);
  if (existing && adapter) {
    try { await adapter.deleteTeam(existing.teamName); } catch { /* swallow */ }
    activeTeams.delete(storyId);
  }

  const handle: TeamHandle = {
    teamName,
    storyId,
    phase: phase.name,
    teammates: [],
    createdAt: new Date().toISOString(),
  };

  if (adapter) {
    try {
      await adapter.createTeam({ teamName });
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  activeTeams.set(storyId, handle);
  return { success: true, data: handle };
}

/**
 * Spawn all teammates for a team based on workflow YAML config.
 */
export async function spawnTeammates(
  handle: TeamHandle,
  config: TeamConfig,
  storyId: string,
  phase: string,
  adapter?: TeamProcessAdapter,
): Promise<TeamResult<TeammateHandle[]>> {
  const teammates: TeammateHandle[] = [];

  for (const member of config.teammates) {
    const teammate: TeammateHandle = {
      agent: member.agent,
      task: member.task,
      status: 'spawned',
    };

    if (adapter) {
      try {
        await adapter.spawnTeammate({
          teamName: handle.teamName,
          agent: member.agent,
          prompt: `pf agent start "${member.agent}"`,
          model: config.model,
        });
      } catch {
        teammate.status = 'crashed';
      }
    }

    teammates.push(teammate);
  }

  handle.teammates = teammates;
  // Update registry
  if (activeTeams.has(handle.storyId)) {
    activeTeams.set(handle.storyId, handle);
  }

  return { success: true, data: teammates };
}

/**
 * Shut down all active teammates in a team.
 */
export async function shutdownAllTeammates(
  handle: TeamHandle,
  adapter?: TeamProcessAdapter,
): Promise<TeamResult<{ shutdownCount: number }>> {
  let shutdownCount = 0;

  for (const teammate of handle.teammates) {
    if (teammate.status === 'shutdown' || teammate.status === 'crashed') {
      continue;
    }

    if (adapter) {
      try {
        await adapter.shutdownTeammate({
          teamName: handle.teamName,
          agent: teammate.agent,
        });
      } catch { /* swallow — graceful degradation */ }
    }

    teammate.status = 'shutdown';
    shutdownCount++;
  }

  return { success: true, data: { shutdownCount } };
}

/**
 * Clean up a team entirely (TeamDelete).
 * Must run before pf handoff.
 */
export async function cleanupTeam(
  handle: TeamHandle,
  adapter?: TeamProcessAdapter,
): Promise<TeamResult<{ cleaned: boolean }>> {
  if (adapter) {
    try { await adapter.deleteTeam(handle.teamName); } catch { /* swallow */ }
  }

  activeTeams.delete(handle.storyId);
  return { success: true, data: { cleaned: true } };
}

/**
 * Check gate condition when a TaskCompleted event fires.
 */
export function checkGateOnTaskCompleted(
  handle: TeamHandle,
  phase: WorkflowPhase,
): GateCheckResult {
  if (!phase.gate) {
    return { passed: true, gate: 'none' };
  }

  const gateType = phase.gate.type ?? 'unknown';
  const hasActive = handle.teammates.some((t) => t.status === 'active');

  if (hasActive) {
    return { passed: false, gate: gateType, reason: 'Teammates still active' };
  }

  return { passed: true, gate: gateType };
}

/**
 * Check gate condition when a TeammateIdle event fires.
 */
export function checkGateOnTeammateIdle(
  _handle: TeamHandle,
  teammate: TeammateHandle,
  phase: WorkflowPhase,
): GateCheckResult {
  if (!phase.gate) {
    return { passed: true, gate: 'none' };
  }

  const gateType = phase.gate.type ?? 'unknown';

  if (teammate.status === 'crashed') {
    return { passed: false, gate: gateType, reason: 'Teammate crashed' };
  }

  return { passed: true, gate: gateType };
}

/**
 * Generate a team activity summary for the session file audit trail.
 */
export function generateTeamSummary(
  handle: TeamHandle,
): TeamActivitySummary {
  return {
    teamName: handle.teamName,
    storyId: handle.storyId,
    phase: handle.phase,
    members: handle.teammates.map((t) => ({
      agent: t.agent,
      status: t.status,
      task: t.task,
    })),
    cleanShutdown: handle.teammates.every((t) => t.status === 'shutdown'),
  };
}

/**
 * Acquire an exclusive lock for sidecar file writing.
 */
export async function acquireSidecarLock(
  filePath: string,
  storyId: string,
  _timeout?: number,
): Promise<TeamResult<SidecarLock>> {
  const existing = sidecarLocks.get(filePath);

  if (existing) {
    if (existing.storyId === storyId) {
      return { success: true, data: existing };
    }
    return { success: false, error: `Lock held by story ${existing.storyId}` };
  }

  const lock: SidecarLock = {
    lockPath: `${filePath}.lock`,
    storyId,
    acquiredAt: new Date().toISOString(),
  };

  sidecarLocks.set(filePath, lock);
  return { success: true, data: lock };
}

/**
 * Release a sidecar file lock.
 */
export function releaseSidecarLock(
  lock: SidecarLock,
): TeamResult<void> {
  // Find and remove by lockPath
  for (const [path, held] of sidecarLocks) {
    if (held.lockPath === lock.lockPath) {
      sidecarLocks.delete(path);
      break;
    }
  }
  return { success: true };
}

/**
 * Get the active team for a story, if any.
 */
export function getActiveTeam(storyId: string): TeamHandle | null {
  return activeTeams.get(storyId) ?? null;
}
