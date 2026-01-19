/**
 * Rich Text Editor module using TipTap
 * Provides a rich text input area for composing messages to Claude
 *
 * Note: TipTap dependencies are loaded from tiptap.bundle.js which must be
 * included in the HTML before this module. The bundle exposes window.TipTap.
 */

import { addMessage, showThinking, scrollToBottom, onResponseSubmitted } from './components/MessageView.js';

// Import from modules
import { EDITOR_CONTAINER_ID, EDITOR_OPTIONS, SUPPORTED_IMAGE_TYPES, IMAGE_WARN_SIZE_BYTES, IMAGE_MAX_SIZE_BYTES } from './editor/constants.js';
import { jsonToMarkdown } from './editor/markdown.js';
import { initToolbar, updateToolbarState } from './editor/toolbar.js';
import {
  initCommandHistory,
  addToHistory,
  navigateHistoryUp,
  navigateHistoryDown,
  resetHistoryNavigation
} from './editor/command-history.js';
import {
  initTabCompletion,
  isCompletionVisible,
  getSlashPrefix,
  showCompletionPopup,
  closeCompletionPopup,
  updateCompletions,
  navigateCompletion,
  selectCompletion,
  getCompletionState
} from './editor/tab-completion.js';
import {
  initMessageQueue,
  isProcessing,
  setProcessing,
  getMessageQueue,
  getQueueCount,
  setOnQueueChange,
  queueMessage,
  dequeueMessage,
  clearMessageQueue,
  removeFromQueue,
  loadMessageQueue,
  saveMessageQueue,
  processNextInQueue,
  injectMessage
} from './editor/message-queue.js';
import {
  showImagePreview,
  hideImagePreview,
  updateImagePreview,
  isPreviewVisible,
  setOnImageRemoved,
  setOnClearAll,
  showImageSizeError
} from './editor/image-preview.js';
import {
  initSuggestions,
  isSuggestionVisible,
  showSuggestion,
  handleSuggestionKey
} from './editor/suggestions.js';

// Re-export constants for external consumers
export { EDITOR_CONTAINER_ID, EDITOR_OPTIONS, EDITOR_EXTENSIONS, SUPPORTED_IMAGE_TYPES, IMAGE_PREVIEW_SIZE, IMAGE_WARN_SIZE_BYTES, IMAGE_MAX_SIZE_BYTES } from './editor/constants.js';
export { MESSAGE_QUEUE_KEY, MAX_QUEUE_SIZE } from './editor/constants.js';

// Re-export tab completion for external consumers
export { getCompletionState, showCompletionPopup, closeCompletionPopup, navigateCompletion, selectCompletion, updateCompletions } from './editor/tab-completion.js';

// Re-export message queue for external consumers
export {
  isProcessing,
  setProcessing,
  getMessageQueue,
  getQueueCount,
  setOnQueueChange,
  queueMessage,
  dequeueMessage,
  clearMessageQueue,
  removeFromQueue,
  loadMessageQueue,
  saveMessageQueue,
  processNextInQueue,
  injectMessage
} from './editor/message-queue.js';

// Re-export markdown for external consumers
export { jsonToMarkdown } from './editor/markdown.js';

// ============================================================================
// State
// ============================================================================

/** TipTap Editor instance (initialized in browser only) */
let editorInstance = null;

/** Callback for submit action (set by consumer) */
let onSubmitCallback = null;

/** Flag to prevent duplicate sends while processing */
let isSubmitting = false;

/** Pending images waiting to be sent (Story 28-1) */
let pendingImages = [];

// ============================================================================
// Image Paste Handling (Story 28-1)
// ============================================================================

/**
 * Check if clipboard data contains image data
 * @param {DataTransfer} clipboardData - Clipboard data from paste event
 * @returns {boolean}
 */
