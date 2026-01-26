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

// =============================================================================
// Types
// =============================================================================

interface HookRequest {
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
  sessionId?: string;
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
// Allowlist and Grants (imported from settings-store when available)
// =============================================================================

// Temporary allowlist for common safe commands
const SAFE_COMMAND_PATTERNS = [
  /^ls\b/,
  /^pwd$/,
  /^echo\b/,
  /^cat\b.*\.(md|txt|json|yaml|yml|ts|js|py|sh)$/,
  /^git status/,
  /^git diff/,
  /^git log/,
  /^git branch/,
  /^npm run (build|test|lint)/,
  /^node --version/,
  /^npm --version/,
];

function isCommandAllowlisted(command: string): boolean {
  return SAFE_COMMAND_PATTERNS.some(pattern => pattern.test(command.trim()));
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
  const { toolName, toolId, input, sessionId: _sessionId, context } = req.body as HookRequest;

  if (!toolName || !toolId) {
    res.status(400).json({ error: 'Missing required fields: toolName, toolId' });
    return;
  }

  // Check for auto-approval
  if (toolName === 'Bash') {
    const command = (input?.command as string) || '';
    if (isCommandAllowlisted(command)) {
      res.json({
        decision: 'allow',
        reason: 'Command matches safe pattern allowlist',
      });
      return;
    }
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

  // Broadcast to clients (include context for UI display)
  broadcastHookRequest({
    type: 'hook-request',
    toolId,
    toolName,
    input: input || {},
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
