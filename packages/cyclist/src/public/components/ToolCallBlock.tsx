/**
 * ToolCallBlock Component
 *
 * Displays tool use and result in a distinct block.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React, { useState } from 'react';

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

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  // Display the most relevant input field based on tool type
  if (toolName === 'Read' && input.file_path) {
    return String(input.file_path);
  }
  if (toolName === 'Bash' && input.command) {
    return String(input.command);
  }
  if (toolName === 'Glob' && input.pattern) {
    return String(input.pattern);
  }
  if (toolName === 'Grep' && input.pattern) {
    return String(input.pattern);
  }
  if (toolName === 'Write' && input.file_path) {
    return String(input.file_path);
  }
  // Default: show JSON
  return JSON.stringify(input, null, 2);
}

export default function ToolCallBlock({ toolUse, result }: ToolCallBlockProps): React.ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const status = result ? 'complete' : 'pending';
  const inputDisplay = formatToolInput(toolUse.tool_name, toolUse.input);

  return (
    <div data-testid="tool-call-block" className="tool-call-block">
      <div className="tool-header">
        <span className="tool-name">{toolUse.tool_name}</span>
        <span data-testid="tool-status" className={`tool-status tool-status-${status}`}>
          {status}
        </span>
      </div>
      <div className="tool-input">
        <code>{inputDisplay}</code>
      </div>
      {result && (
        <>
          <button
            data-testid="tool-result-toggle"
            className="tool-result-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? '▶' : '▼'} Result
          </button>
          <div
            data-testid="tool-result-content"
            className={`tool-result-content ${isCollapsed ? 'collapsed' : ''}`}
          >
            <pre>{result.content}</pre>
          </div>
        </>
      )}
    </div>
  );
}
