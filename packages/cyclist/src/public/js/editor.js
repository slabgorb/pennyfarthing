/**
 * Rich Text Editor module using TipTap
 * Provides a rich text input area for composing messages to Claude
 *
 * Note: TipTap dependencies are loaded from tiptap.bundle.js which must be
 * included in the HTML before this module. The bundle exposes window.TipTap.
 */

import { addMessage, showThinking, hideThinking, scrollToBottom, onResponseSubmitted } from './components/MessageView.js';
import { filterCommands, isCompletionTrigger } from './slash-commands.js';

// ============================================================================
// Constants - Exported for testing and configuration
// ============================================================================

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

// ============================================================================
// State
// ============================================================================

/** TipTap Editor instance (initialized in browser only) */
let editorInstance = null;

/** Callback for submit action (set by consumer) */
let onSubmitCallback = null;

/** Toolbar button elements cache */
let toolbarButtons = null;

/** Flag to prevent duplicate sends while processing */
let isSubmitting = false;

// ============================================================================
// Message Queue (Story 17-1)
// ============================================================================

/** localStorage key for persisting message queue */
export const MESSAGE_QUEUE_KEY = 'cyclist-message-queue';

/** Maximum number of messages to queue */
export const MAX_QUEUE_SIZE = 10;

/** Queued messages waiting to be sent */
let messageQueue = [];

/** Callback invoked when queue changes */
let onQueueChangeCallback = null;

/**
 * Check if Claude is currently processing a message
 * @returns {boolean} True if processing
 */
export function isProcessing() {
  return isSubmitting;
}

/**
 * Set the processing state
 * @param {boolean} value - New processing state
 */
export function setProcessing(value) {
  isSubmitting = value;
}

/**
 * Get the current message queue
 * @returns {string[]} Copy of the message queue
 */
export function getMessageQueue() {
  return [...messageQueue];
}

/**
 * Get the number of queued messages
 * @returns {number} Queue length
 */
export function getQueueCount() {
  return messageQueue.length;
}

/**
 * Set callback for queue changes
 * @param {Function|null} callback - Called with new queue count when queue changes
 */
export function setOnQueueChange(callback) {
  onQueueChangeCallback = callback;
}

/**
 * Notify listener of queue change
 */
function notifyQueueChange() {
  if (onQueueChangeCallback) {
    onQueueChangeCallback(messageQueue.length);
  }
}

/**
 * Save message queue to localStorage
 */
export function saveMessageQueue() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MESSAGE_QUEUE_KEY, JSON.stringify(messageQueue));
  } catch (e) {
    console.warn('Failed to save message queue:', e);
  }
}

/**
 * Load message queue from localStorage
 */
export function loadMessageQueue() {
  if (typeof localStorage === 'undefined') return;
  try {
    const stored = localStorage.getItem(MESSAGE_QUEUE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        messageQueue = parsed;
        notifyQueueChange();
      }
    }
  } catch (e) {
    console.warn('Failed to load message queue:', e);
    messageQueue = [];
  }
}

/**
 * Add a message to the queue
 * @param {string} message - Message to queue
 * @returns {boolean} True if message was queued
 */
export function queueMessage(message) {
  // Don't queue empty messages
  if (!message || !message.trim()) {
    return false;
  }

  // Enforce max queue size
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    return false;
  }

  messageQueue.push(message);
  saveMessageQueue();
  notifyQueueChange();
  return true;
}

/**
 * Remove and return the first message from the queue
 * @returns {string|undefined} First message or undefined if empty
 */
export function dequeueMessage() {
  if (messageQueue.length === 0) {
    return undefined;
  }
  const message = messageQueue.shift();
  saveMessageQueue();
  notifyQueueChange();
  return message;
}

/**
 * Process the next message in the queue
 * Should be called when Claude finishes processing
 */
export function processNextInQueue() {
  if (messageQueue.length === 0 || isSubmitting) {
    return;
  }
  const message = dequeueMessage();
  if (message) {
    // Trigger submit with the queued message
    if (typeof window !== 'undefined' && window.electronAPI?.claude?.send) {
      isSubmitting = true;
      window.electronAPI.claude.send(message);
    }
  }
}

/**
 * Clear all queued messages
 */
export function clearMessageQueue() {
  messageQueue = [];
  saveMessageQueue();
  notifyQueueChange();
}

// ============================================================================
// Command History (B-9.4)
// ============================================================================

