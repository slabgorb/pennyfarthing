/**
 * Tool-watch Observation Scope for Story 95-5
 *
 * Delivers tool call information (name, params, results) from primary agent
 * to backseat observer within one tool-use cycle. Truncates large results
 * to configurable max size. Non-blocking to primary.
 *
 * Hook side: processToolCall() appends JSONL to transport file (synchronous, fast).
 * Backseat side: startToolWatcher() polls JSONL and writes observations.
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { appendObservation } from './observation-writer.js';

// =============================================================================
// Types
// =============================================================================

export interface ToolCallEntry {
  timestamp: string;
  toolName: string;
  params: Record<string, unknown>;
  resultPreview: string;
  resultSize: number;
}

export interface ToolWatchConfig {
  sessionDir: string;
  storyId: string;
  agent: string;
  persona: string;
  phase: string;
  pollIntervalMs?: number;
  maxResultSize?: number;
  observationFilePath?: string;
}

export interface ToolWatchHandle {
  running: boolean;
  pollIntervalMs: number;
}

export interface ToolWatchResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProcessToolCallParams {
  sessionDir: string;
  storyId: string;
  toolName: string;
  params: Record<string, unknown>;
  toolResult: string;
  maxResultSize?: number;
}

// =============================================================================
// Internal state
// =============================================================================

const DEFAULT_MAX_RESULT_SIZE = 500;
const DEFAULT_POLL_MS = 1000;

const timers = new WeakMap<ToolWatchHandle, ReturnType<typeof setInterval>>();
const lastReadLines = new WeakMap<ToolWatchHandle, number>();

// =============================================================================
// Implementations
// =============================================================================

/**
 * Truncate a tool result string to maxSize characters.
 * Appends `[truncated from N chars]` indicator when truncated.
 */
export function truncateResult(result: string, maxSize: number): string {
  if (result.length <= maxSize) {
    return result;
  }
  return result.slice(0, maxSize) + ` [truncated from ${result.length} chars]`;
}

/**
 * Record a tool call to the JSONL transport file.
 * Called from the PostToolUse hook — must be synchronous and fast.
 */
export function processToolCall(params: ProcessToolCallParams): ToolWatchResult {
  try {
    const { sessionDir, storyId, toolName, params: toolParams, toolResult } = params;
    const maxResultSize = params.maxResultSize ?? DEFAULT_MAX_RESULT_SIZE;

    if (!existsSync(sessionDir)) {
      return { success: false, error: `Session directory does not exist: ${sessionDir}` };
    }

    const filePath = join(sessionDir, `${storyId}-tandem-toolcalls.jsonl`);

    const entry: ToolCallEntry = {
      timestamp: new Date().toISOString(),
      toolName,
      params: toolParams,
      resultPreview: truncateResult(toolResult, maxResultSize),
      resultSize: toolResult.length,
    };

    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read tool call entries from a JSONL transport file.
 * Skips malformed lines gracefully.
 */
export function readToolCalls(filePath: string): ToolWatchResult<ToolCallEntry[]> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const entries: ToolCallEntry[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        entries.push(parsed as ToolCallEntry);
      } catch {
        // Skip malformed lines
      }
    }

    return { success: true, data: entries };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Start a polling tool watcher that reads JSONL entries and writes observations.
 */
export async function startToolWatcher(
  config: ToolWatchConfig
): Promise<ToolWatchResult<ToolWatchHandle>> {
  try {
    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;
    const toolCallsPath = join(config.sessionDir, `${config.storyId}-tandem-toolcalls.jsonl`);

    const handle: ToolWatchHandle = {
      running: true,
      pollIntervalMs,
    };

    // Start from line 0 — process all existing and future entries
    lastReadLines.set(handle, 0);

    const timer = setInterval(() => {
      if (!handle.running) return;

      try {
        if (!existsSync(toolCallsPath)) return;

        const content = readFileSync(toolCallsPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        const prevCount = lastReadLines.get(handle) ?? 0;

        if (lines.length <= prevCount) return;

        // Process only new lines
        const newLines = lines.slice(prevCount);
        lastReadLines.set(handle, lines.length);

        if (!config.observationFilePath) return;

        for (const line of newLines) {
          try {
            const entry = JSON.parse(line) as ToolCallEntry;

            // Build a param summary for the trigger detail
            const paramKeys = Object.keys(entry.params);
            const paramSummary = paramKeys.length > 0
              ? ` (${paramKeys.map(k => `${k}: ${String(entry.params[k]).slice(0, 50)}`).join(', ')})`
              : '';

            const triggerDetail = `${entry.toolName}${paramSummary}`;

            // Build enriched observation text (not just raw result replay)
            const observation = `Tool: ${entry.toolName}${paramSummary}\nResult (${entry.resultSize} chars): ${entry.resultPreview}`;

            appendObservation(config.observationFilePath, {
              triggerType: 'tool-watch',
              triggerDetail,
              observation,
            });
          } catch {
            // Skip malformed lines, continue polling
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
 * Stop a running tool watcher. Idempotent — safe to call multiple times.
 */
export async function stopToolWatcher(handle: ToolWatchHandle): Promise<ToolWatchResult> {
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
