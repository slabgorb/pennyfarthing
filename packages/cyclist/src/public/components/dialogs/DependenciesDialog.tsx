import React from 'react';
import { ToolDialog } from './ToolDialog';

// Stub: Story 83-3 — DependenciesDialog
// Dev will implement outdated table + security section

export interface DependenciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DependenciesDialog({ open, onOpenChange }: DependenciesDialogProps): React.ReactElement {
  return (
    <ToolDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dependencies"
      description="Package staleness and security analysis"
    >
      <div data-testid="dependencies-panel">Not implemented</div>
    </ToolDialog>
  );
}
