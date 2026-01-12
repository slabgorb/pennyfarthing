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

import {
  getDangerousPathGate,
  isPathAllowlisted,
  addToPathAllowlist,
} from './settings-store.js';

/**
 * Dangerous path patterns organized by category
 * Each pattern is tested against normalized paths (lowercase, forward slashes)
 */
export const DANGEROUS_PATH_PATTERNS: RegExp[] = [
  // Secrets category
  /^\.env($|\.)/i,                           // .env, .env.local, .env.production, etc.
  /\/\.env($|\.)/i,                          // /path/to/.env
  /~\/\.ssh\//i,                             // ~/.ssh/ (SSH keys, config)
  /~\/\.aws\//i,                             // ~/.aws/ (AWS credentials)
  /~\/\.config\/gh\//i,                      // GitHub CLI config
  /~\/\.config\/gcloud\//i,                  // Google Cloud CLI config

  // Git category
  /^\.git\//i,                               // .git/ (NOT .gitignore, .gitattributes)
  /\/\.git\//i,                              // /path/to/.git/

  // Dependencies category
  /^node_modules\//i,                        // node_modules/
  /\/node_modules\//i,                       // /path/to/node_modules/
  /^package-lock\.json$/i,                   // package-lock.json
  /^pnpm-lock\.yaml$/i,                      // pnpm-lock.yaml
  /^yarn\.lock$/i,                           // yarn.lock
  /\/package-lock\.json$/i,
  /\/pnpm-lock\.yaml$/i,
  /\/yarn\.lock$/i,

  // System category
  /^\/etc\//i,                               // /etc/passwd, /etc/hosts
  /^\/usr\//i,                               // /usr/local/bin/, /usr/bin/
  /^\/var\//i,                               // /var/log/
  /^\/System\/Library\//i,                   // macOS system
];

/**
 * Category-specific patterns for classification
 */
const CATEGORY_PATTERNS: Record<'secrets' | 'git' | 'dependencies' | 'system', RegExp[]> = {
  secrets: [
    /^\.env($|\.)/i,
    /\/\.env($|\.)/i,
    /~\/\.ssh\//i,
    /~\/\.aws\//i,
    /~\/\.config\/gh\//i,
    /~\/\.config\/gcloud\//i,
  ],
  git: [
    /^\.git\//i,
    /\/\.git\//i,
  ],
  dependencies: [
    /^node_modules\//i,
    /\/node_modules\//i,
    /^package-lock\.json$/i,
    /^pnpm-lock\.yaml$/i,
    /^yarn\.lock$/i,
    /\/package-lock\.json$/i,
    /\/pnpm-lock\.yaml$/i,
    /\/yarn\.lock$/i,
  ],
  system: [
    /^\/etc\//i,
    /^\/usr\//i,
    /^\/var\//i,
    /^\/System\/Library\//i,
  ],
};

/**
 * Pending approval requests, keyed by tool_id
 * Each entry holds the resolve function and path info
 */
const pendingPathApprovals: Map<string, {
  resolve: (approved: boolean) => void;
  path: string;
  category: string;
}> = new Map();

/**
 * Normalize a path for consistent matching
 * - Converts backslashes to forward slashes (Windows paths)
 * - Removes ./ prefix
 * - Handles case-insensitive matching
 */
export function normalizePath(path: string): string {
  if (!path) return '';

  // Convert backslashes to forward slashes (Windows)
  let normalized = path.replace(/\\/g, '/');

  // Remove leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

/**
 * Check if a path is dangerous
 * Tests against all dangerous path patterns
 */
export function isDangerousPath(path: string): boolean {
  if (!path) return false;

  const normalized = normalizePath(path);

  // Check against all patterns (case-insensitive via pattern flags)
  return DANGEROUS_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Get the category of a dangerous path
 * Returns null if path is not dangerous
 */
export function getPathCategory(path: string): 'secrets' | 'git' | 'dependencies' | 'system' | null {
  if (!path) return null;

  const normalized = normalizePath(path);

  // Check each category's patterns
  for (const category of ['secrets', 'git', 'dependencies', 'system'] as const) {
    const patterns = CATEGORY_PATTERNS[category];
    if (patterns.some(pattern => pattern.test(normalized))) {
      return category;
    }
  }

  return null;
}

/**
 * Extract target paths from bash commands with redirects
 * Handles:
 * - > and >> redirects
 * - tee and tee -a commands
 * - Paths with or without quotes
 */
export function extractBashTargetPaths(command: string): string[] {
  const paths: string[] = [];

  if (!command) return paths;

  // Match redirect patterns: > path, >> path (with optional quotes)
  const redirectPattern = />>?\s*"?([^"\s&|;]+)"?/g;
  let match;
  while ((match = redirectPattern.exec(command)) !== null) {
    paths.push(match[1]);
  }

  // Match tee commands: tee [-a] path
  // Handles: tee file, tee -a file, sudo tee file
  const teePattern = /\btee\s+(?:-a\s+)?([^\s&|;]+)/g;
  while ((match = teePattern.exec(command)) !== null) {
    // Skip if it's a flag
    if (!match[1].startsWith('-')) {
      paths.push(match[1]);
    }
  }

  // Handle quoted paths with spaces in redirects
  const quotedRedirectPattern = />>?\s*"([^"]+)"/g;
  while ((match = quotedRedirectPattern.exec(command)) !== null) {
    if (!paths.includes(match[1])) {
      paths.push(match[1]);
    }
  }

  return paths;
}

