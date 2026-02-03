/**
 * ToolStack Component
 *
 * Collapsible container for consecutive tool use groups.
 * Story MSSCI-13400 - Tool use stack between messages
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ToolCallBlock from './ToolCallBlock';
import type { ToolStackData } from '../utils/toolStackGrouper';
import { generateToolIntentSummary } from '../utils/toolIntentSummarizer';

interface ToolResultMessage {
  type: 'tool_result';
  tool_id: string;
  content: string;
  timestamp: number;
}

interface ToolStackProps {
  stack: ToolStackData;
  toolResults: Map<string, ToolResultMessage>;
}

export default function ToolStack({ stack, toolResults }: ToolStackProps): React.ReactElement {
  // AC4: Expand automatically when stack has active (pending) tool
  const [isCollapsed, setIsCollapsed] = useState(!stack.isActive);

  // Track previous isActive to detect transitions
  const prevIsActiveRef = useRef(stack.isActive);

  // When stack transitions from active to inactive, keep it expanded
  // This ensures completed tools remain visible for user review
  useEffect(() => {
    if (prevIsActiveRef.current && !stack.isActive) {
      // Stack just completed - keep expanded for review
      setIsCollapsed(false);
    }
    prevIsActiveRef.current = stack.isActive;
  }, [stack.isActive]);

  // AC2: Count display with singular/plural
  const countText = stack.count === 1 ? '1 tool' : `${stack.count} tools`;

  // Generate summary of tool intents for collapsed view
  const collapsedSummary = useMemo(() => {
    // Show first 2 tool intents, abbreviated
    const summaries = stack.tools.slice(0, 2).map(tool =>
      generateToolIntentSummary(tool.tool_name, tool.input)
    );
    if (stack.tools.length > 2) {
      return summaries.join(', ') + '...';
    }
    return summaries.join(', ');
  }, [stack.tools]);

  // AC4: Determine which tool is current (pending)
  const getToolClass = (toolIndex: number): string => {
    const tool = stack.tools[toolIndex];
    const result = toolResults.get(tool.tool_id);

    // If stack is active, last tool without result is current
    if (stack.isActive) {
      const isLastTool = toolIndex === stack.tools.length - 1;
      const hasPendingResult = !result;

      if (isLastTool && hasPendingResult) {
        return 'tool-current';
      }
      return 'tool-historical';
    }

    // If stack is not active, all tools are historical
    return 'tool-historical';
  };

  // Toggle collapse state
  const handleToggle = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  // AC4: When active and user tries to collapse, still show current tool
  const shouldShowTools = !isCollapsed || stack.isActive;

  return (
    <div
      data-testid="tool-stack"
      data-collapsible="true"
      className={`tool-stack ${isCollapsed && !stack.isActive ? 'collapsed' : ''}`}
    >
      <div
        data-testid="tool-stack-header"
        className="tool-stack-header"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed || stack.isActive}
        aria-label={`Tool stack with ${countText}: ${collapsedSummary}`}
      >
        <span className="tool-stack-toggle">
          {isCollapsed && !stack.isActive ? '▶' : '▼'}
        </span>
        <span
          data-testid="tool-stack-count"
          className="tool-stack-count"
        >
          {countText}
        </span>
        {isCollapsed && !stack.isActive && (
          <span className="tool-stack-summary">
            {collapsedSummary}
          </span>
        )}
      </div>

      {shouldShowTools && (
        <div className="tool-stack-content">
          {stack.tools.map((tool, index) => {
            const result = toolResults.get(tool.tool_id);
            const toolClass = getToolClass(index);

            return (
              <ToolCallBlock
                key={tool.tool_id || `tool-${index}`}
                toolUse={{
                  type: 'tool_use',
                  tool_name: tool.tool_name,
                  tool_id: tool.tool_id,
                  input: tool.input,
                  timestamp: tool.timestamp,
                }}
                result={result ? {
                  type: 'tool_result',
                  tool_id: result.tool_id,
                  content: result.content,
                  timestamp: result.timestamp,
                } : undefined}
                className={toolClass}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
