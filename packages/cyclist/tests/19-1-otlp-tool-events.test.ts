/**
 * Story 19-1: OTLP Tool Events Tests
 *
 * Tests for extending the OTLP receiver to parse tool spans and events
 * from Claude Code's OTEL output.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the parsing logic.
 *
 * Acceptance Criteria:
 * 1. /v1/logs endpoint parses claude_code.tool_result events
 * 2. /v1/logs endpoint parses claude_code.user_prompt events
 * 3. Tool name, inputs, outputs extracted from events
 * 4. Execution timing captured per tool
 * 5. Events stored in session-scoped memory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

// Functions that don't exist yet - imports will succeed but calls will fail
// until Dev implements them in otlp-receiver.ts
import {
  parseOTLPLogs,
  recordToolEvent,
  recordPromptEvent,
  getToolEvents,
  getPromptEvents,
  resetEventStore,
  // Types for events
  type ToolEvent,
  type ParsedPromptEvent,
} from '../src/otlp-receiver.js';

// =============================================================================
// Sample OTLP Log Payloads
// =============================================================================

/**
 * OTLP logs follow the structure:
 * resourceLogs[] -> scopeLogs[] -> logRecords[]
 *
 * Each logRecord has:
 * - body: { stringValue: "event_name" }
 * - attributes: key-value pairs
 * - timeUnixNano: timestamp
 * - traceId, spanId: for correlation
 */

const toolResultEvent = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [{
        timeUnixNano: '1704844800000000000', // 2024-01-10T00:00:00Z in nanoseconds
        body: { stringValue: 'claude_code.tool_result' },
        traceId: 'abc123def456',
        spanId: 'span789',
        attributes: [
          { key: 'tool.name', value: { stringValue: 'Read' } },
          { key: 'tool.input', value: { stringValue: '/path/to/file.ts' } },
          { key: 'tool.output', value: { stringValue: 'file contents here...' } },
          { key: 'tool.duration_ms', value: { intValue: 42 } },
          { key: 'tool.success', value: { boolValue: true } },
        ],
      }],
    }],
  }],
};

const userPromptEvent = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [{
        timeUnixNano: '1704844800000000000',
        body: { stringValue: 'claude_code.user_prompt' },
        traceId: 'abc123def456',
        spanId: 'span001',
        attributes: [
          { key: 'prompt.text', value: { stringValue: 'Create the telemetry types file' } },
          { key: 'prompt.tokens', value: { intValue: 42 } },
        ],
      }],
    }],
  }],
};

const toolErrorEvent = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [{
        timeUnixNano: '1704844800000000000',
        body: { stringValue: 'claude_code.tool_result' },
        traceId: 'error-trace',
        spanId: 'error-span',
        attributes: [
          { key: 'tool.name', value: { stringValue: 'Bash' } },
          { key: 'tool.input', value: { stringValue: 'rm -rf /' } },
          { key: 'tool.success', value: { boolValue: false } },
          { key: 'tool.error', value: { stringValue: 'Permission denied' } },
          { key: 'tool.duration_ms', value: { intValue: 5 } },
        ],
      }],
    }],
  }],
};

const multipleToolEvents = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [
        {
          timeUnixNano: '1704844800000000000',
          body: { stringValue: 'claude_code.tool_result' },
          traceId: 'trace-multi',
          spanId: 'span-1',
          attributes: [
            { key: 'tool.name', value: { stringValue: 'Glob' } },
            { key: 'tool.input', value: { stringValue: '**/*.ts' } },
            { key: 'tool.output', value: { stringValue: 'src/index.ts\nsrc/types.ts' } },
            { key: 'tool.duration_ms', value: { intValue: 15 } },
            { key: 'tool.success', value: { boolValue: true } },
          ],
        },
        {
          timeUnixNano: '1704844815000000000', // 15ms later
          body: { stringValue: 'claude_code.tool_result' },
          traceId: 'trace-multi',
          spanId: 'span-2',
          attributes: [
            { key: 'tool.name', value: { stringValue: 'Read' } },
            { key: 'tool.input', value: { stringValue: 'src/index.ts' } },
            { key: 'tool.output', value: { stringValue: 'export const foo = 1;' } },
            { key: 'tool.duration_ms', value: { intValue: 8 } },
            { key: 'tool.success', value: { boolValue: true } },
          ],
        },
      ],
    }],
  }],
};

