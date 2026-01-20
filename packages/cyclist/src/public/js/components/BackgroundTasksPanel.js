/**
 * BackgroundTasksPanel - Sidebar panel showing running and completed background tasks
 *
 * Story 35-16: Background Tasks Sidebar Panel with Real-time Status
 *
 * Features:
 * - Shows running tasks with elapsed time
 * - Shows completed tasks with success/failure status
 * - Expandable output for completed tasks
 * - Dismiss button for completed tasks
 * - Real-time updates via IPC or WebSocket
 */

/** @typedef {{ taskId: string, description: string, subagentType: string, startedAt: number, status: 'pending' | 'completed', success?: boolean, output?: string, error?: string }} BackgroundTask */

/** Local task store */
let tasks = [];

/** Panel element reference */
let panelElement = null;

/** Timer for updating elapsed times */
let elapsedTimeInterval = null;

/** WebSocket connection for fallback mode */
let wsConnection = null;

/** WebSocket connection state */
let connectionState = 'disconnected';

/** WebSocket reconnection timer */
let reconnectTimer = null;

/** WebSocket URL for reconnection */
let wsUrl = null;

/** Reconnection interval (2s per WheelHub pattern) */
const RECONNECT_INTERVAL = 2000;

/**
 * Format elapsed time since start
 * @param {number} startedAt - Timestamp in ms
 * @returns {string} Formatted elapsed time
 */