export function isImageClipboardData(clipboardData) {
  if (!clipboardData) return false;

  // Check items array
  if (clipboardData.items) {
    for (const item of clipboardData.items) {
      if (item.type && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
        return true;
      }
    }
  }

  // Check files array (some browsers use this instead)
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (const file of clipboardData.files) {
      if (file.type && SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Handle image paste from clipboard
 * @param {DataTransfer} clipboardData - Clipboard data from paste event
 * @returns {Promise<boolean>} True if image was handled, false otherwise
 */
export async function handleImagePaste(clipboardData) {
  if (!clipboardData) return false;

  // Find image item
  let imageFile = null;

  // Check items array first (preferred)
  if (clipboardData.items) {
    for (const item of clipboardData.items) {
      if (item.type && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
        imageFile = item.getAsFile();
        break;
      }
    }
  }

  // Fallback to files array
  if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
    for (const file of clipboardData.files) {
      if (file.type && SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        imageFile = file;
        break;
      }
    }
  }

  if (!imageFile) return false;

  // Size validation (Story 28-5)
  const fileSizeBytes = imageFile.size;

  // Block images over 20MB
  if (fileSizeBytes > IMAGE_MAX_SIZE_BYTES) {
    const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    console.warn(`Image too large: ${sizeMB}MB (max: 20MB)`);
    // Show error to user via preview module
    showImageSizeError(`Image too large (${sizeMB}MB). Maximum size is 20MB.`);
    return false;
  }

  // Warn for images over 5MB but allow
  const isLargeImage = fileSizeBytes > IMAGE_WARN_SIZE_BYTES;
  if (isLargeImage) {
    const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    console.log(`Large image detected: ${sizeMB}MB`);
  }

  // Convert to base64 data URL
  let dataUrl;
  try {
    dataUrl = await fileToDataUrl(imageFile);
  } catch (error) {
    console.error('Failed to read image from clipboard:', error);
    return false;
  }

  // Generate filename
  const filename = imageFile.name || generateImageFilename(imageFile.type);

  // Add to pending images (28-5: include size for preview tooltip)
  const imageData = {
    dataUrl,
    mimeType: imageFile.type,
    filename,
    sizeBytes: fileSizeBytes,
    isLarge: isLargeImage,
  };

  pendingImages.push(imageData);

  // Update preview
  updateImagePreview(pendingImages);

  return true;
}

/**
 * Get all pending images
 * @returns {Array<{dataUrl: string, mimeType: string, filename: string}>}
 */
export function getPendingImages() {
  return [...pendingImages];
}

/**
 * Remove a pending image by index
 * @param {number} index
 */
export function removePendingImage(index) {
  if (index >= 0 && index < pendingImages.length) {
    pendingImages.splice(index, 1);
    updateImagePreview(pendingImages);
  }
}

/**
 * Clear all pending images
 */
export function clearPendingImages() {
  pendingImages = [];
  updateImagePreview([]);
}

/**
 * Get editor payload including images
 * @returns {{markdown: string, images: Array}}
 */
export function getEditorPayload() {
  return {
    markdown: getEditorMarkdown(),
    images: [...pendingImages],
  };
}

/**
 * Convert File to base64 data URL
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Generate filename for pasted images without names
 * @param {string} mimeType
 * @returns {string}
 */
function generateImageFilename(mimeType) {
  const ext = mimeType.split('/')[1] || 'png';
  return `Pasted Image.${ext}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Set callback for when user submits content
 * @param {Function} callback - Called with editor content on submit
 */
export function setOnSubmit(callback) {
  onSubmitCallback = callback;
}

/**
 * Get current editor content as HTML
 * @returns {string} HTML content or empty string
 */
export function getEditorContent() {
  if (!editorInstance) return '';
  return editorInstance.getHTML();
}

/**
 * Get current editor content as Markdown
 * @returns {string} Markdown content or empty string
 */
export function getEditorMarkdown() {
  if (!editorInstance) return '';
  const json = editorInstance.getJSON();
  return jsonToMarkdown(json);
}

/**
 * Set editor content from HTML
 * @param {string} html - HTML content to set
 */
export function setEditorContent(html) {
  if (!editorInstance) return;
  editorInstance.commands.setContent(html);
}

/**
 * Clear all editor content and pending images
 */
export function clearEditor() {
  if (editorInstance) {
    editorInstance.commands.clearContent();
  }
  // Always clear pending images, even if editor is not initialized
  clearPendingImages();

  // Show suggestion pill after clearing (small delay for TipTap to settle)
  setTimeout(() => {
    showSuggestion();
  }, 50);
}

/**
 * Move cursor to end of editor content
 */
function moveCursorToEnd() {
  if (!editorInstance) return;
  editorInstance.commands.focus('end');
}

/**
 * Get the editor instance (for advanced usage)
 * @returns {Object|null} TipTap Editor instance
 */
export function getEditor() {
  return editorInstance;
}

/**
 * Insert text into the editor at current cursor position
 * @param {string} text - Text to insert
 */
export function insertText(text) {
  if (!editorInstance) return;
  editorInstance.commands.insertContent(text);
}

/**
 * Insert text and immediately submit it to Claude
 * @param {string} text - Text to insert and submit
 */
export function insertAndSubmit(text) {
  if (!editorInstance) return;
  clearEditor();
  editorInstance.commands.insertContent(text);
  submitEditorContent();
}

/**
 * Reset the submitting flag (called when response completes or errors)
 */
export function resetSubmitting() {
  isSubmitting = false;
}

// ============================================================================
// Editor Initialization
// ============================================================================

/**
 * Create and initialize the TipTap editor
 * Must be called in browser environment with DOM available
 * @returns {Object|null} Editor instance or null if initialization fails
 */
export async function createEditor() {
  // Only run in browser with DOM
  if (typeof document === 'undefined') {
    return null;
  }

  const container = document.getElementById(EDITOR_CONTAINER_ID);
  if (!container) {
    console.error(`Editor container #${EDITOR_CONTAINER_ID} not found`);
    return null;
  }

  try {
    // TipTap loaded from local bundle (tiptap.bundle.js)
    if (typeof window === 'undefined' || !window.TipTap) {
      throw new Error('TipTap bundle not loaded. Ensure tiptap.bundle.js is included before editor.js');
    }
    const { Editor, StarterKit, CodeBlock } = window.TipTap;

    editorInstance = new Editor({
      element: container,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        CodeBlock,
      ],
      content: '',
      autofocus: EDITOR_OPTIONS.autofocus,
      editorProps: {
        ...EDITOR_OPTIONS.editorProps,
        // Handle paste events for image clipboard data (Story 28-1)
        handlePaste: (view, event) => {
          if (isImageClipboardData(event.clipboardData)) {
            handleImagePaste(event.clipboardData);
            return true; // Prevent default paste - we handled the image
          }
          return false; // Let TipTap handle text/HTML paste
        },
        handleKeyDown: (view, event) => {
          // Suggestion pill handling - hide on typing, Escape to dismiss
          if (isSuggestionVisible()) {
            if (handleSuggestionKey(event)) {
              return true;
            }
          }

          // Tab key - trigger or select completion
          if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            if (isCompletionVisible()) {
              event.preventDefault();
              selectCompletion(getCompletionState().selectedIndex);
              return true;
            }
            const prefixInfo = getSlashPrefix();
            if (prefixInfo) {
              event.preventDefault();
              showCompletionPopup(prefixInfo.prefix);
              return true;
            }
          }

          // Escape - close completion popup
          if (event.key === 'Escape') {
            if (isCompletionVisible()) {
              event.preventDefault();
              closeCompletionPopup();
              return true;
            }
          }

          // Shift+Enter - insert new paragraph (for mixed content like paragraphs + lists)
          if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            // Split at cursor to create new paragraph (not just hard break)
            const editor = editorInstance;
            if (editor) {
              // If in a list, exit the list item; otherwise create new paragraph
              if (editor.isActive('listItem')) {
                editor.chain().focus().splitListItem('listItem').run();
              } else {
                // Create new paragraph by splitting at cursor
                editor.chain().focus().splitBlock().run();
              }
            }
            return true;
          }

          // Enter - select completion OR submit content
          if (event.key === 'Enter' && !event.shiftKey) {
            if (isCompletionVisible()) {
              event.preventDefault();
              selectCompletion(getCompletionState().selectedIndex);
              return true;
            }
            event.preventDefault();
            submitEditorContent();
            return true;
          }

          // Up arrow - navigate popup OR history
          if (event.key === 'ArrowUp' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            if (isCompletionVisible()) {
              event.preventDefault();
              navigateCompletion(-1);
              return true;
            }
            if (navigateHistoryUp()) {
              event.preventDefault();
              return true;
            }
          }

          // Down arrow - navigate popup OR history
          if (event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            if (isCompletionVisible()) {
              event.preventDefault();
              navigateCompletion(1);
              return true;
            }
            if (navigateHistoryDown()) {
              event.preventDefault();
              return true;
            }
          }

          return false;
        },
      },
      onTransaction: ({ editor }) => {
        updateToolbarState();

        // Auto-show completion popup when "/" is typed at start of message (B-9.5 enhancement)
        const text = editor.getText();
        if (text === '/' && !isCompletionVisible()) {
          showCompletionPopup('/');
        }

        // Update completion popup as user types (filter commands)
        if (isCompletionVisible()) {
          const prefixInfo = getSlashPrefix();
          if (prefixInfo) {
            // Update filtering as user types more characters
            updateCompletions(prefixInfo.prefix);
          } else {
            // User deleted the "/" or moved cursor away - close popup
            closeCompletionPopup();
          }
        }
      },
    });

    // Initialize modules with editor callbacks
    initToolbar({
      getEditor: () => editorInstance
    });

    initCommandHistory({
      getContent: getEditorMarkdown,
      setContent: setEditorContent,
      moveCursorToEnd
    });

    initTabCompletion({
      getEditor: () => editorInstance,
      insertText
    });

    initMessageQueue({
      clearEditor,
      insertContent: (text) => editorInstance?.commands.insertContent(text),
      submit: submitEditorContent
    });

    // Initialize suggestion pills
    initSuggestions(editorInstance);

    // Show suggestion pill on initial focus (if editor is empty)
    setTimeout(() => {
      if (editorInstance && editorInstance.getText().trim() === '') {
        showSuggestion();
      }
    }, 100);

    // Set up image removal callback (Story 28-1)
    setOnImageRemoved((index) => {
      removePendingImage(index);
    });

    // Set up clear all callback (Story 28-6)
    setOnClearAll(() => {
      clearPendingImages();
    });

    // Focus the editor
    editorInstance.commands.focus();

    // Listen for agent/workflow menu launches
    if (typeof window !== 'undefined' && window.electronAPI?.agent?.onLaunch) {
      window.electronAPI.agent.onLaunch((event, command) => {
        insertAndSubmit(command);
      });
    }

    return editorInstance;
  } catch (error) {
    console.error('Failed to initialize TipTap editor:', error);
    return null;
  }
}

