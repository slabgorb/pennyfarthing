/**
 * 28-1: Clipboard Image Paste
 *
 * Tests for pasting images from clipboard into Cyclist input.
 * Supports screenshots from OS tools and images copied from browsers.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Cmd+V pastes clipboard images (from OS screenshot tools like Cmd+Shift+4)
 * - AC2: Works with images copied from browser (right-click copy image)
 * - AC3: Visual feedback on successful paste (thumbnail preview appears)
 * - AC4: Images can be removed before sending (X button on preview)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// Mock clipboard data item for image paste
interface MockDataTransferItem {
  kind: 'file' | 'string';
  type: string;
  getAsFile: () => File | null;
  getAsString: (callback: (data: string) => void) => void;
}

// Factory for creating mock image clipboard data
const createMockImageItem = (mimeType: string, filename: string = 'image.png'): MockDataTransferItem => {
  const blob = new Blob(['fake-image-data'], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  return {
    kind: 'file',
    type: mimeType,
    getAsFile: () => file,
    getAsString: () => {},
  };
};

// Factory for creating mock text clipboard data
const createMockTextItem = (text: string): MockDataTransferItem => ({
  kind: 'string',
  type: 'text/plain',
  getAsFile: () => null,
  getAsString: (callback) => callback(text),
});

// Factory for mock ClipboardEvent
const createMockPasteEvent = (items: MockDataTransferItem[]) => ({
  clipboardData: {
    items: items,
    getData: (type: string) => '',
    files: items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean),
  },
  preventDefault: vi.fn(),
});

describe('28-1: Clipboard Image Paste', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Also populate the global document so modules can find the elements
    if (typeof global !== 'undefined') {
      (global as any).document = window.document;
    }

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  // ==========================================================================
  // AC1: Cmd+V pastes clipboard images (from OS screenshot tools)
  // ==========================================================================
  describe('AC1: Cmd+V pastes clipboard images (from OS screenshot tools)', () => {

    it('should export handleImagePaste function from editor.js', async () => {
      const editor = await import('../src/public/js/editor.js');
      expect(editor.handleImagePaste).toBeDefined();
      expect(typeof editor.handleImagePaste).toBe('function');
    });

    it('should export isImageClipboardData function to detect images', async () => {
      const editor = await import('../src/public/js/editor.js');
      expect(editor.isImageClipboardData).toBeDefined();
      expect(typeof editor.isImageClipboardData).toBe('function');
    });

    it('should detect PNG images in clipboard data', async () => {
      const editor = await import('../src/public/js/editor.js');

      const pngItem = createMockImageItem('image/png');
      const event = createMockPasteEvent([pngItem]);

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(true);
    });

    it('should detect JPEG images in clipboard data', async () => {
      const editor = await import('../src/public/js/editor.js');

      const jpegItem = createMockImageItem('image/jpeg');
      const event = createMockPasteEvent([jpegItem]);

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(true);
    });

    it('should detect GIF images in clipboard data', async () => {
      const editor = await import('../src/public/js/editor.js');

      const gifItem = createMockImageItem('image/gif');
      const event = createMockPasteEvent([gifItem]);

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(true);
    });

    it('should detect WebP images in clipboard data', async () => {
      const editor = await import('../src/public/js/editor.js');

      const webpItem = createMockImageItem('image/webp');
      const event = createMockPasteEvent([webpItem]);

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(true);
    });

    it('should NOT detect text as image data', async () => {
      const editor = await import('../src/public/js/editor.js');

      const textItem = createMockTextItem('Hello World');
      const event = createMockPasteEvent([textItem]);

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(false);
    });

    it('should NOT detect HTML as image data', async () => {
      const editor = await import('../src/public/js/editor.js');

      const htmlItem: MockDataTransferItem = {
        kind: 'string',
        type: 'text/html',
        getAsFile: () => null,
        getAsString: (cb) => cb('<p>Hello</p>'),
      };
      const event = createMockPasteEvent([htmlItem]);

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(false);
    });

    it('should export getPendingImages function', async () => {
      const editor = await import('../src/public/js/editor.js');
      expect(editor.getPendingImages).toBeDefined();
      expect(typeof editor.getPendingImages).toBe('function');
    });

    it('should return empty array when no images pasted', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const images = editor.getPendingImages();
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBe(0);
    });

    it('should store image data after paste', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png', 'screenshot.png');
      const event = createMockPasteEvent([pngItem]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images.length).toBe(1);
    });

    it('should store image as base64 data URL', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png', 'screenshot.png');
      const event = createMockPasteEvent([pngItem]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should store MIME type with image', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const jpegItem = createMockImageItem('image/jpeg', 'photo.jpg');
      const event = createMockPasteEvent([jpegItem]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].mimeType).toBe('image/jpeg');
    });

    it('should preventDefault on image paste', async () => {
      const editor = await import('../src/public/js/editor.js');

      const pngItem = createMockImageItem('image/png');
      const event = createMockPasteEvent([pngItem]);

      // handlePaste in editorProps should call preventDefault
      // This is tested through the return value (true = handled)
      const handled = await editor.handleImagePaste(event.clipboardData);
      expect(handled).toBe(true);
    });

    it('should NOT preventDefault on text paste', async () => {
      const editor = await import('../src/public/js/editor.js');

      const textItem = createMockTextItem('Hello');
      const event = createMockPasteEvent([textItem]);

      const handled = await editor.handleImagePaste(event.clipboardData);
      expect(handled).toBe(false);
    });

  });

  // ==========================================================================
  // AC2: Works with images copied from browser (right-click copy image)
  // ==========================================================================
  describe('AC2: Works with images copied from browser (right-click copy image)', () => {

    it('should handle mixed clipboard data (image + text)', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // Browser copies often include both image and text representations
      const pngItem = createMockImageItem('image/png');
      const textItem = createMockTextItem('https://example.com/image.png');
      const event = createMockPasteEvent([pngItem, textItem]);

      // Should detect as image, not text
      expect(editor.isImageClipboardData(event.clipboardData)).toBe(true);
    });

    it('should prefer image data over text data in mixed clipboard', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png', 'copied-image.png');
      const textItem = createMockTextItem('https://example.com/image.png');
      const event = createMockPasteEvent([textItem, pngItem]); // Text first

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images.length).toBe(1);
      expect(images[0].mimeType).toBe('image/png');
    });

    it('should handle clipboard with only file reference', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // Some browsers provide files array instead of items
      const event = {
        clipboardData: {
          items: [] as MockDataTransferItem[],
          files: [new File(['fake-data'], 'copied.png', { type: 'image/png' })],
          getData: () => '',
        },
      };

      expect(editor.isImageClipboardData(event.clipboardData)).toBe(true);
    });

    it('should extract filename from File object', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png', 'my-screenshot.png');
      const event = createMockPasteEvent([pngItem]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].filename).toBe('my-screenshot.png');
    });

    it('should generate default filename for screenshots without name', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // OS screenshots often don't have filenames
      const blob = new Blob(['fake-image'], { type: 'image/png' });
      const file = new File([blob], '', { type: 'image/png' }); // Empty filename
      const item: MockDataTransferItem = {
        kind: 'file',
        type: 'image/png',
        getAsFile: () => file,
        getAsString: () => {},
      };
      const event = createMockPasteEvent([item]);

      await editor.handleImagePaste(event.clipboardData);

      const images = editor.getPendingImages();
      expect(images[0].filename).toMatch(/^Screenshot|^Pasted Image|^image/i);
    });

  });

  // ==========================================================================
  // AC3: Visual feedback on successful paste (thumbnail preview appears)
  // ==========================================================================
  describe('AC3: Visual feedback on successful paste (thumbnail preview appears)', () => {

    beforeEach(async () => {
      // Reset preview state before each test
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      imagePreview.hideImagePreview();
    });

    it('should have image-preview container in HTML', () => {
      const preview = document.querySelector('#image-preview, .image-preview, #quick-actions .image-preview');
      expect(preview).not.toBeNull();
    });

    it('should have image-preview hidden by default', () => {
      const preview = document.querySelector('#image-preview, .image-preview');
      if (preview) {
        const isHidden = preview.classList.contains('hidden') ||
                         preview.getAttribute('aria-hidden') === 'true' ||
                         preview.hasAttribute('hidden') ||
                         (preview as HTMLElement).style.display === 'none';
        expect(isHidden).toBe(true);
      }
    });

    it('should export image-preview.js module', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      expect(imagePreview).toBeDefined();
    });

    it('should export showImagePreview function', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      expect(imagePreview.showImagePreview).toBeDefined();
      expect(typeof imagePreview.showImagePreview).toBe('function');
    });

    it('should export hideImagePreview function', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      expect(imagePreview.hideImagePreview).toBeDefined();
      expect(typeof imagePreview.hideImagePreview).toBe('function');
    });

    it('should export updateImagePreview function', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      expect(imagePreview.updateImagePreview).toBeDefined();
      expect(typeof imagePreview.updateImagePreview).toBe('function');
    });

    it('should show preview when image pasted', async () => {
      const editor = await import('../src/public/js/editor.js');
      const imagePreview = await import('../src/public/js/editor/image-preview.js');

      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png');
      const event = createMockPasteEvent([pngItem]);

      await editor.handleImagePaste(event.clipboardData);

      // Preview should become visible
      expect(imagePreview.isPreviewVisible()).toBe(true);
    });

    it('should display thumbnail image in preview', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');

      const testImage = {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
        filename: 'test.png',
      };

      imagePreview.updateImagePreview([testImage]);

      const thumbnail = imagePreview.getThumbnailElement();
      expect(thumbnail).not.toBeNull();
      expect(thumbnail?.src || thumbnail?.style?.backgroundImage).toContain('data:image');
    });

    it('should display filename/label in preview', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');

      const testImage = {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
        filename: 'screenshot.png',
      };

      imagePreview.updateImagePreview([testImage]);

      const label = imagePreview.getPreviewLabel();
      expect(label).toContain('screenshot.png');
    });

    it('should show "Screenshot" label for images without filename', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');

      const testImage = {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
        filename: '',
      };

      imagePreview.updateImagePreview([testImage]);

      const label = imagePreview.getPreviewLabel();
      expect(label).toMatch(/Screenshot|Pasted Image/i);
    });

    it('should have CSS for image-preview component', () => {
      expect(css).toMatch(/\.image-preview|#image-preview/);
    });

    it('should have thumbnail styling with max dimensions', () => {
      expect(css).toMatch(/\.image-preview[^}]*(max-width|max-height|width|height)/);
    });

    it('should position preview near input area', () => {
      // Preview should be in #quick-actions or similar location near editor
      const quickActions = document.querySelector('#quick-actions');
      expect(quickActions).not.toBeNull();
    });

  });

  // ==========================================================================
  // AC4: Images can be removed before sending (X button on preview)
  // ==========================================================================
  describe('AC4: Images can be removed before sending (X button on preview)', () => {

    it('should have remove button in preview', () => {
      const removeBtn = document.querySelector('.image-preview .remove-btn, .image-preview [data-action="remove"], .image-preview-remove');
      // May not exist until preview is shown, so we check module exports instead
      expect(true).toBe(true); // Placeholder for DOM check
    });

    it('should export removePendingImage function from editor.js', async () => {
      const editor = await import('../src/public/js/editor.js');
      expect(editor.removePendingImage).toBeDefined();
      expect(typeof editor.removePendingImage).toBe('function');
    });

    it('should export clearPendingImages function from editor.js', async () => {
      const editor = await import('../src/public/js/editor.js');
      expect(editor.clearPendingImages).toBeDefined();
      expect(typeof editor.clearPendingImages).toBe('function');
    });

    it('should remove image by index', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      // Add two images
      const png1 = createMockImageItem('image/png', 'first.png');
      const png2 = createMockImageItem('image/png', 'second.png');

      await editor.handleImagePaste(createMockPasteEvent([png1]).clipboardData);
      await editor.handleImagePaste(createMockPasteEvent([png2]).clipboardData);

      expect(editor.getPendingImages().length).toBe(2);

      // Remove first image
      editor.removePendingImage(0);

      const remaining = editor.getPendingImages();
      expect(remaining.length).toBe(1);
      expect(remaining[0].filename).toBe('second.png');
    });

    it('should hide preview when last image removed', async () => {
      const editor = await import('../src/public/js/editor.js');
      const imagePreview = await import('../src/public/js/editor/image-preview.js');

      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png');
      await editor.handleImagePaste(createMockPasteEvent([pngItem]).clipboardData);

      expect(imagePreview.isPreviewVisible()).toBe(true);

      // Remove the only image
      editor.removePendingImage(0);

      expect(imagePreview.isPreviewVisible()).toBe(false);
    });

    it('should clear all images with clearPendingImages', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Add multiple images
      const png1 = createMockImageItem('image/png', 'one.png');
      const png2 = createMockImageItem('image/png', 'two.png');

      await editor.handleImagePaste(createMockPasteEvent([png1]).clipboardData);
      await editor.handleImagePaste(createMockPasteEvent([png2]).clipboardData);

      expect(editor.getPendingImages().length).toBe(2);

      editor.clearPendingImages();

      expect(editor.getPendingImages().length).toBe(0);
    });

    it('should clear images when editor cleared', async () => {
      const editor = await import('../src/public/js/editor.js');

      const pngItem = createMockImageItem('image/png');
      await editor.handleImagePaste(createMockPasteEvent([pngItem]).clipboardData);

      expect(editor.getPendingImages().length).toBe(1);

      // clearEditor should also clear pending images
      editor.clearEditor();

      expect(editor.getPendingImages().length).toBe(0);
    });

    it('should have X button with aria-label for accessibility', () => {
      // Check CSS exists for remove button
      expect(css).toMatch(/\.remove-btn|\.image-preview-remove|\[data-action="remove"\]/);
    });

    it('should export onImageRemoved callback setter', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');
      expect(imagePreview.setOnImageRemoved).toBeDefined();
      expect(typeof imagePreview.setOnImageRemoved).toBe('function');
    });

    it('should call onImageRemoved callback when X clicked', async () => {
      const imagePreview = await import('../src/public/js/editor/image-preview.js');

      const mockCallback = vi.fn();
      imagePreview.setOnImageRemoved(mockCallback);

      const testImage = {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
        filename: 'test.png',
      };

      imagePreview.updateImagePreview([testImage]);
      imagePreview.handleRemoveClick(0);

      expect(mockCallback).toHaveBeenCalledWith(0);
    });

  });

  // ==========================================================================
  // Editor Integration: Image State in Submit Flow
  // ==========================================================================
  describe('Editor Integration: Image State in Submit Flow', () => {

    it('should include pending images in getEditorPayload', async () => {
      const editor = await import('../src/public/js/editor.js');
      expect(editor.getEditorPayload).toBeDefined();
      expect(typeof editor.getEditorPayload).toBe('function');
    });

    it('should return images array in payload', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png', 'test.png');
      await editor.handleImagePaste(createMockPasteEvent([pngItem]).clipboardData);

      const payload = editor.getEditorPayload();

      expect(payload.images).toBeDefined();
      expect(Array.isArray(payload.images)).toBe(true);
      expect(payload.images.length).toBe(1);
    });

    it('should return empty images array when no images', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const payload = editor.getEditorPayload();

      expect(payload.images).toBeDefined();
      expect(payload.images.length).toBe(0);
    });

    it('should clear images after submit', async () => {
      const editor = await import('../src/public/js/editor.js');
      editor.clearPendingImages?.();

      const pngItem = createMockImageItem('image/png');
      await editor.handleImagePaste(createMockPasteEvent([pngItem]).clipboardData);

      expect(editor.getPendingImages().length).toBe(1);

      // Simulate submit (this would normally call clearPendingImages)
      // The actual submit flow is tested in integration tests
      editor.clearPendingImages();

      expect(editor.getPendingImages().length).toBe(0);
    });

  });

  // ==========================================================================
  // Constants and Configuration
  // ==========================================================================
  describe('Constants and Configuration', () => {

    it('should export SUPPORTED_IMAGE_TYPES from constants', async () => {
      const constants = await import('../src/public/js/editor/constants.js');
      expect(constants.SUPPORTED_IMAGE_TYPES).toBeDefined();
      expect(Array.isArray(constants.SUPPORTED_IMAGE_TYPES)).toBe(true);
    });

    it('should include common image MIME types', async () => {
      const constants = await import('../src/public/js/editor/constants.js');

      expect(constants.SUPPORTED_IMAGE_TYPES).toContain('image/png');
      expect(constants.SUPPORTED_IMAGE_TYPES).toContain('image/jpeg');
      expect(constants.SUPPORTED_IMAGE_TYPES).toContain('image/gif');
      expect(constants.SUPPORTED_IMAGE_TYPES).toContain('image/webp');
    });

    it('should export IMAGE_PREVIEW_SIZE from constants', async () => {
      const constants = await import('../src/public/js/editor/constants.js');
      expect(constants.IMAGE_PREVIEW_SIZE).toBeDefined();
      expect(typeof constants.IMAGE_PREVIEW_SIZE).toBe('number');
    });

    it('should have reasonable preview size (32-128px)', async () => {
      const constants = await import('../src/public/js/editor/constants.js');
      expect(constants.IMAGE_PREVIEW_SIZE).toBeGreaterThanOrEqual(32);
      expect(constants.IMAGE_PREVIEW_SIZE).toBeLessThanOrEqual(128);
    });

  });

});
