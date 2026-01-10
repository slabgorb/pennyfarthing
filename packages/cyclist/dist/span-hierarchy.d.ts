/**
 * Span Hierarchy Builder - Story 19-3
 *
 * Transforms flat OTEL events (ToolEvent[], ParsedPromptEvent[]) into
 * structured parent/child span hierarchies (AgentSpan[]).
 *
 * Pattern:
 * ```
 * claude.agent.run (AgentSpan - one per unique traceId)
 *   ├─ user.prompt (PromptEvent)
 *   ├─ tool.Read (ToolSpan)
 *   ├─ tool.Write (ToolSpan)
 *   └─ agent.completed (event)
 * ```
 *
 * @see telemetry-types.ts for type definitions
 * @see otlp-receiver.ts for event sources
 */
import type { AgentSpan, ToolSpan, PromptEvent } from './telemetry-types.js';
import type { ToolEvent, ParsedPromptEvent } from './otlp-receiver.js';
/**
 * Convert a ToolEvent from OTLP receiver to a ToolSpan
 *
 * @param event - The tool event from OTLP parsing
 * @param parentSpanId - The parent AgentSpan's spanId
 * @returns A ToolSpan with proper parent reference
 */
export declare function convertToolEventToToolSpan(event: ToolEvent, parentSpanId: string): ToolSpan;
/**
 * Convert a ParsedPromptEvent from OTLP receiver to a PromptEvent
 *
 * @param event - The parsed prompt event from OTLP parsing
 * @returns A PromptEvent suitable for AgentSpan.events
 */
export declare function convertPromptEventToPromptEvent(event: ParsedPromptEvent): PromptEvent;
/**
 * Group events by their trace_id
 *
 * @param toolEvents - Tool events to group
 * @param promptEvents - Prompt events to group
 * @returns Object with traceId keys containing grouped events
 */
export declare function groupEventsByTraceId(toolEvents: ToolEvent[], promptEvents: ParsedPromptEvent[]): Record<string, {
    tools: ToolEvent[];
    prompts: ParsedPromptEvent[];
}>;
/**
 * Add events to the hierarchy (incremental building)
 *
 * Events are grouped by trace_id and merged into existing spans
 * or create new spans as needed.
 *
 * @param toolEvents - Tool events to add
 * @param promptEvents - Prompt events to add
 */
export declare function addEventsToHierarchy(toolEvents: ToolEvent[], promptEvents: ParsedPromptEvent[]): void;
/**
 * Build span hierarchy from events (one-shot, pure function)
 *
 * Unlike addEventsToHierarchy, this does not modify session state.
 * Useful for testing and one-off transformations.
 *
 * @param toolEvents - Tool events to process
 * @param promptEvents - Prompt events to process
 * @returns Array of AgentSpans with hierarchy
 */
export declare function buildSpanHierarchy(toolEvents: ToolEvent[], promptEvents: ParsedPromptEvent[]): AgentSpan[];
/**
 * Get the current span hierarchy
 *
 * @returns Array of all AgentSpans in the hierarchy
 */
export declare function getSpanHierarchy(): AgentSpan[];
/**
 * Reset the span hierarchy (for new session or testing)
 */
export declare function resetSpanHierarchy(): void;
//# sourceMappingURL=span-hierarchy.d.ts.map