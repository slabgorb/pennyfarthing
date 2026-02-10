/**
 * Tandem Backseat Agent Lifecycle for Story 95-2
 *
 * Manages spawn/kill lifecycle for backseat observer agents in phased workflows.
 * When a workflow phase has a `tandem:` config block, BikeLane spawns a background
 * subagent that observes the primary agent's work.
 *
 * STUB: This module contains type definitions and stub implementations.
 * Dev will replace stubs with real implementations.
 */

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
// Stub Implementations (to be replaced by Dev)
// =============================================================================

/**
 * Spawn a backseat agent for a tandem-configured phase.
 *
 * If phase has no tandem config, returns success with no handle (no-op).
 * If phase has tandem config, spawns background subagent and returns handle.
 *
 * STUB: Returns not-implemented error.
 */
export async function spawnBackseat(
  _params: SpawnBackseatParams
): Promise<TandemResult<BackseatHandle>> {
  // STUB: Not yet implemented — tests should fail on assertions
  throw new Error('spawnBackseat not implemented');
}

/**
 * Terminate a running backseat agent.
 *
 * Should handle already-stopped tasks gracefully (no throw).
 *
 * STUB: Returns not-implemented error.
 */
export async function terminateBackseat(
  _handle: BackseatHandle
): Promise<TandemResult<{ status: string }>> {
  // STUB: Not yet implemented — tests should fail on assertions
  throw new Error('terminateBackseat not implemented');
}

/**
 * Get the active backseat handle for a story, if any.
 *
 * Returns null if no backseat is running for this story.
 *
 * STUB: Returns undefined (will cause assertion failures).
 */
export function getActiveBackseat(
  _storyId: string
): BackseatHandle | null {
  // STUB: Not yet implemented
  throw new Error('getActiveBackseat not implemented');
}

/**
 * Register a cleanup handler for tandem backseat processes.
 *
 * Handlers are executed on crash recovery or explicit cleanup.
 *
 * STUB: No-op.
 */
export function registerCleanupHandler(
  _handler: TandemCleanupHandler
): void {
  // STUB: Not yet implemented
  throw new Error('registerCleanupHandler not implemented');
}

/**
 * Execute all cleanup handlers for a story.
 *
 * Must not throw even if individual handlers fail.
 * Must clear handlers after execution (idempotent).
 *
 * STUB: No-op.
 */
export async function executeCleanupHandlers(
  _storyId: string
): Promise<void> {
  // STUB: Not yet implemented
  throw new Error('executeCleanupHandlers not implemented');
}
