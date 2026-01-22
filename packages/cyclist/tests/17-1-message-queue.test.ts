/**
 * Story 17-1: Message Input Buffer for Non-Blocking Input
 *
 * Tests verify the message queue system that allows users to type and
 * submit messages while Claude is still processing a response.
 *
 * Acceptance Criteria:
 * - AC1: Input field remains active while Claude is processing
 * - AC2: Messages submitted during processing are queued (not lost)
 * - AC3: Visual indicator shows number of queued messages
 * - AC4: Queued messages delivered in FIFO order after response
 * - AC5: Queue persists if user navigates away and returns
 * - AC6: Clear queue option available if user changes mind
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Story 17-1: Message Input Buffer', () => {

  describe('AC1: Input field remains active while processing', () => {

    it('should export isProcessing state getter', async () => {
      const editor = await import('../src/public/js/editor.js');

      // New export to check if Claude is processing (renamed from isSubmitting)
      expect(editor.isProcessing).toBeDefined();
      expect(typeof editor.isProcessing).toBe('function');
    });

    it('should export setProcessing state setter', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Replaces resetSubmitting with more explicit API
      expect(editor.setProcessing).toBeDefined();
      expect(typeof editor.setProcessing).toBe('function');
    });

    it('should allow input while processing (input not disabled)', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Editor should accept input even when isProcessing() returns true
      // This is a behavioral contract - actual DOM testing requires browser
      expect(editor.EDITOR_OPTIONS.editorProps.attributes.class).not.toContain('disabled');
    });

  });

  describe('AC2: Messages queued during processing', () => {

    it('should export messageQueue array', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Expose queue for testing and UI display
      expect(editor.getMessageQueue).toBeDefined();
      expect(typeof editor.getMessageQueue).toBe('function');
    });

    it('should export queueMessage function', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Function to add message to queue
      expect(editor.queueMessage).toBeDefined();
      expect(typeof editor.queueMessage).toBe('function');
    });

    it('should export MESSAGE_QUEUE_KEY for localStorage', async () => {
      const editor = await import('../src/public/js/editor.js');

      // localStorage key for queue persistence
      expect(editor.MESSAGE_QUEUE_KEY).toBe('cyclist-message-queue');
    });

    it('should export MAX_QUEUE_SIZE constant', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Prevent unbounded queue growth
      expect(editor.MAX_QUEUE_SIZE).toBeDefined();
      expect(typeof editor.MAX_QUEUE_SIZE).toBe('number');
      expect(editor.MAX_QUEUE_SIZE).toBeGreaterThan(0);
    });

    it('should queue message instead of discarding when processing', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Set processing state
      editor.setProcessing(true);

      // Queue a message
      const testMessage = 'Test queued message';
      editor.queueMessage(testMessage);

      // Verify it was queued, not discarded (MSSCI-12274: now returns QueuedMessage[])
      const queue = editor.getMessageQueue();
      expect(queue.some(m => m.text === testMessage)).toBe(true);

      // Cleanup
      editor.clearMessageQueue();
      editor.setProcessing(false);
    });

  });

  describe('AC3: Visual indicator shows queue count', () => {

    it('should export getQueueCount function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.getQueueCount).toBeDefined();
      expect(typeof editor.getQueueCount).toBe('function');
    });

    it('should export onQueueChange callback setter', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Allow UI to subscribe to queue changes
      expect(editor.setOnQueueChange).toBeDefined();
      expect(typeof editor.setOnQueueChange).toBe('function');
    });

    it('should call onQueueChange when queue is modified', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockCallback = vi.fn();
      editor.setOnQueueChange(mockCallback);

      // Queue a message
      editor.queueMessage('Test message');

      // Callback should have been invoked with new count
      expect(mockCallback).toHaveBeenCalledWith(1);

      // Cleanup
      editor.clearMessageQueue();
      editor.setOnQueueChange(null);
    });

  });

  describe('AC4: FIFO delivery order', () => {

    it('should export processNextInQueue function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.processNextInQueue).toBeDefined();
      expect(typeof editor.processNextInQueue).toBe('function');
    });

    it('should process messages in FIFO order', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Queue multiple messages
      editor.queueMessage('First');
      editor.queueMessage('Second');
      editor.queueMessage('Third');

      // MSSCI-12274: queue now returns QueuedMessage[] objects
      const queue = editor.getMessageQueue();
      expect(queue[0].text).toBe('First');
      expect(queue[1].text).toBe('Second');
      expect(queue[2].text).toBe('Third');

      // Cleanup
      editor.clearMessageQueue();
    });

    it('should remove message from queue when processed', async () => {
      const editor = await import('../src/public/js/editor.js');

      editor.queueMessage('First');
      editor.queueMessage('Second');

      expect(editor.getQueueCount()).toBe(2);

      // Process first message (requires mocking send, so just test dequeue)
      // MSSCI-12274: dequeue now returns QueuedMessage object
      const next = editor.dequeueMessage();
      expect(next.text).toBe('First');
      expect(editor.getQueueCount()).toBe(1);

      // Cleanup
      editor.clearMessageQueue();
    });

    it('should export dequeueMessage function', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Get and remove first message from queue
      expect(editor.dequeueMessage).toBeDefined();
      expect(typeof editor.dequeueMessage).toBe('function');
    });

  });

  describe('AC5: Queue persistence', () => {

    it('should export saveMessageQueue function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.saveMessageQueue).toBeDefined();
      expect(typeof editor.saveMessageQueue).toBe('function');
    });

    it('should export loadMessageQueue function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.loadMessageQueue).toBeDefined();
      expect(typeof editor.loadMessageQueue).toBe('function');
    });

    it('should persist queue to localStorage on change', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Mock localStorage
      const mockStorage: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      // Queue a message
      editor.queueMessage('Persistent message');

      // Check localStorage was updated (MSSCI-12274: now stored as QueuedMessage[])
      expect(mockStorage[editor.MESSAGE_QUEUE_KEY]).toBeDefined();
      const saved = JSON.parse(mockStorage[editor.MESSAGE_QUEUE_KEY]);
      expect(saved.some((m: { text: string }) => m.text === 'Persistent message')).toBe(true);

      // Cleanup
      editor.clearMessageQueue();
      vi.unstubAllGlobals();
    });

    it('should restore queue from localStorage on load', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Pre-populate localStorage with legacy string format (MSSCI-12274: tests migration)
      const mockQueue = ['Saved message 1', 'Saved message 2'];
      const mockStorage: Record<string, string> = {
        [editor.MESSAGE_QUEUE_KEY]: JSON.stringify(mockQueue),
      };
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      // Load queue (should migrate legacy format)
      editor.loadMessageQueue();

      // Verify restoration (now as QueuedMessage[])
      const queue = editor.getMessageQueue();
      expect(queue[0].text).toBe('Saved message 1');
      expect(queue[1].text).toBe('Saved message 2');

      // Cleanup
      editor.clearMessageQueue();
      vi.unstubAllGlobals();
    });

  });

  describe('AC6: Clear queue option', () => {

    it('should export clearMessageQueue function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.clearMessageQueue).toBeDefined();
      expect(typeof editor.clearMessageQueue).toBe('function');
    });

    it('should clear all queued messages', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Queue some messages
      editor.queueMessage('Message 1');
      editor.queueMessage('Message 2');
      expect(editor.getQueueCount()).toBe(2);

      // Clear the queue
      editor.clearMessageQueue();

      // Verify empty
      expect(editor.getQueueCount()).toBe(0);
      expect(editor.getMessageQueue()).toEqual([]);
    });

    it('should remove queue from localStorage when cleared', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockStorage: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      // Queue and then clear
      editor.queueMessage('To be cleared');
      editor.clearMessageQueue();

      // localStorage should have empty array or be removed
      const saved = mockStorage[editor.MESSAGE_QUEUE_KEY];
      if (saved) {
        expect(JSON.parse(saved)).toEqual([]);
      }

      vi.unstubAllGlobals();
    });

    it('should invoke onQueueChange with 0 when cleared', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockCallback = vi.fn();
      editor.setOnQueueChange(mockCallback);

      editor.queueMessage('Test');
      mockCallback.mockClear(); // Reset after queue add

      editor.clearMessageQueue();

      expect(mockCallback).toHaveBeenCalledWith(0);

      // Cleanup
      editor.setOnQueueChange(null);
    });

  });

  describe('Edge Cases', () => {

    it('should enforce MAX_QUEUE_SIZE limit', async () => {
      const editor = await import('../src/public/js/editor.js');

      const maxSize = editor.MAX_QUEUE_SIZE;

      // Try to queue more than max
      for (let i = 0; i < maxSize + 5; i++) {
        editor.queueMessage(`Message ${i}`);
      }

      // Should not exceed max
      expect(editor.getQueueCount()).toBeLessThanOrEqual(maxSize);

      // Cleanup
      editor.clearMessageQueue();
    });

    it('should not queue empty messages', async () => {
      const editor = await import('../src/public/js/editor.js');

      editor.queueMessage('');
      editor.queueMessage('   ');
      editor.queueMessage('\n\t');

      expect(editor.getQueueCount()).toBe(0);
    });

    it('should handle corrupted localStorage gracefully', async () => {
      const editor = await import('../src/public/js/editor.js');

      vi.stubGlobal('localStorage', {
        getItem: () => 'not valid json {{{',
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });

      // Should not throw
      expect(() => editor.loadMessageQueue()).not.toThrow();

      // Queue should be empty (not corrupted)
      expect(editor.getMessageQueue()).toEqual([]);

      vi.unstubAllGlobals();
    });

  });

});
