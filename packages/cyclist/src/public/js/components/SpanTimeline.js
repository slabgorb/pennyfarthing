/**
 * SpanTimeline - Timeline visualization for enriched OTEL spans
 *
 * Story MSSCI-11734: Enriched Span Export and Visualization
 * Displays tool execution spans chronologically with enrichment details,
 * filter controls, and export functionality.
 *
 * Usage:
 *   import { createTimeline, setLoading, getFilteredSpans } from './components/SpanTimeline.js';
 *   createTimeline(container, spans);
 */

/** Tool icons for timeline entries */
const TOOL_ICONS = {
  Task: '🚀',
  Bash: '⚡',
  Read: '📖',
  Write: '✏️',
  Edit: '✏️',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  WebSearch: '🔎',
  default: '🔧',
};

/** Tool CSS class names for color coding */
const TOOL_CLASSES = {
  Task: 'tool-task',
  Bash: 'tool-bash',
  Read: 'tool-read',
  Write: 'tool-write',
  Edit: 'tool-edit',
  Glob: 'tool-glob',
  Grep: 'tool-grep',
  WebFetch: 'tool-webfetch',
  WebSearch: 'tool-websearch',
  default: 'tool-default',
};

/**
 * Format duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format timestamp for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * Get icon for a tool
 * @param {string} toolName - The tool name
 * @returns {string} The icon for the tool
 */
function getToolIcon(toolName) {
  return TOOL_ICONS[toolName] || TOOL_ICONS.default;
}

/**
 * Get CSS class for a tool
 * @param {string} toolName - The tool name
 * @returns {string} The CSS class for the tool
 */
function getToolClass(toolName) {
  return TOOL_CLASSES[toolName] || TOOL_CLASSES.default;
}

/**
 * Render enrichment details for a span
 * @param {object} span - The span with enrichment data
 * @returns {string} HTML string for enrichment details
 */
