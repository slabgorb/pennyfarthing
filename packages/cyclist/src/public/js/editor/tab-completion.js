/**
 * Tab Completion Module (B-9.5)
 * Provides slash command completion with popup UI
 */

import { filterCommands, isCompletionTrigger } from '../slash-commands.js';

// State
let completionState = {
  visible: false,
  commands: [],
  selectedIndex: 0,
};

let popupElement = null;
let currentPrefix = '';
let lastRenderedCommands = null;
let lastSelectedIndex = -1;

// Editor callbacks (set via init)
let getEditorFn = null;
let insertTextFn = null;
let replaceSlashPrefixFn = null;

/**
 * Initialize tab completion with editor callbacks
 * @param {Object} callbacks - Editor callback functions
 * @param {Function} callbacks.getEditor - Get TipTap editor instance
 * @param {Function} callbacks.insertText - Insert text at cursor
 * @param {Function} [callbacks.replaceSlashPrefix] - Replace slash prefix with command (textarea mode)
 */
export function initTabCompletion({ getEditor, insertText, replaceSlashPrefix }) {
  getEditorFn = getEditor;
  insertTextFn = insertText;
  replaceSlashPrefixFn = replaceSlashPrefix || null;
}

/**
 * Get current completion state (for testing)
 * @returns {Object} Current completion state
 */
export function getCompletionState() {
  return { ...completionState, commands: [...completionState.commands] };
}

/**
 * Check if completion popup is visible
 * @returns {boolean} True if visible
 */
export function isCompletionVisible() {
  return completionState.visible;
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
    selectedIndex: 0,
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
    replaceCurrentPrefix(command.name);
  }
  closeCompletionPopup();
}

/**
 * Get or create the completion popup DOM element
 * @returns {HTMLElement|null} The popup element
 */
function getPopupElement() {
  if (popupElement) return popupElement;
  if (typeof document === 'undefined') return null;

  popupElement = document.createElement('div');
  popupElement.id = 'completion-popup';
  popupElement.className = 'completion-popup';
  popupElement.style.display = 'none';

  // Use event delegation - single click handler for all items
  popupElement.addEventListener('click', (e) => {
    const item = e.target.closest('.completion-item');
    if (item) {
      const index = parseInt(item.dataset.index, 10);
      selectCompletion(index);
    }
  });

  // Insert popup near editor
  const editorWrapper = document.getElementById('editor-wrapper');
  if (editorWrapper) {
    editorWrapper.appendChild(popupElement);
  }

  return popupElement;
}

/**
 * Render the completion popup based on current state
 * Optimized: only rebuilds DOM when commands change, updates selection in-place
 */
function renderCompletionPopup() {
  const popup = getPopupElement();
  if (!popup) return;

  const { visible, commands, selectedIndex } = completionState;

  if (!visible || commands.length === 0) {
    popup.style.display = 'none';
    lastRenderedCommands = null;
    lastSelectedIndex = -1;
    return;
  }

  // Check if commands have changed (by comparing names)
  const commandsKey = commands.map(c => c.name).join('|');
  const lastKey = lastRenderedCommands ? lastRenderedCommands.map(c => c.name).join('|') : null;
  const commandsChanged = commandsKey !== lastKey;

  if (commandsChanged) {
    // Full rebuild only when commands change
    const items = commands.map((cmd, i) => {
      const isSelected = i === selectedIndex;
      return `<div class="completion-item${isSelected ? ' selected' : ''}" data-index="${i}">
      <span class="completion-name">${cmd.name}</span>
      <span class="completion-desc">${cmd.description}</span>
    </div>`;
    }).join('');

    popup.innerHTML = items;
    lastRenderedCommands = commands;
    lastSelectedIndex = selectedIndex;
  } else if (lastSelectedIndex !== selectedIndex) {
    // Just update selection classes - much faster
    const items = popup.querySelectorAll('.completion-item');
    if (lastSelectedIndex >= 0 && lastSelectedIndex < items.length) {
      items[lastSelectedIndex].classList.remove('selected');
    }
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      items[selectedIndex].classList.add('selected');
    }
    lastSelectedIndex = selectedIndex;
  }

  popup.style.display = 'block';
  // Click handlers are now via event delegation in getPopupElement()
}

/**
 * Get the current text before cursor and extract the slash command prefix
 * @returns {{ text: string, slashPos: number, prefix: string } | null}
 */
export function getSlashPrefix() {
  const editor = getEditorFn?.();
  if (!editor) return null;

  // Get text content and cursor position
  const { state } = editor.view;
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
  const editor = getEditorFn?.();
  if (!editor) return;

  // Check if this is a textarea (plaintext mode) or TipTap (rich mode)
  // Textarea mode: editor.view is undefined
  // TipTap mode: editor.view exists with state and selection
  const isTipTap = editor.view?.state?.selection !== undefined;

  if (isTipTap) {
    // TipTap: use ProseMirror API
    const prefixInfo = getSlashPrefix();
    if (!prefixInfo) {
      // Fallback: just insert at cursor
      if (insertTextFn) insertTextFn(commandName);
      return;
    }

    const { state } = editor.view;
    const { from } = state.selection;
    const deleteFrom = from - prefixInfo.prefix.length;

    // Delete the prefix and insert the command
    editor
      .chain()
      .focus()
      .deleteRange({ from: deleteFrom, to: from })
      .insertContent(commandName)
      .run();
  } else {
    // Textarea mode: use direct text manipulation via insertTextFn
    // The textarea module will handle finding and replacing the prefix
    if (insertTextFn) {
      // insertTextFn for textarea replaces selection at cursor
      // We need to replace the current prefix, so we'll use replaceSlashPrefix callback
      if (replaceSlashPrefixFn) {
        replaceSlashPrefixFn(commandName);
      } else {
        // Fallback if no replaceSlashPrefix callback - just insert
        insertTextFn(commandName);
      }
    }
  }
}
