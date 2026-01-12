/**
 * 28-5: Image Size Validation & Resize
 *
 * Tests for validating image size before paste and providing user feedback.
 *
 * Acceptance Criteria:
 * - AC1: Warning for images > 5MB
 * - AC2: Block images > 20MB with clear message
 * - AC3: Optional auto-resize to fit limits (stretch goal - not tested)
 * - AC4: File size shown in preview tooltip
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock clipboard data item for image paste with size control
interface MockDataTransferItem {
  kind: 'file' | 'string';
  type: string;
  getAsFile: () => File | null;
  getAsString: (callback: (data: string) => void) => void;
}

// Factory for creating mock image with specific size
const createMockImageWithSize = (
  sizeBytes: number,
  mimeType: string = 'image/png',
  filename: string = 'image.png'
): MockDataTransferItem => {
  // Create array of specified size
  const data = new Uint8Array(sizeBytes);
  const blob = new Blob([data], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  return {
    kind: 'file',
    type: mimeType,
    getAsFile: () => file,
    getAsString: () => {},
  };
};

// Factory for mock ClipboardEvent
const createMockPasteEvent = (items: MockDataTransferItem[]) => ({
  clipboardData: {
    items: items,
    getData: () => '',
    files: items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean),
  },
  preventDefault: vi.fn(),
});

describe('28-5: Image Size Validation', () => {

  // ==========================================================================
  // AC1: Warning for images > 5MB
  // ==========================================================================
  describe('AC1: Warning for images > 5MB', () => {

    it('should export IMAGE_WARN_SIZE_BYTES constant (5MB)', async () => {
      const constants = await import('../src/public/js/editor/constants.js');
      expect(constants.IMAGE_WARN_SIZE_BYTES).toBeDefined();
      expect(constants.IMAGE_WARN_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });

    it('should allow images under 5MB without warning', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // 1MB image - should pass without warning
      const smallImage = createMockImageWithSize(1 * 1024 * 1024);
      const event = createMockPasteEvent([smallImage]);

      const result = await editor.handleImagePaste(event.clipboardData);
      expect(result).toBe(true);

      const images = editor.getPendingImages();
      expect(images.length).toBe(1);
      expect(images[0].isLarge).toBe(false);
    });

    it('should mark images over 5MB as large', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // 6MB image - should be marked as large
      const largeImage = createMockImageWithSize(6 * 1024 * 1024);
      const event = createMockPasteEvent([largeImage]);

      const result = await editor.handleImagePaste(event.clipboardData);
      expect(result).toBe(true);

      const images = editor.getPendingImages();
      expect(images.length).toBe(1);
      expect(images[0].isLarge).toBe(true);
    });

    it('should still allow images between 5MB and 20MB', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // 15MB image - large but under max
      const largeImage = createMockImageWithSize(15 * 1024 * 1024);
      const event = createMockPasteEvent([largeImage]);

      const result = await editor.handleImagePaste(event.clipboardData);
      expect(result).toBe(true);

      const images = editor.getPendingImages();
      expect(images.length).toBe(1);
    });

  });

  // ==========================================================================
  // AC2: Block images > 20MB with clear message
  // ==========================================================================
  describe('AC2: Block images > 20MB with clear message', () => {

    it('should export IMAGE_MAX_SIZE_BYTES constant (20MB)', async () => {
      const constants = await import('../src/public/js/editor/constants.js');
      expect(constants.IMAGE_MAX_SIZE_BYTES).toBeDefined();
      expect(constants.IMAGE_MAX_SIZE_BYTES).toBe(20 * 1024 * 1024);
    });

    it('should block images over 20MB', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // 25MB image - should be blocked
      const hugeImage = createMockImageWithSize(25 * 1024 * 1024);
      const event = createMockPasteEvent([hugeImage]);

      const result = await editor.handleImagePaste(event.clipboardData);
      expect(result).toBe(false);

      const images = editor.getPendingImages();
      expect(images.length).toBe(0);
    });

    it('should allow images exactly at 20MB', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // Exactly 20MB - should be allowed (at the limit, not over)
      const maxImage = createMockImageWithSize(20 * 1024 * 1024);
      const event = createMockPasteEvent([maxImage]);

      const result = await editor.handleImagePaste(event.clipboardData);
      expect(result).toBe(true);

      const images = editor.getPendingImages();
      expect(images.length).toBe(1);
    });

    it('should export showImageSizeError function', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      expect(imagePreview.showImageSizeError).toBeDefined();
      expect(typeof imagePreview.showImageSizeError).toBe('function');
    });

  });

  // ==========================================================================
  // AC4: File size shown in preview tooltip
  // ==========================================================================
  describe('AC4: File size shown in preview tooltip', () => {

    it('should include sizeBytes in image data', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const testSize = 2 * 1024 * 1024; // 2MB
      const image = createMockImageWithSize(testSize);
      const event = createMockPasteEvent([image]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].sizeBytes).toBe(testSize);
    });

    it('should include isLarge flag in image data', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // Small image
      const smallImage = createMockImageWithSize(1 * 1024 * 1024);
      await editor.handleImagePaste(createMockPasteEvent([smallImage]).clipboardData);

      let images = editor.getPendingImages();
      expect(images[0].isLarge).toBe(false);

      // Clear and test large image
      editor.clearPendingImages?.();
      const largeImage = createMockImageWithSize(10 * 1024 * 1024);
      await editor.handleImagePaste(createMockPasteEvent([largeImage]).clipboardData);

      images = editor.getPendingImages();
      expect(images[0].isLarge).toBe(true);
    });

  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {

    it('should handle zero-byte files gracefully', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const emptyImage = createMockImageWithSize(0);
      const event = createMockPasteEvent([emptyImage]);

      // Should allow (0 bytes is under all limits)
      const result = await editor.handleImagePaste(event.clipboardData);
      expect(result).toBe(true);

      const images = editor.getPendingImages();
      expect(images[0].sizeBytes).toBe(0);
      expect(images[0].isLarge).toBe(false);
    });

    it('should handle images exactly at 5MB boundary', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // Exactly 5MB - should NOT be marked as large (> 5MB, not >=)
      const boundaryImage = createMockImageWithSize(5 * 1024 * 1024);
      const event = createMockPasteEvent([boundaryImage]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].isLarge).toBe(false);
    });

    it('should handle images one byte over 5MB', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // 5MB + 1 byte - should be marked as large
      const overBoundaryImage = createMockImageWithSize(5 * 1024 * 1024 + 1);
      const event = createMockPasteEvent([overBoundaryImage]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].isLarge).toBe(true);
    });

  });

});
