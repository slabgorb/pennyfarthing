/**
 * Dangerous Path Detection (Story 22-4)
 *
 * Main process module that detects when Claude attempts to modify sensitive paths
 * (secrets, git internals, dependencies, system paths) and requests user approval.
 *
 * Categories:
 * - secrets: .env files, SSH keys, AWS credentials, config files with secrets
 * - git: .git/ internal directories (not .gitignore, .gitattributes)
 * - dependencies: node_modules/, lockfiles
 * - system: /etc/, /usr/, /var/, /System/Library/, ~/.config/ (cloud CLIs)
 */
/**
 * Dangerous path patterns organized by category
 * Each pattern is tested against normalized paths (lowercase, forward slashes)
 */
export declare const DANGEROUS_PATH_PATTERNS: RegExp[];
/**
 * Normalize a path for consistent matching
 * - Converts backslashes to forward slashes (Windows paths)
 * - Removes ./ prefix
 * - Handles case-insensitive matching
 */
export declare function normalizePath(path: string): string;
/**
 * Check if a path is dangerous
 * Tests against all dangerous path patterns
 */
export declare function isDangerousPath(path: string): boolean;
/**
 * Get the category of a dangerous path
 * Returns null if path is not dangerous
 */
export declare function getPathCategory(path: string): 'secrets' | 'git' | 'dependencies' | 'system' | null;
/**
 * Extract target paths from bash commands with redirects
 * Handles:
 * - > and >> redirects
 * - tee and tee -a commands
 * - Paths with or without quotes
 */
export declare function extractBashTargetPaths(command: string): string[];
/**
 * Intercept a tool_use message and check for dangerous paths
 * Returns whether approval is needed, the path, category, and tool ID
 */
export declare function interceptDangerousPath(message: {
    type: string;
    tool_name?: string;
    tool_id?: string;
    input?: {
        file_path?: string;
        command?: string;
    };
}): {
    shouldApprove: boolean;
    path: string;
    category: string;
    toolId: string;
};
/**
 * Request approval for a dangerous path operation
 * Returns a promise that resolves when the user approves or rejects
 */
export declare function requestPathApproval(path: string, toolId: string, category: string): Promise<boolean>;
/**
 * Resolve a pending path approval request
 * Called by IPC handler when user responds to approval modal
 */
export declare function resolvePathApproval(toolId: string, approved: boolean, alwaysAllow?: boolean): void;
/**
 * Create a tool_result error message for rejected paths
 */
export declare function createPathRejectionError(toolId: string, path: string): {
    type: 'tool_result';
    tool_id: string;
    output: string;
    is_error: boolean;
};
/**
 * Get number of pending path approval requests
 * Useful for testing and debugging
 */
export declare function getPathQueueLength(): number;
/**
 * Clear all pending approvals (for testing)
 */
export declare function clearPendingPathApprovals(): void;
//# sourceMappingURL=dangerous-path.d.ts.map