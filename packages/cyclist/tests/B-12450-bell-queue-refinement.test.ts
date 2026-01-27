/**
 * B-12450: Bell Mode Queue Refinements
 *
 * Tests for refined bell mode message queue behavior when Claude's turn completes.
 *
 * Acceptance Criteria:
 * - AC1: Bell mode OFF + turn stop: ALL queued messages sent at once, queue cleared
 * - AC2: Bell mode ON + turn stop: Any remaining messages (not consumed by hook) sent immediately
 *
 * Key Files:
 * - packages/cyclist/src/public/js/editor/message-queue.js - Frontend queue management
 * - packages/cyclist/src/public/js/message-view-init.js - Turn complete handling (onComplete)
 *
 * Current Behavior (Bug):
 * - processNextInQueue() sends messages ONE AT A TIME
 * - When bell mode OFF, turn complete only sends the first message
 * - When bell mode ON, remaining messages after hook are orphaned
 *
 * Required Behavior:
 * - Bell OFF: Send ALL queued messages at once on turn complete
 * - Bell ON: After turn stop, check for remaining queue and send all immediately
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock settings-sync module for testing
 */
function createMockSettingsSync() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string, defaultValue?: unknown) => store.get(key) ?? defaultValue),
    set: vi.fn((key: string, value: unknown) => store.set(key, value)),
    delete: vi.fn((key: string) => store.delete(key)),
    _store: store,
  };
}

/**
 * Create test queued messages
 */
function createTestMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    text: `Test message ${i + 1}`,
    images: [],
  }));
}

// =============================================================================
// AC1: Bell mode OFF + turn stop - ALL queued messages sent at once
// =============================================================================

