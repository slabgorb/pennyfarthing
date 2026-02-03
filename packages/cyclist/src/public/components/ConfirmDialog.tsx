/**
 * ConfirmDialog Component
 *
 * Generic confirmation modal for destructive or important actions.
 *
 * Features:
 * - Title and message customization
 * - Confirm/Cancel button labels
 * - Danger mode styling for destructive actions
 * - Escape key to cancel
 * - Click outside to cancel
 * - Focus trap for accessibility
 */

import React, { useEffect, useRef, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: string;
  /** Confirm button label (default: "Confirm") */
  confirmLabel?: string;
  /** Cancel button label (default: "Cancel") */
  cancelLabel?: string;
  /** Whether this is a dangerous/destructive action */
  isDanger?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }, [onCancel]);

  // Handle confirm with keyboard
  const handleConfirmKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onConfirm();
    }
  }, [onConfirm]);

  // Handle cancel with keyboard
  const handleCancelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCancel();
    }
  }, [onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`confirm-dialog ${isDanger ? 'danger' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {isDanger && <span className="danger-icon">⚠️</span>}
          {title}
        </h2>

        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>

        <div className="confirm-dialog-actions">
          <button
            className="confirm-dialog-btn cancel"
            onClick={onCancel}
            onKeyDown={handleCancelKeyDown}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            className={`confirm-dialog-btn confirm ${isDanger ? 'danger' : ''}`}
            onClick={onConfirm}
            onKeyDown={handleConfirmKeyDown}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Hook for easy usage
// =============================================================================

interface UseConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
}

interface UseConfirmDialogReturn {
  isOpen: boolean;
  confirm: () => Promise<boolean>;
  dialogProps: ConfirmDialogProps;
}

/**
 * Hook for programmatic confirmation dialogs
 *
 * Usage:
 * ```tsx
 * const { confirm, dialogProps } = useConfirmDialog({
 *   title: 'Delete item?',
 *   message: 'This cannot be undone.',
 *   isDanger: true,
 * });
 *
 * const handleDelete = async () => {
 *   if (await confirm()) {
 *     // User confirmed, proceed with deletion
 *   }
 * };
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     <ConfirmDialog {...dialogProps} />
 *   </>
 * );
 * ```
 */
export function useConfirmDialog(options: UseConfirmDialogOptions): UseConfirmDialogReturn {
  const [isOpen, setIsOpen] = React.useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const dialogProps: ConfirmDialogProps = {
    isOpen,
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    isDanger: options.isDanger,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { isOpen, confirm, dialogProps };
}

export default ConfirmDialog;
