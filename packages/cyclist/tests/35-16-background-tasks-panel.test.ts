/**
 * 35-16: Background Tasks Sidebar Panel with Real-time Status
 *
 * These tests verify the acceptance criteria for the background tasks sidebar panel.
 * Extends Story 31-15's notification system with:
 * - REST API for querying tasks
 * - IPC events for task START (not just completion)
 * - WebSocket channel for real-time updates
 * - Sidebar panel showing running and completed tasks
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: GET /api/background-tasks returns list of tracked tasks
 * - AC2: IPC broadcasts task start events (not just completion)
 * - AC3: WebSocket /ws/background-tasks pushes real-time updates
 * - AC4: Sidebar panel shows running tasks with elapsed time
 * - AC5: Sidebar panel shows completed tasks with success/failure
 * - AC6: Completed tasks expandable to show output
 * - AC7: Dismiss button removes completed task from panel
 * - AC8: Panel updates in real-time as tasks start/complete
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';
import WebSocket from 'ws';

import { app, createTerminalServer } from '../src/server.js';

// =============================================================================
// Test Fixtures: OTEL Span Data (reused from 31-15)
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
// AC1: GET /api/background-tasks returns list of tracked tasks
// =============================================================================

describe('AC1: GET /api/background-tasks returns list of tracked tasks', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should have GET /api/background-tasks endpoint', async () => {
    const response = await request(app).get('/api/background-tasks');
    // Should return 200, not 404
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(200);
  });

  it('should return empty array when no tasks tracked', async () => {
    const response = await request(app).get('/api/background-tasks');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tasks: [] });
  });

  it('should return tracked tasks after task is registered', async () => {
    // Register a background task directly (simulates message stream detection)
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.trackBackgroundTask({
      taskId: 'api-test-001',
      description: 'Test task for API',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });

    // Query the API
    const response = await request(app).get('/api/background-tasks');
    expect(response.status).toBe(200);
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0]).toMatchObject({
      taskId: 'api-test-001',
      description: 'Test task for API',
      subagentType: 'testing-runner',
      status: 'pending',
    });
  });

  it('should return tasks with updated status after completion', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');

    // Register task directly (simulates message stream detection)
    otlpReceiver.trackBackgroundTask({
      taskId: 'api-test-002',
      description: 'Task to complete',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });

    // Complete task via TaskOutput OTEL span (this path still works)
    const outputSpan = createTaskOutputSpan({
      taskId: 'api-test-002',
      status: 'completed',
      success: true,
      output: 'Task finished',
    });
    const outputEvents = otlpReceiver.parseOTLPLogs(outputSpan);
    await otlpReceiver.processLogEvents(outputEvents);

    // Query API
    const response = await request(app).get('/api/background-tasks');
    expect(response.status).toBe(200);
    const task = response.body.tasks.find((t: { taskId: string }) => t.taskId === 'api-test-002');
    expect(task).toBeDefined();
    expect(task.status).toBe('completed');
    expect(task.success).toBe(true);
  });

  it('should return multiple concurrent tasks', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');

    // Register tasks directly (simulates message stream detection)
    otlpReceiver.trackBackgroundTask({
      taskId: 'multi-001',
      description: 'Task 1',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });
    otlpReceiver.trackBackgroundTask({
      taskId: 'multi-002',
      description: 'Task 2',
      subagentType: 'reviewer-preflight',
      startedAt: Date.now(),
      isBackground: true,
    });
    otlpReceiver.trackBackgroundTask({
      taskId: 'multi-003',
      description: 'Task 3',
      subagentType: 'Explore',
      startedAt: Date.now(),
      isBackground: true,
    });

    const response = await request(app).get('/api/background-tasks');
    expect(response.status).toBe(200);
    expect(response.body.tasks).toHaveLength(3);
    expect(response.body.tasks.map((t: { taskId: string }) => t.taskId)).toContain('multi-001');
    expect(response.body.tasks.map((t: { taskId: string }) => t.taskId)).toContain('multi-002');
    expect(response.body.tasks.map((t: { taskId: string }) => t.taskId)).toContain('multi-003');
  });
});

// =============================================================================
// AC2: IPC broadcasts task start events (not just completion)
// =============================================================================

describe('AC2: IPC broadcasts task start events (not just completion)', () => {
  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should export setBackgroundTaskStartCallback function', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    expect(otlpReceiver.setBackgroundTaskStartCallback).toBeDefined();
    expect(typeof otlpReceiver.setBackgroundTaskStartCallback).toBe('function');
  });

  it('should trigger start callback when background task is registered', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');

    const startCallback = vi.fn();
    otlpReceiver.setBackgroundTaskStartCallback(startCallback);

    // Track task directly (simulates message stream detection)
    otlpReceiver.trackBackgroundTask({
      taskId: 'start-callback-001',
      description: 'Test start callback',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });

    expect(startCallback).toHaveBeenCalled();
    expect(startCallback).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'start-callback-001',
      description: 'Test start callback',
      subagentType: 'testing-runner',
      status: 'pending',
    }));
  });

  it('should have TASK_STARTED channel in IPC_BACKGROUND_TASK_CHANNELS', async () => {
    const { IPC_BACKGROUND_TASK_CHANNELS } = await import('../src/ipc-channels.js');
    expect(IPC_BACKGROUND_TASK_CHANNELS.TASK_STARTED).toBeDefined();
    expect(IPC_BACKGROUND_TASK_CHANNELS.TASK_STARTED).toBe('backgroundTask:started');
  });

  it('should trigger start callback before completion callback', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');

    const callOrder: string[] = [];
    const startCallback = vi.fn(() => callOrder.push('start'));
    const completeCallback = vi.fn(() => callOrder.push('complete'));

    otlpReceiver.setBackgroundTaskStartCallback(startCallback);
    otlpReceiver.setBackgroundTaskCallback(completeCallback);

    // Register task directly (simulates message stream detection)
    otlpReceiver.trackBackgroundTask({
      taskId: 'order-test-001',
      description: 'Order test',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });

    // Complete task via TaskOutput OTEL span (this path still works)
    const outputSpan = createTaskOutputSpan({
      taskId: 'order-test-001',
      status: 'completed',
    });
    const outputEvents = otlpReceiver.parseOTLPLogs(outputSpan);
    await otlpReceiver.processLogEvents(outputEvents);

    expect(callOrder).toEqual(['start', 'complete']);
  });

  it('should include startedAt timestamp in start callback payload', async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');

    const startCallback = vi.fn();
    otlpReceiver.setBackgroundTaskStartCallback(startCallback);

    const beforeTime = Date.now();
    // Track task directly (simulates message stream detection)
    otlpReceiver.trackBackgroundTask({
      taskId: 'timestamp-test-001',
      description: 'Timestamp test',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });
    const afterTime = Date.now();

    expect(startCallback).toHaveBeenCalled();
    const task = startCallback.mock.calls[0][0];
    expect(task.startedAt).toBeGreaterThanOrEqual(beforeTime - 10);
    expect(task.startedAt).toBeLessThanOrEqual(afterTime + 10);
  });
});

// =============================================================================
// AC3: WebSocket /ws/background-tasks pushes real-time updates
// =============================================================================

describe('AC3: WebSocket /ws/background-tasks pushes real-time updates', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  const PORT = 19898; // Use different port to avoid conflicts

  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }

    // Re-initialize broadcast callbacks (may have been overwritten by AC2 tests)
    const { initBackgroundTaskBroadcast } = await import('../src/api/background-tasks.js');
    initBackgroundTaskBroadcast();

    // Start server with WebSocket support for WebSocket tests
    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(PORT, resolve));
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should accept WebSocket connections at /ws/background-tasks', async () => {
    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${PORT}/ws/background-tasks`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        resolve();
      });

      ws.on('error', reject);

      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  });

  it('should push task:started event when background task begins', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${PORT}/ws/background-tasks`);

      ws.on('open', async () => {
        // Call trackBackgroundTask directly (simulates message stream detection)
        const otlpReceiver = await import('../src/otlp-receiver.js');
        otlpReceiver.trackBackgroundTask({
          taskId: 'ws-start-001',
          description: 'WebSocket start test',
          subagentType: 'testing-runner',
          startedAt: Date.now(),
          isBackground: true,
        });
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'task:started') {
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('Did not receive task:started event')), 5000);
    });

    expect(receivedMessages).toContainEqual(expect.objectContaining({
      type: 'task:started',
      task: expect.objectContaining({
        taskId: 'ws-start-001',
        status: 'pending',
      }),
    }));
  });

  it('should push task:completed event when background task finishes', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${PORT}/ws/background-tasks`);

      ws.on('open', async () => {
        const otlpReceiver = await import('../src/otlp-receiver.js');

        // Register task directly (simulates message stream detection)
        otlpReceiver.trackBackgroundTask({
          taskId: 'ws-complete-001',
          description: 'WebSocket completion test',
          subagentType: 'testing-runner',
          startedAt: Date.now(),
          isBackground: true,
        });

        // Complete task via TaskOutput OTEL span (this path still works)
        const outputSpan = createTaskOutputSpan({
          taskId: 'ws-complete-001',
          status: 'completed',
          success: true,
          output: 'WebSocket completion test',
        });
        const outputEvents = otlpReceiver.parseOTLPLogs(outputSpan);
        await otlpReceiver.processLogEvents(outputEvents);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'task:completed') {
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('Did not receive task:completed event')), 5000);
    });

    expect(receivedMessages).toContainEqual(expect.objectContaining({
      type: 'task:completed',
      task: expect.objectContaining({
        taskId: 'ws-complete-001',
        status: 'completed',
        success: true,
      }),
    }));
  });

  it('should broadcast to multiple connected clients', async () => {
    const ws1Messages: unknown[] = [];
    const ws2Messages: unknown[] = [];

    const ws1 = new WebSocket(`ws://localhost:${PORT}/ws/background-tasks`);
    const ws2 = new WebSocket(`ws://localhost:${PORT}/ws/background-tasks`);

    await Promise.all([
      new Promise<void>((resolve) => ws1.on('open', resolve)),
      new Promise<void>((resolve) => ws2.on('open', resolve)),
    ]);

    ws1.on('message', (data) => ws1Messages.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => ws2Messages.push(JSON.parse(data.toString())));

    // Trigger task by calling trackBackgroundTask directly (simulates message stream detection)
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.trackBackgroundTask({
      taskId: 'broadcast-001',
      description: 'Broadcast test',
      subagentType: 'testing-runner',
      startedAt: Date.now(),
      isBackground: true,
    });

    // Wait for messages
    await new Promise((resolve) => setTimeout(resolve, 500));

    ws1.close();
    ws2.close();

    expect(ws1Messages).toContainEqual(expect.objectContaining({ type: 'task:started' }));
    expect(ws2Messages).toContainEqual(expect.objectContaining({ type: 'task:started' }));
  });
});

// =============================================================================
// AC4: Sidebar panel shows running tasks with elapsed time
// =============================================================================

describe('AC4: Sidebar panel shows running tasks with elapsed time', () => {
  let document: Document;

  beforeEach(async () => {
    const window = new Window();
    window.document.write(`
      <html>
        <body>
          <div id="sidebar"></div>
        </body>
      </html>
    `);
    document = window.document as unknown as Document;
    globalThis.document = document;

    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should export renderBackgroundTasksPanel function', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    expect(panelModule.renderBackgroundTasksPanel).toBeDefined();
    expect(typeof panelModule.renderBackgroundTasksPanel).toBe('function');
  });

  it('should render panel with header showing task count', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      { taskId: 'task-1', description: 'Test 1', subagentType: 'testing-runner', status: 'pending', startedAt: Date.now() },
      { taskId: 'task-2', description: 'Test 2', subagentType: 'Explore', status: 'pending', startedAt: Date.now() },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Panel should have a title (either "HELPER" or dynamic helper name)
    expect(html).toMatch(/panel-title/);
    // Should show count badge
    expect(html).toMatch(/\[2\]|badge.*2|count.*2/i);
  });

  it('should render pending task with spinner icon', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      { taskId: 'pending-1', description: 'Running task', subagentType: 'testing-runner', status: 'pending', startedAt: Date.now() },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Should have spinner/loading indicator for pending
    const hasSpinner =
      html.includes('spinner') ||
      html.includes('loading') ||
      html.includes('⏳') ||
      html.includes('pending');

    expect(hasSpinner).toBe(true);
  });

  it('should show elapsed time for running tasks', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const startedAt = Date.now() - 45000; // 45 seconds ago
    const tasks = [
      { taskId: 'elapsed-1', description: 'Long running', subagentType: 'testing-runner', status: 'pending', startedAt },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Should include elapsed time or data-started-at for live updates
    const hasElapsedTime =
      html.includes('45s') ||
      html.includes('elapsed') ||
      html.includes('ago') ||
      html.includes(`data-started-at="${startedAt}"`) ||
      html.includes('startedAt');

    expect(hasElapsedTime).toBe(true);
  });

  it('should show task description and subagent type', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      { taskId: 'info-1', description: 'Run unit tests', subagentType: 'testing-runner', status: 'pending', startedAt: Date.now() },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    expect(html).toContain('Run unit tests');
    expect(html).toContain('testing-runner');
  });
});

// =============================================================================
// AC5: Sidebar panel shows completed tasks with success/failure
// =============================================================================

describe('AC5: Sidebar panel shows completed tasks with success/failure', () => {
  beforeEach(async () => {
    const window = new Window();
    window.document.write('<html><body><div id="sidebar"></div></body></html>');
    globalThis.document = window.document as unknown as Document;
  });

  it('should render completed successful task with success indicator', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'success-1',
        description: 'Tests passed',
        subagentType: 'testing-runner',
        status: 'completed',
        success: true,
        startedAt: Date.now() - 30000,
        output: 'All tests passed',
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Should have success indicator
    const hasSuccessIndicator =
      html.includes('success') ||
      html.includes('✅') ||
      html.includes('check') ||
      html.includes('passed') ||
      html.includes('green');

    expect(hasSuccessIndicator).toBe(true);
  });

  it('should render completed failed task with failure indicator', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'fail-1',
        description: 'Tests failed',
        subagentType: 'testing-runner',
        status: 'completed',
        success: false,
        startedAt: Date.now() - 30000,
        error: '3 tests failed',
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Should have failure indicator
    const hasFailureIndicator =
      html.includes('error') ||
      html.includes('fail') ||
      html.includes('❌') ||
      html.includes('red');

    expect(hasFailureIndicator).toBe(true);
  });

  it('should differentiate success and failure visually', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const successTask = {
      taskId: 'diff-success',
      description: 'Passed',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
      startedAt: Date.now(),
    };

    const failTask = {
      taskId: 'diff-fail',
      description: 'Failed',
      subagentType: 'testing-runner',
      status: 'completed',
      success: false,
      startedAt: Date.now(),
    };

    const successHtml = panelModule.renderBackgroundTasksPanel([successTask]);
    const failHtml = panelModule.renderBackgroundTasksPanel([failTask]);

    // HTML should be different (different classes, icons, etc.)
    expect(successHtml).not.toBe(failHtml);
  });
});

// =============================================================================
// AC6: Completed tasks expandable to show output
// =============================================================================

describe('AC6: Completed tasks expandable to show output', () => {
  beforeEach(async () => {
    const window = new Window();
    window.document.write('<html><body><div id="sidebar"></div></body></html>');
    globalThis.document = window.document as unknown as Document;
  });

  it('should render completed task with expandable output section', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'expand-1',
        description: 'Test run',
        subagentType: 'testing-runner',
        status: 'completed',
        success: true,
        startedAt: Date.now(),
        output: 'Detailed test output here...',
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Should have expandable element (details/summary or similar)
    const hasExpandable =
      html.includes('<details') ||
      html.includes('expandable') ||
      html.includes('collapsible') ||
      html.includes('toggle');

    expect(hasExpandable).toBe(true);
  });

  it('should include full output in expandable section', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const fullOutput = `Running tests...
Test 1: PASS
Test 2: PASS
Test 3: PASS
All tests completed in 2.3s`;

    const tasks = [
      {
        taskId: 'output-1',
        description: 'Test run',
        subagentType: 'testing-runner',
        status: 'completed',
        success: true,
        startedAt: Date.now(),
        output: fullOutput,
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    expect(html).toContain('Running tests');
    expect(html).toContain('Test 1: PASS');
    expect(html).toContain('All tests completed');
  });

  it('should handle tasks without output gracefully', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'no-output-1',
        description: 'Silent task',
        subagentType: 'testing-runner',
        status: 'completed',
        success: true,
        startedAt: Date.now(),
        // No output field
      },
    ];

    // Should not throw
    expect(() => panelModule.renderBackgroundTasksPanel(tasks)).not.toThrow();

    const html = panelModule.renderBackgroundTasksPanel(tasks);
    expect(html).toContain('Silent task');
  });
});

// =============================================================================
// AC7: Dismiss button removes completed task from panel
// =============================================================================

describe('AC7: Dismiss button removes completed task from panel', () => {
  beforeEach(async () => {
    const window = new Window();
    window.document.write('<html><body><div id="sidebar"></div></body></html>');
    globalThis.document = window.document as unknown as Document;
  });

  it('should render dismiss button for completed tasks', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'dismiss-1',
        description: 'Completed task',
        subagentType: 'testing-runner',
        status: 'completed',
        success: true,
        startedAt: Date.now(),
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Should have dismiss button
    const hasDismiss =
      html.includes('dismiss') ||
      html.includes('×') ||
      html.includes('&times;') ||
      html.includes('close') ||
      html.includes('remove') ||
      html.includes('data-dismiss');

    expect(hasDismiss).toBe(true);
  });

  it('should render cancel button for pending tasks', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'pending-nodismiss',
        description: 'Running task',
        subagentType: 'testing-runner',
        status: 'pending',
        startedAt: Date.now(),
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Pending tasks should have a cancel button (dismiss with title="Cancel")
    expect(html).toMatch(/data-dismiss="pending-nodismiss"/i);
    expect(html).toMatch(/title="Cancel"/i);
  });

  it('should export dismissBackgroundTask function', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    expect(panelModule.dismissBackgroundTask).toBeDefined();
    expect(typeof panelModule.dismissBackgroundTask).toBe('function');
  });

  it('should remove task from list when dismissed', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    // Initialize with tasks
    panelModule.initBackgroundTasksPanel();

    // Add a completed task
    panelModule.addBackgroundTask({
      taskId: 'to-dismiss',
      description: 'Will be dismissed',
      subagentType: 'testing-runner',
      status: 'completed',
      success: true,
      startedAt: Date.now(),
    });

    // Dismiss it
    panelModule.dismissBackgroundTask('to-dismiss');

    // Get current tasks
    const tasks = panelModule.getBackgroundTasks();
    expect(tasks.find((t: { taskId: string }) => t.taskId === 'to-dismiss')).toBeUndefined();
  });
});

// =============================================================================
// AC8: Panel updates in real-time as tasks start/complete
// =============================================================================

describe('AC8: Panel updates in real-time as tasks start/complete', () => {
  beforeEach(async () => {
    const window = new Window();
    window.document.write('<html><body><div id="sidebar"></div></body></html>');
    globalThis.document = window.document as unknown as Document;

    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should export initBackgroundTasksPanel function', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    expect(panelModule.initBackgroundTasksPanel).toBeDefined();
    expect(typeof panelModule.initBackgroundTasksPanel).toBe('function');
  });

  it('should export addBackgroundTask function', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    expect(panelModule.addBackgroundTask).toBeDefined();
    expect(typeof panelModule.addBackgroundTask).toBe('function');
  });

  it('should export updateBackgroundTask function', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    expect(panelModule.updateBackgroundTask).toBeDefined();
    expect(typeof panelModule.updateBackgroundTask).toBe('function');
  });

  it('should add new task when addBackgroundTask called', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    panelModule.initBackgroundTasksPanel();

    const initialTasks = panelModule.getBackgroundTasks();
    const initialCount = initialTasks.length;

    panelModule.addBackgroundTask({
      taskId: 'realtime-add-1',
      description: 'New task',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now(),
    });

    const updatedTasks = panelModule.getBackgroundTasks();
    expect(updatedTasks.length).toBe(initialCount + 1);
    expect(updatedTasks.find((t: { taskId: string }) => t.taskId === 'realtime-add-1')).toBeDefined();
  });

  it('should update task status when updateBackgroundTask called', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    panelModule.initBackgroundTasksPanel();

    // Add pending task
    panelModule.addBackgroundTask({
      taskId: 'realtime-update-1',
      description: 'Task to update',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now(),
    });

    // Update to completed
    panelModule.updateBackgroundTask('realtime-update-1', {
      status: 'completed',
      success: true,
      output: 'Task completed',
    });

    const tasks = panelModule.getBackgroundTasks();
    const task = tasks.find((t: { taskId: string }) => t.taskId === 'realtime-update-1');
    expect(task).toBeDefined();
    expect(task.status).toBe('completed');
    expect(task.success).toBe(true);
  });

  it('should export getBackgroundTasks function', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    expect(panelModule.getBackgroundTasks).toBeDefined();
    expect(typeof panelModule.getBackgroundTasks).toBe('function');
  });

  it('should update count badge when tasks change', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    // Check that count changes are reflected
    const html1 = panelModule.renderBackgroundTasksPanel([]);
    const html2 = panelModule.renderBackgroundTasksPanel([
      { taskId: 't1', description: 'Task 1', subagentType: 'test', status: 'pending', startedAt: Date.now() },
    ]);
    const html3 = panelModule.renderBackgroundTasksPanel([
      { taskId: 't1', description: 'Task 1', subagentType: 'test', status: 'pending', startedAt: Date.now() },
      { taskId: 't2', description: 'Task 2', subagentType: 'test', status: 'pending', startedAt: Date.now() },
    ]);

    // Count should change in each rendered output
    expect(html1).not.toBe(html2);
    expect(html2).not.toBe(html3);
  });
});

// =============================================================================
// Integration: Full Panel Workflow
// =============================================================================

describe('Integration: Full Panel Workflow', () => {
  beforeEach(async () => {
    const window = new Window();
    window.document.write('<html><body><div id="sidebar"></div></body></html>');
    globalThis.document = window.document as unknown as Document;

    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }
  });

  it('should complete full lifecycle: start → running → complete → dismiss', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    // Initialize panel
    panelModule.initBackgroundTasksPanel();

    // 1. Start task
    panelModule.addBackgroundTask({
      taskId: 'lifecycle-001',
      description: 'Full lifecycle test',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now(),
    });

    let tasks = panelModule.getBackgroundTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('pending');

    // 2. Task completes
    panelModule.updateBackgroundTask('lifecycle-001', {
      status: 'completed',
      success: true,
      output: 'All tests passed',
    });

    tasks = panelModule.getBackgroundTasks();
    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].success).toBe(true);

    // 3. Dismiss task
    panelModule.dismissBackgroundTask('lifecycle-001');

    tasks = panelModule.getBackgroundTasks();
    expect(tasks).toHaveLength(0);
  });

  it('should handle multiple concurrent tasks correctly', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    panelModule.initBackgroundTasksPanel();

    // Start multiple tasks
    panelModule.addBackgroundTask({
      taskId: 'concurrent-1',
      description: 'Task 1',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now(),
    });
    panelModule.addBackgroundTask({
      taskId: 'concurrent-2',
      description: 'Task 2',
      subagentType: 'Explore',
      status: 'pending',
      startedAt: Date.now(),
    });
    panelModule.addBackgroundTask({
      taskId: 'concurrent-3',
      description: 'Task 3',
      subagentType: 'reviewer-preflight',
      status: 'pending',
      startedAt: Date.now(),
    });

    let tasks = panelModule.getBackgroundTasks();
    expect(tasks).toHaveLength(3);

    // Complete one
    panelModule.updateBackgroundTask('concurrent-2', {
      status: 'completed',
      success: true,
    });

    tasks = panelModule.getBackgroundTasks();
    const pendingCount = tasks.filter((t: { status: string }) => t.status === 'pending').length;
    const completedCount = tasks.filter((t: { status: string }) => t.status === 'completed').length;

    expect(pendingCount).toBe(2);
    expect(completedCount).toBe(1);
  });
});
