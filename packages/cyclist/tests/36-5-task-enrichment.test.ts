/**
 * Story 36-5: Task/Subagent Enrichment Tests
 *
 * Tests for enriching Task tool spans with subagent metadata.
 * Follows the pattern established by 31-15 (background task tracking)
 * and extends to ToolEvent enrichment like 36-2/36-3 (file/bash enrichment).
 *
 * Acceptance Criteria:
 * 1. Subagent type in span attributes
 * 2. Prompt summary (first 200 chars)
 * 3. Result summary when complete
 * 4. Background flag included
 *
 * Implementation Notes:
 * - ToolEvent interface needs: subagentType, promptSummary, resultSummary, isBackground
 * - Enrichment happens in otlp-receiver.ts after existing Read/Edit/Bash enrichment
 * - TaskOutput completion should link back to original Task span for result summary
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../src/server.js';

// =============================================================================
// Test Fixtures: OTEL Span Data for Task Tool
// =============================================================================

/**
 * Create a Task tool span with full parameters for enrichment testing
 */
function createTaskSpan(overrides: Partial<{
  taskId: string;
  description: string;
  subagentType: string;
  prompt: string;
  runInBackground: boolean;
  traceId: string;
  spanId: string;
}> = {}) {
  const taskId = overrides.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const runInBackground = overrides.runInBackground ?? false;

  return {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [{
          timeUnixNano: String(Date.now() * 1_000_000),
          body: { stringValue: 'claude_code.tool_result' },
          traceId: overrides.traceId || 'trace-36-5',
          spanId: overrides.spanId || 'span-36-5',
          attributes: [
            { key: 'tool_name', value: { stringValue: 'Task' } },
            { key: 'tool_parameters', value: { stringValue: JSON.stringify({
              description: overrides.description || 'Test task',
              subagent_type: overrides.subagentType || 'general-purpose',
              prompt: overrides.prompt || 'Execute the test task',
              run_in_background: runInBackground,
            }) } },
            { key: 'task_id', value: { stringValue: taskId } },
            { key: 'success', value: { stringValue: 'true' } },
            { key: 'duration_ms', value: { stringValue: '100' } },
          ],
        }],
      }],
    }],
  };
}

/**
 * Create a TaskOutput span for completion testing
 */
function createTaskOutputSpan(overrides: Partial<{
  taskId: string;
  status: 'running' | 'completed';
  success: boolean;
  output: string;
  traceId: string;
  spanId: string;
}> = {}) {
  const taskId = overrides.taskId || 'task-123';
  const status = overrides.status || 'completed';
  const success = overrides.success !== false;

  return {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [{
          timeUnixNano: String(Date.now() * 1_000_000),
          body: { stringValue: 'claude_code.tool_result' },
          traceId: overrides.traceId || 'trace-36-5',
          spanId: overrides.spanId || 'span-output-36-5',
          attributes: [
            { key: 'tool_name', value: { stringValue: 'TaskOutput' } },
            { key: 'tool_parameters', value: { stringValue: JSON.stringify({
              task_id: taskId,
              block: true,
            }) } },
            { key: 'task_status', value: { stringValue: status } },
            { key: 'success', value: { stringValue: String(success) } },
            { key: 'tool_output', value: { stringValue: overrides.output || 'Task completed successfully' } },
            { key: 'duration_ms', value: { stringValue: '50' } },
          ],
        }],
      }],
    }],
  };
}

// =============================================================================
// AC1: Subagent type in span attributes
// =============================================================================

describe('AC1: Subagent type in span attributes', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should have subagentType field in ToolEvent interface', async () => {
    // This test verifies the ToolEvent interface has been extended
    const span = createTaskSpan({
      taskId: 'subagent-type-001',
      subagentType: 'testing-runner',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.subagentType).toBe('testing-runner');
  });

  it('should capture subagentType for general-purpose agent', async () => {
    const span = createTaskSpan({
      taskId: 'subagent-type-002',
      subagentType: 'general-purpose',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.subagentType).toBe('general-purpose');
  });

  it('should capture subagentType for Explore agent', async () => {
    const span = createTaskSpan({
      taskId: 'subagent-type-003',
      subagentType: 'Explore',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.subagentType).toBe('Explore');
  });

  it('should handle missing subagentType gracefully', async () => {
    // Task without subagent_type field
    const span = {
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: String(Date.now() * 1_000_000),
            body: { stringValue: 'claude_code.tool_result' },
            attributes: [
              { key: 'tool_name', value: { stringValue: 'Task' } },
              { key: 'tool_parameters', value: { stringValue: JSON.stringify({
                description: 'Task without subagent type',
                prompt: 'Do something',
                // No subagent_type field
              }) } },
              { key: 'success', value: { stringValue: 'true' } },
            ],
          }],
        }],
      }],
    };

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    // Should be undefined or empty, not cause an error
    expect(taskEvent.subagentType).toBeUndefined();
  });
});

