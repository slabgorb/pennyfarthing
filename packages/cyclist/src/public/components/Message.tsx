/**
 * Message Component
 *
 * Renders a single message with avatar and content.
 * Story MSSCI-12698 - MessageView Component with Streaming
 * Story MSSCI-12777 - User Avatar from GitHub
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parseMarkdown } from '../utils/markdown';
import StreamingContent from './StreamingContent';
import { usePersona } from '../hooks/usePersona';
import { useUserAvatar } from '../hooks/useUserAvatar';
import type { MessageData } from '../types/message';

interface MessageProps {
  message: MessageData;
  isLastAgentMessage?: boolean;
  /** Whether this is the first message in a turn (shows avatar) */
  isFirstInTurn?: boolean;
}

interface AssistantAvatarProps {
  isStreaming?: boolean;
  agentSlug?: string;
  agentTheme?: string;
  agentCharacter?: string;
}

function AssistantAvatar({ isStreaming, agentSlug, agentTheme, agentCharacter }: AssistantAvatarProps): React.ReactElement {
  const { persona } = usePersona();
  const [imageError, setImageError] = useState(false);

  // Use per-message persona if available, fall back to current global persona
  const slug = agentSlug || persona?.slug;
  const theme = agentTheme || persona?.theme;
  const character = agentCharacter || persona?.character;
  const avatarClass = isStreaming ? 'avatar-portrait avatar-thinking' : 'avatar-portrait';

  if (slug && theme && !imageError) {
    return (
      <img
        src={`/portraits/${theme}/small/${slug}.png`}
        alt={character || 'Agent'}
        className={avatarClass}
        onError={() => setImageError(true)}
      />
    );
  }

  return <span className={isStreaming ? 'avatar-emoji avatar-thinking' : 'avatar-emoji'}>🤖</span>;
}

function UserAvatar(): React.ReactElement {
  const { avatarUrl, isLoading } = useUserAvatar();
  const [imageError, setImageError] = useState(false);

  if (isLoading) {
    return <span className="avatar-emoji">👤</span>;
  }

  if (avatarUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt="User"
        className="avatar-portrait"
        onError={() => setImageError(true)}
      />
    );
  }

  return <span className="avatar-emoji">👤</span>;
}

function useSortableTables(contentRef: React.RefObject<HTMLDivElement | null>) {
  const attachSort = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const headers = el.querySelectorAll<HTMLTableCellElement>('th.sortable-th');
    headers.forEach((th) => {
      if (th.dataset.sortBound) return;
      th.dataset.sortBound = '1';
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const colIdx = parseInt(th.dataset.col || '0', 10);
        const table = th.closest('table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const currentDir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';

        // Clear all indicators in this table
        table.querySelectorAll<HTMLTableCellElement>('th.sortable-th').forEach((h) => {
          h.dataset.sortDir = '';
          const ind = h.querySelector('.sort-indicator');
          if (ind) ind.textContent = '';
        });

        th.dataset.sortDir = currentDir;
        const indicator = th.querySelector('.sort-indicator');
        if (indicator) indicator.textContent = currentDir === 'asc' ? ' \u25B2' : ' \u25BC';

        rows.sort((a, b) => {
          const aText = (a.children[colIdx]?.textContent || '').trim();
          const bText = (b.children[colIdx]?.textContent || '').trim();
          const aNum = parseFloat(aText);
          const bNum = parseFloat(bText);
          // Numeric sort if both parse as numbers
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return currentDir === 'asc' ? aNum - bNum : bNum - aNum;
          }
          const cmp = aText.localeCompare(bText, undefined, { sensitivity: 'base' });
          return currentDir === 'asc' ? cmp : -cmp;
        });

        for (const row of rows) {
          tbody.appendChild(row);
        }
      });
    });
  }, [contentRef]);

  useEffect(() => {
    attachSort();
  });
}

export default function Message({ message, isLastAgentMessage, isFirstInTurn = true }: MessageProps): React.ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  useSortableTables(contentRef);
  const roleClass = `message-${message.type}`;
  const testId = `message-${message.type}`;
  const continuationClass = !isFirstInTurn ? ' continuation' : '';

  // For bell-injected messages (queued messages injected via PostToolUse hook)
  // Show with 🔔 indicator so user knows it was sent mid-turn
  if (message.type === 'bell_injected') {
    const html = message.content ? parseMarkdown(message.content) : '';
    return (
      <TooltipProvider delayDuration={300}>
        <div data-testid="message-bell-injected" className={`message message-user message-bell-injected${continuationClass}`}>
          <div data-testid="avatar" className="message-avatar">
            <UserAvatar />
          </div>
          <div className="message-content">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="bell-indicator">🔔</Badge>
              </TooltipTrigger>
              <TooltipContent>Injected via Bell Mode</TooltipContent>
            </Tooltip>
            <div dangerouslySetInnerHTML={{ __html: html }} />
            {message.imageCount && message.imageCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="message-attachment-indicator">
                    📎 {message.imageCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{`${message.imageCount} image${message.imageCount > 1 ? 's' : ''} attached`}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // For streaming agent messages, use StreamingContent with throbbing avatar
  // Only throb the last agent message's avatar
  if (message.type === 'agent' && message.isStreaming) {
    const showThrob = isLastAgentMessage !== false;
    return (
      <div data-testid={testId} className={`message ${roleClass}${continuationClass}`}>
        <div data-testid="avatar" className="message-avatar">
          <AssistantAvatar
            isStreaming={showThrob}
            agentSlug={message.agentSlug}
            agentTheme={message.agentTheme}
            agentCharacter={message.agentCharacter}
          />
        </div>
        <div className="message-content">
          <StreamingContent content={message.content || ''} isStreaming={message.isStreaming ?? false} />
        </div>
      </div>
    );
  }

  // For regular messages, render markdown
  const html = message.content ? parseMarkdown(message.content) : '';

  return (
    <div data-testid={testId} className={`message ${roleClass}${continuationClass}`} ref={contentRef}>
      <div data-testid="avatar" className="message-avatar">
        {message.type === 'user' ? <UserAvatar /> : (
          <AssistantAvatar
            agentSlug={message.agentSlug}
            agentTheme={message.agentTheme}
            agentCharacter={message.agentCharacter}
          />
        )}
      </div>
      <div className="message-content">
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {message.type === 'user' && message.imageCount && message.imageCount > 0 && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="message-attachment-indicator">
                  📎 {message.imageCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{`${message.imageCount} image${message.imageCount > 1 ? 's' : ''} attached`}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
