/**
 * Approval Gate for Bash Commands (Story 22-3)
 *
 * Main process module that intercepts Bash tool_use messages and
 * requests user approval before execution. Works with ApprovalModal.js
 * in the renderer process via IPC.
 *
 * Flow:
 * 1. Claude emits Bash tool_use message
 * 2. This module intercepts and checks settings
 * 3. If gate enabled and not allowlisted, request approval via IPC
 * 4. Wait for user response (approve/reject/always-allow)
 * 5. Continue execution or inject rejection error
 */

import { getBashApprovalGate, isAllowlisted, addToAllowlist, extractPattern } from './settings-store.js';

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
 * @param alwaysAllow - true if user clicked "Always Allow"
 */
export function resolveApproval(toolId: string, approved: boolean, alwaysAllow = false): void {
  const pending = pendingApprovals.get(toolId);
  if (pending) {
    // If always-allow, add pattern to allowlist
    if (alwaysAllow && approved) {
      const pattern = extractPattern(pending.command);
      addToAllowlist(pattern);
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

  // Need approval
  return {
    shouldApprove: true,
    command,
    toolId,
  };
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
