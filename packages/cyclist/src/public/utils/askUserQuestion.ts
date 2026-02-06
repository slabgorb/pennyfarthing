/**
 * AskUserQuestion Utility (Stub)
 *
 * Utility functions for detecting and handling AskUserQuestion tool_use messages.
 *
 * Story: MSSCI-14395 - Render AskUserQuestion tool via Reflector QuickActions
 *
 * TODO: Implement - this is a stub for TDD RED phase.
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
  throw new Error('isAskUserQuestion not implemented');
}
