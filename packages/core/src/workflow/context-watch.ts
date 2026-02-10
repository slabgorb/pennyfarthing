/**
 * Context-watch Observation Scope for Story 95-6
 *
 * Delivers periodic conversation summaries from primary agent to backseat
 * observer at configurable turn intervals. Summary generation is non-blocking.
 * Token overhead stays under 25% per phase when combined with other scopes.
 *
 * Hook side: incrementTurnCounter() tracks tool calls (synchronous, fast).
 * Backseat side: startContextWatcher() polls counter and writes context observations.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { appendObservation } from './observation-writer.js';

// =============================================================================
// Types
// =============================================================================

export interface ContextWatchConfig {
  sessionDir: string;
  storyId: string;
  agent: string;
  persona: string;
  phase: string;
  pollIntervalMs?: number;
  turnInterval?: number;
  observationFilePath?: string;
  sessionFilePath?: string;
}

export interface ContextWatchHandle {
  running: boolean;
  pollIntervalMs: number;
}

export interface ContextWatchResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ContextSnapshotParams {
  sessionDir: string;
  storyId: string;
  sessionFilePath: string;
  turnCount: number;
}

export interface ContextSnapshotData {
  content: string;
  estimatedTokens: number;
}

// =============================================================================
// Internal state
// =============================================================================

const DEFAULT_TURN_INTERVAL = 5;
const DEFAULT_POLL_MS = 1000;
const MAX_SNAPSHOT_CHARS = 2000;
const COUNTER_FILENAME = '.tandem-turn-counter';

const timers = new WeakMap<ContextWatchHandle, ReturnType<typeof setInterval>>();
const lastProcessedTurn = new WeakMap<ContextWatchHandle, number>();

// =============================================================================
// Turn Counter
// =============================================================================

/**
 * Increment the turn counter for context-watch polling.
 * Called from the PostToolUse hook — must be synchronous and fast.
 */
export function incrementTurnCounter(sessionDir: string): ContextWatchResult<number> {
  try {
    if (!existsSync(sessionDir)) {
      return { success: false, error: `Session directory does not exist: ${sessionDir}` };
    }
    const counterFile = join(sessionDir, COUNTER_FILENAME);
    let count = 0;
    if (existsSync(counterFile)) {
      const raw = readFileSync(counterFile, 'utf-8').trim();
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        count = parsed;
      }
    }
    count += 1;
    writeFileSync(counterFile, String(count), 'utf-8');
    return { success: true, data: count };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read the current turn counter value.
 */
export function readTurnCounter(sessionDir: string): ContextWatchResult<number> {
  try {
    const counterFile = join(sessionDir, COUNTER_FILENAME);
    if (!existsSync(counterFile)) {
      return { success: true, data: 0 };
    }
    const raw = readFileSync(counterFile, 'utf-8').trim();
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
      return { success: true, data: 0 };
    }
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reset the turn counter to 0.
 */
export function resetTurnCounter(sessionDir: string): ContextWatchResult {
  try {
    const counterFile = join(sessionDir, COUNTER_FILENAME);
    writeFileSync(counterFile, '0', 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pure function: determine whether the current turn count should trigger
 * a context summary based on the configured interval.
 */
export function shouldTriggerSummary(turnCount: number, interval: number): boolean {
  if (turnCount <= 0) return false;
  return turnCount % interval === 0;
}

// =============================================================================
// Context Snapshots
// =============================================================================

/**
 * Write a context snapshot from the current session file state.
 * Reads the session file, extracts tail content, writes bounded snapshot.
 * Returns snapshot data with estimated token count.
 */
export function writeContextSnapshot(params: ContextSnapshotParams): ContextWatchResult<ContextSnapshotData> {
  try {
    const { sessionDir, storyId, sessionFilePath, turnCount } = params;
    if (!existsSync(sessionFilePath)) {
      return { success: false, error: `Session file not found: ${sessionFilePath}` };
    }
    const sessionContent = readFileSync(sessionFilePath, 'utf-8');

    // Extract the tail of the session file, bounded to MAX_SNAPSHOT_CHARS
    // This captures the most recent context
    const tailContent = sessionContent.length > MAX_SNAPSHOT_CHARS
      ? sessionContent.slice(-MAX_SNAPSHOT_CHARS)
      : sessionContent;

    // Build snapshot with turn context
    const content = `Context summary at turn ${turnCount}:\n${tailContent}`.slice(0, MAX_SNAPSHOT_CHARS);
    const estimatedTokens = Math.ceil(content.length / 4);

    // Write snapshot to disk for accumulation
    const snapshotFile = join(sessionDir, `${storyId}-tandem-context.md`);
    writeFileSync(snapshotFile, content, 'utf-8');

    return { success: true, data: { content, estimatedTokens } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read the most recent context snapshot for a story.
 * Returns empty content if no prior snapshot exists.
 */
export function readContextSnapshot(sessionDir: string, storyId: string): ContextWatchResult<{ content: string }> {
  try {
    const snapshotFile = join(sessionDir, `${storyId}-tandem-context.md`);
    if (!existsSync(snapshotFile)) {
      return { success: true, data: { content: '' } };
    }
    const content = readFileSync(snapshotFile, 'utf-8');
    return { success: true, data: { content } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// =============================================================================
// Watcher
// =============================================================================

/**
 * Start a polling context watcher that monitors the turn counter and
 * writes context observations at configured intervals.
 */
export async function startContextWatcher(config: ContextWatchConfig): Promise<ContextWatchResult<ContextWatchHandle>> {
  try {
    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;
    const turnInterval = config.turnInterval ?? DEFAULT_TURN_INTERVAL;
    const handle: ContextWatchHandle = {
      running: true,
      pollIntervalMs,
    };

    lastProcessedTurn.set(handle, 0);

    const timer = setInterval(() => {
      if (!handle.running) return;
      try {
        // Read current turn counter
        const counterResult = readTurnCounter(config.sessionDir);
        if (!counterResult.success || counterResult.data === undefined) return;

        const currentTurn = counterResult.data;
        const prevTurn = lastProcessedTurn.get(handle) ?? 0;

        // Check if we've crossed a new interval boundary since last poll
        if (currentTurn <= prevTurn) return;

        // Find interval boundaries between prevTurn and currentTurn
        let triggered = false;
        for (let t = prevTurn + 1; t <= currentTurn; t++) {
          if (shouldTriggerSummary(t, turnInterval)) {
            triggered = true;
            break;
          }
        }

        lastProcessedTurn.set(handle, currentTurn);

        if (!triggered) return;
        if (!config.sessionFilePath) return;

        // Generate context snapshot
        const snapshotResult = writeContextSnapshot({
          sessionDir: config.sessionDir,
          storyId: config.storyId,
          sessionFilePath: config.sessionFilePath,
          turnCount: currentTurn,
        });

        if (!snapshotResult.success || !snapshotResult.data) return;
        if (!config.observationFilePath) return;

        // Write observation
        try {
          appendObservation(config.observationFilePath, {
            triggerType: 'context-watch',
            triggerDetail: `summary at turn ${currentTurn}`,
            observation: snapshotResult.data.content,
          });
        } catch {
          // Error resilience — continue polling
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
 * Stop a running context watcher. Idempotent — safe to call multiple times.
 */
export async function stopContextWatcher(handle: ContextWatchHandle): Promise<ContextWatchResult> {
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
