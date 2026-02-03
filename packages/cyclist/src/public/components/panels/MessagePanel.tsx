/**
 * MessagePanel - Center panel containing MessageView and Editor
 *
 * Story MSSCI-12717 - React Migration
 *
 * This panel wraps the message display and editor input in a single
 * component for the docking workspace center region.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MessageView from '../MessageView';
import Editor, { PastedImage } from '../Editor';
import { ControlBar, useControlBar } from '../ControlBar';
import PersonaHeader from '../PersonaHeader';
import StatsStrip from '../StatsStrip';
import { useMessageQueue, QueuedMessage } from '../../hooks/useMessageQueue';
import { useClaudeContext } from '../../contexts/ClaudeContext';
import type { ClaudeMessage } from '../../hooks/useClaude';

// =============================================================================
// Types
// =============================================================================

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
  /** Whether this tool result represents an error (MSSCI-13402) */
  is_error?: boolean;
  /** Duration in milliseconds for tool execution (MSSCI-13402) */
  durationMs?: number;
}

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
  /** Duration in milliseconds for tool execution (MSSCI-13402) */
  durationMs?: number;
  parent_tool_use_id?: string | null;
  subagent_type?: string;
  subagent_name?: string;
}

// =============================================================================
// Message Transform
// =============================================================================

function transformMessage(sdkMessage: SDKMessage): MessageData | null {
  const timestamp = Date.now();
  // Map parent_tool_use_id to parent_id for subagent grouping
  const parent_id = sdkMessage.parent_tool_use_id || undefined;
  const subagent_type = sdkMessage.subagent_type;
  const subagent_name = sdkMessage.subagent_name;

  // Handle assistant/message type
  if (sdkMessage.type === 'assistant' || sdkMessage.type === 'message') {
    let content = '';
    const contentArray = sdkMessage.message?.content || sdkMessage.content;
    if (Array.isArray(contentArray)) {
      content = contentArray
        .filter((block): block is { type: string; text: string } =>
          block.type === 'text' && typeof block.text === 'string'
        )
        .map(block => block.text)
        .join('');
    } else if (typeof contentArray === 'string') {
      content = contentArray;
    }

    if (!content || content.trim().length < 3) {
      return null;
    }

    return {
      type: 'assistant',
      content,
      timestamp,
      isStreaming: true,
      parent_id,
      subagent_type,
      subagent_name,
    };
  }

  // Handle user messages
  if (sdkMessage.type === 'user') {
    let content = '';
    const contentArray = sdkMessage.message?.content || sdkMessage.content;
    if (Array.isArray(contentArray)) {
      content = contentArray
        .filter((block): block is { type: string; text: string } =>
          block.type === 'text' && typeof block.text === 'string'
        )
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
      parent_id,
      subagent_type,
      subagent_name,
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
      parent_id,
      subagent_type,
      subagent_name,
    };
  }

  // Handle tool_result (MSSCI-13402: include is_error and durationMs)
  if (sdkMessage.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_id: sdkMessage.tool_id,
      content: typeof sdkMessage.output === 'string' ? sdkMessage.output : '',
      timestamp,
      parent_id,
      subagent_type,
      subagent_name,
      is_error: sdkMessage.is_error,
      durationMs: sdkMessage.durationMs,
    };
  }

  return null;
}

// =============================================================================
// MessagePanel Component
// =============================================================================

export function MessagePanel(): React.ReactElement {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    isRunning,
    isStopping,
    bellMode,
    relayMode,
    handleStop,
    handleForceStop,
    handleReset,
    handleBellModeChange,
    handleRelayModeChange,
  } = useControlBar();

  // Claude context for WebSocket communication
  const { send, onMessage, onComplete, onError, isConnected } = useClaudeContext();

  // Message queue hook for turn complete handling
  const { handleTurnComplete, pauseQueue } = useMessageQueue();

  // Ref to track the submit function for turn complete
  const submitRef = useRef<(text: string, images: QueuedMessage['images']) => void>();

  // Handle incoming SDK message
  const handleSDKMessage = useCallback((sdkMessage: ClaudeMessage) => {
    const transformed = transformMessage(sdkMessage as SDKMessage);
    if (transformed) {
      setMessages(prev => [...prev, transformed]);
    }
  }, []);

  // Handle query completion
  const handleComplete = useCallback(() => {
    setIsProcessing(false);
    // Mark ALL assistant messages as no longer streaming
    setMessages(prev => prev.map(msg =>
      msg.type === 'assistant' && msg.isStreaming
        ? { ...msg, isStreaming: false }
        : msg
    ));

    // MSSCI-12450: Process queued messages on turn complete
    // Uses the submit function via ref to send queued messages
    if (submitRef.current) {
      handleTurnComplete(submitRef.current);
    }
  }, [handleTurnComplete]);

  // Handle SDK error
  const handleError = useCallback((error: string) => {
    setIsProcessing(false);
    setMessages(prev => [...prev, {
      type: 'assistant',
      content: `Error: ${error}`,
      timestamp: Date.now(),
    }]);
  }, []);

  // Connect to Claude events via WebSocket context
  useEffect(() => {
    if (!isConnected) {
      console.log('[MessagePanel] Claude WebSocket not connected');
      return;
    }

    const cleanupMessage = onMessage(handleSDKMessage);
    const cleanupComplete = onComplete(handleComplete);
    const cleanupError = onError(handleError);

    // Cleanup listeners on unmount or dependency change to prevent duplicates
    return () => {
      cleanupMessage();
      cleanupComplete();
      cleanupError();
    };
  }, [isConnected, onMessage, onComplete, onError, handleSDKMessage, handleComplete, handleError]);

  // Handle editor submit
  const handleSubmit = useCallback((text: string, images: PastedImage[]) => {
    // Add user message to view immediately
    setMessages(prev => [...prev, {
      type: 'user',
      content: text,
      timestamp: Date.now(),
    }]);

    setIsProcessing(true);

    // Send to Claude via WebSocket
    send(text, images);
  }, [send]);

  // Update submit ref for turn complete
  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Pause queue on stop (prevent auto-advance after abort)
  const handleStopWithPause = useCallback(() => {
    pauseQueue();
    handleStop();
  }, [pauseQueue, handleStop]);

  return (
    <div className="message-panel" data-testid="message-panel">
      <PersonaHeader />
      <div className="message-panel-content">
        <MessageView messages={messages} />
      </div>
      <div className="message-panel-editor">
        <div className="editor-with-controls">
          <div className="editor-area">
            <Editor
              onSubmit={handleSubmit}
              isProcessing={isProcessing || isRunning}
              placeholder="Send a message..."
            />
          </div>
          <ControlBar
            isRunning={isRunning || isProcessing}
            isStopping={isStopping}
            onStop={handleStopWithPause}
            onForceStop={handleForceStop}
            onReset={handleReset}
            bellMode={bellMode}
            relayMode={relayMode}
            onBellModeChange={handleBellModeChange}
            onRelayModeChange={handleRelayModeChange}
          />
        </div>
      </div>
      <StatsStrip />
    </div>
  );
}

export default MessagePanel;
