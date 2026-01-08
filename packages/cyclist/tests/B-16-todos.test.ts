/**
 * B-16: Todo Visualizer Tests
 *
 * Tests for todo list parsing and state management.
 * These tests define the expected behavior for extracting TodoWrite
 * tool_use blocks from Claude's stream-json output.
 *
 * Acceptance Criteria:
 * - AC1: Sidebar shows "Tasks" section when todos exist
 * - AC2: Displays all todo items with status indicators
 * - AC3: Shows progress count (e.g., "3/7 complete")
 * - AC4: Updates in real-time as Claude modifies todos
 * - AC5: In-progress task visually highlighted
 * - AC6: Section collapses when no active todos
 * - AC7: Persists todo state across messages in same session
 */

import { describe, it, expect } from 'vitest';

import type { SDKMessage, SDKAssistantMessage } from '../src/claude-service.js';
// These functions will be implemented in src/todos.ts
import { isTodoWriteMessage, extractTodos, type TodoItem } from '../src/todos.js';

// Sample TodoWrite messages for testing
const sampleTodoWriteMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'First task', status: 'completed', activeForm: 'Completing first task' },
          { content: 'Second task', status: 'in_progress', activeForm: 'Working on second task' },
          { content: 'Third task', status: 'pending', activeForm: 'Will do third task' },
        ]
      }
    }]
  }
};

const sampleEmptyTodoWriteMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use',
      name: 'TodoWrite',
      input: {
        todos: []
      }
    }]
  }
};

const sampleTextOnlyMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello! How can I help you today?' }]
  }
};

const sampleOtherToolUseMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use',
      name: 'Read',
      input: { file_path: '/test/file.ts' }
    }]
  }
};

const sampleMixedContentMessage: SDKAssistantMessage = {
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: 'Let me track these tasks:' },
      {
        type: 'tool_use',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Mixed task', status: 'pending', activeForm: 'Doing mixed task' }
          ]
        }
      }
    ]
  }
};

const sampleSystemMessage: SDKMessage = {
  type: 'system',
  session_id: 'test-session',
  model: 'claude-sonnet-4-20250514',
};

const sampleResultMessage: SDKMessage = {
  type: 'result',
  usage: { input_tokens: 100, output_tokens: 50 },
  cost_usd: 0.001,
  duration_ms: 500,
};

