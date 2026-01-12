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
    },
  },
};

/** localStorage key for persisting message queue (Story 17-1) */
export const MESSAGE_QUEUE_KEY = 'cyclist-message-queue';

/** Maximum number of messages allowed in queue (Story 17-1) */
export const MAX_QUEUE_SIZE = 10;

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
