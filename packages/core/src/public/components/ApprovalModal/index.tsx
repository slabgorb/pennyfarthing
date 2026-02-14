/**
 * ApprovalModal Component
 *
 * Tool permission modal with command preview.
 * Story MSSCI-12713 - ApprovalModal Component
 *
 * Features:
 * - Command preview for different tool types
 * - Keyboard-first interaction (Enter approve, Escape reject)
 * - Red accent styling for destructive actions
 * - "Always allow" checkbox for persistent permissions
 * - Non-blocking overlay (click outside to dismiss)
 * - Accessible with ARIA attributes
 *
 * Uses shadcn Dialog, Checkbox, and Button primitives.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import './ApprovalModal.css';

// ============================================================================
// Constants - Test IDs
// ============================================================================

export const MODAL_TESTID = 'approval-modal';
export const OVERLAY_TESTID = 'approval-modal-overlay';
export const COMMAND_PREVIEW_TESTID = 'command-preview';
export const TOOL_NAME_TESTID = 'tool-name';
export const APPROVE_BUTTON_TESTID = 'approve-button';
export const REJECT_BUTTON_TESTID = 'reject-button';
export const ALWAYS_ALLOW_TESTID = 'always-allow-checkbox';
export const WARNING_TESTID = 'approval-modal-warning';

// ============================================================================
// Constants - Keyboard Shortcuts
// ============================================================================

export const KEYBOARD_SHORTCUTS = {
  APPROVE: 'Enter',
  REJECT: 'Escape',
} as const;

export const INITIAL_FOCUS_ELEMENT = 'approve-button';

// ============================================================================
// Constants - Grant Scopes
// ============================================================================

export const GRANT_SCOPES = {
  ONCE: 'once',
  SESSION: 'session',
  ALWAYS: 'always',
} as const;

export type GrantScope = typeof GRANT_SCOPES[keyof typeof GRANT_SCOPES];

// ============================================================================
// Constants - Severity Styling
// ============================================================================

export const SEVERITY_CLASSNAMES = {
  destructive: 'severity-destructive',
  normal: 'severity-normal',
  safe: 'severity-safe',
} as const;

export type ActionSeverity = keyof typeof SEVERITY_CLASSNAMES;

// ============================================================================
// Constants - Accessibility
// ============================================================================

export const MODAL_ROLE = 'dialog';
export const ARIA_MODAL = true;
export const TITLE_ID = 'approval-modal-title';
export const DESCRIPTION_ID = 'approval-modal-description';
export const MODAL_TITLE = 'Permission Required';

// ============================================================================
// Constants - Labels
// ============================================================================

export const ALWAYS_ALLOW_LABEL = 'Always allow this action';
export const ALWAYS_ALLOW_ARIA_LABEL = 'Check to always allow this type of action without asking';

// ============================================================================
// Constants - Behavior
// ============================================================================

export const IS_NON_BLOCKING = true;
export const COMPONENT_CLASSNAME = 'approval-modal';

// ============================================================================
// Types
// ============================================================================

export interface ToolInput {
  command?: string;
  file_path?: string;
  old_string?: string;
  new_string?: string;
  content?: string;
  url?: string;
  prompt?: string;
  [key: string]: unknown;
}

export interface ApprovalRequest {
  toolId: string;
  toolName: string;
  input: ToolInput;
  reason?: string;
  severity?: ActionSeverity;
  warning?: string;
  agent?: string;
}

export interface ApprovalResponse {
  toolId: string;
  approved: boolean;
  grantScope?: GrantScope;
}

export interface ApprovalModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Tool name (Bash, Edit, Write, WebFetch, etc.) */
  toolName: string;
  /** Tool ID for response */
  toolId: string;
  /** Tool input parameters */
  input: ToolInput;
  /** Called when user approves */
  onApprove: (grantScope: GrantScope) => void;
  /** Called when user rejects */
  onReject: () => void;
  /** Called when user dismisses (clicks overlay) */
  onDismiss?: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Server-provided severity classification (MSSCI-14323) */
  severity?: ActionSeverity;
  /** Server-provided warning text for destructive operations (MSSCI-14323) */
  warning?: string;
  /** Agent name requesting permission (MSSCI-14392) */
  agent?: string;
}

interface UseApprovalModalResult {
  request: ApprovalRequest | null;
  isOpen: boolean;
  show: (request: ApprovalRequest) => void;
  hide: () => void;
  approve: (grantScope: GrantScope) => void;
  reject: () => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format command preview based on tool type.
 */
export function formatCommandPreview(toolName: string, input: ToolInput): string {
  switch (toolName) {
    case 'Bash':
      return input.command ?? '';
    case 'Edit':
      return input.file_path ?? '';
    case 'Write':
      return input.file_path ?? '';
    case 'WebFetch':
      return input.url ?? '';
    default:
      return JSON.stringify(input);
  }
}

/**
 * Get icon identifier for tool type.
 */
export function getToolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    Bash: 'terminal',
    Edit: 'edit',
    Write: 'file-plus',
    WebFetch: 'globe',
    Read: 'file',
    Grep: 'search',
    Glob: 'folder-search',
  };
  return icons[toolName] ?? 'tool';
}

