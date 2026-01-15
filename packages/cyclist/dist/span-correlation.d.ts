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
 * Store a tool input from Claude message stream for later OTEL correlation
 * @param toolId - Claude tool_use_id
 * @param toolName - Tool name (Read, Edit, etc.)
 * @param input - Tool input parameters
 */
export declare function storePendingToolInput(toolId: string, toolName: string, input: Record<string, unknown>): void;
/**
 * Find and consume a pending tool input matching the given tool name
 * Returns the oldest matching entry (FIFO) and removes it from the queue
 * @param toolName - Tool name to match
 * @returns Matching pending input, or undefined if none found
 */
export declare function consumePendingToolInput(toolName: string): PendingToolInput | undefined;
/**
 * Get all pending tool inputs (for debugging)
 */
export declare function getPendingToolInputs(): PendingToolInput[];
/**
 * Clear all pending tool inputs (for testing/reset)
 */
export declare function clearPendingToolInputs(): void;
/**
 * Store a span correlation in the map
 * @param spanId - The OTEL span ID to use as key
 * @param context - The correlation context to store
 */
export declare function correlateSpan(spanId: string, context: CorrelationContext): void;
/**
 * Retrieve a span correlation by span ID
 * @param spanId - The OTEL span ID to look up
 * @returns The correlation context, or undefined if not found
 */
export declare function getCorrelation(spanId: string): SpanCorrelation | undefined;
/**
 * Get all stored correlations in insertion order
 * @returns Array of all span correlations
 */
export declare function getAllCorrelations(): SpanCorrelation[];
/**
 * Check if a correlation exists for a given span ID
 * @param spanId - The OTEL span ID to check
 * @returns True if correlation exists, false otherwise
 */
export declare function hasCorrelation(spanId: string): boolean;
/**
 * Reset all correlations (for new session)
 */
export declare function resetCorrelations(): void;
/**
 * Remove a single correlation by span ID
 * @param spanId - The OTEL span ID to remove
 * @returns True if removed, false if not found
 */
export declare function removeCorrelation(spanId: string): boolean;
/**
 * Link a Claude tool_use message context to an existing span correlation
 * @param spanId - The OTEL span ID to link
 * @param messageContext - The message context to attach
 */
export declare function linkToolUseToSpan(spanId: string, messageContext: MessageContext): void;
/**
 * Get all correlations for a specific tool type
 * @param toolName - The tool name to filter by (e.g., 'Bash', 'Read')
 * @returns Array of matching correlations
 */
export declare function getCorrelationsByToolName(toolName: string): SpanCorrelation[];
/**
 * Get all correlations for a specific trace
 * @param traceId - The OTEL trace ID to filter by
 * @returns Array of matching correlations
 */
export declare function getCorrelationByTraceId(traceId: string): SpanCorrelation[];
//# sourceMappingURL=span-correlation.d.ts.map