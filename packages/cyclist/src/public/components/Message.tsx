/**
 * Message Component
 *
 * Renders a single message with avatar and content.
 * Story MSSCI-12698 - MessageView Component with Streaming
 * Story MSSCI-12777 - User Avatar from GitHub
 */

import React, { useState } from 'react';
import { parseMarkdown } from '../utils/markdown';
import StreamingContent from './StreamingContent';
import { usePersona } from '../hooks/usePersona';
import { useUserAvatar } from '../hooks/useUserAvatar';
import type { MessageData } from '../types/message';

interface MessageProps {
  message: MessageData;
}

interface AssistantAvatarProps {
  isStreaming?: boolean;
}

function AssistantAvatar({ isStreaming }: AssistantAvatarProps): React.ReactElement {
  const { persona } = usePersona();
  const [imageError, setImageError] = useState(false);

  const slug = persona?.slug;
  const theme = persona?.theme;
  const avatarClass = isStreaming ? 'avatar-portrait avatar-thinking' : 'avatar-portrait';

  if (slug && theme && !imageError) {
    return (
      <img
        src={`/portraits/${theme}/small/${slug}.png`}
        alt={persona?.character || 'Agent'}
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

export default function Message({ message }: MessageProps): React.ReactElement {
  const roleClass = `message-${message.type}`;
  const testId = `message-${message.type}`;

  // For bell-injected messages (queued messages injected via PostToolUse hook)
  // Show with 🔔 indicator so user knows it was sent mid-turn
  if (message.type === 'bell_injected') {
    const html = message.content ? parseMarkdown(message.content) : '';
    return (
      <div data-testid="message-bell-injected" className="message message-user message-bell-injected">
        <div data-testid="avatar" className="message-avatar">
          <UserAvatar />
        </div>
        <div className="message-content">
          <span className="bell-indicator" title="Injected via Bell Mode">🔔</span>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {message.imageCount && message.imageCount > 0 && (
            <span className="message-attachment-indicator" title={`${message.imageCount} image${message.imageCount > 1 ? 's' : ''} attached`}>
              📎 {message.imageCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  // For streaming agent messages, use StreamingContent with throbbing avatar
  if (message.type === 'agent' && message.isStreaming) {
    return (
      <div data-testid={testId} className={`message ${roleClass}`}>
        <div data-testid="avatar" className="message-avatar">
          <AssistantAvatar isStreaming={true} />
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
    <div data-testid={testId} className={`message ${roleClass}`}>
      <div data-testid="avatar" className="message-avatar">
        {message.type === 'user' ? <UserAvatar /> : <AssistantAvatar />}
      </div>
      <div className="message-content">
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {message.type === 'user' && message.imageCount && message.imageCount > 0 && (
          <span className="message-attachment-indicator" title={`${message.imageCount} image${message.imageCount > 1 ? 's' : ''} attached`}>
            📎 {message.imageCount}
          </span>
        )}
      </div>
    </div>
  );
}
