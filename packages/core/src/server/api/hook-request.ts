/**
 * Hook Request API Router
 *
 * Handles approval requests from Claude Code hooks via WheelHub.
 * Per ADR-0004: All communication converges through WheelHub.
 *
 * Flow:
 * 1. Hook script sends POST /api/hook-request with tool data
 * 2. WheelHub checks allowlist/grants for auto-approval
 * 3. If manual approval needed, broadcasts to WebSocket clients
 * 4. Client shows approval modal, user decides
 * 5. Client sends decision back via WebSocket
 * 6. WheelHub returns HTTP response to hook
 *
 * Story: MSSCI-12409 - Hook consistency and WheelHub consolidation
 */

import { Router, Request, Response } from 'express';
import { WebSocket } from 'ws';
import { checkGrant, isAllowlisted, addGrant, type GrantTypeValue } from '../settings-store.js';
import { isDangerousPath, getPathCategory, extractBashTargetPaths } from '../dangerous-path.js';

// =============================================================================
// Types
// =============================================================================

interface HookRequest {
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
  sessionId?: string;
  agent?: string;
  context?: {
    percentage: number;
    isHigh: boolean;
    isCritical: boolean;
  };
}

interface HookResponse {
  decision: 'allow' | 'deny' | 'ask';
  reason: string;
  data?: Record<string, unknown>;
}

interface PendingApproval {
  resolve: (response: HookResponse) => void;
  toolName: string;
  input: Record<string, unknown>;
  agent?: string;
  timestamp: number;
}

// =============================================================================
// State
// =============================================================================

// Pending approval requests, keyed by toolId
const pendingApprovals = new Map<string, PendingApproval>();

// WebSocket clients for hook notifications
const hookClients = new Set<WebSocket>();

// Approval timeout (2 minutes)
const APPROVAL_TIMEOUT_MS = 120000;

// =============================================================================
// Scope Extraction (MSSCI-14321)
// =============================================================================

/**
 * Extract the scope identifier from tool input for grant matching.
 * Modeled after getToolScope() in approval-gate.ts.
 */
function extractToolScope(toolName: string, input: Record<string, unknown>): string {
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

// =============================================================================
// Severity Classification (MSSCI-14323)
// =============================================================================

export type HookSeverity = 'safe' | 'normal' | 'destructive';

interface SeverityResult {
  severity: HookSeverity;
  warning?: string;
}

const SAFE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch']);

const DESTRUCTIVE_BASH_PATTERNS = [
  /rm\s+(-[rf]+\s+)*/,
  /git\s+(reset\s+--hard|push\s+--force|clean\s+-[fd])/,
  /drop\s+database/i,
  /truncate\s+table/i,
];

const SAFE_BASH_PATTERNS = [
  /^(ls|cat|head|tail|grep|find|pwd|echo|which|type|file|stat|wc|diff)\b/,
  /^git\s+(status|log|diff|show|branch|remote)\b/,
];

const CATEGORY_WARNINGS: Record<string, string> = {
  secrets: 'Modifying sensitive secrets/credentials file',
  git: 'Modifying git internals',
  dependencies: 'Modifying dependency files',
  system: 'Modifying system files',
};

/**
 * Classify the severity of a hook request server-side.
 * Combines tool-name classification with dangerous-path detection.
 */
export function classifyHookSeverity(
  toolName: string,
  input: Record<string, unknown>,
): SeverityResult {
  // Safe tools are always safe
  if (SAFE_TOOLS.has(toolName)) {
    return { severity: 'safe' };
  }

  // Check dangerous paths for Write/Edit
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (input.file_path as string) || '';
    if (filePath && isDangerousPath(filePath)) {
      const category = getPathCategory(filePath);
      return {
        severity: 'destructive',
        warning: category ? CATEGORY_WARNINGS[category] : 'Modifying sensitive path',
      };
    }
    return { severity: 'normal' };
  }

  // Bash command classification
  if (toolName === 'Bash') {
    const command = (input.command as string) || '';

    // Check for destructive bash patterns
    if (DESTRUCTIVE_BASH_PATTERNS.some(p => p.test(command))) {
      return { severity: 'destructive', warning: 'Destructive command detected' };
    }

    // Check for bash redirecting to dangerous paths
    const targetPaths = extractBashTargetPaths(command);
    for (const targetPath of targetPaths) {
      if (isDangerousPath(targetPath)) {
        const category = getPathCategory(targetPath);
        return {
          severity: 'destructive',
          warning: category ? CATEGORY_WARNINGS[category] : 'Redirecting to sensitive path',
        };
      }
    }

    // Check for safe bash patterns
    if (SAFE_BASH_PATTERNS.some(p => p.test(command))) {
      return { severity: 'safe' };
    }

    return { severity: 'normal' };
  }

  // Default: normal
  return { severity: 'normal' };
}

// =============================================================================
// WebSocket Client Management
// =============================================================================

