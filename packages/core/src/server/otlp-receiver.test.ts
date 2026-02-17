/**
 * Tests for Story 98-23: Implement real OTLP integrations for core server stubs
 *
 * Core's otlp-receiver module must provide real OTLP processing without
 * requiring Cyclist's provider. WheelHub standalone (BikeRack mode) needs
 * working telemetry ingestion.
 *
 * Acceptance Criteria:
 * AC1: parseOTLPMetrics extracts token usage from OTLP JSON payloads
 * AC2: aggregateTokenStats accumulates stats and notifies listeners
 * AC3: parseOTLPLogs extracts structured events from OTLP log payloads
 * AC4: processLogEvents categorizes and records tool/prompt events
 * AC5: Background task lifecycle — track, complete, retrieve, callbacks
 * AC6: Tool event listeners fire when events are recorded
 * AC7: Session state management — reset clears stores, email extracted
 * AC8: Delegating stubs work standalone (no provider required)
 *
 * Run with: cd packages/core && npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// =============================================================================
// Test Fixtures — valid OTLP payloads matching Claude Code's format
// =============================================================================

function createMetricsPayload(tokens: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreation?: number;
}) {
  const dataPoints: Array<{
    asInt: number;
    attributes: Array<{ key: string; value: { stringValue: string } }>;
  }> = [];

  const tokenMap: Record<string, number | undefined> = {
    input: tokens.input,
    output: tokens.output,
    cacheRead: tokens.cacheRead,
    cacheCreation: tokens.cacheCreation,
  };

  for (const [type, value] of Object.entries(tokenMap)) {
    if (value !== undefined) {
      dataPoints.push({
        asInt: value,
        attributes: [{ key: 'type', value: { stringValue: type } }],
      });
    }
  }

  return {
    resourceMetrics: [{
      scopeMetrics: [{
        metrics: [{
          name: 'claude_code.token.usage',
          sum: { dataPoints },
        }],
      }],
    }],
  };
}

function createLogsPayload(events: Array<{
  name: string;
  attributes?: Record<string, string | number | boolean>;
  timestamp?: string;
}>) {
  return {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: events.map(event => ({
          timeUnixNano: event.timestamp || String(Date.now() * 1_000_000),
          body: { stringValue: event.name },
          attributes: Object.entries(event.attributes || {}).map(([key, value]) => ({
            key,
            value: typeof value === 'string'
              ? { stringValue: value }
              : typeof value === 'number'
                ? { intValue: value }
                : { boolValue: value },
          })),
        })),
      }],
    }],
  };
}

// =============================================================================
// AC1: OTLP Metrics Parsing
// =============================================================================

describe('AC1: parseOTLPMetrics — real implementation', () => {
  it('parses token usage from valid OTLP metrics payload', async () => {
    const { parseOTLPMetrics } = await import('./otlp-receiver.js');

    const payload = createMetricsPayload({ input: 100, output: 50 });
    const result = parseOTLPMetrics(payload);

    // Current stub returns null — should return an object with parsed stats
    assert.ok(result !== null && result !== undefined,
      'parseOTLPMetrics should return a result object, not null');
    const stats = result as Record<string, number>;
    assert.strictEqual(stats.inputTokens, 100, 'Should parse input token count');
    assert.strictEqual(stats.outputTokens, 50, 'Should parse output token count');
  });

  it('parses all four token types', async () => {
    const { parseOTLPMetrics } = await import('./otlp-receiver.js');

    const payload = createMetricsPayload({
      input: 200, output: 100, cacheRead: 50, cacheCreation: 25,
    });
    const result = parseOTLPMetrics(payload) as Record<string, number>;

    assert.ok(result !== null, 'Should not return null');
    assert.strictEqual(result.inputTokens, 200);
    assert.strictEqual(result.outputTokens, 100);
    assert.strictEqual(result.cacheReadTokens, 50);
    assert.strictEqual(result.cacheCreationTokens, 25);
  });

  it('returns empty object (not null) for empty payload', async () => {
    const { parseOTLPMetrics } = await import('./otlp-receiver.js');

    const result = parseOTLPMetrics({});
    assert.ok(result !== null, 'Should return object, not null, for empty payload');
    assert.strictEqual(typeof result, 'object');
  });

  it('ignores non-token-usage metrics', async () => {
    const { parseOTLPMetrics } = await import('./otlp-receiver.js');

    const payload = {
      resourceMetrics: [{
        scopeMetrics: [{
          metrics: [{
            name: 'other.metric.name',
            sum: { dataPoints: [{ asInt: 999 }] },
          }],
        }],
      }],
    };

    const result = parseOTLPMetrics(payload) as Record<string, number>;
    assert.ok(result !== null);
    assert.strictEqual(result.inputTokens, undefined,
      'Should not extract from non-token metrics');
  });
});

// =============================================================================
// AC2: Token Stats Aggregation
// =============================================================================

describe('AC2: aggregateTokenStats + getTokenStats', () => {
  beforeEach(async () => {
    const mod = await import('./otlp-receiver.js');
    mod.resetEventStore();
  });

  it('accumulates token stats across multiple calls', async () => {
    const { aggregateTokenStats, getTokenStats } = await import('./otlp-receiver.js');

    // After real implementation, these should modify internal state
    aggregateTokenStats({ inputTokens: 50, outputTokens: 20 });
    aggregateTokenStats({ inputTokens: 30, outputTokens: 10 });

    const stats = getTokenStats();
    // Current stub getTokenStats returns {inputTokens:0,...} always
    assert.strictEqual(stats.inputTokens, 80,
      'Input tokens should accumulate (50 + 30 = 80)');
    assert.strictEqual(stats.outputTokens, 30,
      'Output tokens should accumulate (20 + 10 = 30)');
  });

  it('notifies registered listener on aggregation', async () => {
    const { aggregateTokenStats, addTokenStatsListener } = await import('./otlp-receiver.js');

    let notified = false;
    addTokenStatsListener(() => { notified = true; });

    aggregateTokenStats({ inputTokens: 100 });

    // Current stubs: addTokenStatsListener is no-op, aggregateTokenStats doesn't notify
    assert.strictEqual(notified, true,
      'Token stats listener should fire on aggregation');
  });
});

// =============================================================================
// AC3: OTLP Logs Parsing
// =============================================================================

describe('AC3: parseOTLPLogs — real implementation', () => {
  it('parses log records into structured event array', async () => {
    const { parseOTLPLogs } = await import('./otlp-receiver.js');

    const payload = createLogsPayload([{
      name: 'claude_code.tool_result',
      attributes: { tool_name: 'Read', success: 'true', duration_ms: '42' },
    }]);

    const events = parseOTLPLogs(payload) as unknown[];

    // Current stub returns null — should return array
    assert.ok(Array.isArray(events), 'Should return an array, not null');
    assert.strictEqual(events.length, 1, 'Should parse one event');

    const event = events[0] as Record<string, unknown>;
    assert.strictEqual(event.name, 'claude_code.tool_result');
    assert.ok((event.timestamp as number) > 0, 'Should have a valid timestamp');

    const attrs = event.attributes as Record<string, unknown>;
    assert.strictEqual(attrs.tool_name, 'Read');
  });

  it('returns empty array for empty payload', async () => {
    const { parseOTLPLogs } = await import('./otlp-receiver.js');

    const result = parseOTLPLogs({}) as unknown[];
    assert.ok(Array.isArray(result), 'Empty payload should return empty array');
    assert.strictEqual(result.length, 0);
  });

  it('parses multiple events', async () => {
    const { parseOTLPLogs } = await import('./otlp-receiver.js');

    const payload = createLogsPayload([
      { name: 'claude_code.tool_result', attributes: { tool_name: 'Read' } },
      { name: 'claude_code.user_prompt', attributes: { 'prompt.text': 'hello' } },
      { name: 'claude_code.tool_result', attributes: { tool_name: 'Bash' } },
    ]);

    const events = parseOTLPLogs(payload) as unknown[];
    assert.ok(Array.isArray(events));
    assert.strictEqual(events.length, 3, 'Should parse all three log records');
  });

  it('converts nanosecond timestamps to milliseconds', async () => {
    const { parseOTLPLogs } = await import('./otlp-receiver.js');

    const knownMs = 1700000000000;
    const payload = createLogsPayload([{
      name: 'test_event',
      timestamp: String(knownMs * 1_000_000),
    }]);

    const events = parseOTLPLogs(payload) as unknown[];
    assert.ok(Array.isArray(events) && events.length === 1);
    assert.strictEqual(
      (events[0] as Record<string, unknown>).timestamp,
      knownMs,
      'Should convert nanoseconds to milliseconds',
    );
  });
});

// =============================================================================
// AC4: Log Event Processing
// =============================================================================

describe('AC4: processLogEvents — core implementation', () => {
  beforeEach(async () => {
    const mod = await import('./otlp-receiver.js');
    mod.resetEventStore();
  });

  it('records tool events from tool_result log events', async () => {
    const { processLogEvents, getAuditLog } = await import('./otlp-receiver.js');

    processLogEvents([{
      name: 'claude_code.tool_result',
      timestamp: Date.now(),
      attributes: {
        tool_name: 'Read',
        success: 'true',
        duration_ms: '150',
      },
    }]);

    const audit = getAuditLog();
    // Current stubs: processLogEvents is no-op, getAuditLog returns []
    assert.ok(audit.length > 0,
      'Should record tool events to audit log');
  });

  it('extracts tool_name and success from attributes', async () => {
    const { processLogEvents, getAuditLog } = await import('./otlp-receiver.js');

    processLogEvents([{
      name: 'claude_code.tool_result',
      timestamp: Date.now(),
      attributes: {
        tool_name: 'Bash',
        success: 'false',
        duration_ms: '300',
      },
    }]);

    const audit = getAuditLog();
    assert.ok(audit.length === 1);
    const entry = audit[0] as Record<string, unknown>;
    assert.strictEqual(entry.toolName, 'Bash', 'Should record tool name');
    assert.strictEqual(entry.success, false, 'Should parse success as boolean');
  });
});

// =============================================================================
// AC5: Background Task Lifecycle
// =============================================================================

describe('AC5: Background task lifecycle', () => {
  beforeEach(async () => {
    const mod = await import('./otlp-receiver.js');
    mod.resetEventStore();
  });

  it('trackBackgroundTask stores a pending task', async () => {
    const { trackBackgroundTask, getBackgroundTasks } = await import('./otlp-receiver.js');

    trackBackgroundTask({
      taskId: 'task-1',
      description: 'Test task',
      subagentType: 'general-purpose',
      startedAt: Date.now(),
    });

    const tasks = getBackgroundTasks();
    // Current stub: trackBackgroundTask is no-op, getBackgroundTasks returns []
    assert.ok(tasks.length > 0, 'Should have stored the task');
    const task = tasks.find(t => t.taskId === 'task-1');
    assert.ok(task, 'Should find task by ID');
    assert.strictEqual(task.status, 'pending');
  });

  it('getBackgroundTaskByToolId finds tracked task', async () => {
    const { trackBackgroundTask, getBackgroundTaskByToolId } = await import('./otlp-receiver.js');

    trackBackgroundTask({
      taskId: 'lookup-1',
      description: 'Lookup test',
      subagentType: 'Explore',
      startedAt: Date.now(),
    });

    const found = getBackgroundTaskByToolId('lookup-1');
    // Current stub always returns undefined
    assert.ok(found !== null && found !== undefined,
      'Should find task by tool ID');
    assert.strictEqual(found!.taskId, 'lookup-1');
  });

  it('completeBackgroundTask marks task completed with metadata', async () => {
    const {
      trackBackgroundTask,
      completeBackgroundTask,
    } = await import('./otlp-receiver.js');

    trackBackgroundTask({
      taskId: 'complete-1',
      description: 'Complete test',
      subagentType: 'general-purpose',
      startedAt: Date.now(),
    });

    const completed = completeBackgroundTask('complete-1', true, 'done');
    // Current stub always returns undefined
    assert.ok(completed !== null && completed !== undefined,
      'Should return the completed task');
    assert.strictEqual(completed!.status, 'completed');
    assert.strictEqual(completed!.success, true);
    assert.ok(completed!.completedAt! > 0, 'Should have completedAt timestamp');
    assert.ok(completed!.durationMs! >= 0, 'Should have durationMs');
  });

  it('setBackgroundTaskCallback fires on task completion', async () => {
    const {
      trackBackgroundTask,
      completeBackgroundTask,
      setBackgroundTaskCallback,
    } = await import('./otlp-receiver.js');

    let callbackFired = false;
    setBackgroundTaskCallback(() => { callbackFired = true; });

    trackBackgroundTask({
      taskId: 'cb-1',
      description: 'Callback test',
      subagentType: 'general-purpose',
      startedAt: Date.now(),
    });
    completeBackgroundTask('cb-1', true, 'result');

    // Current stub: setBackgroundTaskCallback is delegating (no-op without provider)
    // trackBackgroundTask/completeBackgroundTask are plain no-ops
    assert.strictEqual(callbackFired, true,
      'Completion callback should fire');
  });

  it('setBackgroundTaskStartCallback fires on task tracking', async () => {
    const { trackBackgroundTask, setBackgroundTaskStartCallback } = await import('./otlp-receiver.js');

    let startFired = false;
    setBackgroundTaskStartCallback(() => { startFired = true; });

    trackBackgroundTask({
      taskId: 'start-cb-1',
      description: 'Start callback test',
      subagentType: 'general-purpose',
      startedAt: Date.now(),
    });

    assert.strictEqual(startFired, true,
      'Start callback should fire when task is tracked');
  });
});

// =============================================================================
// AC6: Tool Event Listeners
// =============================================================================

describe('AC6: addToolEventListener', () => {
  beforeEach(async () => {
    const mod = await import('./otlp-receiver.js');
    mod.resetEventStore();
  });

  it('listener fires when tool event is recorded via processLogEvents', async () => {
    const { addToolEventListener, processLogEvents } = await import('./otlp-receiver.js');

    let listenerFired = false;
    let receivedToolName: string | undefined;

    addToolEventListener((event: { toolName?: string }) => {
      listenerFired = true;
      receivedToolName = event.toolName;
    });

    processLogEvents([{
      name: 'claude_code.tool_result',
      timestamp: Date.now(),
      attributes: { tool_name: 'Read', success: 'true' },
    }]);

    // Current stub: addToolEventListener is no-op
    assert.strictEqual(listenerFired, true,
      'Tool event listener should fire');
    assert.strictEqual(receivedToolName, 'Read',
      'Listener should receive the tool event');
  });
});

// =============================================================================
// AC7: Session State Management
// =============================================================================

describe('AC7: Session state management', () => {
  it('resetEventStore clears all in-memory stores', async () => {
    const {
      trackBackgroundTask,
      getBackgroundTasks,
      processLogEvents,
      getAuditLog,
      aggregateTokenStats,
      getTokenStats,
      resetEventStore,
    } = await import('./otlp-receiver.js');

    // Populate stores
    trackBackgroundTask({
      taskId: 'reset-1', description: 'r', subagentType: 'x', startedAt: Date.now(),
    });
    processLogEvents([{
      name: 'claude_code.tool_result',
      timestamp: Date.now(),
      attributes: { tool_name: 'Read', success: 'true' },
    }]);
    aggregateTokenStats({ inputTokens: 100 });

    // Reset
    resetEventStore();

    // Current stub: resetEventStore is delegating (no-op without provider)
    // After implementation, should clear all stores
    assert.strictEqual(getBackgroundTasks().length, 0,
      'Background tasks should be cleared');
    assert.strictEqual(getAuditLog().length, 0,
      'Audit log should be cleared');
    assert.strictEqual(getTokenStats().inputTokens, 0,
      'Token stats should be reset to zero');
  });

  it('getUserEmail returns email extracted from OTLP log events', async () => {
    const { getUserEmail, processLogEvents, resetEventStore } = await import('./otlp-receiver.js');

    resetEventStore();

    processLogEvents([{
      name: 'claude_code.tool_result',
      timestamp: Date.now(),
      attributes: {
        tool_name: 'Read',
        success: 'true',
        'user.email': 'test@example.com',
      },
    }]);

    // Current stub: getUserEmail always returns null
    assert.strictEqual(getUserEmail(), 'test@example.com',
      'Should extract user email from OTLP event attributes');
  });
});

// =============================================================================
// AC8: Delegating Stubs Work Standalone (No Provider)
// =============================================================================

describe('AC8: Standalone mode — delegating stubs without provider', () => {
  beforeEach(async () => {
    const mod = await import('./otlp-receiver.js');
    mod.resetEventStore();
  });

  it('processOTLPMetrics parses and aggregates without provider', async () => {
    const { processOTLPMetrics, getTokenStats } = await import('./otlp-receiver.js');

    const payload = createMetricsPayload({ input: 200, output: 100 });
    processOTLPMetrics(payload);

    const stats = getTokenStats();
    // Without provider, current stub does nothing — getTokenStats returns zeros
    assert.strictEqual(stats.inputTokens, 200,
      'Should parse and aggregate metrics without Cyclist provider');
    assert.strictEqual(stats.outputTokens, 100);
  });

  it('processOTLPLogs parses and records events without provider', async () => {
    const { processOTLPLogs, getAuditLog } = await import('./otlp-receiver.js');

    const payload = createLogsPayload([{
      name: 'claude_code.tool_result',
      attributes: { tool_name: 'Bash', success: 'true' },
    }]);

    processOTLPLogs(payload);

    const audit = getAuditLog();
    // Without provider, current stubs do nothing
    assert.ok(audit.length > 0,
      'Should record events without Cyclist provider');
  });

  it('full standalone pipeline: ingest → query audit log + stats + types', async () => {
    const {
      processOTLPLogs,
      processOTLPMetrics,
      getAuditLog,
      getTokenStats,
      getToolTypes,
      getAuditLogStats,
      exportAuditLogAsJSON,
      exportAuditLogAsCSV,
    } = await import('./otlp-receiver.js');

    // Ingest metrics
    processOTLPMetrics(createMetricsPayload({ input: 500, output: 250 }));

    // Ingest logs with two tool events
    processOTLPLogs(createLogsPayload([
      { name: 'claude_code.tool_result', attributes: { tool_name: 'Read', success: 'true' } },
      { name: 'claude_code.tool_result', attributes: { tool_name: 'Bash', success: 'false' } },
    ]));

    // Token stats
    const stats = getTokenStats();
    assert.strictEqual(stats.inputTokens, 500);
    assert.strictEqual(stats.outputTokens, 250);

    // Audit log
    const log = getAuditLog();
    assert.strictEqual(log.length, 2, 'Should have 2 audit entries');

    // Tool types
    const types = getToolTypes();
    assert.ok(types.includes('Read'), 'Types should include Read');
    assert.ok(types.includes('Bash'), 'Types should include Bash');

    // Audit stats
    const auditStats = getAuditLogStats() as Record<string, unknown>;
    assert.strictEqual(auditStats.total, 2);

    // JSON export
    const json = exportAuditLogAsJSON();
    assert.ok(json.length > 2, 'JSON export should have content');
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed), 'JSON export should be array');

    // CSV export
    const csv = exportAuditLogAsCSV();
    assert.ok(csv.includes('toolName'), 'CSV should have header');
    assert.ok(csv.includes('Read'), 'CSV should contain tool data');
  });
});
