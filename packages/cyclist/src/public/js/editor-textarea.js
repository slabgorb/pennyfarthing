/**
 * Simple Textarea Editor module - lightweight alternative to TipTap
 *
 * This is a drop-in replacement for the TipTap-based editor that uses a plain
 * textarea for better performance. It maintains API compatibility with editor.js.
 *
 * To use: In index.html, replace the editor.js import with editor-textarea.js
 */

import { addMessage, showThinking, scrollToBottom, onResponseSubmitted } from './components/MessageView.js';

// Import from modules
import { EDITOR_CONTAINER_ID, SUPPORTED_IMAGE_TYPES, IMAGE_WARN_SIZE_BYTES, IMAGE_MAX_SIZE_BYTES } from './editor/constants.js';
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
  queueMessage,
  isQueuePaused,
  resumeQueue
} from './editor/message-queue.js';
import {
  updateImagePreview,
  setOnImageRemoved,
  setOnClearAll,
  showImageSizeError
} from './editor/image-preview.js';

// Re-export everything the original editor exports for API compatibility
export { EDITOR_CONTAINER_ID, EDITOR_OPTIONS, EDITOR_EXTENSIONS, SUPPORTED_IMAGE_TYPES, IMAGE_PREVIEW_SIZE, IMAGE_WARN_SIZE_BYTES, IMAGE_MAX_SIZE_BYTES } from './editor/constants.js';
export { MESSAGE_QUEUE_KEY, MAX_QUEUE_SIZE } from './editor/constants.js';
export { getCompletionState, showCompletionPopup, closeCompletionPopup, navigateCompletion, selectCompletion, updateCompletions } from './editor/tab-completion.js';
export {
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
  injectMessage,
  pauseQueue,
  resumeQueue,
  isQueuePaused,
  setBellMode,
  isBellModeEnabled,
  sendAllQueuedMessages,
  flushRemainingQueue,
  handleTurnComplete
} from './editor/message-queue.js';

// Re-export markdown for external consumers (stub for textarea)
export { jsonToMarkdown } from './editor/markdown.js';

// ============================================================================
// State
// ============================================================================

/** Textarea element */
let textareaElement = null;

/** Callback for submit action */
let onSubmitCallback = null;

/** Flag to prevent duplicate sends */
let isSubmitting = false;

/** Pending images */
let pendingImages = [];

// ============================================================================
// Image Handling (same as original)
// ============================================================================

export function isImageClipboardData(clipboardData) {
  if (!clipboardData) return false;
  if (clipboardData.items) {
    for (const item of clipboardData.items) {
      if (item.type && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
        return true;
      }
    }
  }
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (const file of clipboardData.files) {
      if (file.type && SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        return true;
      }
    }
  }
  return false;
}

export async function handleImagePaste(clipboardData) {
  if (!clipboardData) return false;

  let imageFile = null;
  if (clipboardData.items) {
    for (const item of clipboardData.items) {
      if (item.type && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
        imageFile = item.getAsFile();
        break;
      }
    }
  }
  if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
    for (const file of clipboardData.files) {
      if (file.type && SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        imageFile = file;
        break;
      }
    }
  }
  if (!imageFile) return false;

  const fileSizeBytes = imageFile.size;
  if (fileSizeBytes > IMAGE_MAX_SIZE_BYTES) {
    const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    showImageSizeError(`Image too large (${sizeMB}MB). Maximum size is 20MB.`);
    return false;
  }

  const isLargeImage = fileSizeBytes > IMAGE_WARN_SIZE_BYTES;
  let dataUrl;
  try {
    dataUrl = await fileToDataUrl(imageFile);
  } catch (error) {
    console.error('Failed to read image from clipboard:', error);
    return false;
  }

  const filename = imageFile.name || generateImageFilename(imageFile.type);
  const imageData = {
    dataUrl,
    mimeType: imageFile.type,
    filename,
    sizeBytes: fileSizeBytes,
    isLarge: isLargeImage,
  };

  pendingImages.push(imageData);
  updateImagePreview(pendingImages);
  return true;
}

export function getPendingImages() {
  return [...pendingImages];
}

export function removePendingImage(index) {
  if (index >= 0 && index < pendingImages.length) {
    pendingImages.splice(index, 1);
    updateImagePreview(pendingImages);
  }
}

export function clearPendingImages() {
  pendingImages = [];
  updateImagePreview([]);
}

