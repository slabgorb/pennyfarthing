/**
 * Skill Panel - Collapsible, resizable panel for displaying skill invocations
 *
 * 35-12: Dedicated panel for skill invocations tracking
 *
 * Features:
 * - Click button to collapse/expand
 * - Drag handle to resize width
 * - Drag to near-zero width to collapse
 * - Shows skill count badge
 * - Expandable rows to show arguments and results
 * - Persists width and collapsed state to localStorage
 */

const STORAGE_KEY = 'cyclist-skill-panel';
const MIN_WIDTH = 150;
const COLLAPSE_THRESHOLD = 50;
const DEFAULT_WIDTH = 350;

let panel = null;
let resizeHandle = null;
let collapseBtn = null;
let expandBtn = null;
let countBadge = null;
let contentEl = null;
let logList = null;
let isDragging = false;
let startX = 0;
let startWidth = 0;

/** @type {import('../../tests/35-12-skill-panel.test.ts').SkillEntry[]} */
let entries = [];

/**
 * Get saved panel state from localStorage
 * @returns {{ width: number, collapsed: boolean }}
 */
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[SkillPanel] Failed to load state:', e);
  }
  return { width: DEFAULT_WIDTH, collapsed: true };
}

/**
 * Save panel state to localStorage
 * @param {{ width: number, collapsed: boolean }} state
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[SkillPanel] Failed to save state:', e);
  }
}

/**
 * Get current panel width (or saved width if collapsed)
 * @returns {number}
 */
export function getCurrentWidth() {
  const state = loadState();
  return state.width || DEFAULT_WIDTH;
}

/**
 * Set panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (!panel) return;

  const clampedWidth = Math.max(MIN_WIDTH, Math.min(width, window.innerWidth * 0.5));
  panel.style.width = `${clampedWidth}px`;

  const state = loadState();
  state.width = clampedWidth;
  saveState(state);
}

/**
 * Collapse the panel
 */
export function collapse() {
  if (!panel) return;

  panel.classList.add('collapsed');
  if (expandBtn) {
    expandBtn.classList.add('visible');
  }
  if (collapseBtn) {
    collapseBtn.setAttribute('aria-expanded', 'false');
  }

  const state = loadState();
  state.collapsed = true;
  saveState(state);

  console.log('[SkillPanel] Collapsed');
}

/**
 * Expand the panel
 */
export function expand() {
  if (!panel) return;

  const state = loadState();
  const width = state.width || DEFAULT_WIDTH;

  panel.style.width = `${width}px`;
  panel.classList.remove('collapsed');
  if (expandBtn) {
    expandBtn.classList.remove('visible');
  }
  if (collapseBtn) {
    collapseBtn.setAttribute('aria-expanded', 'true');
  }

  state.collapsed = false;
  saveState(state);

  console.log('[SkillPanel] Expanded to', width);
}

/**
 * Toggle collapse state
 */
