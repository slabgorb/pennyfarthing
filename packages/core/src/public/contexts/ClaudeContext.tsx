/**
 * ClaudeContext
 *
 * React context for shared Claude WebSocket connection.
 * Part of IPC-to-WebSocket migration (Phase 1).
 *
 * Provides a single WebSocket connection shared across all components
 * that need to interact with Claude (MessagePanel, ControlBar, QuickActions).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PastedImage, ClaudeMessage, PermissionMode } from '../hooks/useClaude';

// =============================================================================
// Types
// =============================================================================

interface WebSocketClaudeMessage {
  type: 'message' | 'complete' | 'error' | 'init';
  message?: ClaudeMessage;
  error?: string;
}

type MessageCallback = (message: ClaudeMessage) => void;
type CompleteCallback = () => void;
type ErrorCallback = (error: string) => void;
type ClearCallback = () => void;

/** User message sent via send() - for display in MessagePanel */
interface UserMessageData {
  prompt: string;
  images: PastedImage[];
  timestamp: number;
}
type UserMessageCallback = (message: UserMessageData) => void;

interface ClaudeContextValue {
  /** Send a message to Claude */
  send: (prompt: string, images?: PastedImage[]) => void;
  /** Abort the current query */
  abort: () => void;
  /** Clear the session */
  clear: () => void;
  /** Clear session and reload agent (TirePump) */
  clearAndReload: (agent: string) => void;
  /** Set permission mode */
  setMode: (mode: PermissionMode) => void;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Current permission mode */
  mode: PermissionMode;
  /** Subscribe to messages */
  onMessage: (callback: MessageCallback) => () => void;
  /** Subscribe to completion */
  onComplete: (callback: CompleteCallback) => () => void;
  /** Subscribe to errors */
  onError: (callback: ErrorCallback) => () => void;
  /** Subscribe to user messages sent via send() - for display in MessagePanel */
  onUserMessage: (callback: UserMessageCallback) => () => void;
  /** Subscribe to clear/reset events */
  onClear: (callback: ClearCallback) => () => void;
}

// =============================================================================
// Context
// =============================================================================

const ClaudeContext = createContext<ClaudeContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface ClaudeProviderProps {
  children: React.ReactNode;
}

export function ClaudeProvider({ children }: ClaudeProviderProps): React.ReactElement {
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setModeState] = useState<PermissionMode>('default');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Subscriber lists
  const messageCallbacksRef = useRef<Set<MessageCallback>>(new Set());
  const completeCallbacksRef = useRef<Set<CompleteCallback>>(new Set());
  const errorCallbacksRef = useRef<Set<ErrorCallback>>(new Set());
  const userMessageCallbacksRef = useRef<Set<UserMessageCallback>>(new Set());
  const clearCallbacksRef = useRef<Set<ClearCallback>>(new Set());

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/claude`;

    console.log('[ClaudeContext] Connecting to', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ClaudeContext] Connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketClaudeMessage;

        switch (data.type) {
          case 'message':
            if (data.message) {
              messageCallbacksRef.current.forEach(cb => cb(data.message!));
            }
            break;

          case 'complete':
            completeCallbacksRef.current.forEach(cb => cb());
            break;

          case 'error':
            if (data.error) {
              errorCallbacksRef.current.forEach(cb => cb(data.error!));
            }
            break;

          case 'init':
            console.log('[ClaudeContext] Init received');
            break;
        }
      } catch (err) {
        console.error('[ClaudeContext] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[ClaudeContext] Disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Attempt reconnection after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[ClaudeContext] Attempting reconnect...');
        connect();
      }, 2000);
    };

    ws.onerror = (error) => {
      console.error('[ClaudeContext] WebSocket error:', error);
    };
  }, []);

  // Initialize connection
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

  // Send message
  const send = useCallback((prompt: string, images?: PastedImage[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[ClaudeContext] Cannot send: not connected');
      errorCallbacksRef.current.forEach(cb => cb('Not connected to Claude service'));
      return;
    }

    // Notify subscribers that a user message was sent (for display in MessagePanel)
    const userMessage: UserMessageData = {
      prompt,
      images: images || [],
      timestamp: Date.now(),
    };
    userMessageCallbacksRef.current.forEach(cb => cb(userMessage));

    wsRef.current.send(JSON.stringify({
      type: 'send',
      prompt,
      images,
    }));
  }, []);

  // Abort query
  const abort = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[ClaudeContext] Cannot abort: not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'abort' }));
  }, []);

  // Clear session
  const clear = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[ClaudeContext] Cannot clear: not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'clear' }));
    clearCallbacksRef.current.forEach(cb => cb());
  }, []);

  // Clear session and reload agent (TirePump)
  const clearAndReload = useCallback((agent: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[ClaudeContext] Cannot clearAndReload: not connected');
      return;
    }

    console.log('[ClaudeContext] TirePump: clearAndReload agent:', agent);
    wsRef.current.send(JSON.stringify({ type: 'clearAndReload', agent }));
    clearCallbacksRef.current.forEach(cb => cb());
  }, []);

  // Set permission mode
  const setMode = useCallback((newMode: PermissionMode) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[ClaudeContext] Cannot set mode: not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'setMode', mode: newMode }));
    setModeState(newMode);
  }, []);

  // Subscribe to messages
  const onMessage = useCallback((callback: MessageCallback) => {
    messageCallbacksRef.current.add(callback);
    return () => {
      messageCallbacksRef.current.delete(callback);
    };
  }, []);

  // Subscribe to completion
  const onComplete = useCallback((callback: CompleteCallback) => {
    completeCallbacksRef.current.add(callback);
    return () => {
      completeCallbacksRef.current.delete(callback);
    };
  }, []);

  // Subscribe to errors
  const onError = useCallback((callback: ErrorCallback) => {
    errorCallbacksRef.current.add(callback);
    return () => {
      errorCallbacksRef.current.delete(callback);
    };
  }, []);

  // Subscribe to user messages sent via send()
  const onUserMessage = useCallback((callback: UserMessageCallback) => {
    userMessageCallbacksRef.current.add(callback);
    return () => {
      userMessageCallbacksRef.current.delete(callback);
    };
  }, []);

  // Subscribe to clear/reset events
  const onClear = useCallback((callback: ClearCallback) => {
    clearCallbacksRef.current.add(callback);
    return () => {
      clearCallbacksRef.current.delete(callback);
    };
  }, []);

  const value = useMemo(() => ({
    send,
    abort,
    clear,
    clearAndReload,
    setMode,
    isConnected,
    mode,
    onMessage,
    onComplete,
    onError,
    onUserMessage,
    onClear,
  }), [send, abort, clear, clearAndReload, setMode, isConnected, mode, onMessage, onComplete, onError, onUserMessage, onClear]);

  return (
    <ClaudeContext.Provider value={value}>
      {children}
    </ClaudeContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useClaudeContext(): ClaudeContextValue {
  const context = useContext(ClaudeContext);
  if (!context) {
    throw new Error('useClaudeContext must be used within a ClaudeProvider');
  }
  return context;
}

export default ClaudeContext;
