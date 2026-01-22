/**
 * Story MSSCI-12274: Support images in queued messages via base64 encoding
 *
 * Tests verify that the message queue system can store and retrieve
 * messages with attached images (base64 encoded).
 *
 * Acceptance Criteria:
 * - AC1: QueuedMessage interface defined with text and images properties
 * - AC2: queueMessage() accepts message objects with images array
 * - AC3: dequeueMessage() returns full message object including images
 * - AC4: Existing string-based queues migrate transparently on load
 * - AC5: processNextInQueue() passes images to submit callback
 * - AC6: All existing message queue tests continue to pass (see 17-1-message-queue.test.ts)
 * - AC7: New tests cover queued images and migration scenarios (this file)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Test image data (minimal valid base64 PNG - 1x1 transparent pixel)
const TEST_IMAGE = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  mimeType: 'image/png',
  filename: 'test-image.png',
};

const TEST_IMAGE_2 = {
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof',
  mimeType: 'image/jpeg',
  filename: 'test-image-2.jpg',
};

describe('Story MSSCI-12274: Image Queue Support', () => {

  describe('AC1: QueuedMessage interface defined', () => {

    it('should define QueuedMessage type with text and images properties', async () => {
      // The interface should be documented in constants.js
      // We verify by testing that the queue accepts objects with these properties
      const editor = await import('../src/public/js/editor.js');

      const queuedMessage = {
        text: 'Test message with image',
        images: [TEST_IMAGE],
      };

      // Should accept the message object
      const result = editor.queueMessage(queuedMessage);
      expect(result).toBe(true);

      // Cleanup
      editor.clearMessageQueue();
    });

    it('should accept QueuedMessage with empty images array', async () => {
      const editor = await import('../src/public/js/editor.js');

      const queuedMessage = {
        text: 'Test message without images',
        images: [],
      };

      const result = editor.queueMessage(queuedMessage);
      expect(result).toBe(true);

      editor.clearMessageQueue();
    });

  });

  describe('AC2: queueMessage() accepts message objects with images', () => {

    it('should queue message object with single image', async () => {
      const editor = await import('../src/public/js/editor.js');

      const queuedMessage = {
        text: 'Message with one image',
        images: [TEST_IMAGE],
      };

      editor.queueMessage(queuedMessage);

      const queue = editor.getMessageQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].text).toBe('Message with one image');
      expect(queue[0].images).toHaveLength(1);
      expect(queue[0].images[0].dataUrl).toBe(TEST_IMAGE.dataUrl);

      editor.clearMessageQueue();
    });

    it('should queue message object with multiple images', async () => {
      const editor = await import('../src/public/js/editor.js');

      const queuedMessage = {
        text: 'Message with multiple images',
        images: [TEST_IMAGE, TEST_IMAGE_2],
      };

      editor.queueMessage(queuedMessage);

      const queue = editor.getMessageQueue();
      expect(queue[0].images).toHaveLength(2);
      expect(queue[0].images[0].filename).toBe('test-image.png');
      expect(queue[0].images[1].filename).toBe('test-image-2.jpg');

      editor.clearMessageQueue();
    });

    it('should preserve image data integrity (base64 not corrupted)', async () => {
      const editor = await import('../src/public/js/editor.js');

      const queuedMessage = {
        text: 'Image integrity test',
        images: [TEST_IMAGE],
      };

      editor.queueMessage(queuedMessage);

      const queue = editor.getMessageQueue();
      // Verify the full base64 string is preserved exactly
      expect(queue[0].images[0].dataUrl).toBe(TEST_IMAGE.dataUrl);
      expect(queue[0].images[0].mimeType).toBe(TEST_IMAGE.mimeType);
      expect(queue[0].images[0].filename).toBe(TEST_IMAGE.filename);

      editor.clearMessageQueue();
    });

    it('should still accept plain string messages (backward compatibility)', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Plain string should still work
      editor.queueMessage('Plain text message');

      const queue = editor.getMessageQueue();
      expect(queue).toHaveLength(1);
      // Should be normalized to QueuedMessage format
      expect(queue[0].text).toBe('Plain text message');
      expect(queue[0].images).toEqual([]);

      editor.clearMessageQueue();
    });

  });

  describe('AC3: dequeueMessage() returns full message object', () => {

    it('should return QueuedMessage object with images', async () => {
      const editor = await import('../src/public/js/editor.js');

      const queuedMessage = {
        text: 'Dequeue test',
        images: [TEST_IMAGE],
      };

      editor.queueMessage(queuedMessage);
      const dequeued = editor.dequeueMessage();

      expect(dequeued).not.toBeNull();
      expect(dequeued.text).toBe('Dequeue test');
      expect(dequeued.images).toHaveLength(1);
      expect(dequeued.images[0].dataUrl).toBe(TEST_IMAGE.dataUrl);

      editor.clearMessageQueue();
    });

    it('should return null when queue is empty', async () => {
      const editor = await import('../src/public/js/editor.js');

      editor.clearMessageQueue();
      const dequeued = editor.dequeueMessage();

      expect(dequeued).toBeNull();
    });

    it('should maintain FIFO order with image messages', async () => {
      const editor = await import('../src/public/js/editor.js');

      editor.queueMessage({ text: 'First', images: [TEST_IMAGE] });
      editor.queueMessage({ text: 'Second', images: [] });
      editor.queueMessage({ text: 'Third', images: [TEST_IMAGE_2] });

      const first = editor.dequeueMessage();
      expect(first.text).toBe('First');
      expect(first.images).toHaveLength(1);

      const second = editor.dequeueMessage();
      expect(second.text).toBe('Second');
      expect(second.images).toHaveLength(0);

      const third = editor.dequeueMessage();
      expect(third.text).toBe('Third');
      expect(third.images[0].filename).toBe('test-image-2.jpg');

      editor.clearMessageQueue();
    });

  });

  describe('AC4: Existing string-based queues migrate transparently', () => {

    it('should migrate legacy string array to QueuedMessage array on load', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Simulate legacy localStorage with string array (old format)
      const legacyQueue = ['Old message 1', 'Old message 2'];
      const mockStorage: Record<string, string> = {
        [editor.MESSAGE_QUEUE_KEY]: JSON.stringify(legacyQueue),
      };

      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      // Load should trigger migration
      editor.loadMessageQueue();

      // Queue should now be in new format
      const queue = editor.getMessageQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].text).toBe('Old message 1');
      expect(queue[0].images).toEqual([]);
      expect(queue[1].text).toBe('Old message 2');
      expect(queue[1].images).toEqual([]);

      editor.clearMessageQueue();
      vi.unstubAllGlobals();
    });

    it('should preserve new format queue on load (no double migration)', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Queue already in new format
      const newFormatQueue = [
        { text: 'New format message', images: [TEST_IMAGE] },
      ];
      const mockStorage: Record<string, string> = {
        [editor.MESSAGE_QUEUE_KEY]: JSON.stringify(newFormatQueue),
      };

      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      editor.loadMessageQueue();

      const queue = editor.getMessageQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].text).toBe('New format message');
      expect(queue[0].images).toHaveLength(1);
      expect(queue[0].images[0].dataUrl).toBe(TEST_IMAGE.dataUrl);

      editor.clearMessageQueue();
      vi.unstubAllGlobals();
    });

    it('should handle mixed format gracefully (defensive)', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Hypothetical mixed format (shouldn't happen but be defensive)
      const mixedQueue = [
        'Plain string',
        { text: 'Object message', images: [] },
      ];
      const mockStorage: Record<string, string> = {
        [editor.MESSAGE_QUEUE_KEY]: JSON.stringify(mixedQueue),
      };

      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      editor.loadMessageQueue();

      const queue = editor.getMessageQueue();
      expect(queue).toHaveLength(2);
      // First should be migrated
      expect(queue[0].text).toBe('Plain string');
      expect(queue[0].images).toEqual([]);
      // Second already in format
      expect(queue[1].text).toBe('Object message');
      expect(queue[1].images).toEqual([]);

      editor.clearMessageQueue();
      vi.unstubAllGlobals();
    });

  });

  describe('AC5: processNextInQueue() passes images to submit callback', () => {

    it('should pass images array to submit callback', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockSubmit = vi.fn();
      const mockClear = vi.fn();
      const mockInsert = vi.fn();

      editor.initMessageQueue({
        clearEditor: mockClear,
        insertContent: mockInsert,
        submit: mockSubmit,
      });

      // Queue a message with images
      editor.queueMessage({
        text: 'Message with images for submit',
        images: [TEST_IMAGE, TEST_IMAGE_2],
      });

      // Process should call submit with text AND images
      editor.processNextInQueue();

      // Submit should be called with text and images
      expect(mockSubmit).toHaveBeenCalledTimes(1);
      const submitCall = mockSubmit.mock.calls[0];

      // Verify text was passed as first argument
      expect(submitCall[0]).toBe('Message with images for submit');

      // Verify images array was passed as second argument
      expect(submitCall[1]).toHaveLength(2);
      expect(submitCall[1][0].dataUrl).toBe(TEST_IMAGE.dataUrl);
      expect(submitCall[1][1].dataUrl).toBe(TEST_IMAGE_2.dataUrl);

      editor.clearMessageQueue();
    });

    it('should handle text-only messages (empty images array)', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockSubmit = vi.fn();
      const mockClear = vi.fn();
      const mockInsert = vi.fn();

      editor.initMessageQueue({
        clearEditor: mockClear,
        insertContent: mockInsert,
        submit: mockSubmit,
      });

      editor.queueMessage({
        text: 'Text only message',
        images: [],
      });

      editor.processNextInQueue();

      expect(mockSubmit).toHaveBeenCalledTimes(1);
      const submitCall = mockSubmit.mock.calls[0];

      // Verify text was passed
      expect(submitCall[0]).toBe('Text only message');

      // Verify empty images array was passed
      expect(submitCall[1]).toEqual([]);

      editor.clearMessageQueue();
    });

  });

  describe('AC7: Edge cases for image queue', () => {

    it('should enforce MAX_QUEUE_SIZE with image messages', async () => {
      const editor = await import('../src/public/js/editor.js');

      const maxSize = editor.MAX_QUEUE_SIZE;

      // Fill queue to max with image messages
      for (let i = 0; i < maxSize + 5; i++) {
        editor.queueMessage({
          text: `Message ${i}`,
          images: [TEST_IMAGE],
        });
      }

      expect(editor.getQueueCount()).toBeLessThanOrEqual(maxSize);

      editor.clearMessageQueue();
    });

    it('should reject message object with empty text', async () => {
      const editor = await import('../src/public/js/editor.js');

      const result = editor.queueMessage({
        text: '',
        images: [TEST_IMAGE],
      });

      expect(result).toBe(false);
      expect(editor.getQueueCount()).toBe(0);
    });

    it('should reject message object with whitespace-only text', async () => {
      const editor = await import('../src/public/js/editor.js');

      const result = editor.queueMessage({
        text: '   \n\t  ',
        images: [TEST_IMAGE],
      });

      expect(result).toBe(false);
      expect(editor.getQueueCount()).toBe(0);
    });

    it('should persist image messages to localStorage correctly', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockStorage: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      });

      editor.queueMessage({
        text: 'Persist test',
        images: [TEST_IMAGE],
      });

      // Verify localStorage contains the image data
      const stored = JSON.parse(mockStorage[editor.MESSAGE_QUEUE_KEY]);
      expect(stored).toHaveLength(1);
      expect(stored[0].text).toBe('Persist test');
      expect(stored[0].images[0].dataUrl).toBe(TEST_IMAGE.dataUrl);

      editor.clearMessageQueue();
      vi.unstubAllGlobals();
    });

    it('should notify onQueueChange with correct count for image messages', async () => {
      const editor = await import('../src/public/js/editor.js');

      const mockCallback = vi.fn();
      editor.setOnQueueChange(mockCallback);

      editor.queueMessage({ text: 'Msg 1', images: [TEST_IMAGE] });
      expect(mockCallback).toHaveBeenLastCalledWith(1);

      editor.queueMessage({ text: 'Msg 2', images: [] });
      expect(mockCallback).toHaveBeenLastCalledWith(2);

      editor.dequeueMessage();
      expect(mockCallback).toHaveBeenLastCalledWith(1);

      editor.clearMessageQueue();
      editor.setOnQueueChange(null);
    });

  });

});