/** localStorage key for persisting command history */
const HISTORY_KEY = 'cyclist-command-history';

/** Maximum number of commands to store */
const MAX_HISTORY = 100;

/** Array of past commands (most recent at end) */
let commandHistory = [];

/** Current position in history (-1 = new command, not browsing history) */
let historyIndex = -1;

/** Saved current input when browsing history */
let savedCurrentInput = '';

/**
 * Load command history from localStorage
 */
function loadHistory() {
  if (typeof localStorage === 'undefined') return;
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      commandHistory = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load command history:', e);
    commandHistory = [];
  }
}

/**
 * Save command history to localStorage
 */
function saveHistory() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(commandHistory));
  } catch (e) {
    console.warn('Failed to save command history:', e);
  }
}

/**
 * Add a command to history
 * @param {string} command - The command to add
 */
function addToHistory(command) {
  if (!command.trim()) return;

  // Don't add duplicate of last command
  if (commandHistory.length > 0 && commandHistory[commandHistory.length - 1] === command) {
    return;
  }

  commandHistory.push(command);

  // Trim to max size
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory.shift();
  }

  saveHistory();
}

/**
 * Navigate to previous command in history (Up arrow)
 * @returns {boolean} True if navigation occurred
 */
function navigateHistoryUp() {
  if (commandHistory.length === 0) return false;

  // First time pressing up: save current input and start at end
  if (historyIndex === -1) {
    savedCurrentInput = getEditorMarkdown();
    historyIndex = commandHistory.length - 1;
  } else if (historyIndex > 0) {
    historyIndex--;
  } else {
    // Already at oldest command
    return false;
  }

  setEditorContent(commandHistory[historyIndex]);
  moveCursorToEnd();
  return true;
}

/**
 * Navigate to next command in history (Down arrow)
 * @returns {boolean} True if navigation occurred
 */
function navigateHistoryDown() {
  if (historyIndex === -1) return false;

  historyIndex++;

  if (historyIndex >= commandHistory.length) {
    // Back to current input
    historyIndex = -1;
    setEditorContent(savedCurrentInput);
    savedCurrentInput = '';
  } else {
    setEditorContent(commandHistory[historyIndex]);
  }

  moveCursorToEnd();
  return true;
}

/**
 * Reset history navigation state (call after submit)
 */
function resetHistoryNavigation() {
  historyIndex = -1;
  savedCurrentInput = '';
}

// ============================================================================
// Tab Completion (B-9.5)
// ============================================================================

/** Completion popup state */
let completionState = {
  visible: false,
  commands: [],
  selectedIndex: 0,
};

/**
 * Get current completion state (for testing)
 * @returns {Object} Current completion state
 */
export function getCompletionState() {
  return { ...completionState, commands: [...completionState.commands] };
}

/**
 * Show completion popup with filtered commands
 * @param {string} prefix - The command prefix to filter by
 */
export function showCompletionPopup(prefix) {
  const commands = filterCommands(prefix);
  completionState = {
    visible: true,
    commands: commands,
    selectedIndex: 0,
  };
  currentPrefix = prefix;
  renderCompletionPopup();
}

/**
 * Close completion popup and reset state
 */
export function closeCompletionPopup() {
  completionState = {
    visible: false,
    commands: [],
    selectedIndex: 0,
  };
  currentPrefix = '';
  renderCompletionPopup();
}

/**
 * Update completion popup with new filtered commands
 * @param {string} prefix - New prefix to filter by
 */
export function updateCompletions(prefix) {
  const commands = filterCommands(prefix);
  completionState = {
    ...completionState,
    commands: commands,
    selectedIndex: 0, // Reset selection when filter changes
  };
  currentPrefix = prefix;
  renderCompletionPopup();
}

/**
 * Navigate completion selection up or down
 * @param {number} direction - 1 for down, -1 for up
 */
export function navigateCompletion(direction) {
  const { commands, selectedIndex } = completionState;
  if (commands.length === 0) return;

  let newIndex = selectedIndex + direction;

  // Wrap around
  if (newIndex < 0) {
    newIndex = commands.length - 1;
  } else if (newIndex >= commands.length) {
    newIndex = 0;
  }

  completionState = {
    ...completionState,
    selectedIndex: newIndex,
  };
  renderCompletionPopup();
}

/**
 * Select completion at index and insert into editor
 * @param {number} index - Index of command to select
 */
