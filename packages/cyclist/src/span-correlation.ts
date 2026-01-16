/**
 * Span Correlation Module - Story 36-1
 *
 * Provides correlation between OTEL spans from Claude Code and Claude tool_use
 * messages from the message stream. This is the foundation for downstream
 * enrichment in stories 36-2 through 36-5.
 *
 * The correlation map stores span context by spanId, allowing:
 * - Lookup of span context by span ID
 * - Filtering by tool name or trace ID
 * - Linking with Claude message context
 * - Session lifecycle management (reset on new session)
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Context from Claude tool_use messages that can be linked to OTEL spans
 */
export interface MessageContext {
  /** Unique message ID from Claude */
  messageId: string;
  /** Tool name (should match span toolName) */
  toolName: string;
  /** Tool input parameters */
  input?: Record<string, unknown>;
}

/**
 * Core span correlation data structure
 */
export interface SpanCorrelation {
  /** OTEL trace ID (hex string) */
  traceId: string;
  /** OTEL span ID (hex string) */
  spanId: string;
  /** Tool name (e.g., 'Bash', 'Read', 'Edit') */
  toolName: string;
  /** Claude tool_use_id for correlation with message stream */
  toolUseId?: string;
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Flag indicating if downstream enrichment has been applied */
  enriched: boolean;
  /** Linked Claude message context (set via linkToolUseToSpan) */
  messageContext?: MessageContext;
}

/**
 * Context for correlating a span - alias for SpanCorrelation
 * Used when registering new correlations
 */
export type CorrelationContext = SpanCorrelation;

// =============================================================================
// In-Memory Correlation Storage
// =============================================================================

/**
 * In-memory map of spanId -> SpanCorrelation
 * Maintains insertion order via Map semantics
 */
let correlationMap: Map<string, SpanCorrelation> = new Map();

// =============================================================================
// Pending Tool Input Storage (Story 36-8)
// =============================================================================
//
// Tool inputs arrive from Claude message stream BEFORE OTEL spans arrive.
// We store them here temporarily, then match when OTEL event comes in.
// Correlation is by tool name + timing (OTEL has no tool_id).

/**
 * Pending tool input waiting for OTEL correlation
 */
export interface PendingToolInput {
  /** Claude tool_use ID */
  toolId: string;
  /** Tool name (Read, Edit, etc.) */
  toolName: string;
  /** Tool input parameters with file_path, etc. */
  input: Record<string, unknown>;
  /** Timestamp when tool_use was received */
  timestamp: number;
}

/**
 * Queue of pending tool inputs, ordered by arrival time
 * We use a queue because tool_use arrives before tool_result/OTEL span
 */
let pendingToolInputs: PendingToolInput[] = [];

/** Max age for pending inputs (5 seconds) - after this, discard */
const PENDING_INPUT_MAX_AGE_MS = 5000;

/**
 * Store a tool input from Claude message stream for later OTEL correlation
 * @param toolId - Claude tool_use_id
 * @param toolName - Tool name (Read, Edit, etc.)
 * @param input - Tool input parameters
 */
export function storePendingToolInput(
  toolId: string,
  toolName: string,
  input: Record<string, unknown>
): void {
  // Clean up old entries first
  const now = Date.now();
  pendingToolInputs = pendingToolInputs.filter(
    p => now - p.timestamp < PENDING_INPUT_MAX_AGE_MS
  );

  pendingToolInputs.push({
    toolId,
    toolName,
    input,
    timestamp: now,
  });
}

/**
 * Find and consume a pending tool input matching the given tool name and input
 *
 * Story 36-10: Enhanced matching to fix race condition when multiple tools of
 * same type are in flight. For Read/Edit tools, matches on file_path for precision.
 * Falls back to tool name only if no file_path match found.
 *
 * @param toolName - Tool name to match
 * @param toolInput - Optional parsed tool_parameters from OTEL for precise matching
 * @returns Matching pending input, or undefined if none found
 */
