/**
 * Root React component for Cyclist
 * Story MSSCI-12717 - Wire React MessageView to App.tsx
 *
 * Renders the MessageView component and connects it to SDK events.
 */

import React, { useState, useEffect, useCallback } from 'react';
import MessageView from './components/MessageView';

// Message data structure matching MessageView expectations
interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
  isStreaming?: boolean;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
  parent_id?: string;
  subagent_type?: string;
  subagent_name?: string;
}

// SDK message structure (from Claude Code CLI)
interface SDKMessage {
  type: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
}

// Electron API type (subset we use)
interface ElectronClaudeAPI {
  onMessage: (callback: (message: SDKMessage) => void) => void;
  onComplete: (callback: () => void) => void;
  onError: (callback: (error: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: {
      claude?: ElectronClaudeAPI;
    };
  }
}

/**
 * Transform SDK message to MessageData format expected by MessageView
 */
function transformMessage(sdkMessage: SDKMessage): MessageData | null {
  const timestamp = Date.now();

  // Handle assistant/message type
  if (sdkMessage.type === 'assistant' || sdkMessage.type === 'message') {
    // Extract text content from message.content array
    let content = '';
    const contentArray = sdkMessage.message?.content || sdkMessage.content;
    if (Array.isArray(contentArray)) {
      content = contentArray
        .filter((block): block is { type: string; text: string } => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('');
    } else if (typeof contentArray === 'string') {
      content = contentArray;
    }

    // Skip empty assistant messages
    if (!content || content.trim().length < 3) {
      return null;
    }

    return {
      type: 'assistant',
      content,
      timestamp,
      isStreaming: true, // Will be updated on complete
    };
  }

  // Handle user messages
  if (sdkMessage.type === 'user') {
    let content = '';
    const contentArray = sdkMessage.message?.content || sdkMessage.content;
    if (Array.isArray(contentArray)) {
      content = contentArray
        .filter((block): block is { type: string; text: string } => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('');
    } else if (typeof contentArray === 'string') {
      content = contentArray;
    }

    if (!content) return null;

    return {
      type: 'user',
      content,
      timestamp,
    };
  }

  // Handle tool_use
  if (sdkMessage.type === 'tool_use') {
    return {
      type: 'tool_use',
      tool_name: sdkMessage.tool_name,
      tool_id: sdkMessage.tool_id,
      input: sdkMessage.input,
      timestamp,
    };
  }

  // Handle tool_result
  if (sdkMessage.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_id: sdkMessage.tool_id,
      content: typeof sdkMessage.output === 'string' ? sdkMessage.output : '',
      timestamp,
    };
  }

  // Skip other message types (system, init, etc.)
  return null;
}

export default function App(): React.ReactElement {
  const [messages, setMessages] = useState<MessageData[]>([]);

  // Handle incoming SDK message
  const handleMessage = useCallback((sdkMessage: SDKMessage) => {
    console.log('[App] SDK message:', sdkMessage.type);

    const transformed = transformMessage(sdkMessage);
    if (transformed) {
      setMessages(prev => [...prev, transformed]);
    }
  }, []);

  // Handle query completion
  const handleComplete = useCallback(() => {
    console.log('[App] SDK query complete');
    // Mark last assistant message as no longer streaming
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].type === 'assistant' && updated[i].isStreaming) {
          updated[i] = { ...updated[i], isStreaming: false };
          break;
        }
      }
      return updated;
    });
  }, []);

  // Handle SDK error
  const handleError = useCallback((error: string) => {
    console.error('[App] SDK error:', error);
    // Add error as a message for visibility
    setMessages(prev => [...prev, {
      type: 'assistant',
      content: `Error: ${error}`,
      timestamp: Date.now(),
    }]);
  }, []);

  // Connect to SDK events on mount
  useEffect(() => {
    const claude = window.electronAPI?.claude;
    if (!claude) {
      console.log('[App] Claude SDK not available');
      return;
    }

    console.log('[App] Connecting to Claude SDK events');
    claude.onMessage(handleMessage);
    claude.onComplete(handleComplete);
    claude.onError(handleError);

    // Note: Electron IPC listeners don't have a cleanup mechanism in this pattern
    // The listeners are registered once and persist for the window lifetime
  }, [handleMessage, handleComplete, handleError]);

  return <MessageView messages={messages} />;
}
