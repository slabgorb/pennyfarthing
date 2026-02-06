/**
 * AskUserQuestion Utility
 *
 * Utility functions for detecting AskUserQuestion tool_use messages.
 *
 * Story: MSSCI-14395 - Render AskUserQuestion tool via Reflector QuickActions
 */

interface ToolUseMessage {
  type: string;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
}

/**
 * Check if a tool_use message is an AskUserQuestion tool call.
 */
export function isAskUserQuestion(toolUse: ToolUseMessage): boolean {
  return toolUse.tool_name === 'AskUserQuestion';
}
