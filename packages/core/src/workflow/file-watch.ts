/**
 * File-watch Observation Scope for Story 95-4
 *
 * Detects file changes (create, modify, delete) in the working tree
 * and writes observations with file-watch trigger type.
 *
 * Uses snapshot-based diffing: recursive readdirSync, compare mtimes between polls.
 * No git dependency — works in any directory.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { appendObservation } from './observation-writer.js';

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
// Internal state
// =============================================================================

type Snapshot = Map<string, number>; // relative path -> mtime ms

interface SnapshotEntry {
  snapshot: Snapshot;
  dirIno: number; // inode of workDir to detect recreation
}

/** Per-config snapshots keyed by workDir */
const snapshots = new Map<string, SnapshotEntry>();

/** Per-handle interval timers */
const timers = new WeakMap<FileWatchHandle, ReturnType<typeof setInterval>>();

/** Per-handle snapshot for context accumulation (tracking what was already reported) */
const handleSnapshots = new WeakMap<FileWatchHandle, Snapshot>();

// =============================================================================
// Internal helpers
// =============================================================================

function scanDir(dir: string, ignorePaths: string[], baseDir: string): Snapshot {
  const snapshot: Snapshot = new Map();

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry);
      const relPath = relative(baseDir, fullPath);

      // Check ignore paths
      if (ignorePaths.some(ig => relPath.startsWith(ig) || relPath.includes('/' + ig))) {
        continue;
      }

      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else {
          snapshot.set(relPath, stat.mtimeMs);
        }
      } catch {
        // File may have been deleted between readdir and stat
        continue;
      }
    }
  }

  walk(dir);
  return snapshot;
}

function diffSnapshots(prev: Snapshot, curr: Snapshot): FileChange[] {
  const changes: FileChange[] = [];

  // Detect creates and modifies
  for (const [path, mtime] of curr) {
    const prevMtime = prev.get(path);
    if (prevMtime === undefined) {
      changes.push({ path, event: 'create' });
    } else if (mtime !== prevMtime) {
      changes.push({ path, event: 'modify' });
    }
  }

  // Detect deletes
  for (const path of prev.keys()) {
    if (!curr.has(path)) {
      changes.push({ path, event: 'delete' });
    }
  }

  return changes;
}

// =============================================================================
// Implementations
// =============================================================================

const DEFAULT_POLL_MS = 1000;

/**
 * Detect file changes in the working directory since last check.
 *
 * Returns an array of FileChange objects for create, modify, delete events.
 * Filters out ignored paths.
 */
export async function detectFileChanges(
  config: FileWatchConfig
): Promise<FileWatchResult<FileChange[]>> {
  try {
    if (!existsSync(config.workDir)) {
      return { success: false, error: `Work directory does not exist: ${config.workDir}` };
    }

    const ignorePaths = config.ignorePaths ?? [];
    const curr = scanDir(config.workDir, ignorePaths, config.workDir);
    const dirStat = statSync(config.workDir);
    const dirIno = dirStat.ino;
    const prev = snapshots.get(config.workDir);

    if (!prev || prev.dirIno !== dirIno) {
      // First call or directory was recreated — store baseline, return empty changes
      snapshots.set(config.workDir, { snapshot: curr, dirIno });
      return { success: true, data: [] };
    }

    const changes = diffSnapshots(prev.snapshot, curr);
    snapshots.set(config.workDir, { snapshot: curr, dirIno });
    return { success: true, data: changes };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Start a polling file watcher that writes observations on changes.
 *
 * Returns a handle that can be passed to stopFileWatcher.
 */
export async function startFileWatcher(
  config: FileWatchConfig
): Promise<FileWatchResult<FileWatchHandle>> {
  try {
    if (!existsSync(config.workDir)) {
      return { success: false, error: `Work directory does not exist: ${config.workDir}` };
    }

    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;
    const ignorePaths = config.ignorePaths ?? [];

    const handle: FileWatchHandle = {
      running: true,
      pollIntervalMs,
    };

    // Take initial snapshot for this watcher
    const initialSnapshot = scanDir(config.workDir, ignorePaths, config.workDir);
    handleSnapshots.set(handle, initialSnapshot);

    const timer = setInterval(() => {
      if (!handle.running) return;

      try {
        const prev = handleSnapshots.get(handle);
        if (!prev) return;

        const curr = scanDir(config.workDir, ignorePaths, config.workDir);
        const changes = diffSnapshots(prev, curr);

        if (changes.length > 0) {
          // Update snapshot to current
          handleSnapshots.set(handle, curr);

          // Write observations if observation file path is configured
          if (config.observationFilePath) {
            for (const change of changes) {
              try {
                appendObservation(config.observationFilePath, {
                  triggerType: 'file-watch',
                  triggerDetail: `${change.event}: ${change.path}`,
                  observation: `File ${change.event}: ${change.path}`,
                });
              } catch {
                // Error resilience — continue polling even if write fails
              }
            }
          }
        }
      } catch {
        // Error resilience — continue polling
      }
    }, pollIntervalMs);

    timers.set(handle, timer);
    return { success: true, data: handle };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Stop a running file watcher. Idempotent — safe to call multiple times.
 */
export async function stopFileWatcher(
  handle: FileWatchHandle
): Promise<FileWatchResult> {
  try {
    handle.running = false;
    const timer = timers.get(handle);
    if (timer) {
      clearInterval(timer);
      timers.delete(handle);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Create a FileWatchScope configuration with defaults applied.
 *
 * Used to normalize config and provide default poll interval.
 */
export function createFileWatchScope(
  config: FileWatchConfig
): FileWatchHandle {
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;
  return {
    running: false,
    pollIntervalMs,
  };
}
