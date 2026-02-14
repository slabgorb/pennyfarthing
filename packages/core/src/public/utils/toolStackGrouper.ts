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
 * - Single tool_use messages ARE grouped (consistent rendering with multi-tool stacks)
 * - Returns array of ToolStackData, each representing 1+ consecutive tools
 *
 * @param messages - Array of messages to process
 * @returns Array of tool stacks (only stacks with 2+ tools)
 */
/**
 * Generate a stable stack ID from the first tool's ID.
 * This ensures the same stack keeps the same key across re-renders,
 * preventing React from remounting and losing collapse state.
 */
function generateStableStackId(tools: ToolUseMessage[]): string {
  if (tools.length === 0) return 'stack-empty';
  // Use first tool's ID as anchor - it won't change as more tools are added
  return `stack-${tools[0].tool_id}`;
}

export function groupToolsIntoStacks(messages: Message[]): ToolStackData[] {
  const stacks: ToolStackData[] = [];
  let currentTools: ToolUseMessage[] = [];

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
      // Create stack for any tools (single tools also get stacked for consistent rendering)
      if (currentTools.length >= 1) {
        const lastTool = currentTools[currentTools.length - 1];
        stacks.push({
          stackId: generateStableStackId(currentTools),
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
  if (currentTools.length >= 1) {
    const lastTool = currentTools[currentTools.length - 1];
    stacks.push({
      stackId: generateStableStackId(currentTools),
      tools: [...currentTools],
      count: currentTools.length,
      isActive: lastTool.isStreaming === true,
      timestamp: currentTools[0].timestamp,
    });
  }

  return stacks;
}
