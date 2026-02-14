/**
 * SubagentSpan Component
 *
 * Collapsible container for subagent message groups.
 * Story MSSCI-12698 - MessageView Component with Streaming
 * Story MSSCI-12776 - Theme-Aware Subagent Display Messages
 */

import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Message from './Message';
import ToolCallBlock from './ToolCallBlock';
import { useSubagentHelper } from '../hooks/useSubagentHelper';
import { generateFriendlyMessage } from '../utils/subagent-display';
import type { SubagentMessage } from '../types/message';

interface SubagentSpanProps {
  type: string;
  name: string;
  messages: SubagentMessage[];
  defaultCollapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  // MSSCI-12776: Theme-aware helper display (optional - can be overridden by props for testing)
  helperName?: string | null;
  helperStyle?: string | null;
  friendlyMessage?: string | null;
}

export default function SubagentSpan({
  type,
  name,
  messages,
  defaultCollapsed = true,
  onCollapseChange,
  helperName: propHelperName,
  helperStyle: propHelperStyle,
  friendlyMessage: propFriendlyMessage,
}: SubagentSpanProps): React.ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // MSSCI-12776: Fetch themed helper from current persona (AC2)
  const { helper } = useSubagentHelper();

  // Generate friendly message from subagent context (AC3)
  const generatedFriendlyMessage = useMemo(() => {
    return generateFriendlyMessage({ subagent_type: type, description: name }, { plural: helper?.plural });
  }, [type, name, helper?.plural]);

  // Use truthy props if provided (for testing), otherwise use hook/generated values (AC4, AC5)
  // Treating null same as undefined - both mean "use fallback"
  const helperName = propHelperName ?? helper?.name;
  const helperStyle = propHelperStyle ?? helper?.style;
  const friendlyMessage = propFriendlyMessage ?? generatedFriendlyMessage;

  // Determine display values with fallbacks (AC5)
  const displayName = helperName || type;
  const displayMessage = friendlyMessage || name;

  // Count non-result messages for the collapsed summary
  const messageCount = messages.filter(m => m.type !== 'tool_result').length;

  // Group tool_use and tool_result by tool_id
  const toolResults = new Map<string, SubagentMessage>();
  messages.forEach(msg => {
    if (msg.type === 'tool_result' && msg.tool_id) {
      toolResults.set(msg.tool_id, msg);
    }
  });

  const renderMessage = (msg: SubagentMessage, index: number) => {
    if (msg.type === 'tool_use' && msg.tool_name && msg.tool_id) {
      const result = toolResults.get(msg.tool_id);
      return (
        <div key={`tool-wrapper-${msg.tool_id}`} data-testid="message-tool_use" className="message message-tool_use">
          <ToolCallBlock
            toolUse={{
              type: 'tool_use',
              tool_name: msg.tool_name,
              tool_id: msg.tool_id,
              input: msg.input || {},
              timestamp: msg.timestamp,
            }}
            result={result ? {
              type: 'tool_result',
              tool_id: result.tool_id!,
              content: result.content || '',
              timestamp: result.timestamp,
            } : undefined}
          />
        </div>
      );
    }

    if (msg.type === 'tool_result') {
      // Skip tool_result - it's rendered with tool_use
      return null;
    }

    // Subagent prompts (user messages within subagent) — truncated single line
    if (msg.type === 'user') {
      const truncated = (msg.content || '').slice(0, 120).replace(/\n/g, ' ');
      return (
        <div
          key={`subagent-prompt-${index}`}
          data-testid="subagent-prompt"
          className="message message-subagent-prompt"
        >
          <div className="message-content">{truncated}{(msg.content || '').length > 120 ? '...' : ''}</div>
        </div>
      );
    }

    return (
      <Message
        key={`msg-${index}`}
        message={{
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
        }}
      />
    );
  };

  return (
    <div
      data-testid="subagent-span"
      data-collapsible="true"
      className={`subagent-span subagent-${type} ${isCollapsed ? 'collapsed' : ''}`}
    >
      <div
        data-testid="subagent-span-header"
        className="subagent-header"
        onClick={() => {
          const next = !isCollapsed;
          setIsCollapsed(next);
          onCollapseChange?.(next);
        }}
      >
        <span className="subagent-toggle">{isCollapsed ? '▶' : '▼'}</span>

        {/* Helper name or fallback to type (AC4, AC5) */}
        <TooltipProvider delayDuration={300}>
          {helperStyle ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="subagent-helper-name">
                  {displayName}
                </span>
              </TooltipTrigger>
              <TooltipContent>{helperStyle}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="subagent-helper-name">
              {displayName}
            </span>
          )}
        </TooltipProvider>

        {/* Friendly message or fallback to name (AC4, AC5) */}
        <span className="subagent-friendly-message">
          {displayMessage}
        </span>

        {/* Type badge for debugging context (AC4) */}
        <Badge variant="outline" data-testid="subagent-type-badge" className="subagent-type-badge">
          {type}
        </Badge>

        <span className="subagent-count">{messageCount}</span>
      </div>
      {!isCollapsed && (
        <div className="subagent-content">
          {messages.map((msg, index) => renderMessage(msg, index))}
        </div>
      )}
    </div>
  );
}
