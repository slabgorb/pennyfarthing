/**
 * useMessageStream Hook
 *
 * React hook for subscribing to IPC message stream via electronAPI.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import { useState, useEffect, useCallback } from 'react';

interface Message {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface UseMessageStreamResult {
  messages: Message[];
  isStreaming: boolean;
  error: Error | null;
}

interface ElectronAPI {
  claude: {
    onMessage: (callback: (message: Message) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function useMessageStream(): UseMessageStreamResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);

    // Update streaming state
    if (message.type === 'assistant') {
      setIsStreaming(message.isStreaming ?? false);
    }
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.claude) {
      setError(new Error('electronAPI not available'));
      return;
    }

    let cleanup: (() => void) | undefined;
    try {
      cleanup = api.claude.onMessage(handleMessage);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connection failed'));
    }

    return () => {
      cleanup?.();
    };
  }, [handleMessage]);

  return { messages, isStreaming, error };
}
