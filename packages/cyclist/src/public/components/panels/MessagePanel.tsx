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
import { useMessageQueueContext, QueuedMessage, InjectDependencies } from '../../contexts/MessageQueueContext';
import { useClaudeContext } from '../../contexts/ClaudeContext';
import { usePersona } from '../../hooks/usePersona';
import type { ClaudeMessage } from '../../hooks/useClaude';
import type { MessageData } from '../../types/message';

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

interface SDKToolResultBlock {
  type: 'tool_result';
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

type SDKContentBlock = SDKTextBlock | SDKToolUseBlock | SDKToolResultBlock | { type: string; text?: string };

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
 * Check if content is Stop hook feedback that should be hidden.
 * Stop hook feedback messages are internal enforcement messages, not user-facing content.
 * Example: "Stop hook feedback:\nMissing CYCLIST marker..."
 */
function isStopHookFeedback(content: string): boolean {
  return content.startsWith('Stop hook feedback:');
}

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
      // Filter out Stop hook feedback messages - they're internal enforcement, not user content
      if (textContent && textContent.trim().length >= 3 && !isStopHookFeedback(textContent.trim())) {
        results.push({
          type: 'agent',
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
      // Filter out Stop hook feedback messages - they're internal enforcement, not user content
      if (contentArray.trim().length >= 3 && !isStopHookFeedback(contentArray.trim())) {
        results.push({
          type: 'agent',
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

  // Handle user messages (may contain tool_result blocks for completed Task tools)
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

      // MSSCI-14394: Extract tool_result blocks from user messages.
      // The SDK delivers tool results inside user-type messages with tool_use_id
      // matching the original tool_use's tool_id. Without extracting these,
      // the subagent cleanup code never fires and spans accumulate forever.
      const toolResultBlocks = contentArray.filter(
        (block): block is SDKToolResultBlock => block.type === 'tool_result'
      );
      for (const resultBlock of toolResultBlocks) {
        results.push({
          type: 'tool_result',
          tool_id: resultBlock.tool_use_id,
          content: typeof resultBlock.content === 'string' ? resultBlock.content : '',
          timestamp,
          is_error: resultBlock.is_error,
        });
      }
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
    contextPercent,
    currentAgent,
    handleStop,
    handleForceStop,
    handleReset,
    handleBellModeChange,
    handleRelayModeChange,
    handleTirePump,
  } = useControlBar();

  // Claude context for WebSocket communication
  const { send, abort, onMessage, onComplete, onError, onUserMessage, onClear, isConnected } = useClaudeContext();

  // Persona context - capture current persona to stamp on agent messages
  const { persona } = usePersona();
  const personaRef = useRef(persona);
  personaRef.current = persona;

  // Message queue context for turn complete handling and bell mode (shared with Editor)
  const { handleTurnComplete, pauseQueue, onBellConsumed, injectMessage } = useMessageQueueContext();

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
      // User message display is handled by onUserMessage subscription
      setIsProcessing(true);
      send(text, images);
    },
  };

  // Handle incoming SDK message - stamp current persona on agent messages
  const handleSDKMessage = useCallback((sdkMessage: ClaudeMessage) => {
    const transformed = transformMessage(sdkMessage as SDKMessage);
    if (transformed.length > 0) {
      const p = personaRef.current;
      const stamped = transformed.map(msg =>
        msg.type === 'agent' && p
          ? { ...msg, agentSlug: p.slug ?? undefined, agentTheme: p.theme ?? undefined, agentCharacter: p.character ?? undefined }
          : msg
      );

      // MSSCI-14394: When tool_results arrive for completed Task tools, remove their
      // subagent messages from the view (they have parent_id matching the tool_result's tool_id).
      const completedTaskIds = stamped
        .filter(m => m.type === 'tool_result' && !m.parent_id && m.tool_id)
        .map(m => m.tool_id!);

      if (completedTaskIds.length > 0) {
        setMessages(prev => {
          const idsToRemove = new Set(completedTaskIds.filter(id =>
            prev.some(m => m.parent_id === id)
          ));
          if (idsToRemove.size > 0) {
            return [...prev.filter(m => !m.parent_id || !idsToRemove.has(m.parent_id)), ...stamped];
          }
          return [...prev, ...stamped];
        });
      } else {
        setMessages(prev => [...prev, ...stamped]);
      }
    }
  }, []);

  // Handle query completion
  const handleComplete = useCallback(() => {
    setIsProcessing(false);
    // Mark ALL agent messages as no longer streaming
    setMessages(prev => prev.map(msg =>
      msg.type === 'agent' && msg.isStreaming
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
      type: 'agent',
      content: `Error: ${error}`,
      timestamp: Date.now(),
    }]);
  }, []);

  // Subscribe to user messages sent via send() - displays ALL user messages
  // regardless of origin (Editor, QuickActions, GitPanel, etc.)
  useEffect(() => {
    const cleanup = onUserMessage((userMessage) => {
      setMessages(prev => [...prev, {
        type: 'user',
        content: userMessage.prompt,
        timestamp: userMessage.timestamp,
        imageCount: userMessage.images.length > 0 ? userMessage.images.length : undefined,
      }]);
    });
    return cleanup;
  }, [onUserMessage]);

  // Subscribe to clear events — insert a divider message
  useEffect(() => {
    const cleanup = onClear(() => {
      setMessages(prev => [...prev, {
        type: 'context_cleared',
        content: 'Context cleared',
        timestamp: Date.now(),
      }]);
      setIsProcessing(false);
    });
    return cleanup;
  }, [onClear]);

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
    // User message display is handled by onUserMessage subscription
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

  // Resizable editor panel
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startY = e.clientY;
    const panelEl = panelRef.current;
    if (!panelEl) return;
    const panelRect = panelEl.getBoundingClientRect();
    const startEditorHeight = editorHeight ?? panelEl.querySelector('.message-panel-editor')?.getBoundingClientRect().height ?? 150;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY - ev.clientY;
      const newHeight = Math.max(80, Math.min(startEditorHeight + delta, panelRect.height * 0.7));
      setEditorHeight(newHeight);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [editorHeight]);

  return (
    <div className="message-panel" data-testid="message-panel" ref={panelRef}>
      <PersonaHeader />
      <div className="message-panel-content">
        <MessageView messages={messages} />
      </div>
      <div
        className="message-panel-resize-handle"
        onMouseDown={handleResizeStart}
      />
      <div
        className="message-panel-editor"
        style={editorHeight != null ? { height: editorHeight, flexShrink: 0 } : undefined}
      >
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
            contextPercent={contextPercent}
            currentAgent={currentAgent}
            onTirePump={handleTirePump}
          />
        </div>
      </div>
      <StatsStrip />
    </div>
  );
}

export default MessagePanel;
