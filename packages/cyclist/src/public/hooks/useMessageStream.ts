/**
 * useMessageStream Hook
 *
 * React hook for subscribing to Claude message stream via WebSocket.
 * Migrated from IPC to WebSocket for unified communication.
 *
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MessageData } from '../types/message';

interface UseMessageStreamResult {
  messages: MessageData[];
  isStreaming: boolean;
  error: Error | null;
  isConnected: boolean;
}

interface WebSocketMessage {
  type: 'message' | 'complete' | 'error' | 'init' | 'mode';
  message?: {
    type: string;
    content?: string | Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
  error?: string;
}

export function useMessageStream(): UseMessageStreamResult {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleWebSocketMessage = useCallback((data: WebSocketMessage) => {
    if (data.type === 'message' && data.message) {
      const msg = data.message;

      // Extract content string
      let contentStr = '';
      if (typeof msg.content === 'string') {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentStr = msg.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('');
      }

      // Map SDK 'assistant' type to our internal 'agent' type
      const messageType = msg.type === 'assistant' ? 'agent' : msg.type as MessageData['type'];

      const message: MessageData = {
        type: messageType,
        content: contentStr,
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, message]);

      // Update streaming state for agent messages
      if (msg.type === 'assistant') {
        setIsStreaming(true);
      }
    } else if (data.type === 'complete') {
      setIsStreaming(false);
    } else if (data.type === 'error' && data.error) {
      setError(new Error(data.error));
      setIsStreaming(false);
    }
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/claude`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useMessageStream] Connected');
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        handleWebSocketMessage(data);
      } catch (err) {
        console.error('[useMessageStream] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[useMessageStream] Disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Attempt reconnection after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[useMessageStream] Attempting reconnect...');
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      setError(new Error('WebSocket connection failed'));
    };
  }, [handleWebSocketMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { messages, isStreaming, error, isConnected };
}
