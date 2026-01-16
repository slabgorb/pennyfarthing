/**
 * 31-15: Background Task Completion Notifications Tests
 *
 * These tests verify the acceptance criteria for background task notifications
 * in Cyclist. When background subagents (via Task tool with run_in_background: true)
 * complete, users should see a notification in the Message View.
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Cyclist tracks background task IDs from Task tool
 * - AC2: UI notification appears in Message View when background task completes
 * - AC3: Notification shows task type and success/failure status
 * - AC4: User can click notification to see full result (expandable)
 * - AC5: Works with testing-runner and other background subagents
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';

import { app } from '../src/server.js';

// =============================================================================
// Test Fixtures: OTEL Span Data
// =============================================================================

/**
 * Create a background Task tool span (run_in_background: true)
 * This simulates what Claude Code sends when launching a background subagent
 */
function createBackgroundTaskSpan(overrides: Partial<{
  taskId: string;
  description: string;
  subagentType: string;
  traceId: string;
  spanId: string;
}> = {}) {
  const taskId = overrides.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [{
          timeUnixNano: String(Date.now() * 1_000_000),
          body: { stringValue: 'claude_code.tool_result' },
          traceId: overrides.traceId || 'trace-123',
          spanId: overrides.spanId || 'span-456',
          attributes: [
            { key: 'tool_name', value: { stringValue: 'Task' } },
            { key: 'tool_parameters', value: { stringValue: JSON.stringify({
              description: overrides.description || 'Run tests in background',
              subagent_type: overrides.subagentType || 'testing-runner',
              run_in_background: true,
            }) } },
            { key: 'task_id', value: { stringValue: taskId } },
            { key: 'success', value: { stringValue: 'true' } },
            { key: 'duration_ms', value: { stringValue: '50' } },
          ],
        }],
      }],
    }],
  };
}