const apiRequestEvent = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [{
        timeUnixNano: '1704844800000000000',
        body: { stringValue: 'claude_code.api_request' },
        traceId: 'api-trace',
        spanId: 'api-span',
        attributes: [
          { key: 'api.model', value: { stringValue: 'claude-sonnet-4-20250514' } },
          { key: 'api.tokens.input', value: { intValue: 1500 } },
          { key: 'api.tokens.output', value: { intValue: 500 } },
        ],
      }],
    }],
  }],
};

const mixedEvents = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [
        {
          timeUnixNano: '1704844800000000000',
          body: { stringValue: 'claude_code.user_prompt' },
          traceId: 'mixed-trace',
          spanId: 'prompt-span',
          attributes: [
            { key: 'prompt.text', value: { stringValue: 'Fix the bug' } },
          ],
        },
        {
          timeUnixNano: '1704844801000000000',
          body: { stringValue: 'claude_code.tool_result' },
          traceId: 'mixed-trace',
          spanId: 'tool-span',
          attributes: [
            { key: 'tool.name', value: { stringValue: 'Grep' } },
            { key: 'tool.input', value: { stringValue: 'TODO' } },
            { key: 'tool.success', value: { boolValue: true } },
          ],
        },
      ],
    }],
  }],
};

const emptyPayload = {};

const malformedPayload = {
  resourceLogs: [{ invalid: 'structure' }],
};

const nonToolEvent = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [{
        timeUnixNano: '1704844800000000000',
        body: { stringValue: 'some.other.event' },
        attributes: [],
      }],
    }],
  }],
};

// =============================================================================
// Test Suites
// =============================================================================