export function getEditorPayload() {
  return {
    markdown: getEditorMarkdown(),
    images: [...pendingImages],
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function generateImageFilename(mimeType) {
  const ext = mimeType.split('/')[1] || 'png';
  return `Pasted Image.${ext}`;
}

// ============================================================================
// Public API
// ============================================================================

export function setOnSubmit(callback) {
  onSubmitCallback = callback;
}

export function getEditorContent() {
  if (!textareaElement) return '';
  return textareaElement.value;
}

export function getEditorMarkdown() {
  // Textarea content is already plain text/markdown
  return getEditorContent();
}

export function setEditorContent(content) {
  if (!textareaElement) return;
  textareaElement.value = content;
  adjustTextareaHeight();
}

export function clearEditor() {
  if (textareaElement) {
    textareaElement.value = '';
    adjustTextareaHeight();
  }
  clearPendingImages();
}

export function getEditor() {
  // Return a minimal API object for compatibility
  return textareaElement ? {
    getText: () => textareaElement.value,
    getHTML: () => textareaElement.value,
    commands: {
      focus: (position) => {
        textareaElement.focus();
        if (position === 'end') {
          textareaElement.selectionStart = textareaElement.selectionEnd = textareaElement.value.length;
        }
      },
      insertContent: (text) => insertText(text),
      setContent: (content) => setEditorContent(content),
      clearContent: () => clearEditor(),
    }
  } : null;
}

export function insertText(text) {
  if (!textareaElement) return;
  const start = textareaElement.selectionStart;
  const end = textareaElement.selectionEnd;
  const value = textareaElement.value;
  textareaElement.value = value.substring(0, start) + text + value.substring(end);
  textareaElement.selectionStart = textareaElement.selectionEnd = start + text.length;
  adjustTextareaHeight();
}

export function insertAndSubmit(text) {
  clearEditor();
  if (textareaElement) {
    textareaElement.value = text;
  }
  submitEditorContent();
}

export function resetSubmitting() {
  isSubmitting = false;
}


// ============================================================================
// Editor Initialization
// ============================================================================

function adjustTextareaHeight() {
  if (!textareaElement) return;
  // Reset height to auto to get scrollHeight
  textareaElement.style.height = 'auto';
  // Set to scrollHeight, clamped to min/max
  const minHeight = 60;
  const maxHeight = 300;
  const newHeight = Math.min(Math.max(textareaElement.scrollHeight, minHeight), maxHeight);
  textareaElement.style.height = newHeight + 'px';
}

export async function createEditor() {
  if (typeof document === 'undefined') {
    return null;
  }

  const container = document.getElementById(EDITOR_CONTAINER_ID);
  if (!container) {
    console.error(`Editor container #${EDITOR_CONTAINER_ID} not found`);
    return null;
  }

  // Create textarea element
  textareaElement = document.createElement('textarea');
  textareaElement.id = 'editor-textarea';
  textareaElement.className = 'editor-textarea';
  textareaElement.placeholder = 'Type your message... (Enter to send)';
  textareaElement.spellcheck = true;
  textareaElement.lang = 'en';

  // Clear container and add textarea
  container.innerHTML = '';
  container.appendChild(textareaElement);

  // Add styles for textarea
  addTextareaStyles();

  // Handle paste for images
  textareaElement.addEventListener('paste', async (event) => {
    if (isImageClipboardData(event.clipboardData)) {
      event.preventDefault();
      await handleImagePaste(event.clipboardData);
    }
    // Let text paste happen normally
  });

  // Handle keydown
  textareaElement.addEventListener('keydown', (event) => {
    // Tab key - trigger or select completion
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      if (isCompletionVisible()) {
        event.preventDefault();
        selectCompletion(getCompletionState().selectedIndex);
        return;
      }
      const prefixInfo = getSlashPrefixFromTextarea();
      if (prefixInfo) {
        event.preventDefault();
        showCompletionPopup(prefixInfo.prefix);
        return;
      }
    }

    // Escape - close completion popup
    if (event.key === 'Escape') {
      if (isCompletionVisible()) {
        event.preventDefault();
        closeCompletionPopup();
        return;
      }
    }

    // Shift+Enter - insert newline
    if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey) {
      // Let default behavior happen (insert newline)
      return;
    }

    // Enter - select completion OR submit content
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isCompletionVisible()) {
        event.preventDefault();
        selectCompletion(getCompletionState().selectedIndex);
        return;
      }
      event.preventDefault();
      submitEditorContent();
      return;
    }

    // Up arrow - navigate popup OR history
    if (event.key === 'ArrowUp' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      if (isCompletionVisible()) {
        event.preventDefault();
        navigateCompletion(-1);
        return;
      }
      // Only navigate history if cursor is at start
      if (textareaElement.selectionStart === 0) {
        if (navigateHistoryUp()) {
          event.preventDefault();
          return;
        }
      }
    }

    // Down arrow - navigate popup OR history
    if (event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      if (isCompletionVisible()) {
        event.preventDefault();
        navigateCompletion(1);
        return;
      }
      // Only navigate history if cursor is at end
      if (textareaElement.selectionEnd === textareaElement.value.length) {
        if (navigateHistoryDown()) {
          event.preventDefault();
          return;
        }
      }
    }
  });

  // Handle input for completion popup and auto-resize
  textareaElement.addEventListener('input', () => {
    adjustTextareaHeight();

    const text = textareaElement.value;

    // Auto-show completion popup when "/" is typed at start
    if (text === '/' && !isCompletionVisible()) {
      showCompletionPopup('/');
    }

    // Update completion popup as user types
    if (isCompletionVisible()) {
      const prefixInfo = getSlashPrefixFromTextarea();
      if (prefixInfo) {
        updateCompletions(prefixInfo.prefix);
      } else {
        closeCompletionPopup();
      }
    }
  });

  // Initialize modules with editor callbacks
  initCommandHistory({
    getContent: getEditorMarkdown,
    setContent: setEditorContent,
    moveCursorToEnd: () => {
      if (textareaElement) {
        textareaElement.selectionStart = textareaElement.selectionEnd = textareaElement.value.length;
      }
    }
  });

  initTabCompletion({
    getEditor: () => getEditor(),
    insertText
  });

  initMessageQueue({
    clearEditor,
    submit: submitEditorContent
  });

  setOnImageRemoved((index) => {
    removePendingImage(index);
  });

  setOnClearAll(() => {
    clearPendingImages();
  });

  // Focus the textarea
  textareaElement.focus();

  // Listen for agent/workflow menu launches
  if (typeof window !== 'undefined' && window.electronAPI?.agent?.onLaunch) {
    window.electronAPI.agent.onLaunch((event, command) => {
      insertAndSubmit(command);
    });
  }

  return getEditor();
}

