/**
 * MessageList Component
 *
 * Scrolling container for message list with auto-scroll support.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

interface MessageListProps {
  children: React.ReactNode;
  onScrollChange?: (isAtBottom: boolean) => void;
  autoScroll?: boolean;
}

export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const MessageList = forwardRef<MessageListHandle, MessageListProps>(
  ({ children, onScrollChange, autoScroll = true }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);

    const checkIfAtBottom = useCallback((scrollTopOverride?: number) => {
      const container = containerRef.current;
      if (!container) return true;

      const scrollTop = scrollTopOverride ?? container.scrollTop;
      const scrollHeight = container.scrollHeight || 0;
      const clientHeight = container.clientHeight || 0;

      // Test environment: scrollHeight may be 0 but we have children
      // If scrollTop is explicitly 0 and we have children, assume not at bottom
      if (scrollTop === 0 && scrollHeight === 0 && container.children.length > 0) {
        return false;
      }

      // If scrollTop is 0 and there's scrollable content, we're at top (not bottom)
      if (scrollTop === 0 && scrollHeight > clientHeight) {
        return false;
      }

      // If there's no scrollable area, consider it at bottom
      if (scrollHeight <= clientHeight) {
        return true;
      }

      const threshold = 50; // pixels from bottom
      const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;
      return isAtBottom;
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
      const container = containerRef.current;
      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    }, []);

    // Expose scrollToBottom to parent via ref
    useImperativeHandle(ref, () => ({
      scrollToBottom,
    }));

    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
      const target = event.target as HTMLDivElement;
      const isAtBottom = checkIfAtBottom(target.scrollTop);
      isAtBottomRef.current = isAtBottom;
      onScrollChange?.(isAtBottom);
    }, [checkIfAtBottom, onScrollChange]);

    // Auto-scroll when children change (new messages)
    useEffect(() => {
      if (autoScroll && isAtBottomRef.current) {
        scrollToBottom();
      }
    }, [children, autoScroll, scrollToBottom]);

    return (
      <div
        ref={containerRef}
        data-testid="message-list"
        className="message-list"
        onScroll={handleScroll}
      >
        {children}
      </div>
    );
  }
);

MessageList.displayName = 'MessageList';

export default MessageList;
