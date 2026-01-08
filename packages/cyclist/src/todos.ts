/**
 * Todo Visualizer - Parse and manage TodoWrite tool_use blocks
 *
 * B-16: Extracts todo items from Claude's stream-json output
 * for display in the sidebar.
 */

import type { SDKMessage } from './claude-service.js';

/**
 * A single todo item from the TodoWrite tool
 */
export interface TodoItem {
  content: string;
  status: 'completed' | 'in_progress' | 'pending';
  activeForm: string;
}

/**
 * Content block within an assistant message
 */
interface ContentBlock {
  type: 'text' | 'tool_use';
  name?: string;
  input?: unknown;
}

/**
 * Check if a message contains a TodoWrite tool_use block
 */
export function isTodoWriteMessage(msg: SDKMessage): boolean {
  if (msg.type !== 'assistant') return false;

  const assistantMsg = msg as { message?: { content?: ContentBlock[] } };
  const content = assistantMsg.message?.content;
  if (!content || !Array.isArray(content)) return false;

  return content.some(
    (block) => block.type === 'tool_use' && block.name === 'TodoWrite'
  );
}

/**
 * Extract todos from a TodoWrite message
 * Returns empty array if not a TodoWrite message
 * If multiple TodoWrite blocks exist, returns the last one (last write wins)
 */
export function extractTodos(msg: SDKMessage): TodoItem[] {
  if (msg.type !== 'assistant') return [];

  const assistantMsg = msg as { message?: { content?: ContentBlock[] } };
  const content = assistantMsg.message?.content;
  if (!content || !Array.isArray(content)) return [];

  // Find all TodoWrite blocks and use the last one
  const todoWriteBlocks = content.filter(
    (block) => block.type === 'tool_use' && block.name === 'TodoWrite'
  );

  if (todoWriteBlocks.length === 0) return [];

  const lastBlock = todoWriteBlocks[todoWriteBlocks.length - 1];
  const input = lastBlock.input as { todos?: unknown[] } | null | undefined;

  if (!input || !Array.isArray(input.todos)) return [];

  // Extract and normalize todo items
  return input.todos.map((item: unknown) => {
    const todo = item as Record<string, unknown>;
    return {
      content: String(todo.content ?? ''),
      status: (todo.status as TodoItem['status']) ?? 'pending',
      activeForm: String(todo.activeForm ?? ''),
    };
  });
}
