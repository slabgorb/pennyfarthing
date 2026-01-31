/**
 * Message Component
 *
 * Renders a single message with avatar and content.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React from 'react';
import { parseMarkdown } from '../js/components/message-view/markdown-parser.js';
import StreamingContent from './StreamingContent';

interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface MessageProps {
  message: MessageData;
}

export default function Message({ message }: MessageProps): React.ReactElement {
  const roleClass = `message-${message.type}`;
  const testId = `message-${message.type}`;

  // For streaming assistant messages, use StreamingContent
  if (message.type === 'assistant' && message.isStreaming) {
    return (
      <div data-testid={testId} className={`message ${roleClass}`}>
        <div data-testid="avatar" className="message-avatar">
          {message.type === 'user' ? '👤' : '🤖'}
        </div>
        <div className="message-content">
          <StreamingContent content={message.content || ''} isStreaming={true} />
        </div>
      </div>
    );
  }

  // For regular messages, render markdown
  const html = message.content ? parseMarkdown(message.content) : '';

  return (
    <div data-testid={testId} className={`message ${roleClass}`}>
      <div data-testid="avatar" className="message-avatar">
        {message.type === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