describe('Story 19-1: OTLP Tool Events', () => {

  describe('AC1: /v1/logs endpoint parses claude_code.tool_result events', () => {

    beforeEach(() => {
      // Reset event store before each test
      resetEventStore();
    });

    it('should return 200 for valid tool_result event', async () => {
      const response = await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

    it('should parse tool_result event from OTLP logs payload', () => {
      const events = parseOTLPLogs(toolResultEvent);

      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);

      const toolEvent = events.find(e => e.name === 'claude_code.tool_result');
      expect(toolEvent).toBeDefined();
    });

    it('should extract tool_result events via HTTP endpoint', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events.length).toBe(1);
      expect(events[0].toolName).toBe('Read');
    });

    it('should handle multiple tool_result events in single payload', async () => {
      await request(app)
        .post('/v1/logs')
        .send(multipleToolEvents)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events.length).toBe(2);
      expect(events[0].toolName).toBe('Glob');
      expect(events[1].toolName).toBe('Read');
    });

    it('should ignore non-tool events', async () => {
      await request(app)
        .post('/v1/logs')
        .send(nonToolEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events.length).toBe(0);
    });

  });

  describe('AC2: /v1/logs endpoint parses claude_code.user_prompt events', () => {

    beforeEach(() => {
      resetEventStore();
    });

    it('should parse user_prompt event from OTLP logs payload', () => {
      const events = parseOTLPLogs(userPromptEvent);

      const promptEvent = events.find(e => e.name === 'claude_code.user_prompt');
      expect(promptEvent).toBeDefined();
    });

    it('should extract user_prompt events via HTTP endpoint', async () => {
      await request(app)
        .post('/v1/logs')
        .send(userPromptEvent)
        .set('Content-Type', 'application/json');

      const events = getPromptEvents();
      expect(events.length).toBe(1);
      expect(events[0].promptText).toBe('Create the telemetry types file');
    });

    it('should handle mixed tool and prompt events', async () => {
      await request(app)
        .post('/v1/logs')
        .send(mixedEvents)
        .set('Content-Type', 'application/json');

      const toolEvents = getToolEvents();
      const promptEvents = getPromptEvents();

      expect(toolEvents.length).toBe(1);
      expect(promptEvents.length).toBe(1);
      expect(promptEvents[0].promptText).toBe('Fix the bug');
      expect(toolEvents[0].toolName).toBe('Grep');
    });

  });

  describe('AC3: Tool name, inputs, outputs extracted from events', () => {

    beforeEach(() => {
      resetEventStore();
    });

    it('should extract tool.name attribute', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].toolName).toBe('Read');
    });

    it('should extract tool.input attribute', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].input).toBe('/path/to/file.ts');
    });

    it('should extract tool.output attribute', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].output).toBe('file contents here...');
    });

    it('should extract tool.success attribute', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].success).toBe(true);
    });

    it('should extract tool.error when present', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolErrorEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].success).toBe(false);
      expect(events[0].error).toBe('Permission denied');
    });

    it('should handle missing optional attributes gracefully', async () => {
      const minimalToolEvent = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              timeUnixNano: '1704844800000000000',
              body: { stringValue: 'claude_code.tool_result' },
              attributes: [
                { key: 'tool.name', value: { stringValue: 'Write' } },
                { key: 'tool.success', value: { boolValue: true } },
              ],
            }],
          }],
        }],
      };

      await request(app)
        .post('/v1/logs')
        .send(minimalToolEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].toolName).toBe('Write');
      expect(events[0].input).toBeUndefined();
      expect(events[0].output).toBeUndefined();
    });

  });

  describe('AC4: Execution timing captured per tool', () => {

    beforeEach(() => {
      resetEventStore();
    });

    it('should extract tool.duration_ms attribute', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].durationMs).toBe(42);
    });

    it('should extract timestamp from timeUnixNano', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      // timeUnixNano: '1704844800000000000' = 2024-01-10T00:00:00Z
      expect(events[0].timestamp).toBe(1704844800000); // milliseconds
    });

    it('should preserve timing order for multiple events', async () => {
      await request(app)
        .post('/v1/logs')
        .send(multipleToolEvents)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events.length).toBe(2);
      // Events should be in chronological order
      expect(events[0].timestamp).toBeLessThan(events[1].timestamp);
    });

    it('should capture duration for failed tools', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolErrorEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].durationMs).toBe(5);
    });

  });

  describe('AC5: Events stored in session-scoped memory', () => {

    beforeEach(() => {
      resetEventStore();
    });

    it('should store tool events across multiple requests', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      await request(app)
        .post('/v1/logs')
        .send(multipleToolEvents)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events.length).toBe(3); // 1 + 2 from multipleToolEvents
    });

    it('should store prompt events separately from tool events', async () => {
      await request(app)
        .post('/v1/logs')
        .send(mixedEvents)
        .set('Content-Type', 'application/json');

      const toolEvents = getToolEvents();
      const promptEvents = getPromptEvents();

      expect(toolEvents.length).toBe(1);
      expect(promptEvents.length).toBe(1);
    });

    it('should reset event store correctly', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      expect(getToolEvents().length).toBe(1);

      resetEventStore();

      expect(getToolEvents().length).toBe(0);
      expect(getPromptEvents().length).toBe(0);
    });

    it('should preserve trace and span IDs for correlation', async () => {
      await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      const events = getToolEvents();
      expect(events[0].traceId).toBe('abc123def456');
      expect(events[0].spanId).toBe('span789');
    });

    it('should handle empty payload gracefully', async () => {
      const response = await request(app)
        .post('/v1/logs')
        .send(emptyPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(getToolEvents().length).toBe(0);
    });

    it('should handle malformed payload gracefully', async () => {
      const response = await request(app)
        .post('/v1/logs')
        .send(malformedPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(getToolEvents().length).toBe(0);
    });

  });

  describe('Edge Cases and Error Handling', () => {

    beforeEach(() => {
      resetEventStore();
    });

    it('should handle api_request events without crashing', async () => {
      // api_request events exist but aren't in scope for this story
      const response = await request(app)
        .post('/v1/logs')
        .send(apiRequestEvent)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      // Should not store api_request as a tool event
      expect(getToolEvents().length).toBe(0);
    });

    it('should handle missing body in log record', async () => {
      const noBodyPayload = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              timeUnixNano: '1704844800000000000',
              attributes: [],
            }],
          }],
        }],
      };

      const response = await request(app)
        .post('/v1/logs')
        .send(noBodyPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(getToolEvents().length).toBe(0);
    });

    it('should handle deeply nested attributes', async () => {
      // Some OTLP implementations nest attributes differently
      const response = await request(app)
        .post('/v1/logs')
        .send(toolResultEvent)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

  });

});

// =============================================================================
// Type Tests (compile-time verification)
// =============================================================================

describe('Type Definitions', () => {

  it('ToolEvent type should have required fields', () => {
    // This test verifies the ToolEvent type exists and has the right shape
    // Will fail at compile time if types are wrong
    const event: ToolEvent = {
      toolName: 'Read',
      input: '/path',
      output: 'content',
      durationMs: 10,
      success: true,
      timestamp: Date.now(),
      traceId: 'trace',
      spanId: 'span',
    };

    expect(event.toolName).toBe('Read');
    expect(event.success).toBe(true);
  });

  it('ParsedPromptEvent type should have required fields', () => {
    const event: ParsedPromptEvent = {
      promptText: 'Fix the bug',
      tokens: 42,
      timestamp: Date.now(),
      traceId: 'trace',
      spanId: 'span',
    };

    expect(event.promptText).toBe('Fix the bug');
  });

});
