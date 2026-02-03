/**
 * Tool Stack Grouper Utility
 *
 * Groups consecutive tool_use messages into collapsible stacks.
 * Story MSSCI-13400 - Tool use stack between messages
 */

export interface ToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: Record<string, unknown>;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ToolStackData {
  stackId: string;
  tools: ToolUseMessage[];
  count: number;
  isActive: boolean;
  timestamp: number;
}

interface Message {
  type: string;
  timestamp: number;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
  isStreaming?: boolean;
  content?: string;
}

/**
 * Groups consecutive tool_use messages into stacks.
 *
 * Rules:
 * - tool_result messages do NOT break the stack (they're paired with tool_use elsewhere)
 * - assistant/user messages DO break the stack
 * - Single tool_use messages are NOT grouped (returns empty array for that sequence)
 * - Returns array of ToolStackData, each representing 2+ consecutive tools
 *
 * @param messages - Array of messages to process
 * @returns Array of tool stacks (only stacks with 2+ tools)
 */
export function groupToolsIntoStacks(messages: Message[]): ToolStackData[] {
  const stacks: ToolStackData[] = [];
  let currentTools: ToolUseMessage[] = [];
  let stackCounter = 0;

  for (const msg of messages) {
    if (msg.type === 'tool_use') {
      // Add to current stack
      currentTools.push({
        type: 'tool_use',
        tool_name: msg.tool_name || '',
        tool_id: msg.tool_id || '',
        input: msg.input || {},
        timestamp: msg.timestamp,
        isStreaming: msg.isStreaming,
      });
    } else if (msg.type === 'tool_result') {
      // tool_result does NOT break the stack - it's matched separately
      continue;
    } else {
      // assistant, user, or other message types break the stack
      // Only create stack if 2+ tools (single tools in middle render normally)
      if (currentTools.length >= 2) {
        const lastTool = currentTools[currentTools.length - 1];
        stacks.push({
          stackId: `stack-${stackCounter++}`,
          tools: [...currentTools],
          count: currentTools.length,
          isActive: lastTool.isStreaming === true,
          timestamp: currentTools[0].timestamp,
        });
      }
      currentTools = [];
    }
  }

  // Handle remaining tools at end of messages
  // At end of array: create stack even for single tool (supports streaming/active state)
  if (currentTools.length >= 1) {
    const lastTool = currentTools[currentTools.length - 1];
    stacks.push({
      stackId: `stack-${stackCounter++}`,
      tools: [...currentTools],
      count: currentTools.length,
      isActive: lastTool.isStreaming === true,
      timestamp: currentTools[0].timestamp,
    });
  }

  return stacks;
}