// ============================================================================
// Submit Logic
// ============================================================================

/**
 * Submit editor content to Claude SDK
 * Called on Enter key press
 */
function submitEditorContent() {
  if (!editorInstance) return;

  const markdown = getEditorMarkdown();

  // Don't submit empty content
  if (!markdown.trim()) return;

  // If Claude is processing, queue the message instead
  if (isProcessing()) {
    const queued = queueMessage(markdown);
    if (queued) {
      console.log('[Editor] Message queued while processing');
      clearEditor();
      editorInstance.commands.focus();
    } else {
      console.log('[Editor] Queue full or message invalid');
    }
    return;
  }

  // Prevent duplicate sends
  if (isSubmitting) {
    console.log('[Editor] Ignoring submit - already processing');
    return;
  }

  // Mark as submitting
  isSubmitting = true;
  setProcessing(true);

  // Add to command history
  addToHistory(markdown);
  resetHistoryNavigation();

  // Capture images before clearing (28-1)
  const images = [...pendingImages];

  // Add user message to the view (28-1: include images for display)
  addMessage({
    type: 'user',
    content: markdown,
    images: images,
  });

  // Show thinking indicator
  showThinking();
  scrollToBottom();

  // Send to Claude SDK via IPC (28-1: include images)
  if (typeof window !== 'undefined' && window.electronAPI?.claude?.send) {
    console.log('Sending to Claude SDK:', markdown.substring(0, 50) + '...', images.length ? `(${images.length} images)` : '');
    window.electronAPI.claude.send(markdown, images);
  } else if (onSubmitCallback) {
    onSubmitCallback(markdown);
  }

  // Clear pending images after submit (28-1)
  clearPendingImages();

  // Clear editor after submit
  clearEditor();

  // Clear quick action buttons
  onResponseSubmitted();

  // Refocus editor
  editorInstance.commands.focus();
}
