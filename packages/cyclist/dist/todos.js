/**
 * Todo Visualizer - Parse and manage TodoWrite tool_use blocks
 *
 * B-16: Extracts todo items from Claude's stream-json output
 * for display in the sidebar.
 */
/**
 * Check if a message contains a TodoWrite tool_use block
 */
export function isTodoWriteMessage(msg) {
    if (msg.type !== 'assistant')
        return false;
    const assistantMsg = msg;
    const content = assistantMsg.message?.content;
    if (!content || !Array.isArray(content))
        return false;
    return content.some((block) => block.type === 'tool_use' && block.name === 'TodoWrite');
}
/**
 * Extract todos from a TodoWrite message
 * Returns empty array if not a TodoWrite message
 * If multiple TodoWrite blocks exist, returns the last one (last write wins)
 */
export function extractTodos(msg) {
    if (msg.type !== 'assistant')
        return [];
    const assistantMsg = msg;
    const content = assistantMsg.message?.content;
    if (!content || !Array.isArray(content))
        return [];
    // Find all TodoWrite blocks and use the last one
    const todoWriteBlocks = content.filter((block) => block.type === 'tool_use' && block.name === 'TodoWrite');
    if (todoWriteBlocks.length === 0)
        return [];
    const lastBlock = todoWriteBlocks[todoWriteBlocks.length - 1];
    const input = lastBlock.input;
    if (!input || !Array.isArray(input.todos))
        return [];
    // Extract and normalize todo items
    return input.todos.map((item) => {
        const todo = item;
        return {
            content: String(todo.content ?? ''),
            status: todo.status ?? 'pending',
            activeForm: String(todo.activeForm ?? ''),
        };
    });
}
//# sourceMappingURL=todos.js.map