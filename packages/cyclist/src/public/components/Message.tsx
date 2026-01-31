/**
 * Message Component
 *
 * Renders a single message with avatar and content.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React from 'react';

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
  throw new Error('Message not implemented');
}
