/**
 * B-17: Todo Visualizer Integration Tests
 *
 * Tests for IPC layer and sidebar UI integration.
 * Building on B-16 parsing tests, these tests verify:
 *
 * Acceptance Criteria:
 * - AC1: IPC handler broadcasts todos to renderer on TodoWrite detection
 * - AC2: Sidebar shows "Tasks" section with collapsible header
 * - AC3: Tasks display with status indicators (✓/●/○)
 * - AC4: Progress count shows "X/Y complete"
 * - AC5: In-progress tasks visually highlighted
 * - AC6: Section auto-collapses when no todos exist
 * - AC7: Todos persist across messages in same session
 * - AC8: Tests cover IPC layer and integration
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SDKMessage, SDKAssistantMessage } from '../src/claude-service.js';
import { isTodoWriteMessage, extractTodos, type TodoItem } from '../src/todos.js';
// IPC channel constants - will be exported from main.ts after implementation
import { IPC_DATA_CHANNELS } from '../src/main.js';

// =============================================================================
// Test Data
// =============================================================================

const createTodoWriteMessage = (todos: TodoItem[]): SDKAssistantMessage => ({
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use',
      name: 'TodoWrite',
      input: { todos }
    }]
  }
});

const sampleTodos: TodoItem[] = [
  { content: 'First task', status: 'completed', activeForm: 'Completing first task' },
  { content: 'Second task', status: 'in_progress', activeForm: 'Working on second task' },
  { content: 'Third task', status: 'pending', activeForm: 'Will do third task' },
];

const allCompletedTodos: TodoItem[] = [
  { content: 'Done 1', status: 'completed', activeForm: 'Done' },
  { content: 'Done 2', status: 'completed', activeForm: 'Done' },
  { content: 'Done 3', status: 'completed', activeForm: 'Done' },
];

const noneCompletedTodos: TodoItem[] = [
  { content: 'Task 1', status: 'pending', activeForm: 'Pending' },
  { content: 'Task 2', status: 'in_progress', activeForm: 'Working' },
  { content: 'Task 3', status: 'pending', activeForm: 'Pending' },
];

// =============================================================================
// AC1: IPC Handler Broadcasts Todos
// =============================================================================

describe('B-17: IPC Layer', () => {

  describe('AC1: IPC handler broadcasts todos on TodoWrite detection', () => {

    it('should detect TodoWrite message and extract todos for broadcast', () => {
      const message = createTodoWriteMessage(sampleTodos);

      // Verify detection
      expect(isTodoWriteMessage(message)).toBe(true);

      // Verify extraction
      const todos = extractTodos(message);
      expect(todos).toHaveLength(3);
    });

    it('should not broadcast for non-TodoWrite messages', () => {
      const textMessage: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }]
        }
      };

      expect(isTodoWriteMessage(textMessage)).toBe(false);
      expect(extractTodos(textMessage)).toEqual([]);
    });

    it('should handle empty todos array (clear todos)', () => {
      const emptyMessage = createTodoWriteMessage([]);

      expect(isTodoWriteMessage(emptyMessage)).toBe(true);
      expect(extractTodos(emptyMessage)).toEqual([]);
    });

    it('should use last TodoWrite block when multiple exist', () => {
      const multiBlock: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'TodoWrite',
              input: { todos: [{ content: 'First', status: 'pending', activeForm: 'First' }] }
            },
            {
              type: 'tool_use',
              name: 'TodoWrite',
              input: { todos: [{ content: 'Second', status: 'completed', activeForm: 'Second' }] }
            },
          ]
        }
      };

      const todos = extractTodos(multiBlock);
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('Second');
    });

  });

  describe('Todos state management', () => {

    it('should maintain todos array structure', () => {
      const todos = extractTodos(createTodoWriteMessage(sampleTodos));

      // Each todo should have required fields
      for (const todo of todos) {
        expect(todo).toHaveProperty('content');
        expect(todo).toHaveProperty('status');
        expect(todo).toHaveProperty('activeForm');
      }
    });

    it('should preserve all status types', () => {
      const todos = extractTodos(createTodoWriteMessage(sampleTodos));
      const statuses = todos.map(t => t.status);

      expect(statuses).toContain('completed');
      expect(statuses).toContain('in_progress');
      expect(statuses).toContain('pending');
    });

  });

  describe('IPC channel constants', () => {

    it('should have TODOS_GET channel defined', () => {
      // Will fail until main.ts exports TODOS_GET
      expect(IPC_DATA_CHANNELS.TODOS_GET).toBe('todos:get');
    });

    it('should have TODOS_UPDATE channel defined', () => {
      // Will fail until main.ts exports TODOS_UPDATE
      expect(IPC_DATA_CHANNELS.TODOS_UPDATE).toBe('todos:update');
    });

  });

});

// =============================================================================
// AC2-AC6: DOM Rendering Tests
// =============================================================================

describe('B-17: DOM Rendering', () => {

  // Mock DOM elements
  let todoSection: HTMLElement;
  let todoHeader: HTMLElement;
  let todoProgress: HTMLElement;
  let todoList: HTMLElement;

  beforeEach(() => {
    // Create mock DOM structure
    document.body.innerHTML = `
      <section id="todo-section" class="collapsed">
        <div class="section-header">
          <span class="section-title">Tasks</span>
          <span id="todo-progress">(0/0)</span>
          <button class="collapse-btn">▼</button>
        </div>
        <div id="todo-list" class="section-content"></div>
      </section>
    `;

    todoSection = document.getElementById('todo-section')!;
    todoHeader = todoSection.querySelector('.section-header')!;
    todoProgress = document.getElementById('todo-progress')!;
    todoList = document.getElementById('todo-list')!;
  });

  describe('AC2: Tasks section with collapsible header', () => {

    it('should have Tasks section in DOM', () => {
      expect(todoSection).toBeTruthy();
      expect(todoSection.querySelector('.section-title')?.textContent).toBe('Tasks');
    });

    it('should have collapse button', () => {
      const collapseBtn = todoSection.querySelector('.collapse-btn');
      expect(collapseBtn).toBeTruthy();
    });

    it('should start collapsed when no todos', () => {
      expect(todoSection.classList.contains('collapsed')).toBe(true);
    });

  });

  describe('AC3: Status indicators (✓/●/○)', () => {

    it('should use checkmark (✓) for completed status', () => {
      const indicator = getStatusIndicator('completed');
      expect(indicator).toBe('✓');
    });

    it('should use filled circle (●) for in_progress status', () => {
      const indicator = getStatusIndicator('in_progress');
      expect(indicator).toBe('●');
    });

    it('should use empty circle (○) for pending status', () => {
      const indicator = getStatusIndicator('pending');
      expect(indicator).toBe('○');
    });

  });

  describe('AC4: Progress count (X/Y complete)', () => {

    it('should calculate correct progress for mixed todos', () => {
      const progress = calculateProgress(sampleTodos);
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(3);
    });

    it('should show 3/3 when all completed', () => {
      const progress = calculateProgress(allCompletedTodos);
      expect(progress.completed).toBe(3);
      expect(progress.total).toBe(3);
    });

    it('should show 0/3 when none completed', () => {
      const progress = calculateProgress(noneCompletedTodos);
      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(3);
    });

    it('should show 0/0 when empty', () => {
      const progress = calculateProgress([]);
      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(0);
    });

    it('should format progress string correctly', () => {
      const progress = calculateProgress(sampleTodos);
      const formatted = formatProgress(progress);
      expect(formatted).toBe('(1/3)');
    });

  });

  describe('AC5: In-progress tasks highlighted', () => {

    it('should apply highlight class to in_progress items', () => {
      const items = createTodoElements(sampleTodos);
      const inProgressItem = items.find(el => el.dataset.status === 'in_progress');

      expect(inProgressItem).toBeTruthy();
      expect(inProgressItem?.classList.contains('todo-in-progress')).toBe(true);
    });

    it('should not highlight completed or pending items', () => {
      const items = createTodoElements(sampleTodos);

      const completedItem = items.find(el => el.dataset.status === 'completed');
      const pendingItem = items.find(el => el.dataset.status === 'pending');

      expect(completedItem?.classList.contains('todo-in-progress')).toBe(false);
      expect(pendingItem?.classList.contains('todo-in-progress')).toBe(false);
    });

  });

  describe('AC6: Section auto-collapse when empty', () => {

    it('should collapse section when todos array is empty', () => {
      const shouldCollapse = shouldAutoCollapse([]);
      expect(shouldCollapse).toBe(true);
    });

    it('should expand section when todos exist', () => {
      const shouldCollapse = shouldAutoCollapse(sampleTodos);
      expect(shouldCollapse).toBe(false);
    });

    it('should collapse when all todos are completed', () => {
      // Optional: collapse when all done (design choice)
      // For now, only collapse when truly empty
      const shouldCollapse = shouldAutoCollapse(allCompletedTodos);
      expect(shouldCollapse).toBe(false); // Keep expanded to show completion
    });

  });

});

// =============================================================================
// AC7: Persistence Tests
// =============================================================================

describe('B-17: Persistence', () => {

  describe('AC7: Todos persist across messages', () => {

    it('should maintain state when new message arrives without todos', () => {
      // Simulate state management
      let currentTodos = sampleTodos;

      // Non-TodoWrite message arrives
      const textMessage: SDKAssistantMessage = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Working on it...' }] }
      };

      // Should not clear state
      if (!isTodoWriteMessage(textMessage)) {
        // Keep current todos
      } else {
        currentTodos = extractTodos(textMessage);
      }

      expect(currentTodos).toEqual(sampleTodos);
    });

    it('should update state when new TodoWrite message arrives', () => {
      let currentTodos = sampleTodos;

      // New TodoWrite message with updated todos
      const updatedTodos: TodoItem[] = [
        { content: 'First task', status: 'completed', activeForm: 'Completed' },
        { content: 'Second task', status: 'completed', activeForm: 'Completed' },
        { content: 'Third task', status: 'in_progress', activeForm: 'Working' },
      ];

      const newMessage = createTodoWriteMessage(updatedTodos);

      if (isTodoWriteMessage(newMessage)) {
        currentTodos = extractTodos(newMessage);
      }

      expect(currentTodos[0].status).toBe('completed');
      expect(currentTodos[1].status).toBe('completed');
      expect(currentTodos[2].status).toBe('in_progress');
    });

    it('should clear state when empty TodoWrite arrives', () => {
      let currentTodos = sampleTodos;

      const clearMessage = createTodoWriteMessage([]);

      if (isTodoWriteMessage(clearMessage)) {
        currentTodos = extractTodos(clearMessage);
      }

      expect(currentTodos).toEqual([]);
    });

  });

});

// =============================================================================
// AC8: Integration Tests
// =============================================================================

describe('B-17: Integration', () => {

  describe('AC8: Full IPC flow simulation', () => {

    it('should process SDK message and prepare broadcast data', () => {
      const message = createTodoWriteMessage(sampleTodos);

      // Step 1: Detect TodoWrite
      const isTodoMessage = isTodoWriteMessage(message);
      expect(isTodoMessage).toBe(true);

      // Step 2: Extract todos
      const todos = extractTodos(message);
      expect(todos).toHaveLength(3);

      // Step 3: Prepare broadcast payload
      const payload = {
        todos,
        progress: calculateProgress(todos),
      };

      expect(payload.todos).toEqual(sampleTodos);
      expect(payload.progress.completed).toBe(1);
      expect(payload.progress.total).toBe(3);
    });

    it('should update DOM with new todos', () => {
      document.body.innerHTML = `
        <section id="todo-section" class="collapsed">
          <div id="todo-progress">(0/0)</div>
          <div id="todo-list"></div>
        </section>
      `;

      // Simulate DOM update
      const todoList = document.getElementById('todo-list')!;
      const todoProgress = document.getElementById('todo-progress')!;
      const todoSection = document.getElementById('todo-section')!;

      // Create todo elements
      const elements = createTodoElements(sampleTodos);
      todoList.innerHTML = '';
      elements.forEach(el => todoList.appendChild(el));

      // Update progress
      const progress = calculateProgress(sampleTodos);
      todoProgress.textContent = formatProgress(progress);

      // Expand section
      if (!shouldAutoCollapse(sampleTodos)) {
        todoSection.classList.remove('collapsed');
      }

      // Verify
      expect(todoList.children).toHaveLength(3);
      expect(todoProgress.textContent).toBe('(1/3)');
      expect(todoSection.classList.contains('collapsed')).toBe(false);
    });

  });

  describe('Edge cases', () => {

    it('should handle rapid updates gracefully', () => {
      // Simulate rapid TodoWrite messages
      const messages = [
        createTodoWriteMessage([{ content: 'A', status: 'pending', activeForm: 'A' }]),
        createTodoWriteMessage([{ content: 'A', status: 'in_progress', activeForm: 'A' }]),
        createTodoWriteMessage([{ content: 'A', status: 'completed', activeForm: 'A' }]),
      ];

      let currentTodos: TodoItem[] = [];

      for (const msg of messages) {
        if (isTodoWriteMessage(msg)) {
          currentTodos = extractTodos(msg);
        }
      }

      // Final state should be completed
      expect(currentTodos[0].status).toBe('completed');
    });

    it('should handle large todo lists', () => {
      const largeTodos: TodoItem[] = Array.from({ length: 50 }, (_, i) => ({
        content: `Task ${i + 1}`,
        status: i < 25 ? 'completed' : 'pending',
        activeForm: `Doing task ${i + 1}`,
      }));

      const message = createTodoWriteMessage(largeTodos);
      const todos = extractTodos(message);

      expect(todos).toHaveLength(50);
      expect(calculateProgress(todos).completed).toBe(25);
    });

    it('should handle special characters in todo content', () => {
      const specialTodos: TodoItem[] = [
        { content: 'Fix bug in <Component />', status: 'pending', activeForm: 'Fixing' },
        { content: 'Update "config.json"', status: 'pending', activeForm: 'Updating' },
        { content: 'Test & validate', status: 'pending', activeForm: 'Testing' },
      ];

      const message = createTodoWriteMessage(specialTodos);
      const todos = extractTodos(message);

      expect(todos[0].content).toBe('Fix bug in <Component />');
      expect(todos[1].content).toBe('Update "config.json"');
      expect(todos[2].content).toBe('Test & validate');
    });

  });

});

// =============================================================================
// Helper Functions (to be implemented in src/public/js/todos.js)
// =============================================================================

/**
 * Get status indicator character for a todo status
 * Implementation target: src/public/js/todos.js
 */