export function consumePendingToolInput(
  toolName: string,
  toolInput?: Record<string, unknown>
): PendingToolInput | undefined {
  // Clean up old entries first
  const now = Date.now();
  pendingToolInputs = pendingToolInputs.filter(
    p => now - p.timestamp < PENDING_INPUT_MAX_AGE_MS
  );

  // Extract file_path from OTEL input for precise matching (Read/Edit tools)
  const filePath = toolInput?.file_path as string | undefined;

  // Try precise match first: toolName + file_path
  if (filePath) {
    const preciseIndex = pendingToolInputs.findIndex(
      p => p.toolName === toolName && p.input.file_path === filePath
    );
    if (preciseIndex !== -1) {
      const [match] = pendingToolInputs.splice(preciseIndex, 1);
      return match;
    }
  }

  // Fallback: match by tool name only (FIFO for tools without file_path)
  const index = pendingToolInputs.findIndex(p => p.toolName === toolName);
  if (index === -1) {
    return undefined;
  }

  // Remove and return
  const [match] = pendingToolInputs.splice(index, 1);
  return match;
}

/**
 * Get all pending tool inputs (for debugging)
 */
export function getPendingToolInputs(): PendingToolInput[] {
  return [...pendingToolInputs];
}

/**
 * Clear all pending tool inputs (for testing/reset)
 */
export function clearPendingToolInputs(): void {
  pendingToolInputs = [];
}

// =============================================================================
// Core Correlation Functions
// =============================================================================

/**
 * Store a span correlation in the map
 * @param spanId - The OTEL span ID to use as key
 * @param context - The correlation context to store
 */
export function correlateSpan(spanId: string, context: CorrelationContext): void {
  correlationMap.set(spanId, { ...context });
}

/**
 * Retrieve a span correlation by span ID
 * @param spanId - The OTEL span ID to look up
 * @returns The correlation context, or undefined if not found
 */
export function getCorrelation(spanId: string): SpanCorrelation | undefined {
  const correlation = correlationMap.get(spanId);
  return correlation ? { ...correlation } : undefined;
}

/**
 * Get all stored correlations in insertion order
 * @returns Array of all span correlations
 */
export function getAllCorrelations(): SpanCorrelation[] {
  return Array.from(correlationMap.values()).map(c => ({ ...c }));
}

/**
 * Check if a correlation exists for a given span ID
 * @param spanId - The OTEL span ID to check
 * @returns True if correlation exists, false otherwise
 */
export function hasCorrelation(spanId: string): boolean {
  return correlationMap.has(spanId);
}

/**
 * Reset all correlations (for new session)
 */
export function resetCorrelations(): void {
  correlationMap = new Map();
  pendingToolInputs = []; // Story 36-8: Also clear pending tool inputs
}

/**
 * Remove a single correlation by span ID
 * @param spanId - The OTEL span ID to remove
 * @returns True if removed, false if not found
 */
export function removeCorrelation(spanId: string): boolean {
  return correlationMap.delete(spanId);
}

// =============================================================================
// Message Linking Functions
// =============================================================================

/**
 * Link a Claude tool_use message context to an existing span correlation
 * @param spanId - The OTEL span ID to link
 * @param messageContext - The message context to attach
 */
export function linkToolUseToSpan(spanId: string, messageContext: MessageContext): void {
  const existing = correlationMap.get(spanId);
  if (existing) {
    correlationMap.set(spanId, {
      ...existing,
      messageContext: { ...messageContext },
    });
  }
}

// =============================================================================
// Query/Filter Functions
// =============================================================================

/**
 * Get all correlations for a specific tool type
 * @param toolName - The tool name to filter by (e.g., 'Bash', 'Read')
 * @returns Array of matching correlations
 */
export function getCorrelationsByToolName(toolName: string): SpanCorrelation[] {
  return getAllCorrelations().filter(c => c.toolName === toolName);
}

/**
 * Get all correlations for a specific trace
 * @param traceId - The OTEL trace ID to filter by
 * @returns Array of matching correlations
 */
export function getCorrelationByTraceId(traceId: string): SpanCorrelation[] {
  return getAllCorrelations().filter(c => c.traceId === traceId);
}
