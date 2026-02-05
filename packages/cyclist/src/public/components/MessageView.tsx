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
import { Button } from '@/components/ui/button';
import MessageList, { MessageListHandle } from './MessageList';
import Message from './Message';
import ToolCallBlock from './ToolCallBlock';
import ToolStack from './ToolStack';
import SubagentSpan from './SubagentSpan';
import QuickActions from './QuickActions';
import { isSkillContent } from '../utils/messageFilters';
import { groupToolsIntoStacks, ToolStackData } from '../utils/toolStackGrouper';
import type { MessageData } from '../types/message';

interface MessageViewProps {
  messages: MessageData[];
}

interface SubagentGroup {
  parent_id: string;
  type: string;
  name: string;
  messages: MessageData[];
}

interface ToolStackGroup {
  isToolStack: true;
  stack: ToolStackData;
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

  // Find the last assistant message for QuickActions
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'agent' && !messages[i].isStreaming) {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  // Group messages by subagent parent_id and consecutive tool uses
  const groupedContent = useMemo(() => {
    const result: (MessageData | SubagentGroup | ToolStackGroup)[] = [];
    const subagentGroups = new Map<string, SubagentGroup>();

    // First pass: collect tool results for matching
    const toolResults = new Map<string, MessageData>();
    messages.forEach(msg => {
      if (msg.type === 'tool_result' && msg.tool_id) {
        toolResults.set(msg.tool_id, msg);
      }
    });

    // Second pass: filter messages and group by subagent (excluding tool_use for now)
    const filteredMessages: MessageData[] = [];
    messages.forEach(msg => {
      // Filter out skill content from user messages (MSSCI-12783)
      if (msg.type === 'user' && isSkillContent(msg.content)) {
        return;
      }
      // Skip tool_result - rendered with tool_use
      if (msg.type === 'tool_result') {
        return;
      }
      // Skip messages with parent_id (subagent messages handled separately)
      if (msg.parent_id) {
        let group = subagentGroups.get(msg.parent_id);
        if (!group) {
          group = {
            parent_id: msg.parent_id,
            type: msg.subagent_type || 'unknown',
            name: msg.subagent_name || 'unnamed',
            messages: [],
          };
          subagentGroups.set(msg.parent_id, group);
        }
        group.messages.push(msg);
        return;
      }
      filteredMessages.push(msg);
    });

    // Third pass: group consecutive tool_use messages into stacks
    const toolStacks = groupToolsIntoStacks(filteredMessages);

    // Create a set of tool_ids that belong to stacks
    const stackedToolIds = new Set<string>();
    toolStacks.forEach(stack => {
      stack.tools.forEach(tool => stackedToolIds.add(tool.tool_id));
    });

    // Fourth pass: build result array, inserting ToolStackGroups where appropriate
    let currentStackIndex = 0;
    let pendingStack: ToolStackData | null = null;

    filteredMessages.forEach(msg => {
      if (msg.parent_id) {
        // Subagent messages - insert the group when we first see a message from it
        const group = subagentGroups.get(msg.parent_id);
        if (group && !result.includes(group)) {
          result.push(group);
        }
      } else if (msg.type === 'tool_use' && msg.tool_id && stackedToolIds.has(msg.tool_id)) {
        // This tool belongs to a stack
        const stack = toolStacks.find(s =>
          s.tools.some(t => t.tool_id === msg.tool_id)
        );
        if (stack && (!pendingStack || pendingStack.stackId !== stack.stackId)) {
          // New stack - add it
          result.push({ isToolStack: true, stack });
          pendingStack = stack;
        }
        // Skip individual rendering - handled by ToolStack
      } else if (msg.type === 'tool_use') {
        // Single tool - render normally
        result.push(msg);
        pendingStack = null;
      } else {
        // Non-tool message
        result.push(msg);
        pendingStack = null;
      }
    });

    return { items: result, toolResults };
  }, [messages]);

  const renderItem = (item: MessageData | SubagentGroup | ToolStackGroup, index: number) => {
    // Check if this is a tool stack group
    if ('isToolStack' in item && item.isToolStack) {
      return (
        <ToolStack
          key={`stack-${item.stack.stackId}`}
          stack={item.stack}
          toolResults={groupedContent.toolResults as Map<string, { type: 'tool_result'; tool_id: string; content: string; timestamp: number }>}
        />
      );
    }

    // Check if this is a subagent group
    if ('messages' in item && Array.isArray(item.messages)) {
      return (
        <SubagentSpan
          key={`subagent-${(item as SubagentGroup).parent_id}`}
          type={(item as SubagentGroup).type}
          name={(item as SubagentGroup).name}
          messages={(item as SubagentGroup).messages as any}
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
            is_error: result.is_error,
            durationMs: result.durationMs,
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
              background: 'var(--bg-tertiary, #0f0f1a)',
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
    <div data-testid="message-view" className="message-view" role="log" aria-live="polite">
      <MessageList
        ref={messageListRef}
        onScrollChange={handleScrollChange}
        autoScroll={isAtBottom}
      >
        {groupedContent.items.map((item, index) => renderItem(item, index))}
      </MessageList>

      {/* Quick Actions - dedicated area outside message scroll */}
      {lastAssistantMessage && (
        <QuickActions message={lastAssistantMessage} />
      )}

      {/* Auto-scroll indicator */}
      <div
        data-testid="auto-scroll-indicator"
        data-active={isAtBottom.toString()}
        className="auto-scroll-indicator"
        style={{ display: 'none' }}
      />

      {/* Scroll to bottom button */}
      <Button
        variant="ghost"
        size="icon"
        data-testid="scroll-to-bottom-button"
        className="scroll-to-bottom-button"
        onClick={handleScrollToBottom}
        style={{ visibility: isAtBottom ? 'hidden' : 'visible' }}
      >
        ↓
      </Button>
    </div>
  );
}
