/**
 * MessageView Component
 *
 * Main container component for displaying conversation messages.
 * Story MSSCI-12698 - MessageView Component with Streaming
 *
 * Features:
 * - Render messages list with proper roles
 * - Handle streaming content display
 * - Markdown rendering with syntax highlighting
 * - Tool call blocks
 * - Subagent span grouping
 * - Auto-scroll behavior
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import MessageList, { MessageListHandle } from './MessageList';
import Message from './Message';
import ToolCallBlock from './ToolCallBlock';
import SubagentSpan from './SubagentSpan';

interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
  isStreaming?: boolean;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
  parent_id?: string;
  subagent_type?: string;
  subagent_name?: string;
}

interface MessageViewProps {
  messages: MessageData[];
}

interface SubagentGroup {
  parent_id: string;
  type: string;
  name: string;
  messages: MessageData[];
}

export default function MessageView({ messages }: MessageViewProps): React.ReactElement {
  const messageListRef = useRef<MessageListHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScrollChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    messageListRef.current?.scrollToBottom('smooth');
  }, []);

  // Group messages by subagent parent_id
  const groupedContent = useMemo(() => {
    const result: (MessageData | SubagentGroup)[] = [];
    const subagentGroups = new Map<string, SubagentGroup>();

    // First pass: collect tool results for matching
    const toolResults = new Map<string, MessageData>();
    messages.forEach(msg => {
      if (msg.type === 'tool_result' && msg.tool_id) {
        toolResults.set(msg.tool_id, msg);
      }
    });

    // Second pass: group messages
    messages.forEach(msg => {
      if (msg.parent_id) {
        // This message belongs to a subagent
        let group = subagentGroups.get(msg.parent_id);
        if (!group) {
          group = {
            parent_id: msg.parent_id,
            type: msg.subagent_type || 'unknown',
            name: msg.subagent_name || 'unnamed',
            messages: [],
          };
          subagentGroups.set(msg.parent_id, group);
          result.push(group);
        }
        group.messages.push(msg);
      } else if (msg.type === 'tool_result') {
        // Skip standalone tool_result - it's rendered with tool_use
      } else {
        result.push(msg);
      }
    });

    return { items: result, toolResults };
  }, [messages]);

  const renderItem = (item: MessageData | SubagentGroup, index: number) => {
    // Check if this is a subagent group
    if ('messages' in item && Array.isArray(item.messages)) {
      return (
        <SubagentSpan
          key={`subagent-${item.parent_id}`}
          type={item.type}
          name={item.name}
          messages={item.messages as any}
        />
      );
    }

    // It's a regular message
    const msg = item as MessageData;

    if (msg.type === 'tool_use' && msg.tool_name && msg.tool_id) {
      const result = groupedContent.toolResults.get(msg.tool_id);
      return (
        <ToolCallBlock
          key={`tool-${msg.tool_id}`}
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
      );
    }

    return (
      <Message
        key={`msg-${index}-${msg.timestamp}`}
        message={msg}
      />
    );
  };

  // Show empty state when no messages - prompt to start with /sm
  if (messages.length === 0) {
    return (
      <div data-testid="message-view" className="message-view">
        <div className="message-view-empty">
          <div>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚴</div>
            <div>Type <code style={{
              background: 'var(--bg-tertiary, #2d2d2d)',
              padding: '2px 6px',
              borderRadius: '3px',
              fontFamily: 'var(--font-mono, monospace)'
            }}>/sm</code> to start</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="message-view" className="message-view">
      <MessageList
        ref={messageListRef}
        onScrollChange={handleScrollChange}
        autoScroll={isAtBottom}
      >
        {groupedContent.items.map((item, index) => renderItem(item, index))}
      </MessageList>

      {/* Auto-scroll indicator */}
      <div
        data-testid="auto-scroll-indicator"
        data-active={isAtBottom.toString()}
        className="auto-scroll-indicator"
        style={{ display: 'none' }}
      />

      {/* Scroll to bottom button */}
      <button
        data-testid="scroll-to-bottom-button"
        className="scroll-to-bottom-button"
        onClick={handleScrollToBottom}
        style={{ visibility: isAtBottom ? 'hidden' : 'visible' }}
      >
        ↓
      </button>
    </div>
  );
}
