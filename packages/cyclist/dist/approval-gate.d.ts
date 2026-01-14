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
import { type GrantTypeValue } from './settings-store.js';
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
export declare function requestApproval(command: string, toolId: string): Promise<boolean>;
/**
 * Resolve a pending approval request
 * Called by IPC handler when user responds to approval modal
 *
 * @param toolId - The tool_use_id to resolve
 * @param approved - true if approved, false if rejected
 * @param grantScope - Grant scope: 'once', 'session', or 'always'
 */
export declare function resolveApproval(toolId: string, approved: boolean, grantScope?: GrantTypeValue): void;
/**
 * Create a tool_result error message for rejected commands
 *
 * @param toolId - The tool_use_id that was rejected
 * @returns SDKToolResultError message to inject into the conversation
 */
export declare function createRejectionError(toolId: string): SDKToolResultError;
/**
 * Check if a tool_use message is a Bash command that needs approval
 *
 * @param message - The SDK message to check
 * @returns Object with shouldApprove boolean, command string, and toolId
 */
export declare function interceptBashToolUse(message: {
    type: string;
    tool_name?: string;
    tool_id?: string;
    input?: {
        command?: string;
    };
}): {
    shouldApprove: boolean;
    command: string;
    toolId: string;
};
/**
 * Get the number of pending approval requests
 * Useful for testing and debugging
 */
export declare function getQueueLength(): number;
/**
 * Clear all pending approvals (for testing)
 */
export declare function clearPendingApprovals(): void;
//# sourceMappingURL=approval-gate.d.ts.map