export function selectCompletion(index) {
  const { commands } = completionState;
  if (index >= 0 && index < commands.length) {
    const command = commands[index];
    // Replace the current prefix with the full command
    replaceCurrentPrefix(command.name);
  }
  closeCompletionPopup();
  renderCompletionPopup();
}

/** Cached popup element */
let popupElement = null;

/** Current prefix being completed */
let currentPrefix = '';

/**
 * Get or create the completion popup DOM element
 * @returns {HTMLElement} The popup element
 */
function getPopupElement() {
  if (popupElement) return popupElement;
  if (typeof document === 'undefined') return null;

  popupElement = document.createElement('div');
  popupElement.id = 'completion-popup';
  popupElement.className = 'completion-popup';
  popupElement.style.display = 'none';

  // Insert popup near editor
  const editorWrapper = document.getElementById('editor-wrapper');
  if (editorWrapper) {
    editorWrapper.appendChild(popupElement);
  }

  return popupElement;
}

/**
 * Render the completion popup based on current state
 */
function renderCompletionPopup() {
  const popup = getPopupElement();
  if (!popup) return;

  const { visible, commands, selectedIndex } = completionState;

  if (!visible || commands.length === 0) {
    popup.style.display = 'none';
    return;
  }

  // Build popup content
  const items = commands.map((cmd, i) => {
    const isSelected = i === selectedIndex;
    return `<div class="completion-item${isSelected ? ' selected' : ''}" data-index="${i}">
      <span class="completion-name">${cmd.name}</span>
      <span class="completion-desc">${cmd.description}</span>
    </div>`;
  }).join('');

  popup.innerHTML = items;
  popup.style.display = 'block';

  // Add click handlers to items
  popup.querySelectorAll('.completion-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const index = parseInt(item.dataset.index, 10);
      selectCompletion(index);
    });
  });
}

/**
 * Get the current text before cursor and extract the slash command prefix
 * @returns {{ text: string, slashPos: number, prefix: string } | null}
 */
function getSlashPrefix() {
  if (!editorInstance) return null;

  // Get text content and cursor position
  const { state } = editorInstance.view;
  const { from } = state.selection;
  const textBefore = state.doc.textBetween(0, from, '\n');

  // Find the last "/" before cursor
  let slashPos = -1;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    if (textBefore[i] === '/') {
      slashPos = i;
      break;
    }
    // Stop if we hit whitespace or newline (command must be contiguous)
    if (textBefore[i] === ' ' || textBefore[i] === '\n' || textBefore[i] === '\t') {
      break;
    }
  }

  if (slashPos === -1) return null;

  // Check if this is a valid trigger position
  if (!isCompletionTrigger(textBefore, slashPos)) return null;

  const prefix = textBefore.substring(slashPos);
  return { text: textBefore, slashPos, prefix };
}

/**
 * Replace the current slash prefix with the selected command
 * @param {string} commandName - The full command name to insert
 */
function replaceCurrentPrefix(commandName) {
  if (!editorInstance) return;

  const prefixInfo = getSlashPrefix();
  if (!prefixInfo) {
    // Fallback: just insert at cursor
    insertText(commandName);
    return;
  }

  const { state } = editorInstance.view;
  const { from } = state.selection;
  const deleteFrom = from - prefixInfo.prefix.length;

  // Delete the prefix and insert the command
  editorInstance
    .chain()
    .focus()
    .deleteRange({ from: deleteFrom, to: from })
    .insertContent(commandName)
    .run();
}

// ============================================================================
// Toolbar
// ============================================================================

/**
 * Map of toolbar actions to editor commands
 */
const TOOLBAR_ACTIONS = {
  bold: (editor) => editor.chain().focus().toggleBold().run(),
  italic: (editor) => editor.chain().focus().toggleItalic().run(),
  strike: (editor) => editor.chain().focus().toggleStrike().run(),
  code: (editor) => editor.chain().focus().toggleCode().run(),
  heading: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  bulletList: (editor) => editor.chain().focus().toggleBulletList().run(),
  orderedList: (editor) => editor.chain().focus().toggleOrderedList().run(),
  blockquote: (editor) => editor.chain().focus().toggleBlockquote().run(),
  codeBlock: (editor) => editor.chain().focus().toggleCodeBlock().run(),
};

/**
 * Check if a formatting action is currently active
 * @param {Object} editor - TipTap editor instance
 * @param {string} action - Action name
 * @returns {boolean} True if action is active
 */