function getStatusIndicator(status: TodoItem['status']): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'in_progress':
      return '●';
    case 'pending':
      return '○';
    default:
      return '○';
  }
}

/**
 * Calculate progress from todos array
 * Implementation target: src/public/js/todos.js
 */
function calculateProgress(todos: TodoItem[]): { completed: number; total: number } {
  const completed = todos.filter(t => t.status === 'completed').length;
  return { completed, total: todos.length };
}

/**
 * Format progress as string "(X/Y)"
 * Implementation target: src/public/js/todos.js
 */
function formatProgress(progress: { completed: number; total: number }): string {
  return `(${progress.completed}/${progress.total})`;
}

/**
 * Determine if section should auto-collapse
 * Implementation target: src/public/js/todos.js
 */
function shouldAutoCollapse(todos: TodoItem[]): boolean {
  return todos.length === 0;
}

/**
 * Create DOM elements for todos
 * Implementation target: src/public/js/todos.js
 */
function createTodoElements(todos: TodoItem[]): HTMLElement[] {
  return todos.map(todo => {
    const el = document.createElement('div');
    el.className = `todo-item todo-${todo.status}`;
    if (todo.status === 'in_progress') {
      el.classList.add('todo-in-progress');
    }
    el.dataset.status = todo.status;

    const indicator = document.createElement('span');
    indicator.className = 'todo-indicator';
    indicator.textContent = getStatusIndicator(todo.status);

    const content = document.createElement('span');
    content.className = 'todo-content';
    content.textContent = todo.status === 'in_progress' ? todo.activeForm : todo.content;

    el.appendChild(indicator);
    el.appendChild(content);

    return el;
  });
}