export function getHookClients(): Set<WebSocket> {
  return hookClients;
}

export function addHookClient(ws: WebSocket): void {
  hookClients.add(ws);
  ws.on('close', () => hookClients.delete(ws));
}

/**
 * Broadcast hook request to all connected clients
 */
function broadcastHookRequest(data: {
  type: 'hook-request';
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  severity: HookSeverity;
  warning?: string;
  agent?: string;
  context?: {
    percentage: number;
    isHigh: boolean;
    isCritical: boolean;
  };
}): void {
  const message = JSON.stringify(data);
  for (const client of hookClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// =============================================================================
// Approval Resolution
// =============================================================================

/**
 * Resolve a pending approval from client response
 */
export function resolveApproval(
  toolId: string,
  approved: boolean,
  data?: Record<string, unknown>,
): boolean {
  const pending = pendingApprovals.get(toolId);
  if (!pending) {
    return false;
  }

  pending.resolve({
    decision: approved ? 'allow' : 'deny',
    reason: approved ? 'Approved by user' : 'Rejected by user',
    data,
  });

  pendingApprovals.delete(toolId);
  return true;
}

/**
 * Handle WebSocket message from client
 */
export function handleHookWebSocketMessage(ws: WebSocket, message: string): void {
  try {
    const data = JSON.parse(message);

    if (data.type === 'hook-response') {
      // Store grant if user approved with a grantScope (MSSCI-14321 AC8)
      if (data.approved && data.data?.grantScope) {
        const pending = pendingApprovals.get(data.toolId);
        const scope = pending
          ? extractToolScope(pending.toolName, pending.input)
          : '';
        const grant: Parameters<typeof addGrant>[0] = {
          tool: pending?.toolName || '',
          scope,
          grant_type: data.data.grantScope as GrantTypeValue,
          granted_at: new Date().toISOString(),
        };
        // Include agent from the original request if present
        if (pending?.agent) {
          grant.agent = pending.agent;
        }
        addGrant(grant);
      }

      resolveApproval(data.toolId, data.approved, data.data);
    }
  } catch (error) {
    console.error('[HookRequest] Failed to parse WebSocket message:', error);
  }
}

// =============================================================================
// Request Handler
// =============================================================================

async function handleHookRequest(req: Request, res: Response): Promise<void> {
  const { toolName, toolId, input, sessionId: _sessionId, agent, context } = req.body as HookRequest;

  if (!toolName || !toolId) {
    res.status(400).json({ error: 'Missing required fields: toolName, toolId' });
    return;
  }

  // Check for auto-approval via grants (all tool types)
  const scope = extractToolScope(toolName, input || {});
  if (checkGrant(toolName, scope, agent)) {
    res.json({
      decision: 'allow',
      reason: 'Granted by permission grant',
    });
    return;
  }

  // Check Bash allowlist for backward compatibility
  if (toolName === 'Bash' && isAllowlisted(scope)) {
    res.json({
      decision: 'allow',
      reason: 'Command matches allowlist pattern',
    });
    return;
  }

  // No clients connected - fall through to Claude Code's built-in approval
  if (hookClients.size === 0) {
    res.json({
      decision: 'ask',
      reason: 'No Cyclist clients connected, deferring to Claude Code',
    });
    return;
  }

  // Create pending approval with timeout
  const approvalPromise = new Promise<HookResponse>((resolve) => {
    pendingApprovals.set(toolId, {
      resolve,
      toolName,
      input: input || {},
      agent,
      timestamp: Date.now(),
    });

    // Set timeout
    setTimeout(() => {
      if (pendingApprovals.has(toolId)) {
        pendingApprovals.delete(toolId);
        resolve({
          decision: 'ask',
          reason: 'Approval timeout, deferring to Claude Code',
        });
      }
    }, APPROVAL_TIMEOUT_MS);
  });

  // Classify severity before broadcast (MSSCI-14323)
  const { severity, warning } = classifyHookSeverity(toolName, input || {});

  // Broadcast to clients (include context, severity, and agent for UI display)
  broadcastHookRequest({
    type: 'hook-request',
    toolId,
    toolName,
    input: input || {},
    severity,
    warning,
    agent,
    context,
  });

  // Wait for response
  const response = await approvalPromise;
  res.json(response);
}

// =============================================================================
// Router
// =============================================================================

export function createHookRequestRouter(): Router {
  const router = Router();

  // POST /api/hook-request - Handle hook approval requests
  router.post('/', handleHookRequest);

  // GET /api/hook-request/pending - List pending approvals (for debugging)
  router.get('/pending', (_req: Request, res: Response) => {
    const pending = Array.from(pendingApprovals.entries()).map(([id, p]) => ({
      toolId: id,
      toolName: p.toolName,
      timestamp: p.timestamp,
      age: Date.now() - p.timestamp,
    }));
    res.json({ pending });
  });

  return router;
}
