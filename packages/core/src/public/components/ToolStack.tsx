/**
 * ToolStack Component
 *
 * Collapsible container for consecutive tool use groups.
 * Story MSSCI-13400 - Tool use stack between messages
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ToolCallBlock, { getToolBadgeLabel } from './ToolCallBlock';
import type { ToolStackData } from '../utils/toolStackGrouper';
import { generateToolIntentSummary } from '../utils/toolIntentSummarizer';
import { formatDuration } from '../utils/formatDuration';

interface ToolResultMessage {
  type: 'tool_result';
  tool_id: string;
  content: string;
  timestamp: number;
  durationMs?: number;
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

  // Count display - just the number
  const countText = `${stack.count}`;

  // Active tool summary - show what's happening RIGHT NOW
  const activeSummary = useMemo(() => {
    if (stack.isActive && stack.tools.length > 0) {
      // Show the most recent (last) tool's summary
      const lastTool = stack.tools[stack.tools.length - 1];
      return generateToolIntentSummary(lastTool.tool_name, lastTool.input);
    }
    return null;
  }, [stack.tools, stack.isActive]);

  // Generate summary of tool intents for collapsed view
  const collapsedSummary = useMemo(() => {
    // Show last tool's summary as the main description
    if (stack.tools.length === 0) return '';
    const lastTool = stack.tools[stack.tools.length - 1];
    return generateToolIntentSummary(lastTool.tool_name, lastTool.input);
  }, [stack.tools]);

  // Compute tool type counts for mini badges
  const toolTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    stack.tools.forEach(tool => {
      const count = counts.get(tool.tool_name) || 0;
      counts.set(tool.tool_name, count + 1);
    });
    return counts;
  }, [stack.tools]);

  // Total duration across all tools in stack
  const totalDuration = useMemo(() => {
    return stack.tools.reduce((sum, tool) => {
      const result = toolResults.get(tool.tool_id);
      return sum + (result?.durationMs || 0);
    }, 0);
  }, [stack.tools, toolResults]);

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
          className="tool-stack-count-badge"
        >
          {countText}
        </span>
        {stack.isActive && activeSummary ? (
          <span className="tool-stack-active-summary">
            {activeSummary}
          </span>
        ) : (
          <>
            <span className="tool-stack-badges">
              <TooltipProvider delayDuration={300}>
                {Array.from(toolTypeCounts.entries()).slice(0, 4).map(([type, count]) => (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`tool-mini-badge badge-${type.toLowerCase()}`}
                      >
                        {getToolBadgeLabel(type)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{`${count} ${type} call${count > 1 ? 's' : ''}`}</TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </span>
            <span className="tool-stack-summary">
              {collapsedSummary}
            </span>
          </>
        )}
        <span className="tool-stack-duration">
          {totalDuration > 0 ? formatDuration(totalDuration) : ''}
        </span>
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