/**
 * Classify action severity based on tool and input.
 */
export function classifyActionSeverity(toolName: string, input: ToolInput): ActionSeverity {
  if (toolName === 'Bash' && input.command) {
    const cmd = input.command;

    // Destructive patterns
    if (
      /rm\s+(-[rf]+\s+)*/.test(cmd) ||
      /git\s+(reset\s+--hard|push\s+--force|clean\s+-[fd])/.test(cmd) ||
      /drop\s+database/i.test(cmd) ||
      /truncate\s+table/i.test(cmd)
    ) {
      return 'destructive';
    }

    // Safe patterns (read-only commands)
    if (
      /^(ls|cat|head|tail|grep|find|pwd|echo|which|type|file|stat|wc|diff)\b/.test(cmd) ||
      /^git\s+(status|log|diff|show|branch|remote)\b/.test(cmd)
    ) {
      return 'safe';
    }
  }

  return 'normal';
}

/**
 * Get grant scope based on checkbox state.
 */
export function getGrantScope(alwaysAllow: boolean): GrantScope {
  return alwaysAllow ? GRANT_SCOPES.ALWAYS : GRANT_SCOPES.ONCE;
}

/**
 * Create approval response object.
 */
export function createApprovalResponse(
  toolId: string,
  approved: boolean,
  grantScope?: GrantScope
): ApprovalResponse {
  const response: ApprovalResponse = { toolId, approved };
  if (approved && grantScope) {
    response.grantScope = grantScope;
  }
  return response;
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle keyboard events for modal.
 */
export function handleKeyDown(
  event: KeyboardEvent,
  onApprove: () => void,
  onReject: () => void
): void {
  if (event.key === KEYBOARD_SHORTCUTS.APPROVE) {
    event.preventDefault();
    onApprove();
  } else if (event.key === KEYBOARD_SHORTCUTS.REJECT) {
    event.preventDefault();
    onReject();
  }
}

/**
 * Handle overlay click for non-blocking dismiss.
 */
export function handleOverlayClick(
  event: React.MouseEvent,
  onDismiss: () => void
): void {
  // Only dismiss if clicking directly on the overlay, not its children
  if (event.target === event.currentTarget) {
    onDismiss();
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for managing focus trap within modal.
 * Note: Kept for backwards compatibility but shadcn Dialog handles focus trapping
 * automatically via Radix UI primitives.
 */
export function useFocusTrap(isOpen: boolean, modalRef: React.RefObject<HTMLDivElement>): void {
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element (approve button)
    firstElement?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen, modalRef]);
}

/**
 * Hook for managing approval modal state.
 */
export function useApprovalModal(): UseApprovalModalResult {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const show = useCallback((req: ApprovalRequest) => {
    setRequest(req);
    setIsOpen(true);
  }, []);

  const hide = useCallback(() => {
    setIsOpen(false);
    setRequest(null);
  }, []);

  const approve = useCallback((grantScope: GrantScope) => {
    hide();
  }, [hide]);

  const reject = useCallback(() => {
    hide();
  }, [hide]);

  return { request, isOpen, show, hide, approve, reject };
}

// ============================================================================
// WebSocket Functions (Phase 1 Migration - MSSCI-12860)
// ============================================================================

/** WebSocket message format from /ws/hooks */
interface HookRequestMessage {
  type: 'hook-request';
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  severity?: 'safe' | 'normal' | 'destructive';
  warning?: string;
  agent?: string;
  context?: {
    percentage: number;
    isHigh: boolean;
    isCritical: boolean;
  };
}

/** WebSocket response format to /ws/hooks */
interface HookResponseMessage {
  type: 'hook-response';
  toolId: string;
  approved: boolean;
  data?: {
    grantScope?: GrantScope;
  };
}

/** Global WebSocket instance for permission requests */
let hooksWs: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

/**
 * Get or create WebSocket connection to /ws/hooks.
 */
function getHooksWebSocket(): WebSocket | null {
  if (hooksWs && hooksWs.readyState === WebSocket.OPEN) {
    return hooksWs;
  }
  return null;
}

/**
 * Subscribe to permission requests via WebSocket.
 */
export function subscribeToPermissionRequests(
  callback: (request: ApprovalRequest) => void
): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/hooks`;

  const connect = () => {
    try {
      hooksWs = new WebSocket(wsUrl);

      hooksWs.onopen = () => {
        console.debug('[ApprovalModal] WebSocket connected to /ws/hooks');
      };

      hooksWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as HookRequestMessage;
          if (msg.type === 'hook-request') {
            callback({
              toolId: msg.toolId,
              toolName: msg.toolName,
              input: msg.input as ToolInput,
              severity: msg.severity as ActionSeverity | undefined,
              warning: msg.warning,
              agent: msg.agent,
            });
          }
        } catch (err) {
          console.error('[ApprovalModal] Failed to parse message:', err);
        }
      };

      hooksWs.onclose = () => {
        console.debug('[ApprovalModal] WebSocket closed, reconnecting...');
        reconnectTimeout = setTimeout(connect, 2000);
      };

      hooksWs.onerror = (err) => {
        console.error('[ApprovalModal] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[ApprovalModal] WebSocket init failed:', err);
    }
  };

  connect();

  return () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (hooksWs) {
      hooksWs.close();
      hooksWs = null;
    }
  };
}

/**
 * Send permission response via WebSocket.
 */
export function sendPermissionResponse(response: ApprovalResponse): void {
  const ws = getHooksWebSocket();
  if (ws) {
    const msg: HookResponseMessage = {
      type: 'hook-response',
      toolId: response.toolId,
      approved: response.approved,
      data: response.grantScope ? { grantScope: response.grantScope } : undefined,
    };
    ws.send(JSON.stringify(msg));
  } else {
    console.warn('[ApprovalModal] WebSocket not connected, cannot send response');
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * ApprovalModal Component
 *
 * Modal dialog for tool permission approval.
 * Uses shadcn Dialog, Checkbox, and Button primitives.
 */
export default function ApprovalModal({
  isOpen,
  toolName,
  toolId,
  input,
  onApprove,
  onReject,
  onDismiss,
  className = '',
  severity: serverSeverity,
  warning,
  agent,
}: ApprovalModalProps): React.ReactElement {
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  // Keyboard handler for Enter to approve
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === KEYBOARD_SHORTCUTS.APPROVE) {
        e.preventDefault();
        onApprove(getGrantScope(alwaysAllow));
      }
      // Note: Escape is handled natively by Radix Dialog (triggers onOpenChange)
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, alwaysAllow, onApprove]);

  const severity = serverSeverity ?? classifyActionSeverity(toolName, input);
  const severityClass = SEVERITY_CLASSNAMES[severity];
  const preview = formatCommandPreview(toolName, input);
  const icon = getToolIcon(toolName);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Dialog is closing (Escape key or overlay click)
      if (onDismiss) {
        onDismiss();
      } else {
        onReject();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid={MODAL_TESTID}
        className={cn('max-w-[480px]', severityClass, className)}
        onPointerDownOutside={(e) => {
          // Non-blocking overlay: allow dismiss on outside click
          if (!onDismiss) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle
            className={cn(
              severity === 'destructive' && 'text-destructive'
            )}
          >
            {MODAL_TITLE}
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                <span className="approval-modal__icon" data-icon={icon} />
                {agent && <span data-testid="agent-name" className="font-medium">{agent}</span>}
                {agent && <span className="text-muted-foreground/50">/</span>}
                <span data-testid={TOOL_NAME_TESTID}>{toolName}</span>
              </div>

              <pre
                className={cn(
                  'approval-modal__preview',
                  severity === 'safe' && 'border-l-[3px] border-l-green-500',
                  severity === 'normal' && 'border-l-[3px] border-l-primary',
                  severity === 'destructive' && 'border-l-[3px] border-l-destructive bg-destructive/10'
                )}
                data-testid={COMMAND_PREVIEW_TESTID}
              >
                {preview}
              </pre>
            </div>
          </DialogDescription>
        </DialogHeader>

        {warning && (
          <div
            data-testid={WARNING_TESTID}
            className="text-sm text-destructive font-medium"
          >
            {warning}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            id="always-allow"
            data-testid={ALWAYS_ALLOW_TESTID}
            checked={alwaysAllow}
            onCheckedChange={(checked) => setAlwaysAllow(checked === true)}
            aria-label={ALWAYS_ALLOW_ARIA_LABEL}
          />
          <label
            htmlFor="always-allow"
            className="cursor-pointer select-none hover:text-foreground transition-colors"
          >
            {ALWAYS_ALLOW_LABEL}
          </label>
        </div>

        <DialogFooter>
          <Button
            data-testid={REJECT_BUTTON_TESTID}
            variant="destructive"
            onClick={onReject}
          >
            Reject
          </Button>
          <Button
            data-testid={APPROVE_BUTTON_TESTID}
            variant="default"
            onClick={() => onApprove(getGrantScope(alwaysAllow))}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
