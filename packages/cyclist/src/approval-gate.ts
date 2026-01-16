/**
 * Approval Gate for Tool Permissions (Story 22-3, 33-3)
 *
 * Main process module that intercepts tool_use messages and
 * requests user approval before execution. Works with ApprovalModal.js
 * in the renderer process via IPC.
 *
 * Flow:
 * 1. Claude emits tool_use message (Bash, WebFetch, Edit, Write, etc.)
 * 2. This module intercepts and checks settings
 * 3. If gate enabled and not allowlisted, request approval via IPC
 * 4. Wait for user response (approve/reject/always-allow)
 * 5. Continue execution or inject rejection error
 *
 * Story 33-3: Added generic interceptToolUse for any tool type.
 */

import { getBashApprovalGate, isAllowlisted, addToAllowlist, extractPattern, addGrant, checkGrant, type GrantTypeValue } from './settings-store.js';

/**
 * Pending approval requests, keyed by tool_id
 * Each entry holds the resolve function for the approval promise
 */
const pendingApprovals: Map<string, {
  resolve: (approved: boolean) => void;
  command: string;
}> = new Map();

/**
 * SDK tool_result error message format
 */
export interface SDKToolResultError {
  type: 'tool_result';
  tool_id: string;
  output: string;
  is_error: boolean;
}

/**
 * Request approval for a Bash command
 * Returns a promise that resolves when the user approves or rejects
 *
 * @param command - The Bash command to approve
 * @param toolId - The tool_use_id from Claude
 * @returns Promise<boolean> - true if approved, false if rejected
 */
export function requestApproval(command: string, toolId: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(toolId, { resolve, command });
  });
}

/**
 * Resolve a pending approval request
 * Called by IPC handler when user responds to approval modal
 *
 * @param toolId - The tool_use_id to resolve
 * @param approved - true if approved, false if rejected
 * @param grantScope - Grant scope: 'once', 'session', or 'always'
 */
export function resolveApproval(toolId: string, approved: boolean, grantScope?: GrantTypeValue): void {
  const pending = pendingApprovals.get(toolId);
  if (pending) {
    // Add grant based on scope
    if (approved && grantScope) {
      const pattern = extractPattern(pending.command);
      addGrant({
        tool: 'Bash',
        scope: pattern,
        grant_type: grantScope,
        granted_at: new Date().toISOString(),
      });

      // For backwards compatibility, also add to allowlist for 'always' grants
      if (grantScope === 'always') {
        addToAllowlist(pattern);
      }
    }

    pending.resolve(approved);
    pendingApprovals.delete(toolId);
  }
}

/**
 * Create a tool_result error message for rejected commands
 *
 * @param toolId - The tool_use_id that was rejected
 * @returns SDKToolResultError message to inject into the conversation
 */
export function createRejectionError(toolId: string): SDKToolResultError {
  return {
    type: 'tool_result',
    tool_id: toolId,
    output: 'Command rejected by user. The user declined to execute this command.',
    is_error: true,
  };
}

/**
 * Check if a tool_use message is a Bash command that needs approval
 *
 * @param message - The SDK message to check
 * @returns Object with shouldApprove boolean, command string, and toolId
 */
export function interceptBashToolUse(message: {
  type: string;
  tool_name?: string;
  tool_id?: string;
  input?: { command?: string };
}): { shouldApprove: boolean; command: string; toolId: string } {
  const result = { shouldApprove: false, command: '', toolId: '' };

  // Check if this is a Bash tool_use
  if (message.type !== 'tool_use' || message.tool_name !== 'Bash') {
    return result;
  }

  const command = message.input?.command || '';
  const toolId = message.tool_id || '';

  // Check if approval gate is enabled
  if (!getBashApprovalGate()) {
    return result;
  }

  // Check if command is allowlisted
  if (isAllowlisted(command)) {
    return result;
  }

  // Check if command matches an existing grant (this also auto-revokes 'once' grants)
  if (checkGrant('Bash', command)) {
    return result;
  }

  // Need approval
  return {
    shouldApprove: true,
    command,
    toolId,
  };
}

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

/**
 * Get the number of pending approval requests
 * Useful for testing and debugging
 */
export function getQueueLength(): number {
  return pendingApprovals.size;
}

/**
 * Clear all pending approvals (for testing)
 */
export function clearPendingApprovals(): void {
  pendingApprovals.clear();
}