function renderEnrichmentDetails(span) {
  const { enrichment, toolName } = span;
  if (!enrichment) return '<div class="no-enrichment">No enrichment data</div>';

  const items = [];

  switch (toolName) {
    case 'Bash':
      if (enrichment.command) items.push(`<div class="detail-row"><span class="label">Command:</span> <code>${escapeHtml(enrichment.command)}</code></div>`);
      if (enrichment.exitCode !== undefined) items.push(`<div class="detail-row"><span class="label">exit code:</span> ${enrichment.exitCode}</div>`);
      if (enrichment.workingDirectory) items.push(`<div class="detail-row"><span class="label">Directory:</span> ${escapeHtml(enrichment.workingDirectory)}</div>`);
      break;

    case 'Read':
    case 'Write':
      if (enrichment.fileSize) items.push(`<div class="detail-row"><span class="label">Size:</span> ${formatBytes(enrichment.fileSize)}</div>`);
      if (enrichment.lineCount) items.push(`<div class="detail-row"><span class="label">Lines:</span> ${enrichment.lineCount}</div>`);
      if (enrichment.language) items.push(`<div class="detail-row"><span class="label">Language:</span> ${enrichment.language}</div>`);
      if (enrichment.gitStatus) items.push(`<div class="detail-row"><span class="label">Git status:</span> ${enrichment.gitStatus}</div>`);
      break;

    case 'Edit':
      if (enrichment.diff) items.push(`<div class="detail-row"><span class="label">Changes:</span> +${enrichment.diff.added} / -${enrichment.diff.removed}</div>`);
      if (enrichment.language) items.push(`<div class="detail-row"><span class="label">Language:</span> ${enrichment.language}</div>`);
      if (enrichment.gitStatus) items.push(`<div class="detail-row"><span class="label">Git status:</span> ${enrichment.gitStatus}</div>`);
      break;

    case 'Task':
      if (enrichment.subagentType) items.push(`<div class="detail-row"><span class="label">Subagent:</span> ${enrichment.subagentType}</div>`);
      if (enrichment.promptSummary) items.push(`<div class="detail-row"><span class="label">Prompt:</span> ${escapeHtml(enrichment.promptSummary)}</div>`);
      if (enrichment.resultSummary) items.push(`<div class="detail-row"><span class="label">Result:</span> ${escapeHtml(enrichment.resultSummary)}</div>`);
      if (enrichment.background !== undefined) items.push(`<div class="detail-row"><span class="label">Background:</span> ${enrichment.background ? 'Yes' : 'No'}</div>`);
      break;

    case 'Grep':
    case 'Glob':
      if (enrichment.pattern) items.push(`<div class="detail-row"><span class="label">Pattern:</span> <code>${escapeHtml(enrichment.pattern)}</code></div>`);
      if (enrichment.matchCount !== undefined) items.push(`<div class="detail-row"><span class="label">Matches:</span> ${enrichment.matchCount}</div>`);
      if (enrichment.fileCount !== undefined) items.push(`<div class="detail-row"><span class="label">Files:</span> ${enrichment.fileCount}</div>`);
      break;

    default:
      // Generic display for unknown tools
      for (const [key, value] of Object.entries(enrichment)) {
        if (value !== undefined && value !== null) {
          items.push(`<div class="detail-row"><span class="label">${escapeHtml(key)}:</span> ${escapeHtml(String(value))}</div>`);
        }
      }
  }

  return items.length > 0 ? items.join('') : '<div class="no-enrichment">No enrichment data</div>';
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
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
 * Format bytes for display
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Calculate maximum duration for scaling duration bars
 * @param {Array} spans - Array of spans
 * @returns {number} Maximum duration in milliseconds
 */
function getMaxDuration(spans) {
  return Math.max(...spans.map(s => s.durationMs || 0), 1);
}

/**
 * Get unique tool types from spans
 * @param {Array} spans - Array of spans
 * @returns {Array} Sorted array of unique tool names
 */
function getUniqueToolTypes(spans) {
  const types = new Set(spans.map(s => s.toolName));
  return Array.from(types).sort();
}

/** Store for current state */
const state = {
  allSpans: [],
  filteredSpans: [],
  toolTypeFilter: 'all',
  statusFilter: 'all',
};

/**
 * Apply current filters and update display
 * @param {HTMLElement} container - The timeline container
 */
function applyFilters(container) {
  let filtered = [...state.allSpans];

  // Tool type filter
  if (state.toolTypeFilter !== 'all') {
    filtered = filtered.filter(s => s.toolName === state.toolTypeFilter);
  }

  // Status filter
  if (state.statusFilter === 'success') {
    filtered = filtered.filter(s => s.success === true);
  } else if (state.statusFilter === 'error') {
    filtered = filtered.filter(s => s.status === 'error' || s.success === false);
  }

  state.filteredSpans = filtered;

  // Update entries visibility
  const entries = container.querySelectorAll('.timeline-entry');
  entries.forEach(entry => {
    const spanId = entry.dataset.spanId;
    const isVisible = filtered.some(s => s.spanId === spanId);
    entry.classList.toggle('hidden', !isVisible);
  });

  // Update count display
  const countDisplay = container.querySelector('.span-count');
  if (countDisplay) {
    countDisplay.textContent = `${filtered.length} spans`;
  }

  // Show/hide no results message
  const noResults = container.querySelector('.filter-no-results');
  if (noResults) {
    noResults.style.display = filtered.length === 0 ? 'block' : 'none';
  }
}

/**
 * Create the timeline component
 * @param {HTMLElement} container - The container element
 * @param {Array} spans - Array of enriched spans
 */
export function createTimeline(container, spans) {
  state.allSpans = spans;
  state.filteredSpans = spans;
  state.toolTypeFilter = 'all';
  state.statusFilter = 'all';

  const toolTypes = getUniqueToolTypes(spans);
  const maxDuration = getMaxDuration(spans);

  // Build HTML
  container.innerHTML = `
    <div class="span-timeline">
      <div class="timeline-header">
        <div class="timeline-title">
          <span class="span-count">${spans.length} spans</span>
        </div>
        <div class="timeline-controls">
          <select class="filter-tool-type">
            <option value="all">All Tools</option>
            ${toolTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
          <select class="filter-status">
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <button class="btn-export-spans">Export JSON</button>
        </div>
      </div>
      <div class="timeline-body">
        ${spans.length === 0 ? '<div class="timeline-empty">No spans available</div>' : ''}
        ${spans.map(span => renderTimelineEntry(span, maxDuration)).join('')}
        <div class="filter-no-results" style="display: none;">No spans match the current filters</div>
      </div>
    </div>
  `;

  // Attach event listeners
  const toolFilter = container.querySelector('.filter-tool-type');
  const statusFilter = container.querySelector('.filter-status');
  const exportBtn = container.querySelector('.btn-export-spans');

  toolFilter?.addEventListener('change', (e) => {
    state.toolTypeFilter = e.target.value;
    applyFilters(container);
  });

  statusFilter?.addEventListener('change', (e) => {
    state.statusFilter = e.target.value;
    applyFilters(container);
  });

  exportBtn?.addEventListener('click', () => {
    exportSpansToFile(state.filteredSpans);
  });

  // Attach click handlers for expansion
  const entries = container.querySelectorAll('.timeline-entry');
  entries.forEach(entry => {
    entry.addEventListener('click', () => {
      const details = entry.querySelector('.enrichment-details');
      if (details) {
        details.classList.toggle('expanded');
      }
    });
  });
}

/**
 * Render a single timeline entry
 * @param {object} span - The span to render
 * @param {number} maxDuration - Maximum duration for scaling
 * @returns {string} HTML string for the entry
 */
function renderTimelineEntry(span, maxDuration) {
  const toolClass = getToolClass(span.toolName);
  const statusClass = span.success ? 'status-success' : 'status-error';
  const durationWidth = Math.max(5, (span.durationMs / maxDuration) * 100);

  return `
    <div class="timeline-entry ${toolClass}" data-span-id="${span.spanId}">
      <div class="entry-header">
        <span class="tool-icon">${getToolIcon(span.toolName)}</span>
        <span class="tool-name">${span.toolName}</span>
        <span class="span-timestamp">${formatTimestamp(span.startTime)}</span>
        <span class="span-duration">${formatDuration(span.durationMs)}</span>
        <span class="${statusClass}">${span.success ? '✓' : '✗'}</span>
      </div>
      <div class="duration-bar" style="width: ${durationWidth}%"></div>
      <div class="enrichment-details">
        ${renderEnrichmentDetails(span)}
      </div>
    </div>
  `;
}

/**
 * Export spans to a JSON file
 * @param {Array} spans - Spans to export
 */
function exportSpansToFile(spans) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    spanCount: spans.length,
    metadata: {
      version: '1.0.0',
      exportFormat: 'cyclist-enriched-spans',
    },
    spans: spans.map(s => ({
      ...s,
      startTimeISO: new Date(s.startTime).toISOString(),
      endTimeISO: s.endTime ? new Date(s.endTime).toISOString() : undefined,
    })),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cyclist-spans-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Set loading state on timeline
 * @param {HTMLElement} container - The timeline container
 * @param {boolean} loading - Whether to show loading state
 */
export function setLoading(container, loading) {
  let loadingEl = container.querySelector('.timeline-loading');

  if (loading) {
    if (!loadingEl) {
      // Use ownerDocument to get the correct document context (works in jsdom)
      const doc = container.ownerDocument || document;
      loadingEl = doc.createElement('div');
      loadingEl.className = 'timeline-loading';
      loadingEl.textContent = 'Loading spans...';
      container.appendChild(loadingEl);
    }
  } else {
    loadingEl?.remove();
  }
}

/**
 * Get currently filtered spans
 * @param {HTMLElement} container - The timeline container (unused, state is module-level)
 * @returns {Array} Array of filtered spans
 */
export function getFilteredSpans(container) {
  return [...state.filteredSpans];
}