function isActionActive(editor, action) {
  if (!editor) return false;
  switch (action) {
    case 'bold': return editor.isActive('bold');
    case 'italic': return editor.isActive('italic');
    case 'strike': return editor.isActive('strike');
    case 'code': return editor.isActive('code');
    case 'heading': return editor.isActive('heading');
    case 'bulletList': return editor.isActive('bulletList');
    case 'orderedList': return editor.isActive('orderedList');
    case 'blockquote': return editor.isActive('blockquote');
    case 'codeBlock': return editor.isActive('codeBlock');
    default: return false;
  }
}

/**
 * Update toolbar button active states based on current selection
 */
function updateToolbarState() {
  if (!editorInstance || !toolbarButtons) return;

  toolbarButtons.forEach((btn) => {
    const action = btn.dataset.action;
    if (action && isActionActive(editorInstance, action)) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });
}

/**
 * Initialize toolbar button click handlers
 */
function initToolbar() {
  if (typeof document === 'undefined') return;

  const toolbar = document.getElementById('editor-toolbar');
  if (!toolbar) return;

  toolbarButtons = toolbar.querySelectorAll('.toolbar-btn[data-action]');

  toolbarButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      if (action && TOOLBAR_ACTIONS[action] && editorInstance) {
        TOOLBAR_ACTIONS[action](editorInstance);
      }
    });
  });
}

// ============================================================================
// Markdown Serialization
// ============================================================================

/**
 * Serialize TipTap marks (bold, italic, code) to markdown
 * @param {string} text - The text content
 * @param {Array} marks - Array of mark objects
 * @returns {string} Text with markdown formatting
 */
function serializeMarks(text, marks = []) {
  if (!marks || marks.length === 0) return text;

  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'link':
        result = `[${result}](${mark.attrs?.href || ''})`;
        break;
    }
  }
  return result;
}

/**
 * Serialize a single TipTap node to markdown
 * @param {Object} node - TipTap node object
 * @param {number} depth - Nesting depth for lists
 * @returns {string} Markdown string
 */
function serializeNode(node, depth = 0) {
  if (!node) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || []).map(n => serializeNode(n, depth)).join('\n\n');

    case 'paragraph':
      return (node.content || []).map(n => serializeNode(n, depth)).join('');

    case 'text':
      return serializeMarks(node.text || '', node.marks);

    case 'hardBreak':
      return '\n';

    case 'heading': {
      const level = node.attrs?.level || 1;
      const prefix = '#'.repeat(level) + ' ';
      const content = (node.content || []).map(n => serializeNode(n, depth)).join('');
      return prefix + content;
    }

    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      const content = (node.content || []).map(n => n.text || '').join('');
      return '```' + lang + '\n' + content + '\n```';
    }

    case 'blockquote': {
      const content = (node.content || []).map(n => serializeNode(n, depth)).join('\n\n');
      return content.split('\n').map(line => '> ' + line).join('\n');
    }

    case 'bulletList':
      return (node.content || []).map(n => serializeNode(n, depth)).join('\n');

    case 'orderedList':
      return (node.content || []).map((n, i) => serializeNode(n, depth, i + 1)).join('\n');

    case 'listItem': {
      const indent = '  '.repeat(depth);
      const prefix = typeof arguments[2] === 'number' ? `${arguments[2]}. ` : '- ';
      const content = (node.content || []).map(n => serializeNode(n, depth + 1)).join('\n');
      return indent + prefix + content;
    }

    case 'horizontalRule':
      return '---';

    default:
      // Unknown node type - try to extract content
      if (node.content) {
        return (node.content || []).map(n => serializeNode(n, depth)).join('');
      }
      return node.text || '';
  }
}

/**
 * Convert TipTap JSON document to markdown
 * @param {Object} doc - TipTap document JSON
 * @returns {string} Markdown string
 */
