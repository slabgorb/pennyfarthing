/**
 * ToolCallBlock Component
 *
 * Displays tool use and result in a distinct block.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React from 'react';

interface ToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: Record<string, unknown>;
  timestamp: number;
}

interface ToolResultMessage {
  type: 'tool_result';
  tool_id: string;
  content: string;
  timestamp: number;
}

interface ToolCallBlockProps {
  toolUse: ToolUseMessage;
  result?: ToolResultMessage;
}

export default function ToolCallBlock({ toolUse, result }: ToolCallBlockProps): React.ReactElement {
  throw new Error('ToolCallBlock not implemented');
}
