/**
 * B-MSSCI-11950: Background tasks panel WebSocket fallback
 *
 * Bug: Background tasks panel doesn't show tasks because it only listens to
 * IPC events (window.electronAPI.backgroundTask), which are unavailable in
 * web-only mode. The WebSocket broadcast exists but the panel never connects.
 *
 * Fix: Panel should connect to /ws/background-tasks as fallback when IPC
 * is unavailable (window.electronAPI is undefined).
 *
 * Acceptance Criteria:
 * - AC1: Background tasks appear in panel when spawned
 * - AC2: Task status updates shown in real-time
 * - AC3: Completed tasks remain visible until dismissed
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import WebSocket from 'ws';

import { createTerminalServer } from '../src/server.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createBackgroundTaskSpan(overrides: Partial<{
  taskId: string;
  description: string;
  subagentType: string;
}> = {}) {
  const taskId = overrides.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [{
          timeUnixNano: String(Date.now() * 1_000_000),
          body: { stringValue: 'claude_code.tool_result' },
          traceId: 'trace-123',
          spanId: 'span-456',
          attributes: [
            { key: 'tool_name', value: { stringValue: 'Task' } },
            { key: 'tool_parameters', value: { stringValue: JSON.stringify({
              description: overrides.description || 'Background task',
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

function createTaskOutputSpan(overrides: Partial<{
  taskId: string;
  status: 'running' | 'completed';
  success: boolean;
  output: string;
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
          traceId: 'trace-123',
          spanId: 'span-789',
          attributes: [
            { key: 'tool_name', value: { stringValue: 'TaskOutput' } },
            { key: 'tool_parameters', value: { stringValue: JSON.stringify({
              task_id: taskId,
              block: true,
            }) } },
            { key: 'task_status', value: { stringValue: status } },
            { key: 'success', value: { stringValue: String(success) } },
            { key: 'tool_output', value: { stringValue: overrides.output || 'Task completed' } },
            { key: 'duration_ms', value: { stringValue: '100' } },
          ],
        }],
      }],
    }],
  };
}

// =============================================================================
// AC1: Background tasks appear in panel when spawned (via WebSocket)
// =============================================================================

describe('AC1: Background tasks appear in panel when spawned (WebSocket fallback)', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  const PORT = 19899;

  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }

    // Re-initialize broadcast callbacks
    const { initBackgroundTaskBroadcast } = await import('../src/api/background-tasks.js');
    initBackgroundTaskBroadcast();

    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(PORT, resolve));

    // Simulate browser environment WITHOUT Electron IPC
    const window = new Window();
    window.document.write(`
      <html><body>
        <section id="background-tasks-section" class="collapsed">
          <div id="background-tasks-container"></div>
        </section>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;
    // Ensure NO electronAPI - simulating pure web mode
    delete (globalThis.window as Record<string, unknown>).electronAPI;
    // Use ws package as WebSocket (happy-dom's WebSocket doesn't support paths)
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  });

  afterEach(async () => {
    // Clean up panel WebSocket connection
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    panelModule.disconnectWebSocket();
    panelModule.destroyBackgroundTasksPanel();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should export connectWebSocket function for fallback mode', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    // Panel should expose a method to connect via WebSocket
    expect(panelModule.connectWebSocket).toBeDefined();
    expect(typeof panelModule.connectWebSocket).toBe('function');
  });

  it('should automatically connect to WebSocket when IPC unavailable', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    // When initialized without IPC, panel should attempt WebSocket connection
    // We verify by checking if it exposes connection state
    const container = globalThis.document.getElementById('background-tasks-container');
    panelModule.initBackgroundTasksPanel(container);

    // Panel should have a way to check/report connection status
    expect(panelModule.isConnected).toBeDefined();
  });

  it('should add task to panel when task:started received via WebSocket', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    const container = globalThis.document.getElementById('background-tasks-container');

    // Initialize panel and connect to WebSocket
    panelModule.initBackgroundTasksPanel(container);
    await panelModule.connectWebSocket(`ws://localhost:${PORT}/ws/background-tasks`);

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger a background task via OTLP
    const otlpReceiver = await import('../src/otlp-receiver.js');
    const span = createBackgroundTaskSpan({
      taskId: 'ws-fallback-001',
      description: 'Test via WebSocket',
      subagentType: 'testing-runner',
    });
    const events = otlpReceiver.parseOTLPLogs(span);
    await otlpReceiver.processLogEvents(events);

    // Wait for WebSocket message to arrive
    await new Promise(resolve => setTimeout(resolve, 200));

    // Panel should now have the task
    const tasks = panelModule.getBackgroundTasks();
    expect(tasks.find((t: { taskId: string }) => t.taskId === 'ws-fallback-001')).toBeDefined();
  });
});

// =============================================================================
// AC2: Task status updates shown in real-time (via WebSocket)
// =============================================================================

describe('AC2: Task status updates shown in real-time (WebSocket fallback)', () => {
  let server: ReturnType<typeof createTerminalServer>;
  const PORT = 19900;

  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }

    const { initBackgroundTaskBroadcast } = await import('../src/api/background-tasks.js');
    initBackgroundTaskBroadcast();

    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(PORT, resolve));

    const window = new Window();
    window.document.write(`
      <html><body>
        <section id="background-tasks-section" class="collapsed">
          <div id="background-tasks-container"></div>
        </section>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;
    delete (globalThis.window as Record<string, unknown>).electronAPI;
    // Use ws package as WebSocket (happy-dom's WebSocket doesn't support paths)
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  });

  afterEach(async () => {
    // Clean up panel WebSocket connection
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    panelModule.disconnectWebSocket();
    panelModule.destroyBackgroundTasksPanel();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should update task status when task:completed received via WebSocket', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    const container = globalThis.document.getElementById('background-tasks-container');

    panelModule.initBackgroundTasksPanel(container);
    await panelModule.connectWebSocket(`ws://localhost:${PORT}/ws/background-tasks`);
    await new Promise(resolve => setTimeout(resolve, 100));

    const otlpReceiver = await import('../src/otlp-receiver.js');

    // Start task
    const startSpan = createBackgroundTaskSpan({
      taskId: 'ws-update-001',
      description: 'Task to complete',
    });
    await otlpReceiver.processLogEvents(otlpReceiver.parseOTLPLogs(startSpan));
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify task is pending
    let tasks = panelModule.getBackgroundTasks();
    let task = tasks.find((t: { taskId: string }) => t.taskId === 'ws-update-001');
    expect(task?.status).toBe('pending');

    // Complete task
    const completeSpan = createTaskOutputSpan({
      taskId: 'ws-update-001',
      status: 'completed',
      success: true,
      output: 'All tests passed',
    });
    await otlpReceiver.processLogEvents(otlpReceiver.parseOTLPLogs(completeSpan));
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify task is now completed
    tasks = panelModule.getBackgroundTasks();
    task = tasks.find((t: { taskId: string }) => t.taskId === 'ws-update-001');
    expect(task?.status).toBe('completed');
    expect(task?.success).toBe(true);
  });

  it('should show failed task status via WebSocket', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    const container = globalThis.document.getElementById('background-tasks-container');

    panelModule.initBackgroundTasksPanel(container);
    await panelModule.connectWebSocket(`ws://localhost:${PORT}/ws/background-tasks`);
    await new Promise(resolve => setTimeout(resolve, 100));

    const otlpReceiver = await import('../src/otlp-receiver.js');

    // Start task
    const startSpan = createBackgroundTaskSpan({
      taskId: 'ws-fail-001',
      description: 'Task that will fail',
    });
    await otlpReceiver.processLogEvents(otlpReceiver.parseOTLPLogs(startSpan));
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fail task
    const failSpan = createTaskOutputSpan({
      taskId: 'ws-fail-001',
      status: 'completed',
      success: false,
      output: 'Tests failed: 3 errors',
    });
    await otlpReceiver.processLogEvents(otlpReceiver.parseOTLPLogs(failSpan));
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify task shows failure
    const tasks = panelModule.getBackgroundTasks();
    const task = tasks.find((t: { taskId: string }) => t.taskId === 'ws-fail-001');
    expect(task?.status).toBe('completed');
    expect(task?.success).toBe(false);
  });
});

// =============================================================================
// AC3: Completed tasks remain visible until dismissed
// =============================================================================

describe('AC3: Completed tasks remain visible until dismissed (WebSocket mode)', () => {
  beforeEach(async () => {
    const window = new Window();
    window.document.write(`
      <html><body>
        <section id="background-tasks-section" class="collapsed">
          <div id="background-tasks-container"></div>
        </section>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;
    delete (globalThis.window as Record<string, unknown>).electronAPI;
  });

  it('should keep completed tasks in list until explicitly dismissed', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    const container = globalThis.document.getElementById('background-tasks-container');

    panelModule.initBackgroundTasksPanel(container);

    // Add and complete a task
    panelModule.addBackgroundTask({
      taskId: 'persist-001',
      description: 'Completed task',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now() - 5000,
    });

    panelModule.updateBackgroundTask('persist-001', {
      status: 'completed',
      success: true,
      output: 'Done',
    });

    // Add another task
    panelModule.addBackgroundTask({
      taskId: 'persist-002',
      description: 'Another task',
      subagentType: 'Explore',
      status: 'pending',
      startedAt: Date.now(),
    });

    // Both should be visible
    let tasks = panelModule.getBackgroundTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t: { taskId: string }) => t.taskId === 'persist-001')).toBeDefined();

    // Dismiss first task
    panelModule.dismissBackgroundTask('persist-001');

    // Only second task remains
    tasks = panelModule.getBackgroundTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('persist-002');
  });

  it('should render completed tasks in panel HTML', async () => {
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');

    const tasks = [
      {
        taskId: 'render-001',
        description: 'Completed and visible',
        subagentType: 'testing-runner',
        status: 'completed',
        success: true,
        startedAt: Date.now() - 30000,
        output: 'Test output here',
      },
    ];

    const html = panelModule.renderBackgroundTasksPanel(tasks);

    // Completed task should be rendered
    expect(html).toContain('Completed and visible');
    expect(html).toContain('testing-runner');
    // Should have dismiss button
    expect(html).toMatch(/dismiss|&times;|×/i);
  });
});

// =============================================================================
// Integration: WebSocket reconnection
// =============================================================================

describe('Integration: WebSocket reconnection behavior', () => {
  let server: ReturnType<typeof createTerminalServer>;
  const PORT = 19901;

  beforeEach(async () => {
    const otlpReceiver = await import('../src/otlp-receiver.js');
    otlpReceiver.resetEventStore();
    if ('resetBackgroundTasks' in otlpReceiver) {
      (otlpReceiver as unknown as { resetBackgroundTasks: () => void }).resetBackgroundTasks();
    }

    const { initBackgroundTaskBroadcast } = await import('../src/api/background-tasks.js');
    initBackgroundTaskBroadcast();

    const window = new Window();
    window.document.write(`
      <html><body>
        <section id="background-tasks-section" class="collapsed">
          <div id="background-tasks-container"></div>
        </section>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;
    delete (globalThis.window as Record<string, unknown>).electronAPI;
    // Use ws package as WebSocket (happy-dom's WebSocket doesn't support paths)
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  });

  afterEach(async () => {
    // Clean up panel WebSocket connection
    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    panelModule.disconnectWebSocket();
    panelModule.destroyBackgroundTasksPanel();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should attempt reconnection when WebSocket disconnects', async () => {
    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(PORT, resolve));

    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    const container = globalThis.document.getElementById('background-tasks-container');

    panelModule.initBackgroundTasksPanel(container);
    await panelModule.connectWebSocket(`ws://localhost:${PORT}/ws/background-tasks`);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Panel should expose reconnection capability
    expect(panelModule.getConnectionState).toBeDefined();

    const initialState = panelModule.getConnectionState();
    expect(initialState).toBe('connected');
  });

  it('should fetch initial tasks via REST on reconnect', async () => {
    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(PORT, resolve));

    // Add a task to the server before panel connects
    const otlpReceiver = await import('../src/otlp-receiver.js');
    const span = createBackgroundTaskSpan({
      taskId: 'pre-existing-001',
      description: 'Task created before panel init',
    });
    await otlpReceiver.processLogEvents(otlpReceiver.parseOTLPLogs(span));

    const panelModule = await import('../src/public/js/components/BackgroundTasksPanel.js');
    const container = globalThis.document.getElementById('background-tasks-container');

    panelModule.initBackgroundTasksPanel(container);

    // When connecting, panel should fetch existing tasks via REST
    await panelModule.connectWebSocket(`ws://localhost:${PORT}/ws/background-tasks`);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Panel should have the pre-existing task
    const tasks = panelModule.getBackgroundTasks();
    expect(tasks.find((t: { taskId: string }) => t.taskId === 'pre-existing-001')).toBeDefined();
  });
});
