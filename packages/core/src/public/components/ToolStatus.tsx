/**
 * ToolStatus Component
 *
 * Displays status indicator for tool execution state.
 * Story MSSCI-13402 - Tool use visual design polish
 */

import React from 'react';

export type ToolStatusType = 'pending' | 'success' | 'error';

export interface ToolStatusProps {
  status: ToolStatusType;
}

/**
 * Status indicator component showing pending/success/error state
 */
export function ToolStatus({ status }: ToolStatusProps): React.ReactElement {
  const getAriaLabel = (): string => {
    switch (status) {
      case 'pending':
        return 'Tool running';
      case 'success':
        return 'Tool completed successfully';
      case 'error':
        return 'Tool failed with error';
      default:
        return 'Tool status unknown';
    }
  };

  const getContent = (): React.ReactNode => {
    switch (status) {
      case 'pending':
        return <span className="spinner" data-loading="true" />;
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      default:
        return '?';
    }
  };

  return (
    <span
      data-testid="tool-status-indicator"
      className={`tool-status-indicator status-${status}`}
      aria-label={getAriaLabel()}
    >
      {getContent()}
    </span>
  );
}

export default ToolStatus;
