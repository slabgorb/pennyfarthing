/**
 * Approval Gate for Tool Permissions (Story 33-3)
 *
 * Intercepts tool_use messages and checks whether they need
 * user approval based on settings, allowlists, and grants.
 */

import { getBashApprovalGate, isAllowlisted, checkGrant } from './settings-store.js';

/**
 * Generic tool_use message type
 */
export interface ToolUseMessage {
  type: string;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
}

/**
 * Result from interceptToolUse
 */
export interface InterceptResult {
  toolName: string;
  toolId: string;
  context: Record<string, unknown>;
  shouldApprove: boolean;
}

/**
 * Check if a tool_use message needs approval (Story 33-3)
 * Works with any tool type, not just Bash.
 *
 * @param message - The SDK message to check
 * @returns InterceptResult with tool info and shouldApprove flag
 */
export function interceptToolUse(message: ToolUseMessage): InterceptResult {
  const result: InterceptResult = {
    toolName: '',
    toolId: '',
    context: {},
    shouldApprove: false,
  };

  // Check if this is a tool_use message
  if (message.type !== 'tool_use' || !message.tool_name) {
    return result;
  }

  const toolName = message.tool_name;
  const toolId = message.tool_id || '';
  const input = message.input || {};

  result.toolName = toolName;
  result.toolId = toolId;
  result.context = input;

  // Check if approval gate is enabled
  if (!getBashApprovalGate()) {
    return result;
  }

  // For Bash, use existing allowlist and grant checks
  if (toolName === 'Bash') {
    const command = (input.command as string) || '';
    if (isAllowlisted(command) || checkGrant('Bash', command)) {
      return result;
    }
  } else {
    // For other tools, check grants by tool name and context
    const scope = getToolScope(toolName, input);
    if (checkGrant(toolName, scope)) {
      return result;
    }
  }

  // Need approval
  result.shouldApprove = true;
  return result;
}

/**
 * Extract scope identifier from tool context
 * Used for grant matching
 */
function getToolScope(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return (input.command as string) || '';
    case 'WebFetch':
      return (input.url as string) || '';
    case 'Edit':
    case 'Write':
    case 'Read':
      return (input.file_path as string) || '';
    default:
      return JSON.stringify(input);
  }
}
