/**
 * Message Component
 *
 * Renders a single message with avatar and content.
 * Story MSSCI-12698 - MessageView Component with Streaming
 * Story MSSCI-12777 - User Avatar from GitHub
 */

import React, { useState } from 'react';
import { parseMarkdown } from '../js/components/message-view/markdown-parser.js';
import StreamingContent from './StreamingContent';
import { usePersona } from '../hooks/usePersona';
import { useUserAvatar } from '../hooks/useUserAvatar';

interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
  isStreaming?: boolean;
}

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

  // For streaming assistant messages, use StreamingContent with throbbing avatar
  if (message.type === 'assistant' && message.isStreaming) {
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
      <div className="message-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
