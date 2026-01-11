/**
 * Audit Log Viewer Component (Story 22-6)
 *
 * Displays a modal with a table of all tool executions in the current session.
 * Supports filtering by tool type and exporting to JSON/CSV.
 *
 * Exports:
 * - showAuditLogModal() - Show the audit log modal
 * - hideAuditLogModal() - Hide the audit log modal
 * - isModalVisible() - Check if modal is visible
 * - refreshAuditLog() - Refresh the log entries
 * - setFilter(toolType) - Filter by tool type
 * - getFilter() - Get current filter
 * - exportJSON() - Export as JSON file
 * - exportCSV() - Export as CSV file
 * - clearLog() - Clear the log (confirm first)
 * - initAuditLogViewer() - Initialize the component
 */

// Module state
let modalVisible = false;
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
 * Show the audit log modal
 */
export async function showAuditLogModal() {
  modalVisible = true;
  await refreshAuditLog();

  const modal = document.getElementById('audit-log-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    modal.focus();
  }
}

/**
 * Hide the audit log modal
 */
export function hideAuditLogModal() {
  modalVisible = false;

  const modal = document.getElementById('audit-log-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Check if the modal is currently visible
 * @returns {boolean}
 */
export function isModalVisible() {
  return modalVisible;
}

/**
 * Refresh the audit log entries from the main process
 */
export async function refreshAuditLog() {
  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.getEntries) {
    entries = await window.electronAPI.auditLog.getEntries(currentFilter);
  }
  renderTable();
  renderFilterDropdown();
  renderStats();
}

/**
 * Set the filter by tool type
 * @param {string|null} toolType - Tool type to filter by, or null for all
 */
export function setFilter(toolType) {
  currentFilter = toolType || null;
  refreshAuditLog();
}

/**
 * Get the current filter
 * @returns {string|null}
 */
export function getFilter() {
  return currentFilter;
}

/**
 * Render the log table
 */
function renderTable() {
  const tbody = document.getElementById('audit-log-tbody');
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
 * Render the filter dropdown
 */
function renderFilterDropdown() {
  const select = document.getElementById('audit-log-filter');
  if (!select) return;

  const types = getToolTypes();
  const options = [
    '<option value="">All Tools</option>',
    ...types.map(t => `<option value="${escapeHtml(t)}" ${currentFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`),
  ];

  select.innerHTML = options.join('');
}

/**
 * Render the stats summary
 */
function renderStats() {
  const statsEl = document.getElementById('audit-log-stats');
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

  downloadFile(jsonString, 'audit-log.json', 'application/json');
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

  downloadFile(csvString, 'audit-log.csv', 'text/csv');
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
 * Clear the audit log
 */
export async function clearLog() {
  if (!confirm('Clear the audit log? This cannot be undone.')) {
    return;
  }

  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.clear) {
    await window.electronAPI.auditLog.clear();
  }

  entries = [];
  currentFilter = null;
  renderTable();
  renderFilterDropdown();
  renderStats();
}

/**
 * Handle keyboard events on the modal
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
  if (!modalVisible) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    hideAuditLogModal();
  }
}

/**
 * Initialize the audit log viewer
 * Sets up event listeners and IPC subscriptions
 */
export function initAuditLogViewer() {
  const modal = document.getElementById('audit-log-modal');
  if (!modal) return;

  // Close button
  const closeBtn = modal.querySelector('.close-btn, [data-action="close"]');
  if (closeBtn) closeBtn.addEventListener('click', hideAuditLogModal);

  // Filter dropdown
  const filterSelect = document.getElementById('audit-log-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      setFilter(e.target.value || null);
    });
  }

  // Export buttons
  const exportJsonBtn = modal.querySelector('[data-action="export-json"]');
  if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportJSON);

  const exportCsvBtn = modal.querySelector('[data-action="export-csv"]');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV);

  // Clear button
  const clearBtn = modal.querySelector('[data-action="clear"]');
  if (clearBtn) clearBtn.addEventListener('click', clearLog);

  // Refresh button
  const refreshBtn = modal.querySelector('[data-action="refresh"]');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshAuditLog);

  // Keyboard events
  modal.addEventListener('keydown', handleKeydown);

  // Subscribe to IPC entry updates if in Electron
  if (typeof window !== 'undefined' && window.electronAPI?.auditLog?.onEntry) {
    window.electronAPI.auditLog.onEntry((entry) => {
      entries.push(entry);
      if (modalVisible) {
        renderTable();
        renderStats();
      }
    });
  }
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
    document.addEventListener('DOMContentLoaded', initAuditLogViewer);
  } else {
    initAuditLogViewer();
  }
}