export function jsonToMarkdown(doc) {
  if (!doc) return '';
  return serializeNode(doc).trim();
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
 * Clear all editor content
 */
export function clearEditor() {
  if (!editorInstance) return;
  editorInstance.commands.clearContent();
}

/**
 * Move cursor to end of editor content
 * Used after loading history items for better UX
 */
function moveCursorToEnd() {
  if (!editorInstance) return;
  editorInstance.commands.focus('end');
}

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
    // Bundle must be loaded before this module via script tag
    if (typeof window === 'undefined' || !window.TipTap) {
      throw new Error('TipTap bundle not loaded. Ensure tiptap.bundle.js is included before editor.js');
    }
    const { Editor, StarterKit, CodeBlock } = window.TipTap;

    editorInstance = new Editor({
      element: container,
      extensions: [
        StarterKit.configure({
          // Disable default code block, we use extension
          codeBlock: false,
        }),
        CodeBlock,
      ],
      content: '',
      autofocus: EDITOR_OPTIONS.autofocus,
      editorProps: {
        ...EDITOR_OPTIONS.editorProps,
        handleKeyDown: (view, event) => {
          // B-9.5: Tab key - trigger or select completion
          if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            // If popup is visible, select current completion
            if (completionState.visible) {
              event.preventDefault();
              selectCompletion(completionState.selectedIndex);
              return true;
            }
            // Check if we're in a slash command context
            const prefixInfo = getSlashPrefix();
            if (prefixInfo) {
              event.preventDefault();
              showCompletionPopup(prefixInfo.prefix);
              return true;
            }
          }

          // B-9.5: Escape - close completion popup
          if (event.key === 'Escape') {
            if (completionState.visible) {
              event.preventDefault();
              closeCompletionPopup();
              return true;
            }
          }

          // B-9.5: Enter - select completion OR submit content
          if (event.key === 'Enter' && !event.shiftKey) {
            // If popup visible, select current completion
            if (completionState.visible) {
              event.preventDefault();
              selectCompletion(completionState.selectedIndex);
              return true;
            }
            // Otherwise submit content
            event.preventDefault();
            submitEditorContent();
            return true;
          }

          // B-9.5: Up arrow - navigate popup OR history
          if (event.key === 'ArrowUp' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            // If popup visible, navigate up
            if (completionState.visible) {
              event.preventDefault();
              navigateCompletion(-1);
              return true;
            }
            // Otherwise navigate history
            if (navigateHistoryUp()) {
              event.preventDefault();
              return true;
            }
          }

          // B-9.5: Down arrow - navigate popup OR history
          if (event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
            // If popup visible, navigate down
            if (completionState.visible) {
              event.preventDefault();
              navigateCompletion(1);
              return true;
            }
            // Otherwise navigate history
            if (navigateHistoryDown()) {
              event.preventDefault();
              return true;
            }
          }

          // Shift+Enter: insert hard break (newline within paragraph)
          // Let TipTap handle this - StarterKit includes HardBreak extension
          return false;
        },
      },
      onTransaction: () => {
        // Update toolbar button states on any editor change
        updateToolbarState();
      },
    });

    // Initialize toolbar buttons
    initToolbar();

    // B-9.4: Load command history from localStorage
    loadHistory();

    // Focus the editor
    editorInstance.commands.focus();

    // B-23: Listen for agent/workflow menu launches
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

/**
 * Submit editor content to Claude SDK
 * Called on Enter key press
 */
function submitEditorContent() {
  if (!editorInstance) return;

  // Prevent duplicate sends while a request is in progress
  if (isSubmitting) {
    console.log('[Editor] Ignoring submit - already processing');
    return;
  }

  const markdown = getEditorMarkdown();

  // Don't submit empty content
  if (!markdown.trim()) return;

  // Mark as submitting to prevent duplicates
  isSubmitting = true;

  // B-9.4: Add to command history and reset navigation state
  addToHistory(markdown);
  resetHistoryNavigation();

  // Add user message to the view first (so it appears before Claude's response)
  addMessage({
    type: 'user',
    content: markdown,
  });

  // Show thinking indicator and scroll to bottom
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

  // B-9.6: Clear quick action buttons after response sent
  onResponseSubmitted();

  // Refocus editor for next input
  editorInstance.commands.focus();
}

/**
 * Reset the submitting flag (called when response completes or errors)
 */
export function resetSubmitting() {
  isSubmitting = false;
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
 * Used by quick action buttons to insert response text
 * @param {string} text - Text to insert
 */
export function insertText(text) {
  if (!editorInstance) return;
  editorInstance.commands.insertContent(text);
}

/**
 * Insert text and immediately submit it to Claude.
 * Used by quick action buttons for one-click responses.
 * @param {string} text - Text to insert and submit
 */
export function insertAndSubmit(text) {
  if (!editorInstance) return;
  // Clear any existing content first
  clearEditor();
  // Insert the response text
  editorInstance.commands.insertContent(text);
  // Submit immediately
  submitEditorContent();
}
