/**
 * Dangerous Path Detection (Story 22-4)
 * Extracted from packages/cyclist/src/dangerous-path.ts (Story 98-17).
 *
 * Detects when Claude attempts to modify sensitive paths and classifies severity.
 */

import {
  getDangerousPathGate,
  isPathAllowlisted,
  addToPathAllowlist,
} from './settings-store.js';

export const DANGEROUS_PATH_PATTERNS: RegExp[] = [
  /^\.env($|\.)/i,
  /\/\.env($|\.)/i,
  /~\/\.ssh\//i,
  /~\/\.aws\//i,
  /~\/\.config\/gh\//i,
  /~\/\.config\/gcloud\//i,
  /^\.git\//i,
  /\/\.git\//i,
  /^node_modules\//i,
  /\/node_modules\//i,
  /^package-lock\.json$/i,
  /^pnpm-lock\.yaml$/i,
  /^yarn\.lock$/i,
  /\/package-lock\.json$/i,
  /\/pnpm-lock\.yaml$/i,
  /\/yarn\.lock$/i,
  /^\/etc\//i,
  /^\/usr\//i,
  /^\/var\//i,
  /^\/System\/Library\//i,
];

const CATEGORY_PATTERNS: Record<'secrets' | 'git' | 'dependencies' | 'system', RegExp[]> = {
  secrets: [
    /^\.env($|\.)/i, /\/\.env($|\.)/i,
    /~\/\.ssh\//i, /~\/\.aws\//i,
    /~\/\.config\/gh\//i, /~\/\.config\/gcloud\//i,
  ],
  git: [/^\.git\//i, /\/\.git\//i],
  dependencies: [
    /^node_modules\//i, /\/node_modules\//i,
    /^package-lock\.json$/i, /^pnpm-lock\.yaml$/i, /^yarn\.lock$/i,
    /\/package-lock\.json$/i, /\/pnpm-lock\.yaml$/i, /\/yarn\.lock$/i,
  ],
  system: [/^\/etc\//i, /^\/usr\//i, /^\/var\//i, /^\/System\/Library\//i],
};

const pendingPathApprovals: Map<string, {
  resolve: (approved: boolean) => void;
  path: string;
  category: string;
}> = new Map();

export function normalizePath(path: string): string {
  if (!path) return '';
  let normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

export function isDangerousPath(path: string): boolean {
  if (!path) return false;
  const normalized = normalizePath(path);
  return DANGEROUS_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

export function getPathCategory(path: string): 'secrets' | 'git' | 'dependencies' | 'system' | null {
  if (!path) return null;
  const normalized = normalizePath(path);
  for (const category of ['secrets', 'git', 'dependencies', 'system'] as const) {
    if (CATEGORY_PATTERNS[category].some(pattern => pattern.test(normalized))) {
      return category;
    }
  }
  return null;
}

export function extractBashTargetPaths(command: string): string[] {
  const paths: string[] = [];
  if (!command) return paths;

  const redirectPattern = />>?\s*"?([^"\s&|;]+)"?/g;
  let match;
  while ((match = redirectPattern.exec(command)) !== null) {
    paths.push(match[1]);
  }

  const teePattern = /\btee\s+(?:-a\s+)?([^\s&|;]+)/g;
  while ((match = teePattern.exec(command)) !== null) {
    if (!match[1].startsWith('-')) {
      paths.push(match[1]);
    }
  }

  const quotedRedirectPattern = />>?\s*"([^"]+)"/g;
  while ((match = quotedRedirectPattern.exec(command)) !== null) {
    if (!paths.includes(match[1])) {
      paths.push(match[1]);
    }
  }

  return paths;
}

export function interceptDangerousPath(message: {
  type: string;
  tool_name?: string;
  tool_id?: string;
  input?: { file_path?: string; command?: string };
}): { shouldApprove: boolean; path: string; category: string; toolId: string } {
  const result = { shouldApprove: false, path: '', category: '', toolId: '' };

  if (message.type !== 'tool_use') return result;
  if (!getDangerousPathGate()) return result;

  const toolName = message.tool_name || '';
  const toolId = message.tool_id || '';

  if (!['Write', 'Edit', 'Bash'].includes(toolName)) return result;

  let dangerousPath = '';
  let category = '';

  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = message.input?.file_path || '';
    if (filePath && isDangerousPath(filePath)) {
      dangerousPath = filePath;
      category = getPathCategory(filePath) || '';
    }
  } else if (toolName === 'Bash') {
    const command = message.input?.command || '';
    const targetPaths = extractBashTargetPaths(command);
    for (const targetPath of targetPaths) {
      if (isDangerousPath(targetPath)) {
        dangerousPath = targetPath;
        category = getPathCategory(targetPath) || '';
        break;
      }
    }
  }

  if (!dangerousPath) return result;
  if (isPathAllowlisted(dangerousPath)) return result;

  return { shouldApprove: true, path: dangerousPath, category, toolId };
}

export function requestPathApproval(path: string, toolId: string, category: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingPathApprovals.set(toolId, { resolve, path, category });
  });
}

export function resolvePathApproval(toolId: string, approved: boolean, alwaysAllow = false): void {
  const pending = pendingPathApprovals.get(toolId);
  if (pending) {
    if (alwaysAllow && approved) {
      addToPathAllowlist(pending.path);
    }
    pending.resolve(approved);
    pendingPathApprovals.delete(toolId);
  }
}

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

export function getPathQueueLength(): number {
  return pendingPathApprovals.size;
}

export function clearPendingPathApprovals(): void {
  pendingPathApprovals.clear();
}
