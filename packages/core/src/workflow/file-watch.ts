/**
 * File-watch Observation Scope for Story 95-4
 *
 * Detects file changes (create, modify, delete) in the working tree
 * and writes observations with file-watch trigger type.
 *
 * STUB — not yet implemented. Tests should fail on assertions.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A detected file change event
 */
export interface FileChange {
  /** Relative path within work directory */
  path: string;
  /** Event type: create, modify, delete */
  event: 'create' | 'modify' | 'delete';
}

/**
 * Configuration for file-watch scope
 */
export interface FileWatchConfig {
  /** Working directory to watch */
  workDir: string;
  /** Path to .session/ directory */
  sessionDir: string;
  /** Current story ID */
  storyId: string;
  /** Observer agent name */
  agent: string;
  /** Observer persona name */
  persona: string;
  /** Current workflow phase */
  phase: string;
  /** Poll interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Paths to ignore (e.g. .pennyfarthing/, node_modules/) */
  ignorePaths?: string[];
  /** Path to observation file (for startFileWatcher integration) */
  observationFilePath?: string;
}

/**
 * Handle to a running file watcher
 */
export interface FileWatchHandle {
  /** Whether the watcher is currently running */
  running: boolean;
  /** Effective poll interval */
  pollIntervalMs: number;
}

/**
 * Standard result object per framework pattern
 */
export interface FileWatchResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// Implementations — STUBS (not yet implemented)
// =============================================================================

/**
 * Detect file changes in the working directory since last check.
 *
 * Returns an array of FileChange objects for create, modify, delete events.
 * Filters out ignored paths.
 */
export async function detectFileChanges(
  _config: FileWatchConfig
): Promise<FileWatchResult<FileChange[]>> {
  throw new Error('Not implemented: detectFileChanges');
}

/**
 * Start a polling file watcher that writes observations on changes.
 *
 * Returns a handle that can be passed to stopFileWatcher.
 */
export async function startFileWatcher(
  _config: FileWatchConfig
): Promise<FileWatchResult<FileWatchHandle>> {
  throw new Error('Not implemented: startFileWatcher');
}

/**
 * Stop a running file watcher. Idempotent — safe to call multiple times.
 */
export async function stopFileWatcher(
  _handle: FileWatchHandle
): Promise<FileWatchResult> {
  throw new Error('Not implemented: stopFileWatcher');
}

/**
 * Create a FileWatchScope configuration with defaults applied.
 *
 * Used to normalize config and provide default poll interval.
 */
export function createFileWatchScope(
  _config: FileWatchConfig
): FileWatchHandle {
  throw new Error('Not implemented: createFileWatchScope');
}
