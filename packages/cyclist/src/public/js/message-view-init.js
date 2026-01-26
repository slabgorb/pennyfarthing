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
  handleContextClearMarker,
  setQuickActionsVisible,
  setVerboseMode as setMessageViewVerboseMode
} from './components/MessageView.js';
import { renderBackgroundTaskNotification, renderBellInjectedMessage } from './components/message-view/message-renderers.js';
import { enrichMessage } from './message-enrichment.js';
import { updateActivity, clearActivity } from './activity.js';
import { resetSubmitting, setProcessing, handleTurnComplete, setOnQueueChange, clearMessageQueue, loadMessageQueue, getMessageQueue, removeFromQueue, injectMessage, dequeueMessage, pauseQueue } from './editor.js';
import { handleMessage as handleGitCommitMessage } from './git-commit-detector.js';
import { getCurrentAgentCommand } from './persona.js';
import { settingsSync, STORAGE_KEYS } from './settings-sync.js';

// 22-5: Track verbose mode state
let verboseModeEnabled = false;

/**
 * MSSCI-11928: Extract tool_result blocks from SDK-wrapped user messages
 *
 * SDK sends tool results wrapped in user messages:
 * {type: 'user', message: {content: [{type: 'tool_result', tool_use_id, content, is_error}]}}
 *
 * This extracts them as standalone tool_result messages for enrichment and rendering.
 *
 * @param {Object} message - The SDK message to check
 * @returns {Array} Array of extracted tool_result objects, or empty array
 */
export function extractToolResultsFromUserMessage(message) {
  // Only process user messages
  if (message?.type !== 'user') {
    return [];
  }

  // Check for SDK-wrapped content (editor user messages have content as string, not message.content)
  const contentArray = message.message?.content;
  if (!Array.isArray(contentArray)) {
    return [];
  }

  // Extract all tool_result blocks
  return contentArray
    .filter(item => item.type === 'tool_result')
    .map(item => ({
      type: 'tool_result',
      tool_id: item.tool_use_id,
      output: item.content,
      is_error: item.is_error ?? false,
    }));
}

// DOM initialization moved to end of file to avoid TDZ errors with bellWebSocket

/**
 * Initialize the MessageView and connect to SDK events
 */
