/**
 * Story 19-3: Span Hierarchy Builder Tests
 *
 * Tests for building parent/child span relationships from flat OTEL events.
 * Transforms ToolEvent[] and ParsedPromptEvent[] into AgentSpan hierarchy.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the span-hierarchy.ts module.
 *
 * Acceptance Criteria:
 * 1. Spans grouped by trace_id
 * 2. Parent/child relationships established via parent_span_id
 * 3. Events attached to their parent spans
 * 4. Hierarchy available for UI display and export
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Types from telemetry-types.ts (already implemented in 19-2)
import type { AgentSpan, ToolSpan, PromptEvent } from '../src/telemetry-types.js';

// Types from otlp-receiver.ts (implemented in 19-1)
import type { ToolEvent, ParsedPromptEvent } from '../src/otlp-receiver.js';

// Functions that don't exist yet - imports will fail until Dev implements
// span-hierarchy.ts
import {
  buildSpanHierarchy,
  groupEventsByTraceId,
  convertToolEventToToolSpan,
  convertPromptEventToPromptEvent,
  getSpanHierarchy,
  resetSpanHierarchy,
  addEventsToHierarchy,
} from '../src/span-hierarchy.js';

// =============================================================================
// Test Fixtures - Simulating events from OTLP receiver
// =============================================================================

/**
 * Single trace with one tool call
 */
const singleToolEvent: ToolEvent = {
  toolName: 'Read',
  input: '/path/to/file.ts',
  output: 'file contents here...',
  durationMs: 42,
  success: true,
  timestamp: 1704844800000, // 2024-01-10T00:00:00Z
  traceId: 'trace-single',
  spanId: 'span-tool-1',
};

const singlePromptEvent: ParsedPromptEvent = {
  promptText: 'Read the file and explain it',
  tokens: 15,
  timestamp: 1704844799000, // Before tool call
  traceId: 'trace-single',
  spanId: 'span-prompt-1',
};

/**
 * Multiple tools in same trace (sequential operations)
 */
const multiToolEvents: ToolEvent[] = [
  {
    toolName: 'Glob',
    input: '**/*.ts',
    output: 'src/index.ts\nsrc/types.ts',
    durationMs: 15,
    success: true,
    timestamp: 1704844800000,
    traceId: 'trace-multi',
    spanId: 'span-glob',
  },
  {
    toolName: 'Read',
    input: 'src/index.ts',
    output: 'export const foo = 1;',
    durationMs: 8,
    success: true,
    timestamp: 1704844800050, // 50ms later
    traceId: 'trace-multi',
    spanId: 'span-read-1',
  },
  {
    toolName: 'Read',
    input: 'src/types.ts',
    output: 'export type Foo = string;',
    durationMs: 5,
    success: true,
    timestamp: 1704844800100, // 100ms later
    traceId: 'trace-multi',
    spanId: 'span-read-2',
  },
];

const multiPromptEvent: ParsedPromptEvent = {
  promptText: 'Find and read all TypeScript files',
  tokens: 25,
  timestamp: 1704844799900, // Before tool calls
  traceId: 'trace-multi',
  spanId: 'span-prompt-multi',
};

/**
 * Multiple traces (separate agent runs)
 */
const multiTraceToolEvents: ToolEvent[] = [
  {
    toolName: 'Write',
    input: 'test.ts',
    output: 'File written',
    durationMs: 20,
    success: true,
    timestamp: 1704844800000,
    traceId: 'trace-A',
    spanId: 'span-A-1',
  },
  {
    toolName: 'Bash',
    input: 'npm test',
    output: 'Tests passed',
    durationMs: 5000,
    success: true,
    timestamp: 1704844805000,
    traceId: 'trace-B', // Different trace!
    spanId: 'span-B-1',
  },
];

const multiTracePromptEvents: ParsedPromptEvent[] = [
  {
    promptText: 'Write a test file',
    timestamp: 1704844799000,
    traceId: 'trace-A',
    spanId: 'span-A-prompt',
  },
  {
    promptText: 'Run the tests',
    timestamp: 1704844804000,
    traceId: 'trace-B',
    spanId: 'span-B-prompt',
  },
];