function formatElapsedTime(startedAt) {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) {
    return `${elapsed}s`;
  } else if (elapsed < 3600) {
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}m ${secs}s`;
  } else {
    const hrs = Math.floor(elapsed / 3600);
    const mins = Math.floor((elapsed % 3600) / 60);
    return `${hrs}h ${mins}m`;
  }
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render a single task card
 * @param {BackgroundTask} task
 * @returns {string} HTML string
 */
function renderTaskCard(task) {
  const isPending = task.status === 'pending';
  const isSuccess = task.status === 'completed' && task.success;
  const statusClass = isPending ? 'task-pending' : (isSuccess ? 'task-success' : 'task-error');
  const statusIcon = isPending ? '&#x23F3;' : (isSuccess ? '&#x2705;' : '&#x274C;');
  const elapsed = formatElapsedTime(task.startedAt);

  let outputSection = '';
  if (task.status === 'completed' && (task.output || task.error)) {
    const content = task.output || task.error || '';
    outputSection = `
      <details class="task-output">
        <summary>Show output</summary>
        <pre>${escapeHtml(content)}</pre>
      </details>
    `;
  }

  let dismissButton = '';
  if (task.status === 'completed') {
    dismissButton = `<button class="task-dismiss" data-dismiss="${escapeHtml(task.taskId)}" title="Dismiss">&times;</button>`;
  }

  return `
    <div class="task-card ${statusClass}" data-task-id="${escapeHtml(task.taskId)}" data-started-at="${task.startedAt}">
      <div class="task-header">
        <span class="task-status-icon">${statusIcon}</span>
        <span class="task-type">${escapeHtml(task.subagentType)}</span>
        ${dismissButton}
      </div>
      <div class="task-description">${escapeHtml(task.description)}</div>
      <div class="task-elapsed ${isPending ? 'pending' : ''}">${isPending ? `Started ${elapsed} ago` : `Completed in ${elapsed}`}</div>
      ${outputSection}
    </div>
  `;
}

/**
 * Render the background tasks panel
 * @param {BackgroundTask[]} taskList - List of tasks to render
 * @returns {string} HTML string
 */
export function renderBackgroundTasksPanel(taskList) {
  const pendingCount = taskList.filter(t => t.status === 'pending').length;
  const totalCount = taskList.length;

  const countBadge = totalCount > 0 ? `<span class="task-count-badge">[${totalCount}]</span>` : '';

  const taskCards = taskList
    .sort((a, b) => b.startedAt - a.startedAt) // Most recent first
    .map(renderTaskCard)
    .join('');

  const emptyMessage = totalCount === 0
    ? '<div class="tasks-empty">No background tasks</div>'
    : '';

  return `
    <div class="background-tasks-panel">
      <div class="panel-header">
        <span class="panel-title">Background Tasks</span>
        ${countBadge}
      </div>
      <div class="tasks-container">
        ${emptyMessage}
        ${taskCards}
      </div>
    </div>
  `;
}

/**
 * Initialize the background tasks panel
 * @param {HTMLElement} [container] - Optional container element
 */
export function initBackgroundTasksPanel(container) {
  tasks = [];

  if (container) {
    panelElement = container;
    updatePanelDisplay();

    // Set up click handlers for dismiss buttons
    panelElement.addEventListener('click', handlePanelClick);

    // Start elapsed time updates
    startElapsedTimeUpdates();
  }

  // Subscribe to IPC events if available
  if (typeof window !== 'undefined' && window.electronAPI?.backgroundTask) {
    window.electronAPI.backgroundTask.onStarted?.((_event, task) => {
      addBackgroundTask(task);
    });

    window.electronAPI.backgroundTask.onCompleted?.((_event, task) => {
      updateBackgroundTask(task.taskId, {
        status: 'completed',
        success: task.success,
        output: task.output,
        error: task.error,
      });
    });
  }
}

/**
 * Handle click events on the panel
 * @param {Event} event
 */
function handlePanelClick(event) {
  const dismissBtn = event.target.closest('[data-dismiss]');
  if (dismissBtn) {
    const taskId = dismissBtn.dataset.dismiss;
    dismissBackgroundTask(taskId);
  }
}

/**
 * Start interval to update elapsed times for pending tasks
 */
function startElapsedTimeUpdates() {
  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
  }

  elapsedTimeInterval = setInterval(() => {
    if (!panelElement) return;

    const pendingCards = panelElement.querySelectorAll('.task-pending');
    pendingCards.forEach(card => {
      const startedAt = parseInt(card.dataset.startedAt, 10);
      const elapsedEl = card.querySelector('.task-elapsed.pending');
      if (elapsedEl && startedAt) {
        elapsedEl.textContent = `Started ${formatElapsedTime(startedAt)} ago`;
      }
    });
  }, 1000);
}

/**
 * Stop elapsed time updates
 */
function stopElapsedTimeUpdates() {
  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
    elapsedTimeInterval = null;
  }
}

/**
 * Update the panel display
 */
function updatePanelDisplay() {
  if (panelElement) {
    panelElement.innerHTML = renderBackgroundTasksPanel(tasks);
  }
  updateSectionBadge();
}

/**
 * Add a new background task
 * @param {BackgroundTask} task
 */
export function addBackgroundTask(task) {
  // Check if task already exists
  const existingIndex = tasks.findIndex(t => t.taskId === task.taskId);
  if (existingIndex >= 0) {
    tasks[existingIndex] = { ...tasks[existingIndex], ...task };
  } else {
    tasks.push(task);
  }
  updatePanelDisplay();
}

/**
 * Update an existing background task
 * @param {string} taskId
 * @param {Partial<BackgroundTask>} updates
 */
export function updateBackgroundTask(taskId, updates) {
  const index = tasks.findIndex(t => t.taskId === taskId);
  if (index >= 0) {
    tasks[index] = { ...tasks[index], ...updates };
    updatePanelDisplay();
  }
}

/**
 * Dismiss (remove) a background task
 * @param {string} taskId
 */
export function dismissBackgroundTask(taskId) {
  tasks = tasks.filter(t => t.taskId !== taskId);
  updatePanelDisplay();
}

/**
 * Get all tracked background tasks
 * @returns {BackgroundTask[]}
 */
export function getBackgroundTasks() {
  return [...tasks];
}

/**
 * Clear all tasks
 */
export function clearBackgroundTasks() {
  tasks = [];
  updatePanelDisplay();
}

/**
 * Cleanup function
 */
export function destroyBackgroundTasksPanel() {
  stopElapsedTimeUpdates();
  disconnectWebSocket();
  if (panelElement) {
    panelElement.removeEventListener('click', handlePanelClick);
    panelElement = null;
  }
  tasks = [];
}

/**
 * Connect to WebSocket for real-time task updates
 * Used as fallback when IPC is not available (web-only mode)
 * @param {string} url - WebSocket URL (e.g., 'ws://localhost:8765/ws/background-tasks')
 * @returns {Promise<void>}
 */
export async function connectWebSocket(url) {
  wsUrl = url;

  // Close existing connection if any
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.close();
  }

  return new Promise((resolve, reject) => {
    try {
      connectionState = 'connecting';
      wsConnection = new WebSocket(url);

      wsConnection.onopen = async () => {
        connectionState = 'connected';
        clearReconnectTimer();

        // Fetch initial tasks via REST API
        await fetchInitialTasks();

        resolve();
      };

      wsConnection.onmessage = (event) => {
        handleWebSocketMessage(event.data);
      };

      wsConnection.onclose = () => {
        connectionState = 'disconnected';
        scheduleReconnect();
      };

      wsConnection.onerror = (error) => {
        connectionState = 'disconnected';
        console.error('[BackgroundTasksPanel] WebSocket error:', error);
        reject(error);
      };
    } catch (error) {
      connectionState = 'disconnected';
      reject(error);
    }
  });
}

/**
 * Disconnect WebSocket connection
 */
export function disconnectWebSocket() {
  clearReconnectTimer();
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  connectionState = 'disconnected';
}

/**
 * Handle incoming WebSocket message
 * @param {string} data - Raw message data
 */
function handleWebSocketMessage(data) {
  try {
    const message = JSON.parse(data);

    if (message.type === 'task:started' && message.task) {
      addBackgroundTask({
        taskId: message.task.taskId,
        description: message.task.description || '',
        subagentType: message.task.subagentType || '',
        startedAt: message.task.startedAt || Date.now(),
        status: 'pending',
      });
    } else if (message.type === 'task:completed' && message.task) {
      updateBackgroundTask(message.task.taskId, {
        status: 'completed',
        success: message.task.success,
        output: message.task.output,
        error: message.task.error,
      });
    } else if (message.type === 'init' && Array.isArray(message.tasks)) {
      // Handle initial tasks from WebSocket connection
      message.tasks.forEach(task => addBackgroundTask(task));
    }
  } catch (error) {
    console.error('[BackgroundTasksPanel] Failed to parse WebSocket message:', error);
  }
}

/**
 * Fetch initial tasks via REST API
 */
async function fetchInitialTasks() {
  try {
    // Derive REST API URL from WebSocket URL
    const restUrl = wsUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
      .replace('/ws/background-tasks', '/api/background-tasks');

    const response = await fetch(restUrl);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.tasks)) {
        data.tasks.forEach(task => addBackgroundTask(task));
      }
    }
  } catch (error) {
    console.error('[BackgroundTasksPanel] Failed to fetch initial tasks:', error);
  }
}

/**
 * Schedule WebSocket reconnection
 */
function scheduleReconnect() {
  if (reconnectTimer || !wsUrl) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (connectionState === 'disconnected' && wsUrl) {
      connectWebSocket(wsUrl).catch(() => {
        // Reconnect attempt failed, will schedule another
      });
    }
  }, RECONNECT_INTERVAL);
}

/**
 * Clear reconnection timer
 */
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Check if WebSocket is connected
 * @returns {boolean}
 */
export function isConnected() {
  return connectionState === 'connected';
}

/**
 * Get current WebSocket connection state
 * @returns {'disconnected' | 'connecting' | 'connected'}
 */
export function getConnectionState() {
  return connectionState;
}

/**
 * Update the sidebar section count badge
 */
function updateSectionBadge() {
  const badge = document.getElementById('bg-tasks-count');
  if (badge) {
    const count = tasks.length;
    badge.textContent = `(${count})`;
    badge.style.display = count > 0 ? 'inline' : 'none';
  }

  // Auto-expand section when tasks are added
  const section = document.getElementById('background-tasks-section');
  if (section && tasks.length > 0 && section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
  }
}

/**
 * Handle section header toggle
 */
function setupSectionToggle() {
  const section = document.getElementById('background-tasks-section');
  if (!section) return;

  const header = section.querySelector('.section-header');
  if (header) {
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
  }
}

/**
 * Auto-initialize on DOM ready
 */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('background-tasks-container');
    if (container) {
      initBackgroundTasksPanel(container);
      setupSectionToggle();
    }
  });
}
