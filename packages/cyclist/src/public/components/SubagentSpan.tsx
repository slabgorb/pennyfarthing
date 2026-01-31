/**
 * SubagentSpan Component
 *
 * Collapsible container for subagent message groups.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React, { useState } from 'react';
import Message from './Message';
import ToolCallBlock from './ToolCallBlock';

interface SubagentMessage {
  type: 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  parent_id: string;
  timestamp: number;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
}

interface SubagentSpanProps {
  type: string;
  name: string;
  messages: SubagentMessage[];
  defaultCollapsed?: boolean;
}

export default function SubagentSpan({ type, name, messages, defaultCollapsed = false }: SubagentSpanProps): React.ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

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
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="subagent-toggle">{isCollapsed ? '▶' : '▼'}</span>
        <span className="subagent-type">{type}</span>
        <span className="subagent-name">{name}</span>
        {isCollapsed && (
          <span className="subagent-count">{messages.length} messages</span>
        )}
      </div>
      {!isCollapsed && (
        <div className="subagent-content">
          {messages.map((msg, index) => renderMessage(msg, index))}
        </div>
      )}
    </div>
  );
}
