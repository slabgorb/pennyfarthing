import React from 'react';
import { ToolDialog } from './ToolDialog';

// Stub: Story 83-3 — ComplexityDialog
// Dev will implement sortable table with threshold highlighting

export interface ComplexityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplexityDialog({ open, onOpenChange }: ComplexityDialogProps): React.ReactElement {
  return (
    <ToolDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Complexity"
      description="Cyclomatic complexity analysis"
    >
      <div data-testid="complexity-panel">Not implemented</div>
    </ToolDialog>
  );
}