describe('AC1: Bell mode OFF + turn stop sends ALL queued messages at once', () => {
  let window: Window;
  let submitFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Setup happy-dom environment
    window = new Window();
    window.document.write(`
      <html><body>
        <div id="editor"></div>
        <div id="message-view"></div>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;

    // Mock submit function to track submissions
    submitFn = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should export sendAllQueuedMessages function for batch sending', async () => {
    // TODO: Implement sendAllQueuedMessages() in message-queue.js
    // This function should send ALL messages in the queue at once
    // and clear the queue after sending
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    expect(messageQueue.sendAllQueuedMessages).toBeDefined();
    expect(typeof messageQueue.sendAllQueuedMessages).toBe('function');
  });

  it('should send all queued messages when bell mode is OFF and processing stops', async () => {
    // TODO: Implement sendAllQueuedMessages() to batch send all messages
    // Current behavior: processNextInQueue() only sends ONE message
    // Required: Send ALL messages at once when bell mode is OFF
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    // Initialize with mock submit
    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    // Add 3 messages to queue
    messageQueue.queueMessage({ text: 'Message 1', images: [] });
    messageQueue.queueMessage({ text: 'Message 2', images: [] });
    messageQueue.queueMessage({ text: 'Message 3', images: [] });

    expect(messageQueue.getQueueCount()).toBe(3);

    // Ensure bell mode is OFF
    messageQueue.setBellMode(false);
    expect(messageQueue.isBellModeEnabled()).toBe(false);

    // Simulate turn complete - should send ALL messages
    messageQueue.sendAllQueuedMessages();

    // All 3 messages should have been submitted
    expect(submitFn).toHaveBeenCalledTimes(3);
    expect(submitFn).toHaveBeenNthCalledWith(1, 'Message 1', []);
    expect(submitFn).toHaveBeenNthCalledWith(2, 'Message 2', []);
    expect(submitFn).toHaveBeenNthCalledWith(3, 'Message 3', []);

    // Queue should be empty after sending
    expect(messageQueue.getQueueCount()).toBe(0);
  });

  it('should clear queue after sending all messages (bell mode OFF)', async () => {
    // TODO: sendAllQueuedMessages() must clear the queue after sending
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    // Add messages
    messageQueue.queueMessage({ text: 'A', images: [] });
    messageQueue.queueMessage({ text: 'B', images: [] });

    messageQueue.setBellMode(false);
    messageQueue.sendAllQueuedMessages();

    // Queue must be empty
    expect(messageQueue.getQueueCount()).toBe(0);
    expect(messageQueue.getMessageQueue()).toEqual([]);
  });

  it('should handle empty queue gracefully when bell mode OFF', async () => {
    // TODO: sendAllQueuedMessages() should handle empty queue without error
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.setBellMode(false);

    // No messages in queue
    expect(messageQueue.getQueueCount()).toBe(0);

    // Should not throw, should not call submit
    messageQueue.sendAllQueuedMessages();

    expect(submitFn).not.toHaveBeenCalled();
  });

  it('should notify queue change callback when all messages are sent', async () => {
    // TODO: sendAllQueuedMessages() must trigger the onQueueChange callback
    const messageQueue = await import('../src/public/js/editor/message-queue.js');
    const queueChangeFn = vi.fn();

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });
    messageQueue.setOnQueueChange(queueChangeFn);

    // Add messages
    messageQueue.queueMessage({ text: 'X', images: [] });
    messageQueue.queueMessage({ text: 'Y', images: [] });

    // Reset mock to only track sendAllQueuedMessages callback
    queueChangeFn.mockClear();

    messageQueue.setBellMode(false);
    messageQueue.sendAllQueuedMessages();

    // Should have notified with count = 0
    expect(queueChangeFn).toHaveBeenCalledWith(0);
  });

  it('should handle messages with images when batch sending', async () => {
    // TODO: sendAllQueuedMessages() must properly pass images to submit function
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    const testImage = { base64: 'data:image/png;base64,ABC123', name: 'test.png' };

    messageQueue.queueMessage({ text: 'With image', images: [testImage] });
    messageQueue.queueMessage({ text: 'No image', images: [] });

    messageQueue.setBellMode(false);
    messageQueue.sendAllQueuedMessages();

    expect(submitFn).toHaveBeenNthCalledWith(1, 'With image', [testImage]);
    expect(submitFn).toHaveBeenNthCalledWith(2, 'No image', []);
  });
});

// =============================================================================
// AC2: Bell mode ON + turn stop - Remaining messages sent immediately
// =============================================================================

describe('AC2: Bell mode ON + turn stop sends remaining queue immediately', () => {
  let window: Window;
  let submitFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window = new Window();
    window.document.write(`
      <html><body>
        <div id="editor"></div>
        <div id="message-view"></div>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;

    submitFn = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should export flushRemainingQueue function for bell mode cleanup', async () => {
    // TODO: Implement flushRemainingQueue() in message-queue.js
    // This function should send any remaining messages after turn stop
    // when bell mode is ON (hook didn't consume all messages)
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    expect(messageQueue.flushRemainingQueue).toBeDefined();
    expect(typeof messageQueue.flushRemainingQueue).toBe('function');
  });

  it('should send remaining messages when bell mode ON and turn stops', async () => {
    // TODO: Implement flushRemainingQueue() to handle bell mode cleanup
    // Scenario: User queued 3 messages, hook only consumed 1 during turn
    // Result: 2 messages remain, should be sent immediately on turn stop
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    // Queue 3 messages
    messageQueue.queueMessage({ text: 'Msg 1', images: [] });
    messageQueue.queueMessage({ text: 'Msg 2', images: [] });
    messageQueue.queueMessage({ text: 'Msg 3', images: [] });

    // Bell mode is ON
    messageQueue.setBellMode(true);

    // Simulate hook consuming first message (normal bell-consumed flow)
    messageQueue.dequeueMessage();

    // Now 2 messages remain
    expect(messageQueue.getQueueCount()).toBe(2);

    // Turn stops - flush remaining messages
    messageQueue.flushRemainingQueue();

    // Both remaining messages should be submitted
    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(submitFn).toHaveBeenNthCalledWith(1, 'Msg 2', []);
    expect(submitFn).toHaveBeenNthCalledWith(2, 'Msg 3', []);

    // Queue should be empty
    expect(messageQueue.getQueueCount()).toBe(0);
  });

  it('should clear queue after flushing remaining messages (bell mode ON)', async () => {
    // TODO: flushRemainingQueue() must clear the queue after sending
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Remaining 1', images: [] });
    messageQueue.queueMessage({ text: 'Remaining 2', images: [] });

    messageQueue.setBellMode(true);
    messageQueue.flushRemainingQueue();

    expect(messageQueue.getQueueCount()).toBe(0);
    expect(messageQueue.getMessageQueue()).toEqual([]);
  });

  it('should handle empty queue gracefully when bell mode ON', async () => {
    // TODO: flushRemainingQueue() should handle empty queue without error
    // Scenario: Hook consumed all messages during turn, nothing left to flush
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.setBellMode(true);

    // No messages in queue (hook consumed all)
    expect(messageQueue.getQueueCount()).toBe(0);

    // Should not throw, should not call submit
    messageQueue.flushRemainingQueue();

    expect(submitFn).not.toHaveBeenCalled();
  });

  it('should work regardless of bell mode state (flush always sends)', async () => {
    // TODO: flushRemainingQueue() should work even if bell mode changed
    // The function is called on turn stop, should send remaining regardless
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Test', images: [] });

    // Bell mode could be ON or OFF when flush is called
    messageQueue.setBellMode(false);
    messageQueue.flushRemainingQueue();

    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(messageQueue.getQueueCount()).toBe(0);
  });

  it('should notify queue change callback when remaining messages are flushed', async () => {
    // TODO: flushRemainingQueue() must trigger the onQueueChange callback
    const messageQueue = await import('../src/public/js/editor/message-queue.js');
    const queueChangeFn = vi.fn();

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });
    messageQueue.setOnQueueChange(queueChangeFn);

    messageQueue.queueMessage({ text: 'A', images: [] });

    queueChangeFn.mockClear();

    messageQueue.setBellMode(true);
    messageQueue.flushRemainingQueue();

    expect(queueChangeFn).toHaveBeenCalledWith(0);
  });
});

