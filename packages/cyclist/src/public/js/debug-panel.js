/**
 * Debug Panel - Real-time OTEL span viewer
 *
 * Features:
 * - Real-time span streaming via WebSocket (/ws/spans)
 * - Timeline visualization with SpanTimeline component
 * - Filtering by tool type and status
 * - Export spans to JSON
 * - Works in both Electron and web mode
 *
 * Usage:
 *   import { init as initDebugPanel } from '/js/debug-panel.js';
 *   initDebugPanel();
 */

import { createTimeline, setLoading } from '/js/components/SpanTimeline.js';
import PanelManager from '/js/panel-manager.js';

// State
let panel = null;
let contentEl = null;
let spans = [];
let ws = null;
let reconnectTimer = null;
let spanCount = 0;

// WebSocket reconnection settings
const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;

/**
 * Get WebSocket URL for spans
 */
function getSpansWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/spans`;
}

/**
 * Connect to spans WebSocket for real-time updates
 */
function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return; // Already connected or connecting
  }

  const url = getSpansWebSocketUrl();
  console.log('[DebugPanel] Connecting to WebSocket:', url);

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[DebugPanel] WebSocket connected');
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        console.error('[DebugPanel] Error parsing WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      console.log('[DebugPanel] WebSocket closed');
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('[DebugPanel] WebSocket error:', error);
    };
  } catch (e) {
    console.error('[DebugPanel] Failed to create WebSocket:', e);
    scheduleReconnect();
  }
}

/**
 * Schedule WebSocket reconnection
 */
function scheduleReconnect() {
  if (reconnectTimer) return;

  if (reconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
    console.warn('[DebugPanel] Max reconnect attempts reached, falling back to polling');
    startPolling();
    return;
  }

  reconnectAttempts++;
  console.log(`[DebugPanel] Reconnecting in ${WS_RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, WS_RECONNECT_DELAY);
}

/**
 * Handle incoming WebSocket message
 */
function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'init':
      // Initial batch of spans
      spans = data.spans || [];
      updateSpanCount(spans.length);
      renderTimeline();
      break;

    case 'span':
      // New span received
      spans.push(data.span);
      updateSpanCount(spans.length);
      // Re-render timeline with new span
      renderTimeline();
      break;

    case 'clear':
      // Clear all spans
      spans = [];
      updateSpanCount(0);
      renderTimeline();
      break;

    default:
      console.warn('[DebugPanel] Unknown message type:', data.type);
  }
}

/**
 * Polling fallback for when WebSocket isn't available
 */
let pollingInterval = null;
const POLL_INTERVAL = 2000;

function startPolling() {
  if (pollingInterval) return;

  console.log('[DebugPanel] Starting polling fallback');
  pollingInterval = setInterval(fetchSpans, POLL_INTERVAL);
  fetchSpans(); // Immediate fetch
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Fetch spans from REST API
 */
async function fetchSpans() {
  try {
    const response = await fetch('/api/spans?limit=500');
    if (!response.ok) {
      if (response.status === 404) {
        // No spans yet - that's OK
        spans = [];
        updateSpanCount(0);
        renderTimeline();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    spans = data.spans || [];
    updateSpanCount(data.total || spans.length);
    renderTimeline();
  } catch (e) {
    console.error('[DebugPanel] Error fetching spans:', e);
  }
}

/**
 * Update span count for badge
 */
function updateSpanCount(count) {
  spanCount = count;
  PanelManager.updateBadgeCount('debug-panel', count);
}

/**
 * Render the SpanTimeline component
 */
function renderTimeline() {
  if (!contentEl) return;

  // Transform spans for timeline format if needed
  const timelineSpans = spans.map(s => ({
    spanId: s.spanId || s.id || crypto.randomUUID(),
    toolName: s.toolName || s.tool || 'Unknown',
    startTime: s.startTime || s.timestamp || Date.now(),
    endTime: s.endTime,
    durationMs: s.durationMs || s.duration || 0,
    success: s.success !== false,
    status: s.success === false ? 'error' : 'success',
    enrichment: s.enrichment || {
      command: s.command,
      exitCode: s.exitCode,
      fileSize: s.fileSize,
      lineCount: s.lineCount,
      language: s.language,
      gitStatus: s.gitStatus,
      diff: s.diff,
      subagentType: s.subagentType,
      promptSummary: s.promptSummary,
      resultSummary: s.resultSummary,
      pattern: s.pattern,
      matchCount: s.matchCount,
      workingDirectory: s.workingDirectory,
      filePath: s.filePath,
    },
  }));

  createTimeline(contentEl, timelineSpans);
}

/**
 * Handle panel open
 */
function onPanelOpen() {
  console.log('[DebugPanel] Panel opened');
  setLoading(contentEl, true);

  // Try WebSocket first, fall back to polling
  connectWebSocket();

  // Also fetch initial data via REST
  fetchSpans().finally(() => {
    setLoading(contentEl, false);
  });
}

/**
 * Handle panel close
 */
function onPanelClose() {
  console.log('[DebugPanel] Panel closed');
  // Don't disconnect - keep streaming in background for badge updates
}

/**
 * Initialize the debug panel
 */
export function init() {
  panel = document.getElementById('debug-panel');
  if (!panel) {
    console.warn('[DebugPanel] debug-panel element not found');
    return;
  }

  contentEl = panel.querySelector('.debug-panel-content');
  if (!contentEl) {
    // Create content container if not present
    contentEl = document.createElement('div');
    contentEl.className = 'debug-panel-content';
    panel.appendChild(contentEl);
  }

  // Register with PanelManager
  PanelManager.register({
    id: 'debug-panel',
    label: 'DEBUG',
    shortcut: '5',  // Cmd+5
    order: 5,
    element: panel,
    onOpen: onPanelOpen,
    onClose: onPanelClose,
    getBadgeCount: () => spanCount,
  });

  // Subscribe to tool events via Electron IPC if available
  if (window.electronAPI?.auditLog?.onEntry) {
    window.electronAPI.auditLog.onEntry((entry) => {
      // Convert tool event to span format
      const span = {
        spanId: crypto.randomUUID(),
        toolName: entry.toolName,
        startTime: entry.timestamp,
        durationMs: entry.durationMs,
        success: entry.success,
        enrichment: {
          command: entry.command,
          exitCode: entry.exitCode,
          fileSize: entry.fileSize,
          lineCount: entry.lineCount,
          language: entry.language,
          gitStatus: entry.gitStatus,
          diff: entry.diff,
          subagentType: entry.subagentType,
          promptSummary: entry.promptSummary,
          filePath: entry.filePath || entry.input,
        },
      };
      spans.push(span);
      updateSpanCount(spans.length);

      // Only re-render if panel is open
      if (PanelManager.isOpen('debug-panel')) {
        renderTimeline();
      }
    });
    console.log('[DebugPanel] Subscribed to Electron IPC tool events');
  }

  console.log('[DebugPanel] Initialized');
}

/**
 * Cleanup
 */
export function destroy() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPolling();
  PanelManager.unregister('debug-panel');
}

export default {
  init,
  destroy,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