// =============================================================================
// AC2: Prompt summary (first 200 chars)
// =============================================================================

describe('AC2: Prompt summary (first 200 chars)', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should have promptSummary field in ToolEvent interface', async () => {
    const span = createTaskSpan({
      taskId: 'prompt-001',
      prompt: 'Read and follow the testing guide',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.promptSummary).toBe('Read and follow the testing guide');
  });

  it('should truncate prompt to 200 characters', async () => {
    const longPrompt = 'A'.repeat(300); // 300 character prompt
    const span = createTaskSpan({
      taskId: 'prompt-002',
      prompt: longPrompt,
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.promptSummary).toBeDefined();
    expect(taskEvent.promptSummary.length).toBe(200);
    expect(taskEvent.promptSummary).toBe('A'.repeat(200));
  });

  it('should preserve full prompt if under 200 characters', async () => {
    const shortPrompt = 'Run the unit tests and report results';
    const span = createTaskSpan({
      taskId: 'prompt-003',
      prompt: shortPrompt,
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.promptSummary).toBe(shortPrompt);
  });

  it('should handle exactly 200 character prompt', async () => {
    const exactPrompt = 'B'.repeat(200);
    const span = createTaskSpan({
      taskId: 'prompt-004',
      prompt: exactPrompt,
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.promptSummary).toBe(exactPrompt);
    expect(taskEvent.promptSummary.length).toBe(200);
  });

  it('should handle missing prompt gracefully', async () => {
    const span = {
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: String(Date.now() * 1_000_000),
            body: { stringValue: 'claude_code.tool_result' },
            attributes: [
              { key: 'tool_name', value: { stringValue: 'Task' } },
              { key: 'tool_parameters', value: { stringValue: JSON.stringify({
                description: 'Task without prompt',
                subagent_type: 'general-purpose',
                // No prompt field
              }) } },
              { key: 'success', value: { stringValue: 'true' } },
            ],
          }],
        }],
      }],
    };

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.promptSummary).toBeUndefined();
  });
});

// =============================================================================
// AC3: Result summary when complete
// =============================================================================

describe('AC3: Result summary when complete', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should have resultSummary field in ToolEvent interface for TaskOutput', async () => {
    const outputSpan = createTaskOutputSpan({
      taskId: 'result-001',
      status: 'completed',
      success: true,
      output: 'All 42 tests passed successfully',
    });

    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskOutputEvent = events.find((e: { toolName: string }) => e.toolName === 'TaskOutput');

    expect(taskOutputEvent).toBeDefined();
    expect(taskOutputEvent.resultSummary).toBeDefined();
    expect(taskOutputEvent.resultSummary).toContain('42 tests passed');
  });

  it('should truncate result summary to reasonable length', async () => {
    const longOutput = 'Test result line\n'.repeat(100); // Very long output
    const outputSpan = createTaskOutputSpan({
      taskId: 'result-002',
      output: longOutput,
    });

    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskOutputEvent = events.find((e: { toolName: string }) => e.toolName === 'TaskOutput');

    expect(taskOutputEvent).toBeDefined();
    expect(taskOutputEvent.resultSummary).toBeDefined();
    // Result summary should be truncated (200 chars like prompt, or some reasonable limit)
    expect(taskOutputEvent.resultSummary.length).toBeLessThanOrEqual(200);
  });

  it('should capture result for failed tasks', async () => {
    const outputSpan = createTaskOutputSpan({
      taskId: 'result-003',
      status: 'completed',
      success: false,
      output: 'Error: Test suite failed with 3 failures',
    });

    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskOutputEvent = events.find((e: { toolName: string }) => e.toolName === 'TaskOutput');

    expect(taskOutputEvent).toBeDefined();
    expect(taskOutputEvent.resultSummary).toContain('3 failures');
  });

  it('should handle empty result gracefully', async () => {
    const outputSpan = createTaskOutputSpan({
      taskId: 'result-004',
      output: '',
    });

    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskOutputEvent = events.find((e: { toolName: string }) => e.toolName === 'TaskOutput');

    expect(taskOutputEvent).toBeDefined();
    // Should be empty string or undefined, not cause an error
    expect(taskOutputEvent.resultSummary === '' || taskOutputEvent.resultSummary === undefined).toBe(true);
  });
});

// =============================================================================
// AC4: Background flag included
// =============================================================================

