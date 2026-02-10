/**
 * Tandem Backseat Agent Lifecycle for Story 95-2
 *
 * Manages spawn/kill lifecycle for backseat observer agents in phased workflows.
 * When a workflow phase has a `tandem:` config block, BikeLane spawns a background
 * subagent that observes the primary agent's work.
 */

import { join } from 'node:path';
import type { WorkflowPhase } from './workflow-schema.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Handle to a running backseat agent
 */
export interface BackseatHandle {
  /** Background task ID from Task tool */
  taskId: string;
  /** Partner agent name (from tandem config) */
  partner: string;
  /** Model used (should always be 'haiku') */
  model: string;
  /** Whether task runs in background */
  runInBackground: boolean;
  /** Normalized observation scopes */
  scope: string[];
  /** Path to observation file: .session/{storyId}-tandem-{partner}.md */
  observationFilePath: string;
  /** Whether cleanup handler was registered at spawn time */
  cleanupRegistered: boolean;
}

/**
 * Parameters for spawning a backseat agent
 */
export interface SpawnBackseatParams {
  /** Phase config (must have tandem block to spawn) */
  phase: WorkflowPhase;
  /** Current story ID */
  storyId: string;
  /** Path to .session directory */
  sessionDir: string;
  /** Process adapter for real spawn/terminate. Omit for in-memory only (tests). */
  adapter?: ProcessAdapter;
}

/**
 * Cleanup handler for tandem backseat processes
 */
export interface TandemCleanupHandler {
  /** Story ID this handler belongs to */
  storyId: string;
  /** Cleanup function to execute */
  cleanup: () => Promise<void>;
}

/**
 * Standard result object per framework pattern
 */
export interface TandemResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Adapter for real process spawn/terminate operations.
 *
 * The library module cannot call Claude Code's Task tool directly —
 * callers (workflow-executor) inject the real implementation.
 * Tests use the default no-op adapter.
 */
export interface ProcessAdapter {
  /** Spawn a background process. Returns the real task ID. */
  spawn(params: {
    partner: string;
    model: string;
    storyId: string;
    scope: string[];
    observationFilePath: string;
  }): Promise<{ taskId: string }>;

  /** Terminate a background process by task ID. */
  terminate(taskId: string): Promise<void>;
}

// =============================================================================
// In-memory registries
// =============================================================================

/** Active backseat agents keyed by storyId */
const activeBackseats = new Map<string, BackseatHandle>();

/** Cleanup handlers keyed by storyId */
const cleanupHandlers = new Map<string, TandemCleanupHandler[]>();

/** Counter for generating unique task IDs */
let taskIdCounter = 0;

/**
 * Reset all in-memory state. For testing only.
 */
export function _resetForTesting(): void {
  activeBackseats.clear();
  cleanupHandlers.clear();
  taskIdCounter = 0;
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Normalize scope from tandem config to a string array.
 * Defaults to ['file-watch'] when no scope is specified.
 */
function normalizeScope(scope: string | string[] | undefined): string[] {
  if (scope === undefined) {
    return ['file-watch'];
  }
  if (Array.isArray(scope)) {
    return scope;
  }
  return [scope];
}

/**
 * Spawn a backseat agent for a tandem-configured phase.
 *
 * If phase has no tandem config, returns success with no handle (no-op).
 * If phase has tandem config, spawns background subagent and returns handle.
 */
export async function spawnBackseat(
  params: SpawnBackseatParams
): Promise<TandemResult<BackseatHandle>> {
  const { phase, storyId, sessionDir, adapter } = params;

  // No tandem config — no-op
  if (!phase.tandem) {
    return { success: true };
  }

  const { partner, scope } = phase.tandem;

  // Validate partner
  if (!partner) {
    return { success: false, error: 'Tandem partner is required and cannot be empty' };
  }

  const normalizedScope = normalizeScope(scope);
  const observationFilePath = join(sessionDir, `${storyId}-tandem-${partner}.md`);

  // Terminate existing backseat for this story if one is already running
  const existing = activeBackseats.get(storyId);
  if (existing) {
    try {
      if (adapter) {
        await adapter.terminate(existing.taskId);
      }
      activeBackseats.delete(storyId);
    } catch {
      // Swallow — old process may already be dead
    }
  }

  // Spawn via adapter if provided, otherwise generate synthetic ID (test mode)
  let taskId: string;
  if (adapter) {
    try {
      const spawnResult = await adapter.spawn({
        partner,
        model: 'haiku',
        storyId,
        scope: normalizedScope,
        observationFilePath,
      });
      taskId = spawnResult.taskId;
    } catch (err) {
      return { success: false, error: `Failed to spawn backseat: ${err instanceof Error ? err.message : String(err)}` };
    }
  } else {
    taskId = `tandem-${storyId}-${partner}-${++taskIdCounter}`;
  }

  const handle: BackseatHandle = {
    taskId,
    partner,
    model: 'haiku',
    runInBackground: true,
    scope: normalizedScope,
    observationFilePath,
    cleanupRegistered: true,
  };

  // Register cleanup handler at spawn time — terminates the real process
  registerCleanupHandler({
    storyId,
    cleanup: async () => {
      if (adapter) {
        try {
          await adapter.terminate(handle.taskId);
        } catch {
          // Swallow — process may already be dead
        }
      }
      activeBackseats.delete(storyId);
    },
  });

  // Store in active registry
  activeBackseats.set(storyId, handle);

  return { success: true, data: handle };
}

/**
 * Terminate a running backseat agent.
 *
 * Handles already-stopped tasks gracefully (no throw).
 */
export async function terminateBackseat(
  handle: BackseatHandle,
  adapter?: ProcessAdapter
): Promise<TandemResult<{ status: string }>> {
  // Terminate real process via adapter if provided
  if (adapter) {
    try {
      await adapter.terminate(handle.taskId);
    } catch {
      // Swallow — process may already be stopped
    }
  }

  // Remove from active registry (find by taskId)
  for (const [storyId, active] of activeBackseats) {
    if (active.taskId === handle.taskId) {
      activeBackseats.delete(storyId);
      break;
    }
  }

  return { success: true, data: { status: 'terminated' } };
}

/**
 * Get the active backseat handle for a story, if any.
 *
 * Returns null if no backseat is running for this story.
 */
export function getActiveBackseat(
  storyId: string
): BackseatHandle | null {
  return activeBackseats.get(storyId) ?? null;
}

/**
 * Register a cleanup handler for tandem backseat processes.
 *
 * Handlers are executed on crash recovery or explicit cleanup.
 */
export function registerCleanupHandler(
  handler: TandemCleanupHandler
): void {
  const existing = cleanupHandlers.get(handler.storyId) ?? [];
  existing.push(handler);
  cleanupHandlers.set(handler.storyId, existing);
}

/**
 * Execute all cleanup handlers for a story.
 *
 * Must not throw even if individual handlers fail.
 * Clears handlers after execution (idempotent).
 */
export async function executeCleanupHandlers(
  storyId: string
): Promise<void> {
  const handlers = cleanupHandlers.get(storyId);
  if (!handlers || handlers.length === 0) {
    return;
  }

  // Clear immediately to ensure idempotency
  cleanupHandlers.delete(storyId);

  for (const handler of handlers) {
    try {
      await handler.cleanup();
    } catch {
      // Swallow errors — primary agent must not be affected
    }
  }
}