function getSlashPrefixFromTextarea() {
  if (!textareaElement) return null;
  const value = textareaElement.value;
  const cursorPos = textareaElement.selectionStart;

  // Find the start of the current "word" (from last space or start)
  let wordStart = cursorPos;
  while (wordStart > 0 && value[wordStart - 1] !== ' ' && value[wordStart - 1] !== '\n') {
    wordStart--;
  }

  const word = value.substring(wordStart, cursorPos);
  if (word.startsWith('/')) {
    return { prefix: word, start: wordStart, end: cursorPos };
  }
  return null;
}

function addTextareaStyles() {
  // Check if styles already added
  if (document.getElementById('textarea-editor-styles')) return;

  const style = document.createElement('style');
  style.id = 'textarea-editor-styles';
  style.textContent = `
    .editor-textarea {
      width: 100%;
      height: 80px;
      min-height: 60px;
      max-height: 300px;
      padding: 0.75rem 1rem;
      background: transparent;
      border: none;
      outline: none;
      resize: none;
      font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--text-primary);
    }

    .editor-textarea::placeholder {
      color: var(--text-secondary);
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// Submit Logic
// ============================================================================

function submitEditorContent(passedText, passedImages) {
  if (!textareaElement) return;

  const markdown = passedText ?? getEditorMarkdown();
  const images = passedImages ?? [...pendingImages];

  if (!markdown.trim()) return;

  console.log('[Editor-Textarea] submitEditorContent called, isProcessing:', isProcessing(), 'isSubmitting:', isSubmitting);

  // If Claude is processing, queue the message
  if (isProcessing() && passedText === undefined) {
    const queued = queueMessage({ text: markdown, images: images });
    if (queued) {
      console.log('[Editor-Textarea] Message queued while processing');
      clearPendingImages();
      clearEditor();
      textareaElement.focus();
    }
    return;
  }

  // Prevent duplicate sends
  if (isSubmitting && passedText === undefined) {
    console.log('[Editor-Textarea] Ignoring submit - already processing');
    return;
  }

  isSubmitting = true;
  setProcessing(true);

  if (isQueuePaused()) {
    resumeQueue();
  }

  // Add to command history
  if (passedText === undefined) {
    addToHistory(markdown);
    resetHistoryNavigation();
  }

  // Add user message to view
  addMessage({
    type: 'user',
    content: markdown,
    images: images,
  });

  showThinking();
  scrollToBottom();

  // Send to Claude SDK
  if (typeof window !== 'undefined' && window.electronAPI?.claude?.send) {
    console.log('Sending to Claude SDK:', markdown.substring(0, 50) + '...', images.length ? `(${images.length} images)` : '');
    window.electronAPI.claude.send(markdown, images);
  } else if (onSubmitCallback) {
    onSubmitCallback(markdown);
  }

  // Clear after submit
  if (passedText === undefined) {
    clearPendingImages();
    clearEditor();
  }

  onResponseSubmitted();
  textareaElement.focus();
}