describe('AC4: Background flag included', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should have isBackground field in ToolEvent interface', async () => {
    const span = createTaskSpan({
      taskId: 'bg-flag-001',
      runInBackground: true,
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.isBackground).toBe(true);
  });

  it('should capture isBackground: false for foreground tasks', async () => {
    const span = createTaskSpan({
      taskId: 'bg-flag-002',
      runInBackground: false,
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.isBackground).toBe(false);
  });

  it('should default isBackground to false when not specified', async () => {
    // Task without run_in_background field
    const span = {
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: String(Date.now() * 1_000_000),
            body: { stringValue: 'claude_code.tool_result' },
            attributes: [
              { key: 'tool_name', value: { stringValue: 'Task' } },
              { key: 'tool_parameters', value: { stringValue: JSON.stringify({
                description: 'Foreground task',
                subagent_type: 'general-purpose',
                prompt: 'Do something',
                // No run_in_background field
              }) } },
              { key: 'success', value: { stringValue: 'true' } },
            ],
          }],
        }],
      }],
    };

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();
    // Should default to false, not undefined
    expect(taskEvent.isBackground).toBe(false);
  });

  it('should differentiate background and foreground tasks', async () => {
    // Send both background and foreground tasks
    const bgSpan = createTaskSpan({
      taskId: 'bg-flag-003-bg',
      runInBackground: true,
      subagentType: 'testing-runner',
    });
    const fgSpan = createTaskSpan({
      taskId: 'bg-flag-003-fg',
      runInBackground: false,
      subagentType: 'Explore',
    });

    await request(app)
      .post('/v1/logs')
      .send(bgSpan)
      .set('Content-Type', 'application/json');

    await request(app)
      .post('/v1/logs')
      .send(fgSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvents = events.filter((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvents.length).toBe(2);

    const bgTask = taskEvents.find((e: { subagentType?: string }) => e.subagentType === 'testing-runner');
    const fgTask = taskEvents.find((e: { subagentType?: string }) => e.subagentType === 'Explore');

    expect(bgTask.isBackground).toBe(true);
    expect(fgTask.isBackground).toBe(false);
  });
});

// =============================================================================
// Integration: Full Enrichment Flow
// =============================================================================

describe('Integration: Task Enrichment Flow', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should enrich Task span with all fields in a single event', async () => {
    const span = createTaskSpan({
      taskId: 'full-enrich-001',
      description: 'Run unit tests',
      subagentType: 'testing-runner',
      prompt: 'Execute all unit tests in the packages/cyclist/tests directory',
      runInBackground: true,
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();
    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');

    expect(taskEvent).toBeDefined();

    // All four ACs satisfied in one event
    expect(taskEvent.subagentType).toBe('testing-runner'); // AC1
    expect(taskEvent.promptSummary).toBe('Execute all unit tests in the packages/cyclist/tests directory'); // AC2
    expect(taskEvent.isBackground).toBe(true); // AC4
    // AC3 (resultSummary) is on TaskOutput, tested separately
  });

  it('should handle Task and TaskOutput as separate events', async () => {
    // First, Task starts
    const taskSpan = createTaskSpan({
      taskId: 'flow-001',
      subagentType: 'testing-runner',
      prompt: 'Run tests',
      runInBackground: true,
    });

    await request(app)
      .post('/v1/logs')
      .send(taskSpan)
      .set('Content-Type', 'application/json');

    // Then, TaskOutput completes
    const outputSpan = createTaskOutputSpan({
      taskId: 'flow-001',
      status: 'completed',
      success: true,
      output: 'All tests passed: 10 suites, 50 tests',
    });

    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();

    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');
    const outputEvent = events.find((e: { toolName: string }) => e.toolName === 'TaskOutput');

    expect(taskEvent).toBeDefined();
    expect(taskEvent.subagentType).toBe('testing-runner');
    expect(taskEvent.isBackground).toBe(true);

    expect(outputEvent).toBeDefined();
    expect(outputEvent.resultSummary).toContain('50 tests');
  });

  it('should work alongside existing tool enrichments (Read, Edit, Bash)', async () => {
    // Send a Task span
    const taskSpan = createTaskSpan({
      taskId: 'coexist-001',
      subagentType: 'Explore',
      prompt: 'Search the codebase',
      runInBackground: false,
    });

    await request(app)
      .post('/v1/logs')
      .send(taskSpan)
      .set('Content-Type', 'application/json');

    // Send a Read span (existing enrichment)
    const readSpan = {
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: String(Date.now() * 1_000_000),
            body: { stringValue: 'claude_code.tool_result' },
            attributes: [
              { key: 'tool_name', value: { stringValue: 'Read' } },
              { key: 'tool_parameters', value: { stringValue: JSON.stringify({
                file_path: '/test/file.ts',
              }) } },
              { key: 'success', value: { stringValue: 'true' } },
            ],
          }],
        }],
      }],
    };

    await request(app)
      .post('/v1/logs')
      .send(readSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const events = otlpReceiver.getToolEvents();

    const taskEvent = events.find((e: { toolName: string }) => e.toolName === 'Task');
    const readEvent = events.find((e: { toolName: string }) => e.toolName === 'Read');

    // Both should be enriched independently
    expect(taskEvent).toBeDefined();
    expect(taskEvent.subagentType).toBe('Explore');

    expect(readEvent).toBeDefined();
    // Read enrichment fields should still work (though may require correlation)
  });
});
