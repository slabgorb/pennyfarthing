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
 * - Tool call blocks with stacking
 * - Subagent span grouping
 * - Turn-based grouping with speaker labels
 * - Auto-scroll behavior
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MessageList, { MessageListHandle } from './MessageList';
import Message from './Message';
import ToolCallBlock from './ToolCallBlock';
import ToolStack from './ToolStack';
import SubagentSpan from './SubagentSpan';
import QuickActions from './QuickActions';
import { Separator } from '@/components/ui/separator';
import { isSkillContent, extractSkillLabel } from '../utils/messageFilters';
import { groupToolsIntoStacks, ToolStackData } from '../utils/toolStackGrouper';
import { usePersona } from '../hooks/usePersona';
import { useColorScheme } from '../hooks/useColorScheme';
import { useStatsStrip } from '../hooks/useStatsStrip';
import type { MessageData } from '../types/message';

// Agent colors matching CLI statusbar (from PersonaHeader)
const AGENT_COLORS: Record<string, string> = {
  pm: '#a78bfa', sm: '#60a5fa', dev: '#4ade80', tea: '#2dd4bf',
  reviewer: '#f87171', architect: '#fb923c', devops: '#22d3ee',
  'ux-designer': '#f0abfc', 'tech-writer': '#e5e5e5', orchestrator: '#e879f9',
  ba: '#a3e635',
};

const AGENT_ABBREV: Record<string, string> = {
  pm: 'PM', sm: 'SM', dev: 'DEV', tea: 'TEA', reviewer: 'REV',
  architect: 'ARC', devops: 'OPS', 'ux-designer': 'UX', 'tech-writer': 'TW',
  orchestrator: 'ORC', ba: 'BA',
};

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

type RenderItem = MessageData | SubagentGroup | ToolStackGroup;

interface Turn {
  speaker: 'user' | 'agent' | 'system';
  items: RenderItem[];
  timestamp: number;
}

function formatTurnTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Classify an item as 'user' or 'agent' for turn grouping.
 * Tools, subagents, and stacks are all part of the agent's turn.
 */
function speakerOf(item: RenderItem): 'user' | 'agent' | 'system' {
  if ('isToolStack' in item || 'messages' in item) return 'agent';
  const msg = item as MessageData;
  if (msg.type === 'context_cleared') return 'system';
  return (msg.type === 'user' || msg.type === 'bell_injected') ? 'user' : 'agent';
}

