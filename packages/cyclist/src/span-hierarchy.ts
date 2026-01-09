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

import type { AgentSpan, ToolSpan, PromptEvent, SpanStatus } from './telemetry-types.js';
import type { ToolEvent, ParsedPromptEvent } from './otlp-receiver.js';

// =============================================================================
// Session State
// =============================================================================

/** In-memory span hierarchy indexed by traceId */
let spanHierarchy: Map<string, AgentSpan> = new Map();

/** Counter for generating unique span IDs */
let spanIdCounter = 0;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique span ID for AgentSpans
 */
function generateSpanId(): string {
  return `agent-span-${++spanIdCounter}-${Date.now()}`;
}

/**
 * Generate a trace ID for events missing one
 */
function generateTraceId(): string {
  return `generated-trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert a ToolEvent from OTLP receiver to a ToolSpan
 *
 * @param event - The tool event from OTLP parsing
 * @param parentSpanId - The parent AgentSpan's spanId
 * @returns A ToolSpan with proper parent reference
 */
export function convertToolEventToToolSpan(event: ToolEvent, parentSpanId: string): ToolSpan {
  const traceId = event.traceId || generateTraceId();
  const spanId = event.spanId || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    traceId,
    spanId,
    parentSpanId,
    name: `tool.${event.toolName}`,
    startTime: event.timestamp,
    endTime: event.durationMs ? event.timestamp + event.durationMs : undefined,
    attributes: {
      'tool.name': event.toolName,
      'tool.input': event.input,
      'tool.output': event.output,
      'tool.duration_ms': event.durationMs,
      'tool.success': event.success,
      'tool.error': event.error,
    },
  };
}

/**
 * Convert a ParsedPromptEvent from OTLP receiver to a PromptEvent
 *
 * @param event - The parsed prompt event from OTLP parsing
 * @returns A PromptEvent suitable for AgentSpan.events
 */
export function convertPromptEventToPromptEvent(event: ParsedPromptEvent): PromptEvent {
  const attributes: Record<string, string | number | boolean> = {
    'prompt.text': event.promptText,
  };

  if (event.tokens !== undefined) {
    attributes['prompt.tokens'] = event.tokens;
  }

  return {
    name: 'user.prompt',
    timestamp: event.timestamp,
    attributes,
  };
}

// =============================================================================
// Grouping Functions
// =============================================================================

/**
 * Group events by their trace_id
 *
 * @param toolEvents - Tool events to group
 * @param promptEvents - Prompt events to group
 * @returns Object with traceId keys containing grouped events
 */
export function groupEventsByTraceId(
  toolEvents: ToolEvent[],
  promptEvents: ParsedPromptEvent[]
): Record<string, { tools: ToolEvent[]; prompts: ParsedPromptEvent[] }> {
  const grouped: Record<string, { tools: ToolEvent[]; prompts: ParsedPromptEvent[] }> = {};

  // Group tool events
  for (const event of toolEvents) {
    const traceId = event.traceId || generateTraceId();
    if (!grouped[traceId]) {
      grouped[traceId] = { tools: [], prompts: [] };
    }
    grouped[traceId].tools.push(event);
  }

  // Group prompt events
  for (const event of promptEvents) {
    const traceId = event.traceId || generateTraceId();
    if (!grouped[traceId]) {
      grouped[traceId] = { tools: [], prompts: [] };
    }
    grouped[traceId].prompts.push(event);
  }

  return grouped;
}

// =============================================================================
// Hierarchy Building
// =============================================================================

/**
 * Create or update an AgentSpan for a given trace
 *
 * @param traceId - The trace ID for this span
 * @param toolEvents - Tool events belonging to this trace
 * @param promptEvents - Prompt events belonging to this trace
 * @returns The created or updated AgentSpan
 */
function createOrUpdateAgentSpan(
  traceId: string,
  toolEvents: ToolEvent[],
  promptEvents: ParsedPromptEvent[]
): AgentSpan {
  // Check if we already have a span for this trace
  let agentSpan = spanHierarchy.get(traceId);

  if (!agentSpan) {
    // Create new AgentSpan
    agentSpan = {
      traceId,
      spanId: generateSpanId(),
      parentSpanId: undefined, // Root span has no parent
      name: 'claude.agent.run',
      startTime: Infinity,
      endTime: 0,
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'unknown', // Will be populated by future stories
      },
      events: [],
      childSpans: [],
      status: 'completed',
    };
    spanHierarchy.set(traceId, agentSpan);
  }

  // Convert and add tool events as child spans
  for (const toolEvent of toolEvents) {
    const toolSpan = convertToolEventToToolSpan(toolEvent, agentSpan.spanId);
    agentSpan.childSpans.push(toolSpan);

    // Update timing
    if (toolEvent.timestamp < agentSpan.startTime) {
      agentSpan.startTime = toolEvent.timestamp;
    }
    const toolEndTime = toolEvent.timestamp + (toolEvent.durationMs || 0);
    if (toolEndTime > (agentSpan.endTime || 0)) {
      agentSpan.endTime = toolEndTime;
    }

    // Update status if tool failed
    if (!toolEvent.success) {
      agentSpan.status = 'error';
    }
  }

  // Convert and add prompt events
  for (const promptEvent of promptEvents) {
    const event = convertPromptEventToPromptEvent(promptEvent);
    agentSpan.events.push(event);

    // Update timing
    if (promptEvent.timestamp < agentSpan.startTime) {
      agentSpan.startTime = promptEvent.timestamp;
    }
    if (promptEvent.timestamp > (agentSpan.endTime || 0)) {
      agentSpan.endTime = promptEvent.timestamp;
    }
  }

  // Sort events chronologically
  agentSpan.events.sort((a, b) => a.timestamp - b.timestamp);

  // Sort child spans chronologically
  agentSpan.childSpans.sort((a, b) => a.startTime - b.startTime);

  // Handle edge case where startTime is still Infinity (no events)
  if (agentSpan.startTime === Infinity) {
    agentSpan.startTime = Date.now();
  }

  return agentSpan;
}

/**
 * Add events to the hierarchy (incremental building)
 *
 * Events are grouped by trace_id and merged into existing spans
 * or create new spans as needed.
 *
 * @param toolEvents - Tool events to add
 * @param promptEvents - Prompt events to add
 */
export function addEventsToHierarchy(
  toolEvents: ToolEvent[],
  promptEvents: ParsedPromptEvent[]
): void {
  // Handle events without traceId by assigning a generated one
  const processedTools = toolEvents.map(event => ({
    ...event,
    traceId: event.traceId || generateTraceId(),
  }));

  const processedPrompts = promptEvents.map(event => ({
    ...event,
    traceId: event.traceId || generateTraceId(),
  }));

  // Group by trace ID
  const grouped = groupEventsByTraceId(processedTools, processedPrompts);

  // Create or update spans for each trace
  for (const [traceId, { tools, prompts }] of Object.entries(grouped)) {
    createOrUpdateAgentSpan(traceId, tools, prompts);
  }
}

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
export function buildSpanHierarchy(
  toolEvents: ToolEvent[],
  promptEvents: ParsedPromptEvent[]
): AgentSpan[] {
  if (toolEvents.length === 0 && promptEvents.length === 0) {
    return [];
  }

  // Handle events without traceId
  const processedTools = toolEvents.map(event => ({
    ...event,
    traceId: event.traceId || generateTraceId(),
  }));

  const processedPrompts = promptEvents.map(event => ({
    ...event,
    traceId: event.traceId || generateTraceId(),
  }));

  // Group by trace ID
  const grouped = groupEventsByTraceId(processedTools, processedPrompts);

  // Build spans for each trace
  const spans: AgentSpan[] = [];

  for (const [traceId, { tools, prompts }] of Object.entries(grouped)) {
    const spanId = generateSpanId();

    // Calculate timing
    let startTime = Infinity;
    let endTime = 0;
    let hasError = false;

    // Convert tool events
    const childSpans: ToolSpan[] = [];
    for (const toolEvent of tools) {
      const toolSpan = convertToolEventToToolSpan(toolEvent, spanId);
      childSpans.push(toolSpan);

      if (toolEvent.timestamp < startTime) {
        startTime = toolEvent.timestamp;
      }
      const toolEndTime = toolEvent.timestamp + (toolEvent.durationMs || 0);
      if (toolEndTime > endTime) {
        endTime = toolEndTime;
      }
      if (!toolEvent.success) {
        hasError = true;
      }
    }

    // Convert prompt events
    const events: PromptEvent[] = [];
    for (const promptEvent of prompts) {
      events.push(convertPromptEventToPromptEvent(promptEvent));

      if (promptEvent.timestamp < startTime) {
        startTime = promptEvent.timestamp;
      }
      if (promptEvent.timestamp > endTime) {
        endTime = promptEvent.timestamp;
      }
    }

    // Sort chronologically
    childSpans.sort((a, b) => a.startTime - b.startTime);
    events.sort((a, b) => a.timestamp - b.timestamp);

    // Handle edge case
    if (startTime === Infinity) {
      startTime = Date.now();
    }

    const agentSpan: AgentSpan = {
      traceId,
      spanId,
      parentSpanId: undefined,
      name: 'claude.agent.run',
      startTime,
      endTime: endTime || undefined,
      attributes: {
        'gen_ai.system': 'claude',
        'gen_ai.request.model': 'unknown',
      },
      events,
      childSpans,
      status: hasError ? 'error' : 'completed',
    };

    spans.push(agentSpan);
  }

  return spans;
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Get the current span hierarchy
 *
 * @returns Array of all AgentSpans in the hierarchy
 */
export function getSpanHierarchy(): AgentSpan[] {
  return Array.from(spanHierarchy.values());
}

/**
 * Reset the span hierarchy (for new session or testing)
 */
export function resetSpanHierarchy(): void {
  spanHierarchy = new Map();
  spanIdCounter = 0;
}
