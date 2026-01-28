/**
 * MSSCI-12477: Background tasks - Implement subagent visibility
 *
 * Tests for background task visibility in Cyclist UI.
 * Builds on 35-16 foundation, focusing on:
 * - Subagent task display with proper type badges
 * - Background Bash command tracking
 * - Output preview functionality (the key gap)
 *
 * Acceptance Criteria:
 * - AC1: Shows active subagent tasks
 * - AC2: Shows background Bash commands
 * - AC3: Status indicators (running/completed/failed)
 * - AC4: Duration/elapsed time
 * - AC5: Output preview on expand
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import from the ACTUAL location (sidebar/background-tasks.js)
// Note: The 35-16 tests imported from components/BackgroundTasksPanel.js which doesn't exist
import {
  renderBackgroundTasksPanel,
  addBackgroundTask,
  updateBackgroundTask,
  dismissBackgroundTask,
  getBackgroundTasks,
  initBackgroundTasksPanel,
  clearBackgroundTasks,
} from '../src/public/js/sidebar/background-tasks.js';

// =============================================================================
// AC1: Shows active subagent tasks
// =============================================================================

describe('AC1: Shows active subagent tasks', () => {
  beforeEach(() => {
    // Mock DOM for init
    globalThis.document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
    } as unknown as Document;
  });

  it('should display subagent type as a badge', () => {
    const tasks = [
      {
        taskId: 'task-001',
        description: 'Checking workflow status',
        subagentType: 'workflow-status-check',
        status: 'pending' as const,
        startedAt: Date.now(),
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should show the subagent type
    expect(html).toContain('workflow-status-check');
    // Should be in a dedicated element (task-type class)
    expect(html).toContain('task-type');
  });

  it('should display different subagent types correctly', () => {
    const tasks = [
      { taskId: 't1', description: 'Test 1', subagentType: 'testing-runner', status: 'pending' as const, startedAt: Date.now() },
      { taskId: 't2', description: 'Test 2', subagentType: 'Explore', status: 'pending' as const, startedAt: Date.now() },
      { taskId: 't3', description: 'Test 3', subagentType: 'general-purpose', status: 'pending' as const, startedAt: Date.now() },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    expect(html).toContain('testing-runner');
    expect(html).toContain('Explore');
    expect(html).toContain('general-purpose');
  });

  it('should display task description', () => {
    const tasks = [
      {
        taskId: 'task-002',
        description: 'Running unit tests for MSSCI-12477',
        subagentType: 'testing-runner',
        status: 'pending' as const,
        startedAt: Date.now(),
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    expect(html).toContain('Running unit tests for MSSCI-12477');
  });
});

// =============================================================================
// AC2: Shows background Bash commands
// =============================================================================

describe('AC2: Shows background Bash commands', () => {
  beforeEach(() => {
    globalThis.document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
    } as unknown as Document;
  });

  it('should display Bash as subagent type for background shell commands', () => {
    // When Bash tool runs with run_in_background=true, it should appear in the panel
    const tasks = [
      {
        taskId: 'bash-001',
        description: 'npm run build',
        subagentType: 'Bash',
        status: 'pending' as const,
        startedAt: Date.now(),
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    expect(html).toContain('Bash');
    expect(html).toContain('npm run build');
  });

  it('should handle both Task and Bash type background work', () => {
    const tasks = [
      { taskId: 't1', description: 'Subagent work', subagentType: 'testing-runner', status: 'pending' as const, startedAt: Date.now() },
      { taskId: 't2', description: 'npm test', subagentType: 'Bash', status: 'pending' as const, startedAt: Date.now() },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    expect(html).toContain('testing-runner');
    expect(html).toContain('Bash');
    expect(html).toContain('Subagent work');
    expect(html).toContain('npm test');
  });
});

// =============================================================================
// AC3: Status indicators (running/completed/failed)
// =============================================================================

describe('AC3: Status indicators (running/completed/failed)', () => {
  beforeEach(() => {
    globalThis.document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
    } as unknown as Document;
  });

  it('should show pending/running indicator for active tasks', () => {
    const tasks = [
      {
        taskId: 'pending-001',
        description: 'Running task',
        subagentType: 'testing-runner',
        status: 'pending' as const,
        startedAt: Date.now(),
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should have task-pending class
    expect(html).toContain('task-pending');
    // Should have hourglass or spinner indicator
    expect(html).toMatch(/&#x23F3;|⏳|spinner|loading/);
  });

  it('should show success indicator for completed successful tasks', () => {
    const tasks = [
      {
        taskId: 'success-001',
        description: 'Passed task',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: true,
        startedAt: Date.now() - 5000,
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should have task-success class
    expect(html).toContain('task-success');
    // Should have checkmark indicator
    expect(html).toMatch(/&#x2705;|✅|success|check/);
  });

  it('should show error indicator for failed tasks', () => {
    const tasks = [
      {
        taskId: 'fail-001',
        description: 'Failed task',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: false,
        error: 'Test failed',
        startedAt: Date.now() - 5000,
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should have task-error class
    expect(html).toContain('task-error');
    // Should have X indicator
    expect(html).toMatch(/&#x274C;|❌|error|fail/);
  });
});

// =============================================================================
// AC4: Duration/elapsed time
// =============================================================================

describe('AC4: Duration/elapsed time', () => {
  beforeEach(() => {
    globalThis.document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
    } as unknown as Document;
  });

  it('should show elapsed time for pending tasks', () => {
    const startedAt = Date.now() - 30000; // 30 seconds ago
    const tasks = [
      {
        taskId: 'elapsed-001',
        description: 'Long running task',
        subagentType: 'testing-runner',
        status: 'pending' as const,
        startedAt,
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should contain elapsed time or data attribute for live updates
    expect(html).toMatch(/30s|Started.*ago|data-started-at/);
  });

  it('should include startedAt data attribute for live time updates', () => {
    const startedAt = Date.now() - 60000;
    const tasks = [
      {
        taskId: 'data-attr-001',
        description: 'Task with timestamp',
        subagentType: 'testing-runner',
        status: 'pending' as const,
        startedAt,
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should have data-started-at for JavaScript live updates
    expect(html).toContain(`data-started-at="${startedAt}"`);
  });

  it('should show completion time for finished tasks', () => {
    const tasks = [
      {
        taskId: 'complete-001',
        description: 'Finished task',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: true,
        startedAt: Date.now() - 45000, // Started 45s ago
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should show completion duration
    expect(html).toMatch(/Completed in|45s|elapsed/i);
  });
});

// =============================================================================
// AC5: Output preview on expand (THE KEY GAP)
// =============================================================================

describe('AC5: Output preview on expand', () => {
  beforeEach(() => {
    globalThis.document = {
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
    } as unknown as Document;
  });

  it('should render expandable output section for completed tasks with output', () => {
    const tasks = [
      {
        taskId: 'output-001',
        description: 'Task with output',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: true,
        startedAt: Date.now() - 10000,
        output: 'STATUS_CHECK_RESULT:\n  status: success\n  state: NEW_WORK_STATE',
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should have expandable details element
    expect(html).toContain('<details');
    expect(html).toContain('</details>');
    // Should have summary for toggle
    expect(html).toContain('<summary');
    // Should contain the actual output
    expect(html).toContain('STATUS_CHECK_RESULT');
    expect(html).toContain('NEW_WORK_STATE');
  });

  it('should render output in preformatted block', () => {
    const output = `Test Results:
  ✓ test 1 passed
  ✓ test 2 passed
  ✗ test 3 failed`;

    const tasks = [
      {
        taskId: 'pre-001',
        description: 'Test run',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: false,
        startedAt: Date.now(),
        output,
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should use <pre> tag for formatted output
    expect(html).toContain('<pre>');
    expect(html).toContain('</pre>');
  });

  it('should escape HTML in output to prevent XSS', () => {
    const tasks = [
      {
        taskId: 'xss-001',
        description: 'Task with HTML in output',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: true,
        startedAt: Date.now(),
        output: '<script>alert("xss")</script>',
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should NOT contain raw script tag
    expect(html).not.toContain('<script>');
    // Should contain escaped version
    expect(html).toContain('&lt;script&gt;');
  });

  it('should render error message in output section for failed tasks', () => {
    const tasks = [
      {
        taskId: 'error-001',
        description: 'Failed task',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: false,
        startedAt: Date.now(),
        error: 'Command exited with code 1: npm ERR! Test failed',
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should contain the error message
    expect(html).toContain('npm ERR!');
    expect(html).toContain('Test failed');
  });

  it('should NOT render output section for pending tasks', () => {
    const tasks = [
      {
        taskId: 'pending-output-001',
        description: 'Still running',
        subagentType: 'testing-runner',
        status: 'pending' as const,
        startedAt: Date.now(),
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Should not have details/summary for pending tasks
    expect(html).not.toContain('<details');
    expect(html).not.toContain('Show output');
  });

  it('should NOT render output section for completed tasks without output', () => {
    const tasks = [
      {
        taskId: 'no-output-001',
        description: 'Task with no output',
        subagentType: 'testing-runner',
        status: 'completed' as const,
        success: true,
        startedAt: Date.now(),
        // No output or error field
      },
    ];

    const html = renderBackgroundTasksPanel(tasks);

    // Since there's no output, should not render the details section
    // But should still render the task itself
    expect(html).toContain('Task with no output');
    // The details section should only appear when there's content
    expect(html.match(/<details/g)?.length || 0).toBe(0);
  });
});

// =============================================================================
// Integration: Data flow from backend to UI
// =============================================================================

describe('Integration: Output data flows correctly', () => {
  beforeEach(() => {
    // More complete DOM mock including the badge element
    const mockBadge = {
      textContent: '',
      style: { display: 'none' },
    };
    const mockSection = {
      classList: {
        contains: vi.fn(() => false),
        remove: vi.fn(),
        toggle: vi.fn(),
      },
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    };
    const mockContainer = {
      innerHTML: '',
      addEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
    };

    globalThis.document = {
      getElementById: vi.fn((id: string) => {
        if (id === 'bg-tasks-count') return mockBadge;
        if (id === 'background-tasks-section') return mockSection;
        if (id === 'background-tasks-container') return mockContainer;
        return null;
      }),
      querySelector: vi.fn(() => null),
    } as unknown as Document;

    // Clear tasks before each test
    if (typeof clearBackgroundTasks === 'function') {
      clearBackgroundTasks();
    }
  });

  it('should store output when task is updated', () => {
    // Initialize panel
    initBackgroundTasksPanel();

    // Add a pending task
    addBackgroundTask({
      taskId: 'flow-001',
      description: 'Task to complete',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now(),
    });

    // Update with completion and output
    updateBackgroundTask('flow-001', {
      status: 'completed',
      success: true,
      output: 'Test output content here',
    });

    // Verify the task has the output
    const tasks = getBackgroundTasks();
    const task = tasks.find(t => t.taskId === 'flow-001');

    expect(task).toBeDefined();
    expect(task?.output).toBe('Test output content here');
  });

  it('should preserve output through task lifecycle', () => {
    initBackgroundTasksPanel();

    // Add task
    addBackgroundTask({
      taskId: 'lifecycle-001',
      description: 'Full lifecycle',
      subagentType: 'testing-runner',
      status: 'pending',
      startedAt: Date.now(),
    });

    // Complete with output
    updateBackgroundTask('lifecycle-001', {
      status: 'completed',
      success: true,
      output: 'Important result data',
    });

    // Render and check output is present
    const tasks = getBackgroundTasks();
    const html = renderBackgroundTasksPanel(tasks);

    expect(html).toContain('Important result data');
  });
});
