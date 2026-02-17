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

// Stub — not implemented
export function MessageFeed({ messages }: MessageFeedProps): React.ReactElement {
  return <div data-testid="message-feed" />;
}

export default MessageFeed;