describe('B-16: Todo Visualizer', () => {

  describe('isTodoWriteMessage()', () => {

    it('should return true for TodoWrite tool_use message', () => {
      expect(isTodoWriteMessage(sampleTodoWriteMessage)).toBe(true);
    });

    it('should return true for empty TodoWrite message', () => {
      expect(isTodoWriteMessage(sampleEmptyTodoWriteMessage)).toBe(true);
    });

    it('should return false for text-only assistant message', () => {
      expect(isTodoWriteMessage(sampleTextOnlyMessage)).toBe(false);
    });

    it('should return false for other tool_use messages', () => {
      expect(isTodoWriteMessage(sampleOtherToolUseMessage)).toBe(false);
    });

    it('should return true for mixed content with TodoWrite', () => {
      expect(isTodoWriteMessage(sampleMixedContentMessage)).toBe(true);
    });

    it('should return false for system messages', () => {
      expect(isTodoWriteMessage(sampleSystemMessage)).toBe(false);
    });

    it('should return false for result messages', () => {
      expect(isTodoWriteMessage(sampleResultMessage)).toBe(false);
    });

    it('should handle messages with undefined content', () => {
      const msgWithUndefined: SDKAssistantMessage = {
        type: 'assistant',
        message: { content: [] }
      };
      expect(isTodoWriteMessage(msgWithUndefined)).toBe(false);
    });

  });

  describe('extractTodos()', () => {

    it('should extract todos from TodoWrite message', () => {
      const todos = extractTodos(sampleTodoWriteMessage);

      expect(todos).toHaveLength(3);
      expect(todos[0]).toEqual({
        content: 'First task',
        status: 'completed',
        activeForm: 'Completing first task'
      });
      expect(todos[1]).toEqual({
        content: 'Second task',
        status: 'in_progress',
        activeForm: 'Working on second task'
      });
      expect(todos[2]).toEqual({
        content: 'Third task',
        status: 'pending',
        activeForm: 'Will do third task'
      });
    });

    it('should return empty array for empty TodoWrite', () => {
      const todos = extractTodos(sampleEmptyTodoWriteMessage);
      expect(todos).toEqual([]);
    });

    it('should return empty array for non-TodoWrite messages', () => {
      expect(extractTodos(sampleTextOnlyMessage)).toEqual([]);
      expect(extractTodos(sampleOtherToolUseMessage)).toEqual([]);
      expect(extractTodos(sampleSystemMessage)).toEqual([]);
      expect(extractTodos(sampleResultMessage)).toEqual([]);
    });

    it('should extract todos from mixed content message', () => {
      const todos = extractTodos(sampleMixedContentMessage);

      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('Mixed task');
    });

    it('should preserve todo status values', () => {
      const todos = extractTodos(sampleTodoWriteMessage);

      const statuses = todos.map(t => t.status);
      expect(statuses).toContain('completed');
      expect(statuses).toContain('in_progress');
      expect(statuses).toContain('pending');
    });

    it('should preserve activeForm values', () => {
      const todos = extractTodos(sampleTodoWriteMessage);

      expect(todos[0].activeForm).toBe('Completing first task');
      expect(todos[1].activeForm).toBe('Working on second task');
      expect(todos[2].activeForm).toBe('Will do third task');
    });

  });

  describe('TodoItem type', () => {

    it('should have correct shape for todo items', () => {
      const todo: TodoItem = {
        content: 'Test task',
        status: 'pending',
        activeForm: 'Testing task'
      };

      expect(todo.content).toBe('Test task');
      expect(todo.status).toBe('pending');
      expect(todo.activeForm).toBe('Testing task');
    });

    it('should allow all valid status values', () => {
      const completed: TodoItem = { content: 'a', status: 'completed', activeForm: 'a' };
      const inProgress: TodoItem = { content: 'b', status: 'in_progress', activeForm: 'b' };
      const pending: TodoItem = { content: 'c', status: 'pending', activeForm: 'c' };

      expect(completed.status).toBe('completed');
      expect(inProgress.status).toBe('in_progress');
      expect(pending.status).toBe('pending');
    });

  });

  describe('Progress calculation (AC3)', () => {

    it('should be able to calculate completed count', () => {
      const todos = extractTodos(sampleTodoWriteMessage);
      const completedCount = todos.filter(t => t.status === 'completed').length;

      expect(completedCount).toBe(1);
    });

    it('should be able to calculate total count', () => {
      const todos = extractTodos(sampleTodoWriteMessage);

      expect(todos.length).toBe(3);
    });

    it('should handle all completed', () => {
      const allCompleted: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Done 1', status: 'completed', activeForm: 'Done' },
                { content: 'Done 2', status: 'completed', activeForm: 'Done' },
              ]
            }
          }]
        }
      };

      const todos = extractTodos(allCompleted);
      const completedCount = todos.filter(t => t.status === 'completed').length;

      expect(completedCount).toBe(todos.length);
    });

    it('should handle none completed', () => {
      const noneCompleted: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Pending 1', status: 'pending', activeForm: 'Pending' },
                { content: 'In Progress', status: 'in_progress', activeForm: 'Working' },
              ]
            }
          }]
        }
      };

      const todos = extractTodos(noneCompleted);
      const completedCount = todos.filter(t => t.status === 'completed').length;

      expect(completedCount).toBe(0);
    });

  });

  describe('Edge cases', () => {

    it('should handle malformed TodoWrite input gracefully', () => {
      const malformed: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'TodoWrite',
            input: {} // Missing todos array
          }]
        }
      };

      // Should not throw, should return empty array
      expect(() => extractTodos(malformed)).not.toThrow();
      expect(extractTodos(malformed)).toEqual([]);
    });

    it('should handle null input gracefully', () => {
      const nullInput: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'TodoWrite',
            input: null as unknown as Record<string, unknown>
          }]
        }
      };

      expect(() => extractTodos(nullInput)).not.toThrow();
      expect(extractTodos(nullInput)).toEqual([]);
    });

    it('should handle multiple TodoWrite blocks (last wins)', () => {
      const multipleBlocks: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'TodoWrite',
              input: {
                todos: [{ content: 'First write', status: 'pending', activeForm: 'First' }]
              }
            },
            {
              type: 'tool_use',
              name: 'TodoWrite',
              input: {
                todos: [{ content: 'Second write', status: 'completed', activeForm: 'Second' }]
              }
            }
          ]
        }
      };

      const todos = extractTodos(multipleBlocks);

      // Should use the last TodoWrite block
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('Second write');
    });

    it('should handle TodoWrite with extra fields gracefully', () => {
      const extraFields: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            name: 'TodoWrite',
            input: {
              todos: [{
                content: 'Task with extras',
                status: 'pending',
                activeForm: 'Doing task',
                extraField: 'should be ignored',
                anotherExtra: 123
              }]
            }
          }]
        }
      };

      const todos = extractTodos(extraFields);

      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('Task with extras');
      expect(todos[0].status).toBe('pending');
      expect(todos[0].activeForm).toBe('Doing task');
    });

  });

});
