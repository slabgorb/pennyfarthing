/**
 * ConfirmDialog Component
 *
 * Generic confirmation modal for destructive or important actions,
 * built on shadcn AlertDialog (Radix UI primitives).
 *
 * Features:
 * - Title and message customization
 * - Confirm/Cancel button labels
 * - Danger mode styling for destructive actions (uses destructive button variant)
 * - Escape key to cancel (handled by Radix)
 * - Click outside to cancel (handled by Radix)
 * - Focus trap for accessibility (handled by Radix)
 */

import React, { useRef, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
}: ConfirmDialogProps): React.ReactElement {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(isDanger && buttonVariants({ variant: 'destructive' }))}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
