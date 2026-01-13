/**
 * Tool Log Viewer Component
 *
 * Displays tool executions in a panel (converted from modal in Story 22-6).
 * Shows real-time tool execution log with filtering and export.
 *
 * Exports:
 * - init() - Initialize the component
 * - handleToolEvent(entry) - Handle new tool execution event
 * - refresh() - Refresh the log entries
 * - setFilter(toolType) - Filter by tool type
 * - getFilter() - Get current filter
 * - exportJSON() - Export as JSON file
 * - exportCSV() - Export as CSV file
 * - clearLog() - Clear the log
 * - setEntries(entries) - Set entries directly (for testing)
 * - getEntries() - Get entries (for testing)
 * - getToolCount() - Get total tool count
 */

import * as ToolPanel from '../tool-panel.js';

// Module state
let currentFilter = null;
let entries = [];

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
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
 * Format timestamp for display
 * @param {number} timestamp - Milliseconds timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Truncate string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string}
 */
function truncate(str, maxLen = 50) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Get unique tool types from entries
 * @returns {string[]}
 */
function getToolTypes() {
  const types = new Set(entries.map(e => e.toolName));
  return Array.from(types).sort();
}

/**
 * Handle new tool execution event (real-time streaming)
 * @param {object} entry - Tool execution entry
 */
export function handleToolEvent(entry) {
  entries.push(entry);
  renderTable();
  renderStats();
  updateFilterDropdown();
  // Update panel count badge
  ToolPanel.setToolCount(entries.length);
}

/**
 * Refresh the log entries from the main process
 */
export async function refresh() {
  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.getEntries) {
    entries = await window.electronAPI.auditLog.getEntries(currentFilter);
  }
  renderTable();
  updateFilterDropdown();
  renderStats();
  ToolPanel.setToolCount(entries.length);
}

/**
 * Set the filter by tool type
 * @param {string|null} toolType - Tool type to filter by, or null for all
 */
export function setFilter(toolType) {
  currentFilter = toolType || null;
  refresh();
}

/**
 * Get the current filter
 * @returns {string|null}
 */
export function getFilter() {
  return currentFilter;
}

/**
 * Get total tool count
 * @returns {number}
 */
export function getToolCount() {
  return entries.length;
}

/**
 * Render the log table
 */
function renderTable() {
  const tbody = document.getElementById('tool-log-tbody');
  if (!tbody) return;

  // Filter entries if needed
  const filtered = currentFilter
    ? entries.filter(e => e.toolName === currentFilter)
    : entries;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5" class="empty-message">No tool executions recorded yet</td>
      </tr>
    `;
    return;
  }

  // Render entries in reverse chronological order
  tbody.innerHTML = [...filtered].reverse().map(entry => `
    <tr class="${entry.success ? '' : 'error-row'}">
      <td class="col-timestamp">${formatTimestamp(entry.timestamp)}</td>
      <td class="col-tool"><span class="tool-badge tool-${entry.toolName.toLowerCase()}">${escapeHtml(entry.toolName)}</span></td>
      <td class="col-input" title="${escapeHtml(entry.input || '')}">${escapeHtml(truncate(entry.input, 60))}</td>
      <td class="col-duration">${formatDuration(entry.durationMs)}</td>
      <td class="col-status">${entry.success
        ? '<span class="status-success">✓</span>'
        : `<span class="status-error" title="${escapeHtml(entry.error || 'Failed')}">✗</span>`
      }</td>
    </tr>
  `).join('');
}

/**
 * Update the filter dropdown with available tool types
 */
function updateFilterDropdown() {
  const select = document.getElementById('tool-filter');
  if (!select) return;

  const types = getToolTypes();
  const options = [
    '<option value="">All</option>',
    ...types.map(t => `<option value="${escapeHtml(t)}" ${currentFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`),
  ];

  select.innerHTML = options.join('');
}

/**
 * Render the stats summary
 */
function renderStats() {
  const statsEl = document.getElementById('tool-log-stats');
  if (!statsEl) return;

  const total = entries.length;
  const successCount = entries.filter(e => e.success).length;
  const errorCount = total - successCount;

  statsEl.innerHTML = `
    <span class="stat">${total} total</span>
    <span class="stat success">${successCount} success</span>
    ${errorCount > 0 ? `<span class="stat error">${errorCount} errors</span>` : ''}
  `;
}

/**
 * Export the log as JSON file
 */
export async function exportJSON() {
  let jsonString;
  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.export) {
    jsonString = await window.electronAPI.auditLog.export('json', currentFilter);
  } else {
    // Fallback for testing
    const filtered = currentFilter
      ? entries.filter(e => e.toolName === currentFilter)
      : entries;
    jsonString = JSON.stringify(filtered, null, 2);
  }

  downloadFile(jsonString, 'tool-log.json', 'application/json');
}

/**
 * Export the log as CSV file
 */
export async function exportCSV() {
  let csvString;
  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.export) {
    csvString = await window.electronAPI.auditLog.export('csv', currentFilter);
  } else {
    // Fallback for testing
    const filtered = currentFilter
      ? entries.filter(e => e.toolName === currentFilter)
      : entries;

    const header = 'timestamp,toolName,input,durationMs,success,error';
    const rows = filtered.map(e => [
      new Date(e.timestamp).toISOString(),
      e.toolName,
      `"${(e.input || '').replace(/"/g, '""')}"`,
      e.durationMs || '',
      e.success,
      e.error || '',
    ].join(','));

    csvString = [header, ...rows].join('\n');
  }

  downloadFile(csvString, 'tool-log.csv', 'text/csv');
}

/**
 * Download a file in the browser
 * @param {string} content - File content
 * @param {string} filename - File name
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Clear the log
 */
export async function clearLog() {
  if (!confirm('Clear the tool log? This cannot be undone.')) {
    return;
  }

  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.clear) {
    await window.electronAPI.auditLog.clear();
  }

  entries = [];
  currentFilter = null;
  renderTable();
  updateFilterDropdown();
  renderStats();
  ToolPanel.setToolCount(0);
}

/**
 * Initialize the tool log viewer
 * Sets up event listeners and IPC subscriptions
 */
export function init() {
  const panel = document.getElementById('tool-panel');
  if (!panel) return;

  // Filter dropdown
  const filterSelect = document.getElementById('tool-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      setFilter(e.target.value || null);
    });
  }

  // Header controls - export and clear buttons
  const headerControls = panel.querySelector('.tool-panel-controls');
  if (headerControls) {
    // Export JSON
    const exportJsonBtn = headerControls.querySelector('[data-action="export-json"]');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't collapse panel on button click
      exportJSON();
    });

    // Export CSV
    const exportCsvBtn = headerControls.querySelector('[data-action="export-csv"]');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportCSV();
    });

    // Clear button
    const clearBtn = headerControls.querySelector('[data-action="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearLog();
    });
  }

  // Subscribe to IPC entry updates if in Electron (real-time streaming)
  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.onEntry) {
    window.electronAPI.auditLog.onEntry((entry) => {
      handleToolEvent(entry);
    });
  }

  // Initial load from existing entries
  refresh();

  console.log('[ToolLogViewer] Initialized');
}

// For testing - allow setting entries directly
export function setEntries(newEntries) {
  entries = newEntries;
}

export function getEntries() {
  return entries;
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
