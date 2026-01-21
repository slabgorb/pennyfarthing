/**
 * Toolbar Module
 * Handles formatting toolbar button actions and state
 */

// State
let toolbarButtons = null;
let getEditorFn = null;

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
export function updateToolbarState() {
  const editor = getEditorFn?.();
  if (!editor || !toolbarButtons) return;

  toolbarButtons.forEach((btn) => {
    const action = btn.dataset.action;
    if (action && isActionActive(editor, action)) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });
}

/**
 * Initialize toolbar with editor callback
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.getEditor - Get TipTap editor instance
 */
export function initToolbar({ getEditor }) {
  getEditorFn = getEditor;

  if (typeof document === 'undefined') return;

  const toolbar = document.getElementById('editor-toolbar');
  if (!toolbar) return;

  toolbarButtons = toolbar.querySelectorAll('.toolbar-btn[data-action]');

  toolbarButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const editor = getEditorFn?.();
      const action = btn.dataset.action;
      if (action && TOOLBAR_ACTIONS[action] && editor) {
        TOOLBAR_ACTIONS[action](editor);
      }
    });
  });
}
