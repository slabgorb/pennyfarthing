/**
 * MessageView Initialization
 *
 * Initializes the MessageView component and wires it to Claude SDK events.
 * Replaces terminal.js for the programmatic mode UI.
 */

import {
  createMessageView,
  addMessage,
  applyTheme,
  hideThinking,
  processMessageForQuickActions,
  renderQuickActions,
  clearQuickActions,
  handleQuickActionClick,
  setQuickActionsVisible
} from './components/MessageView.js';
import { updateActivity, clearActivity } from './activity.js';
import { resetSubmitting } from './editor.js';

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMessageView);
} else {
  initMessageView();
}

/**
 * Initialize the MessageView and connect to SDK events
 */
function initMessageView() {
  // Create the MessageView component
  const view = createMessageView('message-view');
  console.log('[MessageView] Initialized');

  // Apply initial theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);

  // Listen for theme changes
  window.addEventListener('themechange', (e) => {
    const themeName = e.detail?.theme || 'dark';
    applyTheme(themeName);
  });

  // Connect to Claude SDK events (Electron mode)
  if (window.electronAPI?.claude) {
    // Handle streaming messages from Claude SDK
    window.electronAPI.claude.onMessage((message) => {
      console.log('[MessageView] SDK message:', message.type);
      addMessage(message);
      updateActivity(message);

      // B-9.6: Process assistant messages for quick actions
      if (message.type === 'assistant') {
        const quickActionResult = processMessageForQuickActions(message);
        if (quickActionResult) {
          showQuickActions(quickActionResult);
        }
      }
    });

    window.electronAPI.claude.onComplete(() => {
      console.log('[MessageView] SDK query complete');
      // Hide thinking indicator only when fully done
      hideThinking();
      clearActivity();
      resetSubmitting(); // Allow new submissions
    });

    window.electronAPI.claude.onError((error) => {
      console.error('[MessageView] SDK error:', error);
      hideThinking();  // Also hide on error
      clearActivity();
      resetSubmitting(); // Allow new submissions even on error
      addMessage({
        type: 'error',
        error: error,
      });
    });

    console.log('[MessageView] Connected to Claude SDK events');
  } else {
    console.log('[MessageView] Claude SDK not available (standalone mode)');
  }

  // Wire up stop button and escape key
  const stopBtn = document.getElementById('stop-btn');

  async function abortClaude() {
    if (window.electronAPI?.claude) {
      console.log('[MessageView] Aborting Claude');
      await window.electronAPI.claude.abort();
      hideThinking();
      clearActivity();
    }
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', abortClaude);
  }

  // Escape key to abort (only when Claude is actively running)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stopBtn && !stopBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      abortClaude();
    }
  });

  // B-9.6: Wire up quick actions container with event delegation
  const quickActionsContainer = document.getElementById('quick-actions');
  if (quickActionsContainer) {
    quickActionsContainer.addEventListener('click', (e) => {
      const button = e.target.closest('.quick-action-btn');
      if (button) {
        const response = button.dataset.response;
        if (response) {
          handleQuickActionClick(response);
          clearQuickActions();
        }
      }
    });
  }
}

/**
 * B-9.6: Display quick action buttons
 * @param {Object} result - Detection result from processMessageForQuickActions
 */
function showQuickActions(result) {
  const container = document.getElementById('quick-actions');
  if (!container) return;

  const html = renderQuickActions(result);
  if (html) {
    container.innerHTML = html;
    setQuickActionsVisible(true);
  }
}
