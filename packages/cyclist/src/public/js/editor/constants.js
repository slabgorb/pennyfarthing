/**
 * Editor Constants
 * Configuration values for the TipTap editor
 */

/** DOM element ID where editor mounts */
export const EDITOR_CONTAINER_ID = 'editor';

/** List of TipTap extensions loaded */
export const EDITOR_EXTENSIONS = ['StarterKit', 'CodeBlock'];

/** Editor initialization options */
export const EDITOR_OPTIONS = {
  autofocus: true,
  editorProps: {
    attributes: {
      class: 'prose prose-invert max-w-none focus:outline-none',
      spellcheck: 'true',
      lang: 'en',
    },
  },
};

/** localStorage key for persisting message queue (Story 17-1) */
export const MESSAGE_QUEUE_KEY = 'cyclist-message-queue';

/** Maximum number of messages allowed in queue (Story 17-1) */
export const MAX_QUEUE_SIZE = 10;

// ============================================================================
// Queued Message Type (Story MSSCI-12274)
// ============================================================================

/**
 * @typedef {Object} PastedImage
 * @property {string} dataUrl - Base64-encoded image data URL
 * @property {string} mimeType - Image MIME type (e.g., 'image/png')
 * @property {string} filename - Image filename
 */

/**
 * @typedef {Object} QueuedMessage
 * @property {string} text - Message text content
 * @property {PastedImage[]} images - Attached images (empty array if none)
 */

/** localStorage key for persisting command history (B-9.4) */
export const HISTORY_KEY = 'cyclist-command-history';

/** Maximum number of commands to store in history */
export const MAX_HISTORY = 100;

// ============================================================================
// Image Paste Constants (Story 28-1)
// ============================================================================

/** Supported image MIME types for clipboard paste */
export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

/** Size in pixels for image preview thumbnails */
export const IMAGE_PREVIEW_SIZE = 64;

// ============================================================================
// Image Size Limits (Story 28-5)
// ============================================================================

/** Warning threshold for large images (5MB) - show warning but allow */
export const IMAGE_WARN_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum allowed image size (20MB) - block paste */
export const IMAGE_MAX_SIZE_BYTES = 20 * 1024 * 1024;