/**
 * Intercept a tool_use message and check for dangerous paths
 * Returns whether approval is needed, the path, category, and tool ID
 */
export function interceptDangerousPath(message: {
  type: string;
  tool_name?: string;
  tool_id?: string;
  input?: { file_path?: string; command?: string };
}): { shouldApprove: boolean; path: string; category: string; toolId: string } {
  const result = { shouldApprove: false, path: '', category: '', toolId: '' };

  // Only intercept tool_use messages
  if (message.type !== 'tool_use') {
    return result;
  }

  // Check if gate is enabled
  if (!getDangerousPathGate()) {
    return result;
  }

  const toolName = message.tool_name || '';
  const toolId = message.tool_id || '';

  // Only check Write, Edit, and Bash tools
  // Read is excluded - we only care about modifications
  if (!['Write', 'Edit', 'Bash'].includes(toolName)) {
    return result;
  }

  let dangerousPath = '';
  let category = '';

  if (toolName === 'Write' || toolName === 'Edit') {
    // Check file_path for Write/Edit tools
    const filePath = message.input?.file_path || '';
    if (filePath && isDangerousPath(filePath)) {
      dangerousPath = filePath;
      category = getPathCategory(filePath) || '';
    }
  } else if (toolName === 'Bash') {
    // Extract redirect targets from Bash commands
    const command = message.input?.command || '';
    const targetPaths = extractBashTargetPaths(command);

    // Find first dangerous path in redirects
    for (const targetPath of targetPaths) {
      if (isDangerousPath(targetPath)) {
        dangerousPath = targetPath;
        category = getPathCategory(targetPath) || '';
        break;
      }
    }
  }

  // If no dangerous path found, no approval needed
  if (!dangerousPath) {
    return result;
  }

  // Check allowlist
  if (isPathAllowlisted(dangerousPath)) {
    return result;
  }

  // Approval required
  return {
    shouldApprove: true,
    path: dangerousPath,
    category,
    toolId,
  };
}

/**
 * Request approval for a dangerous path operation
 * Returns a promise that resolves when the user approves or rejects
 */
export function requestPathApproval(path: string, toolId: string, category: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingPathApprovals.set(toolId, { resolve, path, category });
  });
}

/**
 * Resolve a pending path approval request
 * Called by IPC handler when user responds to approval modal
 */
export function resolvePathApproval(toolId: string, approved: boolean, alwaysAllow = false): void {
  const pending = pendingPathApprovals.get(toolId);
  if (pending) {
    // If always-allow, add path to allowlist
    if (alwaysAllow && approved) {
      addToPathAllowlist(pending.path);
    }

    pending.resolve(approved);
    pendingPathApprovals.delete(toolId);
  }
}

/**
 * Create a tool_result error message for rejected paths
 */
export function createPathRejectionError(toolId: string, path: string): {
  type: 'tool_result';
  tool_id: string;
  output: string;
  is_error: boolean;
} {
  return {
    type: 'tool_result',
    tool_id: toolId,
    output: `Operation rejected by user. Access to sensitive path "${path}" was denied.`,
    is_error: true,
  };
}

/**
 * Get number of pending path approval requests
 * Useful for testing and debugging
 */
export function getPathQueueLength(): number {
  return pendingPathApprovals.size;
}

/**
 * Clear all pending approvals (for testing)
 */
export function clearPendingPathApprovals(): void {
  pendingPathApprovals.clear();
}