export function toggle() {
  if (!panel) return;

  if (panel.classList.contains('collapsed')) {
    expand();
  } else {
    collapse();
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return panel ? panel.classList.contains('collapsed') : true;
}

/**
 * Update the skill count badge
 * @param {number} count - Number of skill invocations
 */
export function setSkillCount(count) {
  if (countBadge) {
    countBadge.textContent = count > 0 ? count : '';
  }

  // Update PanelManager badge count (tab bar reads from this)
  if (window.panelBadgeCounts?.setSkillCount) {
    window.panelBadgeCounts.setSkillCount(count);
  }
}

/**
 * Get the content element for rendering skill log
 * @returns {HTMLElement|null}
 */
export function getContentElement() {
  return contentEl;
}

/**
 * Get all entries
 * @returns {import('../../tests/35-12-skill-panel.test.ts').SkillEntry[]}
 */
export function getEntries() {
  return entries;
}

/**
 * Set entries (for testing or restoration)
 * @param {import('../../tests/35-12-skill-panel.test.ts').SkillEntry[]} newEntries
 */
export function setEntries(newEntries) {
  entries = newEntries;
  renderEntries();
  setSkillCount(entries.length);
}

/**
 * Format timestamp as HH:MM:SS
 * @param {number} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format duration in ms to human-readable
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Get status icon based on status
 * @param {'running' | 'completed' | 'error'} status
 * @returns {{ icon: string, label: string, class: string }}
 */
function getStatusInfo(status) {
  switch (status) {
    case 'running':
      return { icon: '⟳', label: 'Skill running', class: 'status-running' };
    case 'completed':
      return { icon: '✓', label: 'Skill completed', class: 'status-success' };
    case 'error':
      return { icon: '✗', label: 'Skill failed', class: 'status-error' };
    default:
      return { icon: '?', label: 'Unknown status', class: '' };
  }
}

/**
 * Create a skill entry DOM element
 * @param {import('../../tests/35-12-skill-panel.test.ts').SkillEntry} entry
 * @returns {HTMLElement}
 */
function createEntryElement(entry) {
  const statusInfo = getStatusInfo(entry.status);

  const el = document.createElement('div');
  el.className = `skill-entry${entry.status === 'error' ? ' error' : ''}`;
  el.dataset.entryId = entry.id;
  el.tabIndex = 0;

  el.innerHTML = `
    <div class="skill-entry-header">
      <span class="skill-name">/${entry.skill}</span>
      <span class="skill-time">${formatTimestamp(entry.timestamp)}</span>
      <span class="skill-status ${statusInfo.class}" aria-label="${statusInfo.label}">${statusInfo.icon}</span>
    </div>
    <div class="skill-entry-details">
      ${entry.args ? `<div class="skill-args"><span class="detail-label">args:</span> ${escapeHtml(entry.args)}</div>` : ''}
      ${entry.result ? `<div class="skill-result"><span class="detail-label">result:</span> ${escapeHtml(entry.result)}</div>` : ''}
      ${entry.error ? `<div class="skill-error"><span class="detail-label">error:</span> ${escapeHtml(entry.error)}</div>` : ''}
      ${entry.durationMs ? `<div class="skill-duration"><span class="detail-label">duration:</span> ${formatDuration(entry.durationMs)}</div>` : ''}
    </div>
  `;

  // Click header to toggle expand
  const header = el.querySelector('.skill-entry-header');
  header.addEventListener('click', () => {
    el.classList.toggle('expanded');
  });

  // Keyboard support
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      el.classList.toggle('expanded');
    } else if (e.key === 'Escape') {
      el.classList.remove('expanded');
    }
  });

  return el;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render all entries to the log list
 */
function renderEntries() {
  if (!logList) return;

  logList.innerHTML = '';

  if (entries.length === 0) {
    logList.innerHTML = '<div class="skill-empty-state">No skill invocations yet</div>';
    return;
  }

  entries.forEach((entry) => {
    logList.appendChild(createEntryElement(entry));
  });
}

/**
 * Handle a skill event (start, complete, error)
 * @param {import('../../tests/35-12-skill-panel.test.ts').SkillEntry} entry
 */
export function handleSkillEvent(entry) {
  // Check if entry already exists (update case)
  const existingIndex = entries.findIndex((e) => e.id === entry.id);

  if (existingIndex >= 0) {
    // Update existing entry
    entries[existingIndex] = { ...entries[existingIndex], ...entry };

    // Update DOM element
    const existingEl = logList?.querySelector(`[data-entry-id="${entry.id}"]`);
    if (existingEl) {
      const newEl = createEntryElement(entries[existingIndex]);
      // Preserve expanded state
      if (existingEl.classList.contains('expanded')) {
        newEl.classList.add('expanded');
      }
      existingEl.replaceWith(newEl);
    }
  } else {
    // Add new entry at top (reverse chronological)
    entries.unshift(entry);
    setSkillCount(entries.length);

    // Render new entry
    if (logList) {
      const emptyState = logList.querySelector('.skill-empty-state');
      if (emptyState) {
        emptyState.remove();
      }
      const el = createEntryElement(entry);
      logList.insertBefore(el, logList.firstChild);
    }
  }
}

