/**
 * Rich Text Editor module using TipTap
 * Provides a rich text input area for composing messages to Claude
 *
 * Note: TipTap dependencies are loaded from tiptap.bundle.js which must be
 * included in the HTML before this module. The bundle exposes window.TipTap.
 */

import { addMessage, showThinking, scrollToBottom, onResponseSubmitted } from './components/MessageView.js';

// Import from modules
import { EDITOR_CONTAINER_ID, EDITOR_OPTIONS } from './editor/constants.js';
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
  processNextInQueue
} from './editor/message-queue.js';

// Re-export constants for external consumers
export { EDITOR_CONTAINER_ID, EDITOR_OPTIONS, EDITOR_EXTENSIONS } from './editor/constants.js';
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
  processNextInQueue
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
 * Clear all editor content
 */
export function clearEditor() {
  if (!editorInstance) return;
  editorInstance.commands.clearContent();
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
        handleKeyDown: (view, event) => {
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
      onTransaction: () => {
        updateToolbarState();
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

  // Add user message to the view
  addMessage({
    type: 'user',
    content: markdown,
  });

  // Show thinking indicator
  showThinking();
  scrollToBottom();

  // Send to Claude SDK via IPC
  if (typeof window !== 'undefined' && window.electronAPI?.claude?.send) {
    console.log('Sending to Claude SDK:', markdown.substring(0, 50) + '...');
    window.electronAPI.claude.send(markdown);
  } else if (onSubmitCallback) {
    onSubmitCallback(markdown);
  }

  // Clear editor after submit
  clearEditor();

  // Clear quick action buttons
  onResponseSubmitted();

  // Refocus editor
  editorInstance.commands.focus();
}
