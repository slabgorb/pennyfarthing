/**
 * MessageFeed - Inter-agent message history
 *
 * Story 86-12: Cyclist: Native team panel
 */

import React from 'react';
import type { TeamMessage } from '../../hooks/useTeamMembers';

export interface MessageFeedProps {
  messages: TeamMessage[];
}

export function MessageFeed({ messages }: MessageFeedProps): React.ReactElement {
  if (messages.length === 0) {
    return (
      <div data-testid="message-feed">
        <div data-testid="messages-empty">No messages</div>
      </div>
    );
  }

  return (
    <div data-testid="message-feed">
      {messages.map((msg, i) => (
        <div key={msg.timestamp + i} data-testid="team-message">
          <span data-testid="message-sender">{msg.from}</span>
          <span>{msg.content}</span>
          <span data-testid="message-timestamp">{msg.timestamp}</span>
          <span data-testid="message-type" data-type={msg.type}>
            {msg.type}
          </span>
        </div>
      ))}
    </div>
  );
}

export default MessageFeed;