export default function MessageView({ messages }: MessageViewProps): React.ReactElement {
  const messageListRef = useRef<MessageListHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { persona } = usePersona();
  const colorScheme = useColorScheme();
  const { projectInfo } = useStatsStrip();

  // Persist subagent collapsed state across re-renders/remounts
  const subagentCollapsedRef = useRef<Map<string, boolean>>(new Map());

  const handleScrollChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    messageListRef.current?.scrollToBottom('smooth');
  }, []);

  // Find the last non-streaming assistant message for QuickActions
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'agent' && !messages[i].isStreaming) return messages[i];
    }
    return null;
  }, [messages]);

  // Single memo: messages → flat render items → turns
  const { turns, toolResults, lastAgentItemIndex } = useMemo(() => {
    // 1. Index tool results by ID
    const results = new Map<string, MessageData>();
    for (const msg of messages) {
      if (msg.type === 'tool_result' && msg.tool_id) results.set(msg.tool_id, msg);
    }

    // 2. Filter and collect subagent groups in one pass
    const filtered: MessageData[] = [];
    const subagentGroups = new Map<string, SubagentGroup>();

    // Track whether we've already emitted a skill label for this skill invocation.
    // The first skill message gets replaced with a label; subsequent ones are dropped.
    let pendingSkillLabel = false;

    for (const msg of messages) {
      if (msg.type === 'tool_result') continue;
      if (msg.type === 'user' && isSkillContent(msg.content)) {
        const label = extractSkillLabel(msg.content);
        if (label && !pendingSkillLabel) {
          // Replace the first skill message with a short label
          pendingSkillLabel = true;
          filtered.push({ ...msg, content: label });
        }
        // Drop all other skill body messages (pf agent start, <purpose>, etc.)
        continue;
      }
      // Any non-skill user message resets the skill label tracker
      if (msg.type === 'user') {
        pendingSkillLabel = false;
      }
      if (msg.parent_id) {
        let group = subagentGroups.get(msg.parent_id);
        if (!group) {
          group = { parent_id: msg.parent_id, type: msg.subagent_type || 'unknown', name: msg.subagent_name || 'unnamed', messages: [] };
          subagentGroups.set(msg.parent_id, group);
        }
        group.messages.push(msg);
        continue;
      }
      filtered.push(msg);
    }

    // 3. Build flat render list, replacing consecutive tool_use runs with stacks
    const stacks = groupToolsIntoStacks(filtered);
    const stackByToolId = new Map<string, ToolStackData>();
    for (const stack of stacks) {
      for (const tool of stack.tools) stackByToolId.set(tool.tool_id, stack);
    }

    const items: RenderItem[] = [];
    const emittedStacks = new Set<string>();
    const emittedSubagents = new Set<string>();

    for (const msg of filtered) {
      if (msg.type === 'tool_use' && msg.tool_id && stackByToolId.has(msg.tool_id)) {
        const stack = stackByToolId.get(msg.tool_id)!;
        if (!emittedStacks.has(stack.stackId)) {
          emittedStacks.add(stack.stackId);
          items.push({ isToolStack: true, stack });
        }
      } else {
        items.push(msg);
      }
    }

    // Insert subagent groups at the position of their first parent_id occurrence
    // (They appear in the agent's turn, after the Task tool_use that spawned them)
    // For now, just append them — they'll naturally land in the agent turn
    for (const [, group] of subagentGroups) {
      if (!emittedSubagents.has(group.parent_id)) {
        emittedSubagents.add(group.parent_id);
        items.push(group);
      }
    }

    // 4. Find last agent message index (for throb control)
    let lastAgent = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!('isToolStack' in item) && !('messages' in item) && (item as MessageData).type === 'agent') {
        lastAgent = i;
        break;
      }
    }

    // 5. Group into turns
    const turnList: Turn[] = [];
    for (const item of items) {
      const speaker = speakerOf(item);
      const last = turnList[turnList.length - 1];
      if (last && last.speaker === speaker) {
        last.items.push(item);
      } else {
        turnList.push({
          speaker,
          items: [item],
          timestamp: ('timestamp' in item) ? (item as MessageData).timestamp : Date.now(),
        });
      }
    }

    return { turns: turnList, toolResults: results, lastAgentItemIndex: lastAgent };
  }, [messages]);

  const renderItem = (item: RenderItem, globalIndex: number, isFirstInTurn: boolean) => {
    if ('isToolStack' in item) {
      return (
        <ToolStack
          key={`stack-${item.stack.stackId}`}
          stack={item.stack}
          toolResults={toolResults as Map<string, { type: 'tool_result'; tool_id: string; content: string; timestamp: number }>}
        />
      );
    }

    if ('messages' in item && 'parent_id' in item) {
      const group = item as SubagentGroup;
      const collapsed = subagentCollapsedRef.current.get(group.parent_id) ?? true;
      return (
        <SubagentSpan
          key={`subagent-${group.parent_id}`}
          type={group.type}
          name={group.name}
          messages={group.messages as any}
          defaultCollapsed={collapsed}
          onCollapseChange={(c) => subagentCollapsedRef.current.set(group.parent_id, c)}
        />
      );
    }

    const msg = item as MessageData;

    if (msg.type === 'tool_use' && msg.tool_name && msg.tool_id) {
      // AskUserQuestion is handled by the Reflector system (CYCLIST markers → QuickActions)
      if (msg.tool_name === 'AskUserQuestion') return null;
      const result = toolResults.get(msg.tool_id);
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
        key={`msg-${globalIndex}-${msg.timestamp}`}
        message={msg}
        isLastAgentMessage={globalIndex === lastAgentItemIndex}
        isFirstInTurn={isFirstInTurn}
      />
    );
  };

  // Empty state
  if (messages.length === 0) {
    return (
      <div data-testid="message-view" className="message-view">
        <div className="message-view-empty">
          <div>
            <img
              src={colorScheme === 'dark' ? '/images/cyclist-dark.png' : '/images/cyclist-light.png'}
              alt="Cyclist"
              style={{ height: '2.5rem', opacity: 0.6, display: 'block', margin: '0 auto 0.5rem' }}
            />
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

  // Track a running global index across turns for lastAgentItemIndex matching
  let globalIdx = 0;

  return (
    <div data-testid="message-view" className="message-view" role="log" aria-live="polite">
      <MessageList
        ref={messageListRef}
        onScrollChange={handleScrollChange}
        autoScroll={isAtBottom}
      >
        {turns.map((turn, turnIndex) => {
          // System turns (context_cleared) render as a divider bar
          if (turn.speaker === 'system') {
            // Still increment globalIdx for system items
            turn.items.forEach(() => globalIdx++);
            return (
              <div key={`turn-${turnIndex}`} className="turn-group turn-system">
                <div className="context-cleared-bar">
                  <Separator className="context-cleared-line" />
                  <span className="context-cleared-label">
                    Context cleared
                  </span>
                  <span className="context-cleared-time">
                    {formatTurnTime(turn.timestamp)}
                  </span>
                  <Separator className="context-cleared-line" />
                </div>
              </div>
            );
          }

          // Track which items in this turn are "first message" (non-tool, non-stack)
          let seenMessage = false;

          const agentName = persona?.character || 'Agent';
          const role = persona?.role || null;
          const roleAbbrev = role ? (AGENT_ABBREV[role] || role) : null;
          const roleColor = role ? (AGENT_COLORS[role] || '#e879f9') : undefined;
          const userName = projectInfo?.githubUsername || 'You';

          return (
            <div key={`turn-${turnIndex}`} className={`turn-group turn-${turn.speaker}`}>
              <div className="turn-label">
                <span className="turn-speaker">
                  {turn.speaker === 'user' ? userName : agentName}
                </span>
                {turn.speaker === 'agent' && roleAbbrev && (
                  <Badge
                    variant="default"
                    className="turn-role-badge"
                    style={{ backgroundColor: roleColor }}
                  >
                    {roleAbbrev}
                  </Badge>
                )}
                <span className="turn-timestamp">
                  {formatTurnTime(turn.timestamp)}
                </span>
              </div>
              {turn.items.map((item) => {
                const idx = globalIdx++;
                const isMessage = !('isToolStack' in item) && !('messages' in item) && (item as MessageData).type !== 'tool_use';
                const isFirst = isMessage && !seenMessage;
                if (isMessage) seenMessage = true;
                return renderItem(item, idx, isFirst);
              })}
            </div>
          );
        })}
      </MessageList>

      {lastAssistantMessage && (
        <QuickActions message={lastAssistantMessage} />
      )}

      <div
        data-testid="auto-scroll-indicator"
        data-active={isAtBottom.toString()}
        className="auto-scroll-indicator"
        style={{ display: 'none' }}
      />

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