/**
 * Clear all entries with confirmation
 * @returns {Promise<void>}
 */
export async function clearLog() {
  const shouldClear = confirm('Clear the skill log? This cannot be undone.');
  if (!shouldClear) return;

  entries = [];
  setSkillCount(0);
  renderEntries();

  console.log('[SkillPanel] Log cleared');
}

/**
 * Reset skill panel state for session clear
 * Clears content and resets count badge
 */
export function resetState() {
  entries = [];
  setSkillCount(0);
  renderEntries();
  console.log('[SkillPanel] State reset');
}

/**
 * Handle mouse down on resize handle
 * @param {MouseEvent} e
 */
function onResizeStart(e) {
  if (!panel) return;

  isDragging = true;
  startX = e.clientX;
  startWidth = panel.offsetWidth;

  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);

  e.preventDefault();
}

/**
 * Handle mouse move during resize
 * @param {MouseEvent} e
 */
function onResizeMove(e) {
  if (!isDragging || !panel) return;

  const delta = e.clientX - startX;
  const newWidth = startWidth + delta;

  // If dragged below threshold, prepare to collapse
  if (newWidth < COLLAPSE_THRESHOLD) {
    panel.style.width = `${COLLAPSE_THRESHOLD}px`;
    panel.style.opacity = '0.5';
  } else {
    panel.style.opacity = '1';
    setWidth(newWidth);
  }
}

/**
 * Handle mouse up after resize
 */
function onResizeEnd() {
  if (!isDragging) return;

  isDragging = false;
  resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);

  // Check if should collapse
  if (panel && panel.offsetWidth <= COLLAPSE_THRESHOLD) {
    panel.style.opacity = '1';
    collapse();
  }
}

/**
 * Initialize skill panel
 */
export function init() {
  panel = document.getElementById('skill-panel');
  resizeHandle = document.getElementById('skill-panel-resize');
  collapseBtn = document.getElementById('skill-panel-collapse');
  expandBtn = document.getElementById('skill-panel-expand');
  countBadge = document.getElementById('skill-panel-count');
  contentEl = document.getElementById('skill-panel-content');
  logList = document.getElementById('skill-log-list');

  if (!panel) {
    console.warn('[SkillPanel] Panel element not found');
    return;
  }

  // Load saved state
  const state = loadState();

  // Apply saved width
  if (state.width) {
    panel.style.width = `${state.width}px`;
  }

  // Apply collapsed state
  if (state.collapsed) {
    panel.classList.add('collapsed');
    if (expandBtn) expandBtn.classList.add('visible');
    if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'false');
  } else {
    panel.classList.remove('collapsed');
    if (expandBtn) expandBtn.classList.remove('visible');
    if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'true');
  }

  // Set up header click to collapse (entire header is clickable)
  const header = panel.querySelector('.skill-panel-header');
  if (header) {
    header.style.cursor = 'pointer';
    header.addEventListener('click', (e) => {
      // Don't collapse if clicking on controls
      if (e.target.closest('.skill-panel-controls')) return;
      collapse();
    });
  }

  // Set up expand button
  if (expandBtn) {
    expandBtn.addEventListener('click', expand);
  }

  // Set up resize handle
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', onResizeStart);
  }

  // Set up clear button
  const clearBtn = panel.querySelector('[data-action="clear"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearLog);
  }

  // Render initial empty state
  renderEntries();

  console.log('[SkillPanel] Initialized, collapsed:', state.collapsed, 'width:', state.width);
}

// Export for external use
export default {
  init,
  collapse,
  expand,
  toggle,
  isCollapsed,
  setSkillCount,
  getContentElement,
  resetState,
  setWidth,
  getCurrentWidth,
  handleSkillEvent,
  clearLog,
  getEntries,
  setEntries,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
