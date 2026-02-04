/**
 * MessageQueueContext
 *
 * React context for shared message queue state.
 * Story MSSCI-14191 - Bug fix for dual hook instances
 *
 * THE BUG: Editor.tsx and MessagePanel.tsx each called useMessageQueue() separately,
 * creating TWO independent state instances. Editor displayed the queue correctly,
 * but MessagePanel's injectMessage and handleTurnComplete operated on an empty queue.
 *
 * THE FIX: This context wraps useMessageQueue and provides a single shared instance
 * to all components that need queue access.
 */

import React, { createContext, useContext, useMemo } from 'react';
import {
  useMessageQueue,
  QueuedMessage,
  BellConsumedCallback,
  InjectDependencies,
} from '../hooks/useMessageQueue';

// =============================================================================
// Types
// =============================================================================

interface MessageQueueContextValue {
  queue: QueuedMessage[];
  queueCount: number;
  isProcessing: boolean;
  bellMode: boolean;
  queuePaused: boolean;
  queueMessage: (message: QueuedMessage) => boolean;
  dequeueMessage: () => QueuedMessage | null;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setProcessing: (value: boolean) => void;
  setBellMode: (value: boolean) => void;
  pauseQueue: () => void;
  resumeQueue: () => void;
  handleTurnComplete: (onSubmit: (text: string, images: QueuedMessage['images']) => void) => void;
  onBellConsumed: (callback: BellConsumedCallback) => () => void;
  injectMessage: (index: number, deps: InjectDependencies) => Promise<boolean>;
}

// =============================================================================
// Context
// =============================================================================

const MessageQueueContext = createContext<MessageQueueContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface MessageQueueProviderProps {
  children: React.ReactNode;
}

export function MessageQueueProvider({ children }: MessageQueueProviderProps): React.ReactElement {
  // Single instance of useMessageQueue for the entire app
  const {
    queue,
    queueCount,
    isProcessing,
    bellMode,
    queuePaused,
    queueMessage,
    dequeueMessage,
    removeFromQueue,
    clearQueue,
    setProcessing,
    setBellMode,
    pauseQueue,
    resumeQueue,
    handleTurnComplete,
    onBellConsumed,
    injectMessage,
  } = useMessageQueue();

  const value = useMemo(() => ({
    queue,
    queueCount,
    isProcessing,
    bellMode,
    queuePaused,
    queueMessage,
    dequeueMessage,
    removeFromQueue,
    clearQueue,
    setProcessing,
    setBellMode,
    pauseQueue,
    resumeQueue,
    handleTurnComplete,
    onBellConsumed,
    injectMessage,
  }), [
    queue,
    queueCount,
    isProcessing,
    bellMode,
    queuePaused,
    queueMessage,
    dequeueMessage,
    removeFromQueue,
    clearQueue,
    setProcessing,
    setBellMode,
    pauseQueue,
    resumeQueue,
    handleTurnComplete,
    onBellConsumed,
    injectMessage,
  ]);

  return (
    <MessageQueueContext.Provider value={value}>
      {children}
    </MessageQueueContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Use the shared message queue context.
 * This replaces direct useMessageQueue() calls in components that need shared state.
 */
export function useMessageQueueContext(): MessageQueueContextValue {
  const context = useContext(MessageQueueContext);
  if (!context) {
    throw new Error('useMessageQueueContext must be used within a MessageQueueProvider');
  }
  return context;
}

// Re-export types for convenience
export type { QueuedMessage, BellConsumedCallback, InjectDependencies };

export default MessageQueueContext;
