/**
 * ToolCallBlock Component
 *
 * Displays tool use and result in a distinct block.
 * Story MSSCI-12698 - MessageView Component with Streaming
 * Story MSSCI-13398 - Collapsible tool result display
 * Story MSSCI-13402 - Tool use visual design polish
 */

import React, { useState, useMemo } from 'react';
import { getToolTypeClass } from '../utils/toolTypeColors.js';
import { formatDuration } from '../utils/formatDuration.js';

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
  /** Whether this result represents an error */
  is_error?: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
}

interface ToolCallBlockProps {
  toolUse: ToolUseMessage;
  result?: ToolResultMessage;
  className?: string;
}

const TRUNCATION_THRESHOLD = 50;

/**
 * Count lines in content, handling both Unix and Windows line endings
 */
function countLines(content: string): number {
  if (!content) return 0;
  // Normalize CRLF to LF, then count
  const normalized = content.replace(/\r\n/g, '\n');
  return normalized.split('\n').length;
}

/**
 * Get truncated content (first N lines)
 */
function getTruncatedContent(content: string, maxLines: number): string {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  return lines.slice(0, maxLines).join('\n');
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

export default function ToolCallBlock({ toolUse, result, className }: ToolCallBlockProps): React.ReactElement {
  // AC1: Start collapsed by default
  const [isCollapsed, setIsCollapsed] = useState(true);
  // AC3: Track whether showing full content or truncated
  const [showFullContent, setShowFullContent] = useState(false);
  // AC4: Track copy state
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  // MSSCI-13402: Determine status based on result presence and error state
  const isError = result?.is_error === true;
  const status = !result ? 'pending' : isError ? 'error' : 'complete';
  const inputDisplay = formatToolInput(toolUse.tool_name, toolUse.input);

  // MSSCI-13402: Get tool type CSS class
  const toolTypeClass = getToolTypeClass(toolUse.tool_name);

  // AC2: Memoize line count for performance
  const lineCount = useMemo(() => {
    return result ? countLines(result.content) : 0;
  }, [result?.content]);

  // AC3: Determine if truncation applies
  const shouldTruncate = lineCount > TRUNCATION_THRESHOLD;
  const isTruncated = shouldTruncate && !showFullContent;

  // AC3: Get display content (truncated or full)
  const displayContent = useMemo(() => {
    if (!result) return '';
    if (isTruncated) {
      return getTruncatedContent(result.content, TRUNCATION_THRESHOLD);
    }
    return result.content;
  }, [result?.content, isTruncated]);

  // AC4: Handle copy to clipboard
  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
    }
  };

  // AC2: Format line count text
  const lineCountText = lineCount === 1 ? '1 line' : `${lineCount} lines`;

  // MSSCI-13402: Build class list with tool type and error state
  const blockClasses = [
    'tool-call-block',
    toolTypeClass,
    isError ? 'tool-error' : '',
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <div data-testid="tool-call-block" className={blockClasses}>
      <div className="tool-header">
        <span className="tool-name">{toolUse.tool_name}</span>
        <span data-testid="tool-status" className={`tool-status tool-status-${status}`}>
          {status}
        </span>
        {/* MSSCI-13402: Duration display */}
        {result && (
          <span data-testid="tool-duration" className="tool-duration">
            {result.durationMs !== undefined ? formatDuration(result.durationMs) : ''}
          </span>
        )}
      </div>
      <div className="tool-input">
        <code>{inputDisplay}</code>
      </div>
      {result && (
        <>
          <div className="tool-result-header">
            <button
              data-testid="tool-result-toggle"
              className="tool-result-toggle"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? '▶' : '▼'} Result ({lineCountText})
            </button>
            <button
              data-testid="tool-result-copy"
              className={`tool-result-copy ${copyState === 'copied' ? 'copied' : ''} ${copyState === 'error' ? 'copy-error' : ''}`}
              onClick={handleCopy}
              aria-label="Copy result to clipboard"
            >
              {copyState === 'copied' ? '✓' : '📋'}
            </button>
          </div>
          <div
            data-testid="tool-result-content"
            className={`tool-result-content ${isCollapsed ? 'collapsed' : ''} ${isTruncated && !isCollapsed ? 'truncated' : ''} ${isError ? 'error-content' : ''}`}
          >
            <pre>{displayContent}</pre>
            {shouldTruncate && !isCollapsed && isTruncated && (
              <button
                data-testid="tool-result-expand"
                className="tool-result-expand"
                onClick={() => setShowFullContent(true)}
              >
                Show all ({lineCount} lines)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
