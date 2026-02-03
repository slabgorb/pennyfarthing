/**
 * useClaude Hook
 *
 * WebSocket-based hook for Claude API communication.
 * Part of IPC-to-WebSocket migration (Phase 1).
 *
 * Replaces window.electronAPI.claude with unified WebSocket communication.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions';

export interface PastedImage {
  dataUrl: string;
  mimeType: string;
  filename: string;
}

export interface ClaudeMessage {
  type: string;
  message?: unknown;
  content?: string | Array<{ type: string; text?: string }>;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  parent_tool_use_id?: string | null;
  subagent_type?: string;
  subagent_name?: string;
}

interface WebSocketClaudeMessage {
  type: 'message' | 'complete' | 'error' | 'init' | 'mode';
  message?: ClaudeMessage;
  error?: string;
  mode?: PermissionMode;
}

export interface UseClaudeResult {
  /** Send a message to Claude */
  send: (prompt: string, images?: PastedImage[]) => void;
  /** Abort the current query */
  abort: () => void;
  /** Clear the session */
  clear: () => void;
  /** Set permission mode */
  setMode: (mode: PermissionMode) => void;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Current permission mode */
  mode: PermissionMode;
}

export interface UseClaudeCallbacks {
  onMessage?: (message: ClaudeMessage) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useClaude(callbacks?: UseClaudeCallbacks): UseClaudeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setModeState] = useState<PermissionMode>('default');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/claude`;

    console.log('[useClaude] Connecting to', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useClaude] Connected');
      setIsConnected(true);
      // Request current mode from server
      ws.send(JSON.stringify({ type: 'getMode' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketClaudeMessage;

        switch (data.type) {
          case 'message':
            if (data.message && callbacksRef.current?.onMessage) {
              callbacksRef.current.onMessage(data.message);
            }
            break;

          case 'complete':
            if (callbacksRef.current?.onComplete) {
              callbacksRef.current.onComplete();
            }
            break;

          case 'error':
            if (data.error && callbacksRef.current?.onError) {
              callbacksRef.current.onError(data.error);
            }
            break;

          case 'init':
            // Initial connection acknowledgment
            console.log('[useClaude] Init received');
            break;

          case 'mode':
            // Server responded with current permission mode
            if (data.mode) {
              console.log('[useClaude] Mode received:', data.mode);
              setModeState(data.mode);
            }
            break;
        }
      } catch (err) {
        console.error('[useClaude] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[useClaude] Disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Attempt reconnection after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[useClaude] Attempting reconnect...');
        connect();
      }, 2000);
    };

    ws.onerror = (error) => {
      console.error('[useClaude] WebSocket error:', error);
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
      console.error('[useClaude] Cannot send: not connected');
      callbacksRef.current?.onError?.('Not connected to Claude service');
      return;
    }

    if (images && images.length > 0) {
      console.log(`[useClaude] Sending ${images.length} image(s) with prompt`);
    }

    wsRef.current.send(JSON.stringify({
      type: 'send',
      prompt,
      images: images || [],
    }));
  }, []);

  // Abort query
  const abort = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useClaude] Cannot abort: not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'abort' }));
  }, []);

  // Clear session
  const clear = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useClaude] Cannot clear: not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'clear' }));
  }, []);

  // Set permission mode
  const setMode = useCallback((newMode: PermissionMode) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useClaude] Cannot set mode: not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'setMode', mode: newMode }));
    setModeState(newMode);
  }, []);

  return {
    send,
    abort,
    clear,
    setMode,
    isConnected,
    mode,
  };
}

export default useClaude;
