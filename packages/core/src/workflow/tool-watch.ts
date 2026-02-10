/**
 * Tool-watch Observation Scope for Story 95-5
 *
 * Delivers tool call information (name, params, results) from primary agent
 * to backseat observer within one tool-use cycle. Truncates large results
 * to configurable max size. Non-blocking to primary.
 *
 * STUB: Implementation pending — tests should fail on assertions, not imports.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A single tool call entry in the JSONL transport file
 */
export interface ToolCallEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Tool name (Bash, Read, Edit, etc.) */
  toolName: string;
  /** Tool parameters */
  params: Record<string, unknown>;
  /** Result preview (potentially truncated) */
  resultPreview: string;
  /** Original result size in characters */
  resultSize: number;
}

/**
 * Configuration for tool-watch scope
 */
export interface ToolWatchConfig {
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
  /** Max result size in characters before truncation (default: 500) */
  maxResultSize?: number;
  /** Path to observation file (for startToolWatcher integration) */
  observationFilePath?: string;
}

/**
 * Handle to a running tool watcher
 */
export interface ToolWatchHandle {
  /** Whether the watcher is currently running */
  running: boolean;
  /** Effective poll interval */
  pollIntervalMs: number;
}

/**
 * Standard result object per framework pattern
 */
export interface ToolWatchResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Parameters for processToolCall (called from PostToolUse hook)
 */
export interface ProcessToolCallParams {
  sessionDir: string;
  storyId: string;
  toolName: string;
  params: Record<string, unknown>;
  toolResult: string;
  maxResultSize?: number;
}

// =============================================================================
// Stub implementations — all throw 'not implemented'
// =============================================================================

export function processToolCall(_params: ProcessToolCallParams): ToolWatchResult {
  throw new Error('not implemented');
}

export function readToolCalls(_filePath: string): ToolWatchResult<ToolCallEntry[]> {
  throw new Error('not implemented');
}

export function truncateResult(_result: string, _maxSize: number): string {
  throw new Error('not implemented');
}

export async function startToolWatcher(_config: ToolWatchConfig): Promise<ToolWatchResult<ToolWatchHandle>> {
  throw new Error('not implemented');
}

export async function stopToolWatcher(_handle: ToolWatchHandle): Promise<ToolWatchResult> {
  throw new Error('not implemented');
}