function initMessageView() {
  // Create the MessageView component
  const view = createMessageView('message-view');
  console.log('[MessageView] Initialized');

  // Apply initial theme (using settings-sync)
  const savedTheme = settingsSync.get(STORAGE_KEYS.THEME, 'dark');
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
    // MSSCI-12143: Also track tool_results that may contain CYCLIST markers (from subagents)
    let pendingToolResultMarkers = null;

    // Handle streaming messages from Claude SDK
    window.electronAPI.claude.onMessage((message) => {
      console.log('[MessageView] SDK message:', message.type);

      // MSSCI-11928: Check for SDK-wrapped tool_result in user messages
      const extractedToolResults = extractToolResultsFromUserMessage(message);
      if (extractedToolResults.length > 0) {
        // Extract and render each tool_result as standalone message
        console.log(`[MessageView] Extracting ${extractedToolResults.length} tool_result(s) from SDK user message`);
        for (const toolResult of extractedToolResults) {
          const enrichedResult = enrichMessage(toolResult);
          addMessage(enrichedResult);
          updateActivity(enrichedResult);

          // MSSCI-12143: Check tool_result content for CYCLIST markers (subagent handoffs)
          // Handle SDK array content blocks (e.g., [{type: 'text', text: '...'}])
          const toolResultText = typeof toolResult.output === 'string'
            ? toolResult.output
            : (Array.isArray(toolResult.output)
                ? toolResult.output.filter(b => b.type === 'text').map(b => b.text).join('\n')
                : '');
          if (toolResultText.includes('CYCLIST:')) {
            const markers = processMessageForQuickActions({
              type: 'assistant',
              message: { content: [{ type: 'text', text: toolResultText }] }
            });
            if (markers) {
              console.log('[MessageView] Found CYCLIST marker in tool_result:', markers);
              pendingToolResultMarkers = markers;
            }
          }
        }
        return; // Don't render the wrapper user message
      }

      // MSSCI-11851: Enrich messages with tool metadata for specialized rendering
      const enrichedMessage = enrichMessage(message);

      addMessage(enrichedMessage);
      updateActivity(enrichedMessage);

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
      handleTurnComplete(); // MSSCI-12450: Send all queued messages on turn complete

      // Process quick actions ONLY on completion (markers-only detection)
      // This ensures we analyze the complete message, not streaming fragments
      // MSSCI-12143: Check assistant message first, then tool_result markers (subagent handoffs)
      // Tool results are checked because subagents (via Task tool) emit markers in their output
      let quickActionResult = lastAssistantMessage
        ? processMessageForQuickActions(lastAssistantMessage)
        : null;
      // If assistant message didn't have markers, check tool_result markers
      if (!quickActionResult && pendingToolResultMarkers) {
        quickActionResult = pendingToolResultMarkers;
      }

      if (quickActionResult) {
        // MSSCI-11840: Handle context_clear marker automatically
        if (quickActionResult.type === 'context_clear') {
          // Use provided agent, or fall back to current agent (for circuit breaker)
          const agent = quickActionResult.agent || getCurrentAgentCommand();
          console.log('[MessageView] Auto-handling CONTEXT_CLEAR marker for:', agent);
          if (agent) {
            handleContextClearMarker(agent);
          }
        } else {
          showQuickActions(quickActionResult);
        }
      }
      // Reset for next turn
      lastAssistantMessage = null;
      pendingToolResultMarkers = null;
    });

    window.electronAPI.claude.onError((error) => {
      console.error('[MessageView] SDK error:', error);
      hideThinking();  // Also hide on error
      clearActivity();
      resetSubmitting(); // Allow new submissions even on error
      setProcessing(false); // 17-1: Mark processing complete on error too

      // Check for "Prompt is too long" error - auto-clear and reload current agent
      const errorStr = typeof error === 'string' ? error : error?.message || '';
      if (errorStr.includes('Prompt is too long')) {
        console.log('[MessageView] Detected "Prompt is too long" error, triggering context clear');
        const currentAgent = getCurrentAgentCommand();
        if (currentAgent) {
          handleContextClearMarker(currentAgent);
          return; // Don't show error message, we're handling it
        }
      }

      addMessage({
        type: 'error',
        error: error,
      });
    });

    console.log('[MessageView] Connected to Claude SDK events');
  } else {
    console.log('[MessageView] Claude SDK not available (standalone mode)');
  }

  // 31-15: Background task completion notifications
  if (window.electronAPI?.backgroundTask) {
    window.electronAPI.backgroundTask.onCompleted((_event, task) => {
      console.log('[MessageView] Background task completed:', task.subagentType, task.success ? 'success' : 'failed');
      const messageView = document.getElementById('message-view');
      if (messageView) {
        const notificationHtml = renderBackgroundTaskNotification(task);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = notificationHtml;
        messageView.appendChild(wrapper.firstElementChild);
        // Auto-scroll to show notification
        messageView.scrollTop = messageView.scrollHeight;
      }
    });
    console.log('[MessageView] Connected to background task notifications');
  }

  // Bell mode: Connect to /ws/bell for injected message notifications
  // When the PostToolUse hook injects a message, this WebSocket receives notification
  // to dequeue from the in-memory queue and display the message in the conversation
  connectBellWebSocket();

  // Wire up stop button and escape key
  const stopBtn = document.getElementById('stop-btn');

  async function abortClaude() {
    if (window.electronAPI?.claude) {
      console.log('[MessageView] Aborting Claude');
      pauseQueue(); // Prevent queue auto-advance after abort
      await window.electronAPI.claude.abort();
      hideThinking();
      clearActivity();
      resetSubmitting(); // Allow new submissions after abort
      setProcessing(false); // Mark processing complete
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

    queueInlineList.innerHTML = messages.map((msg, i) => {
      // MSSCI-12274: msg is now a QueuedMessage object { text, images }, not a string
      const text = msg.text || '';
      const hasImages = msg.images && msg.images.length > 0;
      const imageIndicator = hasImages ? `<span class="queue-image-indicator" title="${msg.images.length} image(s)">🖼</span>` : '';
      return `
      <li class="queue-inline-item" data-index="${i}">
        <button class="queue-inject-btn" data-index="${i}" title="Stop Claude and send this message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
        ${imageIndicator}
        <span class="queue-inline-text" title="${text.replace(/"/g, '&quot;')}">${text}</span>
        <button class="queue-inline-remove" data-index="${i}" title="Remove">✕</button>
      </li>
    `;
    }).join('');
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

// =============================================================================
// Bell Mode WebSocket Connection
// =============================================================================

/** Bell WebSocket connection */
let bellWebSocket = null;
let bellReconnectDelay = 1000;
const BELL_RECONNECT_MAX_DELAY = 30000;
const BELL_RECONNECT_MULTIPLIER = 1.5;

/**
 * Connect to the bell WebSocket for injected message notifications
 * When the PostToolUse hook injects a message, this receives notification
 * to dequeue from the in-memory queue and display in conversation
 */
function connectBellWebSocket() {
  if (bellWebSocket?.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/bell`;

  try {
    bellWebSocket = new WebSocket(wsUrl);

    bellWebSocket.onopen = () => {
      console.log('[Bell] WebSocket connected');
      bellReconnectDelay = 1000; // Reset delay on successful connection
    };

    bellWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'bell-consumed') {
          handleBellConsumed(data.text);
        }
      } catch (err) {
        console.error('[Bell] Failed to parse WebSocket message:', err);
      }
    };

    bellWebSocket.onclose = () => {
      console.log('[Bell] WebSocket closed, reconnecting...');
      scheduleBellReconnect();
    };

    bellWebSocket.onerror = (err) => {
      console.error('[Bell] WebSocket error:', err);
    };
  } catch (err) {
    console.error('[Bell] Failed to connect:', err);
    scheduleBellReconnect();
  }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleBellReconnect() {
  setTimeout(() => {
    bellReconnectDelay = Math.min(
      bellReconnectDelay * BELL_RECONNECT_MULTIPLIER,
      BELL_RECONNECT_MAX_DELAY
    );
    connectBellWebSocket();
  }, bellReconnectDelay);
}

/**
 * Handle bell-consumed event from server
 * Dequeues the message and displays it with a bell icon
 * @param {string} text - The message text that was injected
 */
function handleBellConsumed(text) {
  console.log('[Bell] Message consumed by hook:', text);

  // Dequeue from the in-memory queue (syncs to storage too)
  const dequeuedMsg = dequeueMessage();
  if (dequeuedMsg) {
    console.log('[Bell] Dequeued message:', dequeuedMsg.text);
  }

  // Display the injected message in the conversation with bell icon
  const messageView = document.getElementById('message-view');
  if (messageView && text) {
    const html = renderBellInjectedMessage({ content: text });
    if (html) {
      messageView.insertAdjacentHTML('beforeend', html);
      // Auto-scroll to show the message
      messageView.scrollTop = messageView.scrollHeight;
    }
  }
}

// =============================================================================
// DOM Initialization
// =============================================================================
// Must be at end of file to ensure all variables (especially bellWebSocket)
// are declared before initMessageView() accesses them.

if (typeof document !== 'undefined' && document.getElementById('message-view')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessageView);
  } else {
    initMessageView();
  }
}