/**
 * Create a TaskOutput span (checking on a background task)
 * This simulates what Claude Code sends when polling a background task
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
          traceId: overrides.traceId || 'trace-123',
          spanId: overrides.spanId || 'span-789',
          attributes: [
            { key: 'tool_name', value: { stringValue: 'TaskOutput' } },
            { key: 'tool_parameters', value: { stringValue: JSON.stringify({
              task_id: taskId,
              block: true,
            }) } },
            { key: 'task_status', value: { stringValue: status } },
            { key: 'success', value: { stringValue: String(success) } },
            { key: 'tool_output', value: { stringValue: overrides.output || 'Task completed successfully' } },
            { key: 'duration_ms', value: { stringValue: '100' } },
          ],
        }],
      }],
    }],
  };
}

// =============================================================================
// AC1: Cyclist tracks background task IDs from Task tool
// =============================================================================

describe('AC1: Cyclist tracks background task IDs from Task tool', () => {
  beforeEach(async () => {
    // Reset any tracked tasks before each test
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    // Reset background task tracker if it exists
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should export trackBackgroundTask function', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    expect(otlpReceiver.trackBackgroundTask).toBeDefined();
    expect(typeof otlpReceiver.trackBackgroundTask).toBe('function');
  });

  it('should export getBackgroundTasks function', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    expect(otlpReceiver.getBackgroundTasks).toBeDefined();
    expect(typeof otlpReceiver.getBackgroundTasks).toBe('function');
  });

  it('should export resetBackgroundTasks function', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    expect(otlpReceiver.resetBackgroundTasks).toBeDefined();
    expect(typeof otlpReceiver.resetBackgroundTasks).toBe('function');
  });

  it('should detect Task tool span with run_in_background: true', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'bg-task-001',
      description: 'Run unit tests',
      subagentType: 'testing-runner',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();

    expect(tasks.length).toBeGreaterThan(0);
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'bg-task-001');
    expect(tracked).toBeDefined();
  });

  it('should store task description and subagent type', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'bg-task-002',
      description: 'Gather review data',
      subagentType: 'reviewer-preflight',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'bg-task-002');

    expect(tracked).toBeDefined();
    expect(tracked.description).toBe('Gather review data');
    expect(tracked.subagentType).toBe('reviewer-preflight');
  });

  it('should NOT track regular Task tool spans (non-background)', async () => {
    // Regular Task span without run_in_background
    const span = {
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: String(Date.now() * 1_000_000),
            body: { stringValue: 'claude_code.tool_result' },
            attributes: [
              { key: 'tool_name', value: { stringValue: 'Task' } },
              { key: 'tool_parameters', value: { stringValue: JSON.stringify({
                description: 'Search codebase',
                subagent_type: 'Explore',
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
    const tasks = otlpReceiver.getBackgroundTasks();

    // Should not have added this non-background task
    expect(tasks.length).toBe(0);
  });

  it('should track task start timestamp', async () => {
    // Capture time with tolerance to avoid flaky race condition
    // (implementation may capture timestamp 1-2ms before test's startTime)
    const startTime = Date.now() - 10; // 10ms tolerance
    const span = createBackgroundTaskSpan({
      taskId: 'bg-task-003',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'bg-task-003');

    expect(tracked).toBeDefined();
    expect(tracked.startedAt).toBeDefined();
    expect(tracked.startedAt).toBeGreaterThanOrEqual(startTime);
    expect(tracked.startedAt).toBeLessThanOrEqual(Date.now() + 10); // 10ms tolerance
  });

  it('should track task status as pending initially', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'bg-task-004',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'bg-task-004');

    expect(tracked).toBeDefined();
    expect(tracked.status).toBe('pending');
  });
});

// =============================================================================
// AC2: UI notification appears in Message View when background task completes
// =============================================================================

describe('AC2: UI notification appears in Message View when background task completes', () => {
  beforeEach(async () => {
    // Reset tracked tasks
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }

    // Set up DOM with message-view container
    const window = new Window();
    window.document.write('<html><body><div id="message-view"></div></body></html>');
    globalThis.document = window.document as unknown as Document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export setBackgroundTaskCallback function', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    expect(otlpReceiver.setBackgroundTaskCallback).toBeDefined();
    expect(typeof otlpReceiver.setBackgroundTaskCallback).toBe('function');
  });

  it('should have IPC_BACKGROUND_TASK_CHANNELS in main.ts', async () => {
    const main = await import('../src/main.js');
    expect(main.IPC_BACKGROUND_TASK_CHANNELS).toBeDefined();
    expect(main.IPC_BACKGROUND_TASK_CHANNELS.TASK_COMPLETED).toBeDefined();
  });

  it('should trigger callback when TaskOutput shows completion', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');

    const callback = vi.fn();
    otlpReceiver.setBackgroundTaskCallback(callback);

    // First, register a background task
    const taskSpan = createBackgroundTaskSpan({
      taskId: 'bg-notify-001',
      description: 'Run tests',
    });
    await request(app)
      .post('/v1/logs')
      .send(taskSpan)
      .set('Content-Type', 'application/json');

    // Then, simulate TaskOutput completion
    const outputSpan = createTaskOutputSpan({
      taskId: 'bg-notify-001',
      status: 'completed',
      success: true,
      output: 'All tests passed',
    });
    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    expect(callback).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'bg-notify-001',
      status: 'completed',
    }));
  });

  it('should export renderBackgroundTaskNotification function from message-renderers.js', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');
    expect(renderers.renderBackgroundTaskNotification).toBeDefined();
    expect(typeof renderers.renderBackgroundTaskNotification).toBe('function');
  });

  it('should have CSS for background task notifications', async () => {
    const response = await request(app).get('/styles.css');
    expect(response.text).toMatch(/\.background-task-notification/);
  });
});

// =============================================================================
// AC3: Notification shows task type and success/failure status
// =============================================================================

describe('AC3: Notification shows task type and success/failure status', () => {
  beforeEach(async () => {
    // Note: vi.resetModules() intentionally NOT called here to preserve
    // shared OTLP state that AC5 tests depend on

    // Set up DOM with message-view container
    const window = new Window();
    const html = `
      <html>
        <body>
          <div id="message-view"></div>
        </body>
      </html>
    `;
    window.document.write(html);
    globalThis.document = window.document as unknown as Document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include subagent type in notification HTML', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-001',
      description: 'Run tests',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
    });

    expect(html).toContain('testing-runner');
  });

  it('should include task description in notification HTML', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-002',
      description: 'Gather review data',
      subagentType: 'reviewer-preflight',
      status: 'completed',
      success: true,
    });

    expect(html).toContain('Gather review data');
  });

  it('should show success indicator for successful tasks', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-003',
      description: 'Test run',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
    });

    // Should have success class or indicator
    const hasSuccessIndicator =
      html.includes('notification-success') ||
      html.includes('success') ||
      html.includes('Completed');

    expect(hasSuccessIndicator).toBe(true);
  });

  it('should show failure indicator for failed tasks', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-004',
      description: 'Test run',
      subagentType: 'testing-runner',
      status: 'completed',
      success: false,
      error: 'Tests failed',
    });

    // Should have failure class or indicator
    const hasFailureIndicator =
      html.includes('notification-error') ||
      html.includes('notification-failure') ||
      html.includes('Failed') ||
      html.includes('Error');

    expect(hasFailureIndicator).toBe(true);
  });

  it('should have CSS for success state styling', async () => {
    const response = await request(app).get('/styles.css');
    expect(response.text).toMatch(/\.background-task-notification[^}]*(success)/i);
  });

  it('should have CSS for failure state styling', async () => {
    const response = await request(app).get('/styles.css');
    expect(response.text).toMatch(/\.background-task-notification[^}]*(error|failure)/i);
  });
});

// =============================================================================
// AC4: User can click notification to see full result
// =============================================================================

describe('AC4: User can click notification to see full result', () => {
  beforeEach(async () => {
    // Note: vi.resetModules() intentionally NOT called here to preserve
    // shared OTLP state that AC5 tests depend on

    // Set up DOM with message-view container
    const window = new Window();
    const html = `
      <html>
        <body>
          <div id="message-view"></div>
        </body>
      </html>
    `;
    window.document.write(html);
    globalThis.document = window.document as unknown as Document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render notification as expandable/collapsible element', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-click-001',
      description: 'Test run',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
      output: 'All 42 tests passed',
    });

    // Notification should be expandable (details/summary or collapsible div)
    const isExpandable =
      html.includes('<details') ||
      html.includes('collapsible') ||
      html.includes('expandable') ||
      html.includes('data-task-id');

    expect(isExpandable).toBe(true);
  });

  it('should include output in the expandable section', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-expand-001',
      description: 'Test run',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
      output: 'Detailed test output here...',
    });

    expect(html).toContain('Detailed test output here...');
  });

  it('should display full output in expanded view', async () => {
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    const fullOutput = `
Running 42 tests...
  PASS: test-1.ts
  PASS: test-2.ts
  ...
All tests passed in 3.2s
    `.trim();

    const html = renderers.renderBackgroundTaskNotification({
      taskId: 'task-output-001',
      description: 'Test run',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
      output: fullOutput,
    });

    expect(html).toContain('Running 42 tests');
    expect(html).toContain('All tests passed');
  });

  it('should have CSS for expandable notification content', async () => {
    const response = await request(app).get('/styles.css');
    expect(response.text).toMatch(/\.background-task-notification[^}]*(details|output|expand)/i);
  });
});

// =============================================================================
// AC5: Works with testing-runner and other background subagents
// =============================================================================

describe('AC5: Works with testing-runner and other background subagents', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should track testing-runner subagent', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'testing-001',
      description: 'Run unit tests',
      subagentType: 'testing-runner',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'testing-001');

    expect(tracked).toBeDefined();
    expect(tracked.subagentType).toBe('testing-runner');
  });

  it('should track reviewer-preflight subagent', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'preflight-001',
      description: 'Gather review data',
      subagentType: 'reviewer-preflight',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'preflight-001');

    expect(tracked).toBeDefined();
    expect(tracked.subagentType).toBe('reviewer-preflight');
  });

  it('should track generic-handoff subagent', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'handoff-001',
      description: 'Complete handoff bookkeeping',
      subagentType: 'generic-handoff',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'handoff-001');

    expect(tracked).toBeDefined();
    expect(tracked.subagentType).toBe('generic-handoff');
  });

  it('should track sm-file-summary subagent', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'summary-001',
      description: 'Summarize story files',
      subagentType: 'sm-file-summary',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'summary-001');

    expect(tracked).toBeDefined();
    expect(tracked.subagentType).toBe('sm-file-summary');
  });

  it('should track Explore subagent', async () => {
    const span = createBackgroundTaskSpan({
      taskId: 'explore-001',
      description: 'Search codebase for patterns',
      subagentType: 'Explore',
    });

    await request(app)
      .post('/v1/logs')
      .send(span)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'explore-001');

    expect(tracked).toBeDefined();
    expect(tracked.subagentType).toBe('Explore');
  });

  it('should handle multiple concurrent background tasks', async () => {
    const spans = [
      createBackgroundTaskSpan({ taskId: 'concurrent-001', subagentType: 'testing-runner' }),
      createBackgroundTaskSpan({ taskId: 'concurrent-002', subagentType: 'reviewer-preflight' }),
      createBackgroundTaskSpan({ taskId: 'concurrent-003', subagentType: 'generic-handoff' }),
    ];

    for (const span of spans) {
      await request(app)
        .post('/v1/logs')
        .send(span)
        .set('Content-Type', 'application/json');
    }

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();

    expect(tasks.length).toBe(3);
    expect(tasks.map((t: { taskId: string }) => t.taskId)).toContain('concurrent-001');
    expect(tasks.map((t: { taskId: string }) => t.taskId)).toContain('concurrent-002');
    expect(tasks.map((t: { taskId: string }) => t.taskId)).toContain('concurrent-003');
  });

  it('should update task status when TaskOutput shows completion', async () => {
    // Start background task
    const taskSpan = createBackgroundTaskSpan({
      taskId: 'status-update-001',
      description: 'Run tests',
      subagentType: 'testing-runner',
    });
    await request(app)
      .post('/v1/logs')
      .send(taskSpan)
      .set('Content-Type', 'application/json');

    // Complete the task
    const outputSpan = createTaskOutputSpan({
      taskId: 'status-update-001',
      status: 'completed',
      success: true,
    });
    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'status-update-001');

    expect(tracked).toBeDefined();
    expect(tracked.status).toBe('completed');
    expect(tracked.success).toBe(true);
  });

  it('should store task output when completed', async () => {
    // Start background task
    const taskSpan = createBackgroundTaskSpan({
      taskId: 'output-store-001',
      description: 'Run tests',
      subagentType: 'testing-runner',
    });
    await request(app)
      .post('/v1/logs')
      .send(taskSpan)
      .set('Content-Type', 'application/json');

    // Complete with output
    const outputSpan = createTaskOutputSpan({
      taskId: 'output-store-001',
      status: 'completed',
      success: true,
      output: 'Test results: 42 passed, 0 failed',
    });
    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    const otlpReceiver = await import('../src/otlp-receiver.js');
    const tasks = otlpReceiver.getBackgroundTasks();
    const tracked = tasks.find((t: { taskId: string }) => t.taskId === 'output-store-001');

    expect(tracked).toBeDefined();
    expect(tracked.output).toBe('Test results: 42 passed, 0 failed');
  });
});

// =============================================================================
// Integration: End-to-End Flow
// =============================================================================

describe('Integration: Background Task Notification Flow', () => {
  beforeEach(async () => {
    // Note: vi.resetModules() intentionally NOT called here to preserve
    // shared OTLP state between server and test imports

    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }

    // Set up DOM with message-view container
    const window = new Window();
    const html = `
      <html>
        <body>
          <div id="message-view"></div>
        </body>
      </html>
    `;
    window.document.write(html);
    globalThis.document = window.document as unknown as Document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should complete full flow: track -> notify -> render in message view', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    const renderers = await import('../src/public/js/components/message-view/message-renderers.js');

    // Set up notification callback
    const notificationCallback = vi.fn();
    otlpReceiver.setBackgroundTaskCallback(notificationCallback);

    // 1. Background task starts
    const taskSpan = createBackgroundTaskSpan({
      taskId: 'e2e-001',
      description: 'Run integration tests',
      subagentType: 'testing-runner',
    });
    await request(app)
      .post('/v1/logs')
      .send(taskSpan)
      .set('Content-Type', 'application/json');

    // Verify tracking
    let tasks = otlpReceiver.getBackgroundTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe('pending');

    // 2. Background task completes
    const outputSpan = createTaskOutputSpan({
      taskId: 'e2e-001',
      status: 'completed',
      success: true,
      output: 'All integration tests passed!\n\nSummary:\n- 15 suites\n- 142 tests\n- 0 failures',
    });
    await request(app)
      .post('/v1/logs')
      .send(outputSpan)
      .set('Content-Type', 'application/json');

    // Verify notification callback
    expect(notificationCallback).toHaveBeenCalled();
    expect(notificationCallback).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'e2e-001',
      status: 'completed',
      success: true,
    }));

    // 3. Verify task data updated
    tasks = otlpReceiver.getBackgroundTasks();
    const task = tasks.find((t: { taskId: string }) => t.taskId === 'e2e-001');
    expect(task.status).toBe('completed');
    expect(task.success).toBe(true);
    expect(task.output).toContain('142 tests');

    // 4. Verify notification can be rendered in message view
    const html = renderers.renderBackgroundTaskNotification(task);
    expect(html).toContain('testing-runner');
    expect(html).toContain('Run integration tests');
    expect(html).toContain('142 tests');
  });
});
