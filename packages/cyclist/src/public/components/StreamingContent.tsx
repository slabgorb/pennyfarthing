/**
 * StreamingContent Component
 *
 * Displays progressively streaming text with cursor indicator.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React from 'react';
import { parseMarkdown } from '../js/components/message-view/markdown-parser.js';

interface StreamingContentProps {
  content: string;
  isStreaming: boolean;
}

export default function StreamingContent({ content }: StreamingContentProps): React.ReactElement {
  const html = parseMarkdown(content);

  return (
    <div data-testid="streaming-content" className="streaming-content">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
