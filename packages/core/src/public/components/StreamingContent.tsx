/**
 * StreamingContent Component
 *
 * Displays progressively streaming text with cursor indicator.
 * Story MSSCI-12698 - MessageView Component with Streaming
 * Story MSSCI-12771 - Accessibility Compliance (screen reader announcements)
 */

import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdown } from '../utils/markdown';

interface StreamingContentProps {
  content: string;
  isStreaming: boolean;
}

export default function StreamingContent({ content, isStreaming }: StreamingContentProps): React.ReactElement {
  const html = parseMarkdown(content);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const lastAnnouncedLength = useRef(0);
  const announceThrottleRef = useRef<NodeJS.Timeout | null>(null);

  // Announce streaming state changes
  useEffect(() => {
    if (isStreaming) {
      setStatusMessage('Claude is thinking...');
    } else if (content && lastAnnouncedLength.current > 0) {
      setStatusMessage('Response complete');
    }
  }, [isStreaming, content]);

  // Throttled content announcements during streaming
  useEffect(() => {
    if (!isStreaming) {
      lastAnnouncedLength.current = content.length;
      return;
    }

    // Clear any pending announcement
    if (announceThrottleRef.current) {
      clearTimeout(announceThrottleRef.current);
    }

    // Throttle announcements to every 2 seconds to avoid screen reader overload
    announceThrottleRef.current = setTimeout(() => {
      if (content.length > lastAnnouncedLength.current) {
        lastAnnouncedLength.current = content.length;
      }
    }, 2000);

    return () => {
      if (announceThrottleRef.current) {
        clearTimeout(announceThrottleRef.current);
      }
    };
  }, [content, isStreaming]);

  return (
    <>
      {/* Status region for streaming state changes */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {statusMessage}
      </div>

      {/* Main streaming content */}
      <div
        data-testid="streaming-content"
        className="streaming-content"
        aria-busy={isStreaming}
        aria-atomic="false"
        aria-live="polite"
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}
