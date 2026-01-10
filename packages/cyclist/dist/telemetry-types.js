/**
 * Telemetry Types - OpenTelemetry semantic conventions for GenAI
 *
 * Defines TypeScript interfaces for rich telemetry following OTEL gen_ai.*
 * semantic conventions. These types are foundational for all Epic 19 stories.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 * @see https://github.com/TechNickAI/claude_telemetry (reference implementation)
 */
// =============================================================================
// Type Guards & Utilities
// =============================================================================
/**
 * Check if a span is an agent span (has childSpans and events)
 */
export function isAgentSpan(span) {
    return 'childSpans' in span && 'events' in span;
}
/**
 * Check if a span is a tool span (has tool.name attribute)
 */
export function isToolSpan(span) {
    return 'attributes' in span && 'tool.name' in span.attributes;
}
/**
 * Create an empty token usage object
 */
export function createEmptyTokenUsage() {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
    };
}
/**
 * Create an empty cost attribution object
 */
export function createEmptyCostAttribution() {
    return {
        totalCostUsd: 0,
        byAgent: {},
        byStory: {},
    };
}
//# sourceMappingURL=telemetry-types.js.map