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
import { useMessageQueue, QueuedMessage, InjectDependencies } from '../../hooks/useMessageQueue';
import { useClaudeContext } from '../../contexts/ClaudeContext';
import type { ClaudeMessage } from '../../hooks/useClaude';

// =============================================================================
// Types
// =============================================================================

interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'bell_injected';
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
  /** Number of images attached to user message */
  imageCount?: number;
}

// Content block types from SDK nested format (AC5: Story 75-5)
interface SDKTextBlock {
  type: 'text';
  text: string;
}

interface SDKToolUseBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

type SDKContentBlock = SDKTextBlock | SDKToolUseBlock | { type: string; text?: string };

interface SDKMessage {
  type: string;
  message?: {
    content?: Array<SDKContentBlock>;
  };
  content?: string | Array<SDKContentBlock>;
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

/**
 * Transform SDK message to MessageData.
 * Returns an array because nested SDK format may contain both text and tool_use blocks.
 * (AC5: Story 75-5 - Extract tool_use from nested SDK format)
 */
function transformMessage(sdkMessage: SDKMessage): MessageData[] {
  const timestamp = Date.now();
  // Map parent_tool_use_id to parent_id for subagent grouping
  const parent_id = sdkMessage.parent_tool_use_id || undefined;
  const subagent_type = sdkMessage.subagent_type;
  const subagent_name = sdkMessage.subagent_name;

  const results: MessageData[] = [];

  // Handle assistant/message type
  if (sdkMessage.type === 'assistant' || sdkMessage.type === 'message') {
    const contentArray = sdkMessage.message?.content || sdkMessage.content;

    if (Array.isArray(contentArray)) {
      // Extract text blocks
      const textContent = contentArray
        .filter((block): block is SDKTextBlock =>
          block.type === 'text' && typeof (block as SDKTextBlock).text === 'string'
        )
        .map(block => block.text)
        .join('');

      // Add text message if we have content (AC5: only if >= 3 chars)
      if (textContent && textContent.trim().length >= 3) {
        results.push({
          type: 'assistant',
          content: textContent,
          timestamp,
          isStreaming: true,
          parent_id,
          subagent_type,
          subagent_name,
        });
      }

      // Extract tool_use blocks from nested SDK format (AC5: Story 75-5)
      const toolUseBlocks = contentArray.filter(
        (block): block is SDKToolUseBlock => block.type === 'tool_use'
      );

      for (const toolBlock of toolUseBlocks) {
        results.push({
          type: 'tool_use',
          tool_name: toolBlock.name,
          tool_id: toolBlock.id,
          input: toolBlock.input,
          timestamp,
          parent_id,
          subagent_type,
          subagent_name,
        });
      }
    } else if (typeof contentArray === 'string') {
      if (contentArray.trim().length >= 3) {
        results.push({
          type: 'assistant',
          content: contentArray,
          timestamp,
          isStreaming: true,
          parent_id,
          subagent_type,
          subagent_name,
        });
      }
    }

    return results;
  }

  // Handle user messages
  if (sdkMessage.type === 'user') {
    let content = '';
    const contentArray = sdkMessage.message?.content || sdkMessage.content;
    if (Array.isArray(contentArray)) {
      content = contentArray
        .filter((block): block is SDKTextBlock =>
          block.type === 'text' && typeof (block as SDKTextBlock).text === 'string'
        )
        .map(block => block.text)
        .join('');
    } else if (typeof contentArray === 'string') {
      content = contentArray;
    }

    if (content) {
      results.push({
        type: 'user',
        content,
        timestamp,
        parent_id,
        subagent_type,
        subagent_name,
      });
    }

    return results;
  }

  // Handle discrete tool_use (not nested in assistant message)
  if (sdkMessage.type === 'tool_use') {
    results.push({
      type: 'tool_use',
      tool_name: sdkMessage.tool_name,
      tool_id: sdkMessage.tool_id,
      input: sdkMessage.input,
      timestamp,
      parent_id,
      subagent_type,
      subagent_name,
    });
    return results;
  }

  // Handle tool_result (MSSCI-13402: include is_error and durationMs)
  if (sdkMessage.type === 'tool_result') {
    results.push({
      type: 'tool_result',
      tool_id: sdkMessage.tool_id,
      content: typeof sdkMessage.output === 'string' ? sdkMessage.output : '',
      timestamp,
      parent_id,
      subagent_type,
      subagent_name,
      is_error: sdkMessage.is_error,
      durationMs: sdkMessage.durationMs,
    });
    return results;
  }

  return results;
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
  const { send, abort, onMessage, onComplete, onError, isConnected } = useClaudeContext();

  // Message queue hook for turn complete handling and bell mode
  const { handleTurnComplete, pauseQueue, onBellConsumed, injectMessage } = useMessageQueue();

  // Ref to track the submit function for turn complete
  const submitRef = useRef<(text: string, images: QueuedMessage['images']) => void>();

  // Subscribe to bell-consumed events to display injected messages
  useEffect(() => {
    const unsubscribe = onBellConsumed((consumedMessage) => {
      // Add bell-injected message to the message view
      setMessages(prev => [...prev, {
        type: 'bell_injected',
        content: consumedMessage.text,
        timestamp: Date.now(),
        imageCount: consumedMessage.images.length > 0 ? consumedMessage.images.length : undefined,
      }]);
    });

    return unsubscribe;
  }, [onBellConsumed]);

  // Create inject dependencies for "Send Now" button
  const injectDeps: InjectDependencies = {
    abort,
    submit: (text, images) => {
      // Add user message to view immediately
      setMessages(prev => [...prev, {
        type: 'user',
        content: text,
        timestamp: Date.now(),
        imageCount: images.length > 0 ? images.length : undefined,
      }]);
      setIsProcessing(true);
      send(text, images);
    },
  };

  // Handle incoming SDK message
  const handleSDKMessage = useCallback((sdkMessage: ClaudeMessage) => {
    const transformed = transformMessage(sdkMessage as SDKMessage);
    if (transformed.length > 0) {
      setMessages(prev => [...prev, ...transformed]);
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
      imageCount: images.length > 0 ? images.length : undefined,
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
              onInject={(index) => injectMessage(index, injectDeps)}
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
