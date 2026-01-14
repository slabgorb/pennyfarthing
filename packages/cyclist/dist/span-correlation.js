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
// In-Memory Correlation Storage
// =============================================================================
/**
 * In-memory map of spanId -> SpanCorrelation
 * Maintains insertion order via Map semantics
 */
let correlationMap = new Map();
// =============================================================================
// Core Correlation Functions
// =============================================================================
/**
 * Store a span correlation in the map
 * @param spanId - The OTEL span ID to use as key
 * @param context - The correlation context to store
 */
export function correlateSpan(spanId, context) {
    correlationMap.set(spanId, { ...context });
}
/**
 * Retrieve a span correlation by span ID
 * @param spanId - The OTEL span ID to look up
 * @returns The correlation context, or undefined if not found
 */
export function getCorrelation(spanId) {
    const correlation = correlationMap.get(spanId);
    return correlation ? { ...correlation } : undefined;
}
/**
 * Get all stored correlations in insertion order
 * @returns Array of all span correlations
 */
export function getAllCorrelations() {
    return Array.from(correlationMap.values()).map(c => ({ ...c }));
}
/**
 * Check if a correlation exists for a given span ID
 * @param spanId - The OTEL span ID to check
 * @returns True if correlation exists, false otherwise
 */
export function hasCorrelation(spanId) {
    return correlationMap.has(spanId);
}
/**
 * Reset all correlations (for new session)
 */
export function resetCorrelations() {
    correlationMap = new Map();
}
/**
 * Remove a single correlation by span ID
 * @param spanId - The OTEL span ID to remove
 * @returns True if removed, false if not found
 */
export function removeCorrelation(spanId) {
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
export function linkToolUseToSpan(spanId, messageContext) {
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
export function getCorrelationsByToolName(toolName) {
    return getAllCorrelations().filter(c => c.toolName === toolName);
}
/**
 * Get all correlations for a specific trace
 * @param traceId - The OTEL trace ID to filter by
 * @returns Array of matching correlations
 */
export function getCorrelationByTraceId(traceId) {
    return getAllCorrelations().filter(c => c.traceId === traceId);
}
//# sourceMappingURL=span-correlation.js.map