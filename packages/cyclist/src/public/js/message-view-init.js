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
import { resetSubmitting, setProcessing, processNextInQueue, setOnQueueChange, clearMessageQueue, loadMessageQueue, getMessageQueue, removeFromQueue } from './editor.js';

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
      setProcessing(false); // 17-1: Mark processing complete
      processNextInQueue(); // 17-1: Send next queued message if any
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

  // 17-1: Wire up message queue indicator with dropdown
  const queueIndicator = document.getElementById('queue-indicator');
  const queueToggle = queueIndicator?.querySelector('.queue-toggle');
  const queueCount = queueIndicator?.querySelector('.queue-count');
  const queueDropdown = document.getElementById('queue-dropdown');
  const queueList = queueDropdown?.querySelector('.queue-list');
  const queueClearBtn = queueDropdown?.querySelector('.queue-clear-btn');

  /**
   * Render the queue list items
   */
  function renderQueueList() {
    if (!queueList) return;
    const messages = getMessageQueue();

    if (messages.length === 0) {
      queueList.innerHTML = '<li class="queue-empty">No messages queued</li>';
      return;
    }

    queueList.innerHTML = messages.map((msg, i) => `
      <li class="queue-item" data-index="${i}">
        <span class="queue-item-number">${i + 1}</span>
        <span class="queue-item-text" title="${msg.replace(/"/g, '&quot;')}">${msg}</span>
        <button class="queue-item-remove" data-index="${i}" title="Remove">✕</button>
      </li>
    `).join('');
  }

  /**
   * Toggle dropdown visibility
   */
  function toggleDropdown() {
    if (!queueDropdown) return;
    const isVisible = queueDropdown.style.display !== 'none';
    queueDropdown.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      renderQueueList();
    }
  }

  /**
   * Close dropdown
   */
  function closeDropdown() {
    if (queueDropdown) {
      queueDropdown.style.display = 'none';
    }
  }

  if (queueIndicator && queueCount) {
    // Update indicator when queue changes
    setOnQueueChange((count) => {
      queueCount.textContent = count;
      queueIndicator.style.display = count > 0 ? 'flex' : 'none';
      // Re-render list if dropdown is open
      if (queueDropdown?.style.display !== 'none') {
        renderQueueList();
      }
      // Close dropdown if queue becomes empty
      if (count === 0) {
        closeDropdown();
      }
    });

    // Toggle dropdown on click
    if (queueToggle) {
      queueToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown();
      });
    }

    // Wire up clear button
    if (queueClearBtn) {
      queueClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearMessageQueue();
        closeDropdown();
      });
    }

    // Wire up individual remove buttons via event delegation
    if (queueList) {
      queueList.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.queue-item-remove');
        if (removeBtn) {
          e.preventDefault();
          e.stopPropagation();
          const index = parseInt(removeBtn.dataset.index, 10);
          removeFromQueue(index);
        }
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (queueDropdown?.style.display !== 'none' &&
          !queueIndicator.contains(e.target)) {
        closeDropdown();
      }
    });

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