// =============================================================================
// Integration: Turn complete handler uses correct function
// =============================================================================

describe('Integration: Turn complete handler uses correct queue function', () => {
  let window: Window;
  let submitFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window = new Window();
    window.document.write(`
      <html><body>
        <div id="editor"></div>
        <div id="message-view"></div>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;

    submitFn = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should export handleTurnComplete for coordinated turn handling', async () => {
    // TODO: Implement handleTurnComplete() in message-queue.js
    // This function checks bell mode and calls the appropriate flush function:
    // - Bell OFF: sendAllQueuedMessages()
    // - Bell ON: flushRemainingQueue()
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    expect(messageQueue.handleTurnComplete).toBeDefined();
    expect(typeof messageQueue.handleTurnComplete).toBe('function');
  });

  it('should call sendAllQueuedMessages when bell mode OFF on turn complete', async () => {
    // TODO: handleTurnComplete() should detect bell mode and use sendAllQueuedMessages
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Queued 1', images: [] });
    messageQueue.queueMessage({ text: 'Queued 2', images: [] });

    messageQueue.setBellMode(false);

    // Turn complete handler
    messageQueue.handleTurnComplete();

    // Both messages should be sent
    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(messageQueue.getQueueCount()).toBe(0);
  });

  it('should call flushRemainingQueue when bell mode ON on turn complete', async () => {
    // TODO: handleTurnComplete() should detect bell mode and use flushRemainingQueue
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Bell 1', images: [] });
    messageQueue.queueMessage({ text: 'Bell 2', images: [] });

    messageQueue.setBellMode(true);

    // Simulate hook consumed first message
    messageQueue.dequeueMessage();

    // Turn complete - should flush remaining
    messageQueue.handleTurnComplete();

    // Only the remaining message should be sent (Bell 2)
    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(submitFn).toHaveBeenCalledWith('Bell 2', []);
    expect(messageQueue.getQueueCount()).toBe(0);
  });

  it('should not send if queue is paused', async () => {
    // TODO: handleTurnComplete() should respect queuePaused state
    // (existing behavior from processNextInQueue should be preserved)
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Test', images: [] });
    messageQueue.setBellMode(false);
    messageQueue.pauseQueue();

    messageQueue.handleTurnComplete();

    // Should not submit because queue is paused
    expect(submitFn).not.toHaveBeenCalled();
    // Message should still be in queue
    expect(messageQueue.getQueueCount()).toBe(1);
  });

  it('should not send if still processing', async () => {
    // TODO: handleTurnComplete() should respect processing state
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Test', images: [] });
    messageQueue.setBellMode(false);
    messageQueue.setProcessing(true);

    messageQueue.handleTurnComplete();

    // Should not submit because still processing
    expect(submitFn).not.toHaveBeenCalled();
    expect(messageQueue.getQueueCount()).toBe(1);
  });
});

// =============================================================================
// Edge cases and regression prevention
// =============================================================================

describe('Edge cases: Queue refinement behavior', () => {
  let window: Window;
  let submitFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window = new Window();
    window.document.write(`
      <html><body>
        <div id="editor"></div>
        <div id="message-view"></div>
      </body></html>
    `);
    globalThis.document = window.document as unknown as Document;
    globalThis.window = window as unknown as Window & typeof globalThis;

    submitFn = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should preserve FIFO order when sending all messages', async () => {
    // TODO: Messages must be sent in the order they were queued
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'First', images: [] });
    messageQueue.queueMessage({ text: 'Second', images: [] });
    messageQueue.queueMessage({ text: 'Third', images: [] });

    messageQueue.setBellMode(false);
    messageQueue.sendAllQueuedMessages();

    expect(submitFn.mock.calls[0][0]).toBe('First');
    expect(submitFn.mock.calls[1][0]).toBe('Second');
    expect(submitFn.mock.calls[2][0]).toBe('Third');
  });

  it('should handle rapid successive turn completes', async () => {
    // TODO: Multiple rapid handleTurnComplete() calls should not cause issues
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Single', images: [] });
    messageQueue.setBellMode(false);

    // Rapid calls - only first should have effect
    messageQueue.handleTurnComplete();
    messageQueue.handleTurnComplete();
    messageQueue.handleTurnComplete();

    // Should only submit once (queue was empty after first call)
    expect(submitFn).toHaveBeenCalledTimes(1);
  });

  it('should sync queue to file after batch send', async () => {
    // TODO: sendAllQueuedMessages should call saveMessageQueue to sync storage
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    // Spy on the saveMessageQueue function via fetch mock
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchSpy;

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Test', images: [] });
    fetchSpy.mockClear(); // Clear calls from queueMessage

    messageQueue.setBellMode(false);
    messageQueue.sendAllQueuedMessages();

    // Should have synced the empty queue to file
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/bell-queue',
      expect.objectContaining({
        method: 'POST',
        body: '[]', // Empty queue after sending
      })
    );
  });

  it('should not break existing processNextInQueue behavior', async () => {
    // Regression test: processNextInQueue should still work for single message
    // (used during non-turn-complete scenarios)
    const messageQueue = await import('../src/public/js/editor/message-queue.js');

    messageQueue.initMessageQueue({
      clearEditor: vi.fn(),
      submit: submitFn,
    });

    messageQueue.queueMessage({ text: 'Single', images: [] });
    messageQueue.setBellMode(false);
    messageQueue.setProcessing(false);

    // processNextInQueue should still send ONE message
    messageQueue.processNextInQueue();

    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(messageQueue.getQueueCount()).toBe(0);
  });
});
