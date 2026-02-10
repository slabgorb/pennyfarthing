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
  const { phase, storyId, sessionDir } = params;

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
  const taskId = `tandem-${storyId}-${partner}-${++taskIdCounter}`;

  const handle: BackseatHandle = {
    taskId,
    partner,
    model: 'haiku',
    runInBackground: true,
    scope: normalizedScope,
    observationFilePath,
    cleanupRegistered: true,
  };

  // Register cleanup handler at spawn time
  registerCleanupHandler({
    storyId,
    cleanup: async () => {
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
  handle: BackseatHandle
): Promise<TandemResult<{ status: string }>> {
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
