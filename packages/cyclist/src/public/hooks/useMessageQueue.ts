/**
 * useMessageQueue Hook
 *
 * React hook for message queueing while Claude is processing.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface QueuedMessage {
  text: string;
  images: Array<{
    dataUrl: string;
    mimeType: string;
    filename: string;
  }>;
}

interface UseMessageQueueResult {
  queue: QueuedMessage[];
  queueCount: number;
  isProcessing: boolean;
  queueMessage: (message: QueuedMessage) => boolean;
  dequeueMessage: () => QueuedMessage | null;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setProcessing: (value: boolean) => void;
}

const MAX_QUEUE_SIZE = 10;
const QUEUE_KEY = 'cyclist-message-queue';

export function useMessageQueue(): UseMessageQueueResult {
  const [queue, setQueue] = useState<QueuedMessage[]>(() => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef(queue);

  // Keep ref in sync
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const saveQueue = useCallback((newQueue: QueuedMessage[]) => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const queueMessage = useCallback((message: QueuedMessage): boolean => {
    if (!message.text.trim() && message.images.length === 0) {
      return false;
    }
    if (queueRef.current.length >= MAX_QUEUE_SIZE) {
      return false;
    }

    setQueue(prev => {
      const newQueue = [...prev, message];
      saveQueue(newQueue);
      return newQueue;
    });
    return true;
  }, [saveQueue]);

  const dequeueMessage = useCallback((): QueuedMessage | null => {
    let dequeued: QueuedMessage | null = null;
    setQueue(prev => {
      if (prev.length === 0) return prev;
      dequeued = prev[0];
      const newQueue = prev.slice(1);
      saveQueue(newQueue);
      return newQueue;
    });
    return dequeued;
  }, [saveQueue]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => {
      if (index < 0 || index >= prev.length) return prev;
      const newQueue = [...prev.slice(0, index), ...prev.slice(index + 1)];
      saveQueue(newQueue);
      return newQueue;
    });
  }, [saveQueue]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    saveQueue([]);
  }, [saveQueue]);

  const setProcessing = useCallback((value: boolean) => {
    setIsProcessing(value);
  }, []);

  return {
    queue,
    queueCount: queue.length,
    isProcessing,
    queueMessage,
    dequeueMessage,
    removeFromQueue,
    clearQueue,
    setProcessing,
  };
}
