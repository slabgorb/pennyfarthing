/**
 * useMessageQueue Hook
 *
 * React hook for message queueing while Claude is processing.
 * Story MSSCI-12717 - React Migration
 *
 * Bell Mode (MSSCI-12275):
 * When bell mode is enabled, queued messages are injected into Claude's context
 * via the PostToolUse hook, rather than waiting for Claude to finish.
 *
 * Turn Complete Logic (MSSCI-12450):
 * - Bell mode OFF: All queued messages sent at once when Claude stops
 * - Bell mode ON: Messages injected by hook; remaining queue sent on stop
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
}

const MAX_QUEUE_SIZE = 10;
const QUEUE_KEY = 'cyclist-message-queue';

/**
 * Sync queue to bell-queue.json for PostToolUse hook
 * Only writes when bell mode is enabled
 */
async function syncQueueToFile(queue: QueuedMessage[]): Promise<void> {
  try {
    await fetch('/api/bell-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queue),
    });
  } catch (err) {
    // Ignore errors - bell queue sync is best-effort
    console.debug('[MessageQueue] Bell queue sync error:', err);
  }
}

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
  const [bellMode, setBellModeState] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const queueRef = useRef(queue);
  const bellModeRef = useRef(bellMode);

  // Keep refs in sync
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    bellModeRef.current = bellMode;
  }, [bellMode]);

  // Load bell mode from settings on mount
  useEffect(() => {
    // Load via REST
    fetch('/api/settings')
      .then(res => res.json())
      .then((settings: Record<string, unknown>) => {
        const workflow = settings?.workflow as Record<string, unknown> | undefined;
        if (workflow?.bell_mode) {
          setBellModeState(true);
        }
      })
      .catch(err => console.debug('[MessageQueue] Failed to load settings:', err));

    // Subscribe to settings changes via WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          const workflow = data.settings?.workflow as Record<string, unknown> | undefined;
          setBellModeState(!!workflow?.bell_mode);
        }
      } catch {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  // Listen for bell-consumed WebSocket events
  useEffect(() => {
    // Connect to bell WebSocket for consumed events
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/bell`;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'bell-consumed') {
              // Dequeue the first message when hook consumes it
              setQueue(prev => {
                if (prev.length === 0) return prev;
                const newQueue = prev.slice(1);
                try {
                  localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
                } catch { /* ignore */ }
                return newQueue;
              });
              console.log('[MessageQueue] Bell consumed:', data.text);
            }
          } catch (err) {
            console.error('[MessageQueue] Failed to parse bell message:', err);
          }
        };

        ws.onclose = () => {
          console.log('[MessageQueue] Bell WebSocket closed, reconnecting...');
          reconnectTimeout = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          // Will trigger onclose
        };
      } catch (err) {
        console.debug('[MessageQueue] Bell WebSocket init failed:', err);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  const saveQueue = useCallback((newQueue: QueuedMessage[]) => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
    } catch {
      // Ignore localStorage errors
    }
    // Always sync to file (API checks bell mode)
    syncQueueToFile(newQueue);
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

  const setBellMode = useCallback((value: boolean) => {
    setBellModeState(value);
  }, []);

  const pauseQueue = useCallback(() => {
    setQueuePaused(true);
    console.log('[MessageQueue] Queue paused');
  }, []);

  const resumeQueue = useCallback(() => {
    setQueuePaused(false);
    console.log('[MessageQueue] Queue resumed');
  }, []);

  /**
   * Handle turn complete - send queued messages based on bell mode
   * Called when Claude's turn completes (via onComplete callback)
   *
   * Bell mode OFF: All queued messages sent at once
   * Bell mode ON: Remaining messages (not consumed by hook) sent
   */
  const handleTurnComplete = useCallback((onSubmit: (text: string, images: QueuedMessage['images']) => void) => {
    if (queuePaused) {
      console.log('[MessageQueue] Queue paused, skipping turn complete');
      return;
    }

    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) {
      return;
    }

    console.log('[MessageQueue] Turn complete, sending', currentQueue.length, 'queued messages');

    // Send all queued messages
    for (const msg of currentQueue) {
      onSubmit(msg.text, msg.images);
    }

    // Clear the queue
    setQueue([]);
    saveQueue([]);
  }, [queuePaused, saveQueue]);

  return {
    queue,
    queueCount: queue.length,
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
  };
}