/**
 * Failed tool event
 */
const failedToolEvent: ToolEvent = {
  toolName: 'Bash',
  input: 'rm -rf /',
  success: false,
  error: 'Permission denied',
  durationMs: 5,
  timestamp: 1704844800000,
  traceId: 'trace-error',
  spanId: 'span-error',
};

/**
 * Events without trace/span IDs (edge case)
 */
const noTraceIdEvent: ToolEvent = {
  toolName: 'Read',
  input: '/some/path',
  success: true,
  timestamp: 1704844800000,
  // No traceId or spanId
};

// =============================================================================
// AC1: Spans grouped by trace_id
// =============================================================================

describe('Story 19-3: Span Hierarchy Builder', () => {

  describe('AC1: Spans grouped by trace_id', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    it('should group events by trace_id', () => {
      const grouped = groupEventsByTraceId([...multiTraceToolEvents], [...multiTracePromptEvents]);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['trace-A']).toBeDefined();
      expect(grouped['trace-B']).toBeDefined();
    });

    it('should create one AgentSpan per unique trace_id', () => {
      addEventsToHierarchy(multiTraceToolEvents, multiTracePromptEvents);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy).toHaveLength(2);
      expect(hierarchy.map(s => s.traceId).sort()).toEqual(['trace-A', 'trace-B']);
    });

    it('should keep all events within same trace together', () => {
      addEventsToHierarchy(multiToolEvents, [multiPromptEvent]);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy).toHaveLength(1);
      const span = hierarchy[0];
      expect(span.traceId).toBe('trace-multi');
      expect(span.childSpans).toHaveLength(3); // 3 tool events
      expect(span.events).toHaveLength(1); // 1 prompt event
    });

    it('should handle events without trace_id by generating one', () => {
      addEventsToHierarchy([noTraceIdEvent], []);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy).toHaveLength(1);
      // Should have generated a trace ID
      expect(hierarchy[0].traceId).toBeDefined();
      expect(hierarchy[0].traceId).not.toBe('');
    });

    it('should return empty array when no events', () => {
      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toEqual([]);
    });

  });

  // =============================================================================
  // AC2: Parent/child relationships established via parent_span_id
  // =============================================================================

  describe('AC2: Parent/child relationships via parent_span_id', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    it('should set parent span as the AgentSpan', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();

      const agentSpan = hierarchy[0];
      expect(agentSpan.parentSpanId).toBeUndefined(); // Root span has no parent
    });

    it('should set tool spans as children with parentSpanId', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();

      const agentSpan = hierarchy[0];
      expect(agentSpan.childSpans).toHaveLength(1);

      const toolSpan = agentSpan.childSpans[0];
      expect(toolSpan.parentSpanId).toBe(agentSpan.spanId);
    });

    it('should maintain correct parent reference for multiple children', () => {
      addEventsToHierarchy(multiToolEvents, [multiPromptEvent]);
      const hierarchy = getSpanHierarchy();

      const agentSpan = hierarchy[0];
      expect(agentSpan.childSpans).toHaveLength(3);

      // All child spans should reference the same parent
      for (const childSpan of agentSpan.childSpans) {
        expect(childSpan.parentSpanId).toBe(agentSpan.spanId);
        expect(childSpan.traceId).toBe(agentSpan.traceId);
      }
    });

    it('should generate unique spanId for AgentSpan', () => {
      addEventsToHierarchy(multiTraceToolEvents, multiTracePromptEvents);
      const hierarchy = getSpanHierarchy();

      const spanIds = hierarchy.map(s => s.spanId);
      const uniqueSpanIds = new Set(spanIds);
      expect(uniqueSpanIds.size).toBe(spanIds.length);
    });

    it('should preserve original spanId in tool spans', () => {
      addEventsToHierarchy([singleToolEvent], []);
      const hierarchy = getSpanHierarchy();

      const toolSpan = hierarchy[0].childSpans[0];
      expect(toolSpan.spanId).toBe('span-tool-1');
    });

  });

  // =============================================================================
  // AC3: Events attached to their parent spans
  // =============================================================================

  describe('AC3: Events attached to parent spans', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    it('should attach prompt events to AgentSpan.events', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();

      const agentSpan = hierarchy[0];
      expect(agentSpan.events).toHaveLength(1);
      expect(agentSpan.events[0].name).toBe('user.prompt');
    });

    it('should convert ParsedPromptEvent to PromptEvent format', () => {
      addEventsToHierarchy([], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();

      const event = hierarchy[0].events[0];
      expect(event.name).toBe('user.prompt');
      expect(event.timestamp).toBe(singlePromptEvent.timestamp);
      expect(event.attributes['prompt.text']).toBe(singlePromptEvent.promptText);
      expect(event.attributes['prompt.tokens']).toBe(singlePromptEvent.tokens);
    });

    it('should attach tool events as childSpans (not events)', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();

      const agentSpan = hierarchy[0];
      // Tool becomes a child span, not an event
      expect(agentSpan.childSpans).toHaveLength(1);
      // Prompt becomes an event
      expect(agentSpan.events).toHaveLength(1);
    });

    it('should order events chronologically', () => {
      const promptBefore: ParsedPromptEvent = {
        promptText: 'First prompt',
        timestamp: 1000,
        traceId: 'trace-order',
      };
      const promptAfter: ParsedPromptEvent = {
        promptText: 'Second prompt',
        timestamp: 3000,
        traceId: 'trace-order',
      };

      addEventsToHierarchy([], [promptAfter, promptBefore]); // Out of order
      const hierarchy = getSpanHierarchy();

      expect(hierarchy[0].events[0].attributes['prompt.text']).toBe('First prompt');
      expect(hierarchy[0].events[1].attributes['prompt.text']).toBe('Second prompt');
    });

    it('should order child spans chronologically', () => {
      addEventsToHierarchy(multiToolEvents, []);
      const hierarchy = getSpanHierarchy();

      const childSpans = hierarchy[0].childSpans;
      expect(childSpans[0].attributes['tool.name']).toBe('Glob');
      expect(childSpans[1].attributes['tool.name']).toBe('Read');
      expect(childSpans[2].attributes['tool.name']).toBe('Read');

      // Verify timestamps are in order
      for (let i = 1; i < childSpans.length; i++) {
        expect(childSpans[i].startTime).toBeGreaterThanOrEqual(childSpans[i - 1].startTime);
      }
    });

  });

  // =============================================================================
  // AC4: Hierarchy available for UI display and export
  // =============================================================================

  describe('AC4: Hierarchy for UI display and export', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    it('should return hierarchy via getSpanHierarchy()', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();

      expect(Array.isArray(hierarchy)).toBe(true);
      expect(hierarchy.length).toBeGreaterThan(0);
    });

    it('should reset hierarchy via resetSpanHierarchy()', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      expect(getSpanHierarchy().length).toBe(1);

      resetSpanHierarchy();
      expect(getSpanHierarchy().length).toBe(0);
    });

    it('should populate AgentSpan with correct name', () => {
      addEventsToHierarchy([singleToolEvent], []);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy[0].name).toBe('claude.agent.run');
    });

    it('should set AgentSpan startTime from earliest event', () => {
      addEventsToHierarchy(multiToolEvents, [multiPromptEvent]);
      const hierarchy = getSpanHierarchy();

      // Prompt at 1704844799900, tools start at 1704844800000
      expect(hierarchy[0].startTime).toBe(1704844799900);
    });

    it('should set AgentSpan endTime from latest event + duration', () => {
      addEventsToHierarchy(multiToolEvents, []);
      const hierarchy = getSpanHierarchy();

      // Last tool at 1704844800100 with 5ms duration
      expect(hierarchy[0].endTime).toBe(1704844800105);
    });

    it('should set AgentSpan status based on child results', () => {
      addEventsToHierarchy([singleToolEvent], []);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy[0].status).toBe('completed');
    });

    it('should set AgentSpan status to error if any child failed', () => {
      addEventsToHierarchy([failedToolEvent], []);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy[0].status).toBe('error');
    });

    it('should set default attributes on AgentSpan', () => {
      addEventsToHierarchy([singleToolEvent], []);
      const hierarchy = getSpanHierarchy();

      expect(hierarchy[0].attributes['gen_ai.system']).toBe('claude');
    });

    it('should accumulate hierarchy across multiple addEventsToHierarchy calls', () => {
      addEventsToHierarchy([multiTraceToolEvents[0]], [multiTracePromptEvents[0]]);
      addEventsToHierarchy([multiTraceToolEvents[1]], [multiTracePromptEvents[1]]);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(2);
    });

    it('should merge new events into existing trace', () => {
      // First batch of events for trace-multi
      addEventsToHierarchy([multiToolEvents[0]], [multiPromptEvent]);

      // Second batch for same trace
      addEventsToHierarchy([multiToolEvents[1], multiToolEvents[2]], []);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(1); // Still one trace
      expect(hierarchy[0].childSpans).toHaveLength(3); // All tools merged
    });

  });

  // =============================================================================
  // Conversion Functions
  // =============================================================================

  describe('Conversion Functions', () => {

    it('convertToolEventToToolSpan should transform correctly', () => {
      const parentSpanId = 'parent-123';
      const toolSpan = convertToolEventToToolSpan(singleToolEvent, parentSpanId);

      expect(toolSpan.traceId).toBe(singleToolEvent.traceId);
      expect(toolSpan.spanId).toBe(singleToolEvent.spanId);
      expect(toolSpan.parentSpanId).toBe(parentSpanId);
      expect(toolSpan.name).toBe('tool.Read');
      expect(toolSpan.startTime).toBe(singleToolEvent.timestamp);
      expect(toolSpan.endTime).toBe(singleToolEvent.timestamp + (singleToolEvent.durationMs || 0));
      expect(toolSpan.attributes['tool.name']).toBe('Read');
      expect(toolSpan.attributes['tool.input']).toBe(singleToolEvent.input);
      expect(toolSpan.attributes['tool.output']).toBe(singleToolEvent.output);
      expect(toolSpan.attributes['tool.duration_ms']).toBe(singleToolEvent.durationMs);
      expect(toolSpan.attributes['tool.success']).toBe(true);
    });

    it('convertToolEventToToolSpan should handle failed tools', () => {
      const toolSpan = convertToolEventToToolSpan(failedToolEvent, 'parent');

      expect(toolSpan.attributes['tool.success']).toBe(false);
      expect(toolSpan.attributes['tool.error']).toBe('Permission denied');
    });

    it('convertToolEventToToolSpan should handle missing optional fields', () => {
      const minimalEvent: ToolEvent = {
        toolName: 'Write',
        success: true,
        timestamp: 1704844800000,
      };

      const toolSpan = convertToolEventToToolSpan(minimalEvent, 'parent');

      expect(toolSpan.attributes['tool.name']).toBe('Write');
      expect(toolSpan.attributes['tool.input']).toBeUndefined();
      expect(toolSpan.attributes['tool.output']).toBeUndefined();
      expect(toolSpan.attributes['tool.duration_ms']).toBeUndefined();
    });

    it('convertPromptEventToPromptEvent should transform correctly', () => {
      const promptEvent = convertPromptEventToPromptEvent(singlePromptEvent);

      expect(promptEvent.name).toBe('user.prompt');
      expect(promptEvent.timestamp).toBe(singlePromptEvent.timestamp);
      expect(promptEvent.attributes['prompt.text']).toBe(singlePromptEvent.promptText);
      expect(promptEvent.attributes['prompt.tokens']).toBe(singlePromptEvent.tokens);
    });

    it('convertPromptEventToPromptEvent should handle missing tokens', () => {
      const noTokensPrompt: ParsedPromptEvent = {
        promptText: 'Hello',
        timestamp: 1704844800000,
      };

      const promptEvent = convertPromptEventToPromptEvent(noTokensPrompt);

      expect(promptEvent.attributes['prompt.text']).toBe('Hello');
      expect(promptEvent.attributes['prompt.tokens']).toBeUndefined();
    });

  });

  // =============================================================================
  // buildSpanHierarchy - Full Pipeline
  // =============================================================================

  describe('buildSpanHierarchy - Full Pipeline', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    it('should build complete hierarchy from tool and prompt events', () => {
      const result = buildSpanHierarchy(multiToolEvents, [multiPromptEvent]);

      expect(result).toHaveLength(1);
      expect(result[0].traceId).toBe('trace-multi');
      expect(result[0].childSpans).toHaveLength(3);
      expect(result[0].events).toHaveLength(1);
    });

    it('should handle empty input arrays', () => {
      const result = buildSpanHierarchy([], []);
      expect(result).toEqual([]);
    });

    it('should handle tools-only input', () => {
      const result = buildSpanHierarchy([singleToolEvent], []);

      expect(result).toHaveLength(1);
      expect(result[0].childSpans).toHaveLength(1);
      expect(result[0].events).toHaveLength(0);
    });

    it('should handle prompts-only input', () => {
      const result = buildSpanHierarchy([], [singlePromptEvent]);

      expect(result).toHaveLength(1);
      expect(result[0].childSpans).toHaveLength(0);
      expect(result[0].events).toHaveLength(1);
    });

    it('should build multiple traces correctly', () => {
      const result = buildSpanHierarchy(multiTraceToolEvents, multiTracePromptEvents);

      expect(result).toHaveLength(2);

      const traceA = result.find(s => s.traceId === 'trace-A');
      const traceB = result.find(s => s.traceId === 'trace-B');

      expect(traceA).toBeDefined();
      expect(traceB).toBeDefined();
      expect(traceA!.childSpans[0].attributes['tool.name']).toBe('Write');
      expect(traceB!.childSpans[0].attributes['tool.name']).toBe('Bash');
    });

  });

  // =============================================================================
  // Type Conformance
  // =============================================================================

  describe('Type Conformance', () => {

    beforeEach(() => {
      resetSpanHierarchy();
    });

    it('AgentSpan should conform to telemetry-types interface', () => {
      addEventsToHierarchy([singleToolEvent], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();
      const span: AgentSpan = hierarchy[0];

      // Required fields
      expect(span.traceId).toBeDefined();
      expect(span.spanId).toBeDefined();
      expect(span.name).toBeDefined();
      expect(span.startTime).toBeDefined();
      expect(span.attributes).toBeDefined();
      expect(span.events).toBeDefined();
      expect(span.childSpans).toBeDefined();
      expect(span.status).toBeDefined();

      // Attribute required field
      expect(span.attributes['gen_ai.system']).toBe('claude');
    });

    it('ToolSpan should conform to telemetry-types interface', () => {
      addEventsToHierarchy([singleToolEvent], []);
      const hierarchy = getSpanHierarchy();
      const toolSpan: ToolSpan = hierarchy[0].childSpans[0];

      // Required fields
      expect(toolSpan.traceId).toBeDefined();
      expect(toolSpan.spanId).toBeDefined();
      expect(toolSpan.parentSpanId).toBeDefined();
      expect(toolSpan.name).toBeDefined();
      expect(toolSpan.startTime).toBeDefined();
      expect(toolSpan.attributes).toBeDefined();

      // Attribute required fields
      expect(toolSpan.attributes['tool.name']).toBeDefined();
      expect(toolSpan.attributes['tool.success']).toBeDefined();
    });

    it('PromptEvent should conform to telemetry-types interface', () => {
      addEventsToHierarchy([], [singlePromptEvent]);
      const hierarchy = getSpanHierarchy();
      const event: PromptEvent = hierarchy[0].events[0];

      // Required fields
      expect(event.name).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.attributes).toBeDefined();
    });

  });

});
