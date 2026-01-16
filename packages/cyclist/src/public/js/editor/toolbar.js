/**
 * Toolbar Module
 * Handles formatting toolbar button actions and state
 * Story 35-1: Added handoff toggle for contextual settings
 */

// State
let toolbarButtons = null;
let getEditorFn = null;
let handoffButton = null;
let currentHandoffMode = 'manual'; // 'auto' or 'manual'

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

  // 35-1: Initialize handoff toggle
  initHandoffToggle();
}

// =============================================================================
// Handoff Toggle Functions (35-1)
// =============================================================================

/**
 * Initialize the handoff toggle button
 * Sets up click handler and loads current state from settings
 */
export async function initHandoffToggle() {
  if (typeof document === 'undefined') return;

  const toolbar = document.getElementById('editor-toolbar');
  if (!toolbar) return;

  handoffButton = toolbar.querySelector('[data-control="handoff-mode"]');
  if (!handoffButton) return;

  // Load current state from settings
  try {
    if (window.electronAPI?.settings?.get) {
      const settings = await window.electronAPI.settings.get();
      currentHandoffMode = settings?.workflow?.handoff_mode || 'manual';
    } else {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings = await response.json();
        currentHandoffMode = settings?.workflow?.handoff_mode || 'manual';
      }
    }
  } catch (err) {
    console.warn('[Toolbar] Failed to load handoff mode:', err);
    currentHandoffMode = 'manual';
  }

  // Update button visual state
  updateHandoffState(currentHandoffMode);

  // Set up click handler
  handoffButton.addEventListener('click', (e) => {
    e.preventDefault();
    toggleHandoffMode();
  });

  console.log('[Toolbar] Handoff toggle initialized:', currentHandoffMode);
}

/**
 * Update the handoff button visual state
 * @param {string} mode - 'auto' or 'manual'
 */
export function updateHandoffState(mode) {
  currentHandoffMode = mode;

  if (!handoffButton) {
    handoffButton = document.querySelector('[data-control="handoff-mode"]');
  }
  if (!handoffButton) return;

  // Update label text
  const label = handoffButton.querySelector('.handoff-label');
  if (label) {
    label.textContent = mode === 'auto' ? 'AUTO' : 'MANUAL';
  }

  // Update button class for styling
  if (mode === 'auto') {
    handoffButton.classList.add('auto-enabled');
    handoffButton.classList.remove('manual-enabled');
  } else {
    handoffButton.classList.add('manual-enabled');
    handoffButton.classList.remove('auto-enabled');
  }

  // Update title
  handoffButton.title = mode === 'auto'
    ? 'Auto-handoff enabled: Automatically proceed to next agent'
    : 'Manual handoff: Ask before proceeding to next agent';
}

/**
 * Toggle between auto and manual handoff modes
 * Persists the change via settings API
 */
export async function toggleHandoffMode() {
  const newMode = currentHandoffMode === 'auto' ? 'manual' : 'auto';

  try {
    // Persist via settings API
    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save({ workflow: { handoff_mode: newMode } });
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: { handoff_mode: newMode } }),
      });
    }

    // Update visual state
    updateHandoffState(newMode);
    console.log('[Toolbar] Handoff mode toggled to:', newMode);
  } catch (err) {
    console.error('[Toolbar] Failed to toggle handoff mode:', err);
  }
}

/**
 * Get the current handoff mode
 * @returns {string} 'auto' or 'manual'
 */
export function getHandoffMode() {
  return currentHandoffMode;
}
