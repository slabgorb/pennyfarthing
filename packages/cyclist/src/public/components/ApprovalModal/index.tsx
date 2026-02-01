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
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
// IPC Functions
// ============================================================================

/**
 * Subscribe to permission requests from IPC.
 */
export function subscribeToPermissionRequests(
  callback: (request: ApprovalRequest) => void
): () => void {
  const api = window.electronAPI;
  if (api?.permission?.onRequest) {
    return api.permission.onRequest((_: unknown, req: ApprovalRequest) => {
      callback(req);
    });
  }
  return () => {};
}

/**
 * Send permission response via IPC.
 */
export function sendPermissionResponse(response: ApprovalResponse): void {
  const api = window.electronAPI;
  if (api?.permission?.sendResponse) {
    api.permission.sendResponse(response);
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * ApprovalModal Component
 *
 * Modal dialog for tool permission approval.
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
}: ApprovalModalProps): React.ReactElement | null {
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useFocusTrap(isOpen, modalRef);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      handleKeyDown(
        e,
        () => onApprove(getGrantScope(alwaysAllow)),
        onReject
      );
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, alwaysAllow, onApprove, onReject]);

  if (!isOpen) {
    return null;
  }

  const severity = classifyActionSeverity(toolName, input);
  const severityClass = SEVERITY_CLASSNAMES[severity];
  const preview = formatCommandPreview(toolName, input);
  const icon = getToolIcon(toolName);

  return (
    <div
      className={`${COMPONENT_CLASSNAME}-overlay`}
      data-testid={OVERLAY_TESTID}
      onClick={(e) => onDismiss && handleOverlayClick(e, onDismiss)}
    >
      <div
        ref={modalRef}
        className={`${COMPONENT_CLASSNAME} ${severityClass} ${className}`}
        data-testid={MODAL_TESTID}
        role={MODAL_ROLE}
        aria-modal={ARIA_MODAL}
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
      >
        <h2 id={TITLE_ID} className={`${COMPONENT_CLASSNAME}__title`}>
          {MODAL_TITLE}
        </h2>

        <div id={DESCRIPTION_ID} className={`${COMPONENT_CLASSNAME}__content`}>
          <div className={`${COMPONENT_CLASSNAME}__tool`}>
            <span className={`${COMPONENT_CLASSNAME}__icon`} data-icon={icon} />
            <span data-testid={TOOL_NAME_TESTID}>{toolName}</span>
          </div>

          <pre
            className={`${COMPONENT_CLASSNAME}__preview`}
            data-testid={COMMAND_PREVIEW_TESTID}
          >
            {preview}
          </pre>
        </div>

        <label className={`${COMPONENT_CLASSNAME}__checkbox-label`}>
          <input
            type="checkbox"
            data-testid={ALWAYS_ALLOW_TESTID}
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            aria-label={ALWAYS_ALLOW_ARIA_LABEL}
          />
          {ALWAYS_ALLOW_LABEL}
        </label>

        <div className={`${COMPONENT_CLASSNAME}__actions`}>
          <button
            data-testid={APPROVE_BUTTON_TESTID}
            className={`${COMPONENT_CLASSNAME}__button ${COMPONENT_CLASSNAME}__button--approve`}
            onClick={() => onApprove(getGrantScope(alwaysAllow))}
          >
            Approve
          </button>
          <button
            data-testid={REJECT_BUTTON_TESTID}
            className={`${COMPONENT_CLASSNAME}__button ${COMPONENT_CLASSNAME}__button--reject`}
            onClick={onReject}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
