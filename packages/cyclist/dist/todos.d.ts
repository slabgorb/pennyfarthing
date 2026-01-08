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
 * Check if a message contains a TodoWrite tool_use block
 */
export declare function isTodoWriteMessage(msg: SDKMessage): boolean;
/**
 * Extract todos from a TodoWrite message
 * Returns empty array if not a TodoWrite message
 * If multiple TodoWrite blocks exist, returns the last one (last write wins)
 */
export declare function extractTodos(msg: SDKMessage): TodoItem[];
//# sourceMappingURL=todos.d.ts.map