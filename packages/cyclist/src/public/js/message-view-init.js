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
  setQuickActionsVisible,
  setVerboseMode as setMessageViewVerboseMode
} from './components/MessageView.js';
import { updateActivity, clearActivity } from './activity.js';
import { resetSubmitting, setProcessing, processNextInQueue, setOnQueueChange, clearMessageQueue, loadMessageQueue, getMessageQueue, removeFromQueue, injectMessage } from './editor.js';
import { handleAbort } from './components/ToolActivityBar.js';
import { handleMessage as handleGitCommitMessage } from './git-commit-detector.js';

// 22-5: Track verbose mode state
let verboseModeEnabled = false;

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

  // 22-5: Initialize verbose mode from settings
  if (window.electronAPI?.settings) {
    // Get initial verbose mode state
    window.electronAPI.settings.getVerboseMode().then((enabled) => {
      verboseModeEnabled = enabled;
      setMessageViewVerboseMode(enabled);
      updateToolBlocksVerboseMode(enabled);
      console.log('[MessageView] Verbose mode initialized:', enabled);
    });

    // Subscribe to verbose mode changes
    window.electronAPI.settings.onVerboseModeChange((_event, enabled) => {
      verboseModeEnabled = enabled;
      setMessageViewVerboseMode(enabled);
      updateToolBlocksVerboseMode(enabled);
      console.log('[MessageView] Verbose mode changed:', enabled);
    });
  }

  // Connect to Claude SDK events (Electron mode)
  if (window.electronAPI?.claude) {
    // Track the last assistant message for processing on completion
    // This prevents quick action detection during streaming (partial text)
    let lastAssistantMessage = null;

    // Handle streaming messages from Claude SDK
    window.electronAPI.claude.onMessage((message) => {
      console.log('[MessageView] SDK message:', message.type);
      addMessage(message);
      updateActivity(message);

      // 22-7: Detect git commits and remove committed files from diff list
      handleGitCommitMessage(message);

      // Track assistant messages for quick action processing on completion
      // DON'T process here - streaming messages have incomplete text
      if (message.type === 'assistant') {
        lastAssistantMessage = message;
      }
    });

    window.electronAPI.claude.onComplete(() => {
      console.log('[MessageView] SDK query complete');
      // Hide thinking indicator only when fully done
      hideThinking();
      clearActivity();
      resetSubmitting(); // Allow new submissions
      setProcessing(false); // 17-1: Mark processing complete
      processNextInQueue(); // 17-1: Send next queued message if any

      // Process quick actions ONLY on completion (markers-only detection)
      // This ensures we analyze the complete message, not streaming fragments
      if (lastAssistantMessage) {
        const quickActionResult = processMessageForQuickActions(lastAssistantMessage);
        if (quickActionResult) {
          showQuickActions(quickActionResult);
        }
        lastAssistantMessage = null; // Reset for next turn
      }
    });

    window.electronAPI.claude.onError((error) => {
      console.error('[MessageView] SDK error:', error);
      hideThinking();  // Also hide on error
      clearActivity();
      resetSubmitting(); // Allow new submissions even on error
      setProcessing(false); // 17-1: Mark processing complete on error too
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
      handleAbort(); // 22-2: Visual feedback on activity bar
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

  // Inline message queue (replaces dropdown pill)
  const queueInline = document.getElementById('queue-inline');
  const queueInlineList = queueInline?.querySelector('.queue-inline-list');
  const queueClearBtn = queueInline?.querySelector('.queue-clear-btn');

  /**
   * Render the inline queue list items with inject buttons
   */
  function renderInlineQueueList() {
    if (!queueInlineList) return;
    const messages = getMessageQueue();

    if (messages.length === 0) {
      queueInlineList.innerHTML = '';
      return;
    }

    queueInlineList.innerHTML = messages.map((msg, i) => `
      <li class="queue-inline-item" data-index="${i}">
        <button class="queue-inject-btn" data-index="${i}" title="Stop Claude and send this message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
        <span class="queue-inline-text" title="${msg.replace(/"/g, '&quot;')}">${msg}</span>
        <button class="queue-inline-remove" data-index="${i}" title="Remove">✕</button>
      </li>
    `).join('');
  }

  if (queueInline) {
    // Update inline queue when queue changes
    setOnQueueChange((count) => {
      queueInline.style.display = count > 0 ? 'block' : 'none';
      renderInlineQueueList();
    });

    // Wire up clear button
    if (queueClearBtn) {
      queueClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearMessageQueue();
      });
    }

    // Wire up inject and remove buttons via event delegation
    if (queueInlineList) {
      queueInlineList.addEventListener('click', async (e) => {
        const injectBtn = e.target.closest('.queue-inject-btn');
        if (injectBtn) {
          e.preventDefault();
          e.stopPropagation();
          const index = parseInt(injectBtn.dataset.index, 10);
          await injectMessage(index);
          return;
        }

        const removeBtn = e.target.closest('.queue-inline-remove');
        if (removeBtn) {
          e.preventDefault();
          e.stopPropagation();
          const index = parseInt(removeBtn.dataset.index, 10);
          removeFromQueue(index);
        }
      });
    }

    // Load any persisted queue from localStorage
    loadMessageQueue();
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

/**
 * 22-5: Update all existing tool blocks to match verbose mode state
 * When verbose mode is enabled, expand all tool input/output details elements
 * When disabled, collapse them
 * @param {boolean} enabled - Whether verbose mode is enabled
 */
function updateToolBlocksVerboseMode(enabled) {
  const messageView = document.getElementById('message-view');
  if (!messageView) return;

  // Find all collapsible tool blocks
  const toolBlocks = messageView.querySelectorAll('details.tool-input, details.tool-output');

  toolBlocks.forEach((details) => {
    if (enabled) {
      details.setAttribute('open', '');
    } else {
      details.removeAttribute('open');
    }
  });

  console.log(`[MessageView] Updated ${toolBlocks.length} tool blocks, verbose mode: ${enabled}`);
}
