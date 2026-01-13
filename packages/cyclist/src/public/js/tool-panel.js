/**
 * Tool Panel - Collapsible, resizable panel for displaying tool execution log
 *
 * Features:
 * - Click button to collapse/expand
 * - Drag handle to resize width
 * - Drag to near-zero width to collapse
 * - Shows tool count badge
 * - Persists width and collapsed state to localStorage
 */

const STORAGE_KEY = 'cyclist-tool-panel';
const MIN_WIDTH = 150;
const COLLAPSE_THRESHOLD = 50;
const DEFAULT_WIDTH = 350;

let panel = null;
let resizeHandle = null;
let collapseBtn = null;
let expandBtn = null;
let countBadge = null;
let expandCountBadge = null;
let contentEl = null;
let isDragging = false;
let startX = 0;
let startWidth = 0;

/**
 * Get saved panel state from localStorage
 */
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[ToolPanel] Failed to load state:', e);
  }
  return { width: DEFAULT_WIDTH, collapsed: true };
}

/**
 * Get current panel width (or saved width if collapsed)
 */
function getCurrentWidth() {
  const state = loadState();
  return state.width || DEFAULT_WIDTH;
}

/**
 * Set panel width
 */
function setWidth(width) {
  if (!panel) return;

  const clampedWidth = Math.max(MIN_WIDTH, Math.min(width, window.innerWidth * 0.5));
  panel.style.width = `${clampedWidth}px`;

  const state = loadState();
  state.width = clampedWidth;
  saveState(state);
}

/**
 * Save panel state to localStorage
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[ToolPanel] Failed to save state:', e);
  }
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

  const state = loadState();
  state.collapsed = true;
  saveState(state);

  console.log('[ToolPanel] Collapsed');
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

  state.collapsed = false;
  saveState(state);

  console.log('[ToolPanel] Expanded to', width);
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
 */
export function isCollapsed() {
  return panel ? panel.classList.contains('collapsed') : true;
}

/**
 * Update the tool count badge
 * @param {number} count - Number of tool executions
 */
export function setToolCount(count) {
  if (countBadge) {
    countBadge.textContent = count > 0 ? count : '';
  }
  if (expandCountBadge) {
    expandCountBadge.textContent = count > 0 ? count : '';
    expandCountBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // Update PanelManager badge count (tab bar reads from this)
  if (window.panelBadgeCounts?.setToolCount) {
    window.panelBadgeCounts.setToolCount(count);
  }
}

/**
 * Get the content element for rendering tool log
 * @returns {HTMLElement|null}
 */
export function getContentElement() {
  return contentEl;
}

/**
 * Reset tool panel state for session clear
 * Clears content and resets count badge
 */
export function resetState() {
  setToolCount(0);
  console.log('[ToolPanel] State reset');
}

/**
 * Handle mouse down on resize handle
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
 * Initialize tool panel
 */
export function init() {
  panel = document.getElementById('tool-panel');
  resizeHandle = document.getElementById('tool-panel-resize');
  collapseBtn = document.getElementById('tool-panel-collapse');
  expandBtn = document.getElementById('tool-panel-expand');
  countBadge = document.getElementById('tool-panel-count');
  expandCountBadge = document.getElementById('tool-panel-expand-count');
  contentEl = document.getElementById('tool-panel-content');

  if (!panel) {
    console.warn('[ToolPanel] Panel element not found');
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
  } else {
    panel.classList.remove('collapsed');
    if (expandBtn) expandBtn.classList.remove('visible');
  }

  // Set up header click to collapse (entire header is clickable)
  const header = panel.querySelector('.tool-panel-header');
  if (header) {
    header.style.cursor = 'pointer';
    header.addEventListener('click', collapse);
  }

  // Set up expand button
  if (expandBtn) {
    expandBtn.addEventListener('click', expand);
  }

  // Set up resize handle
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', onResizeStart);
  }

  console.log('[ToolPanel] Initialized, collapsed:', state.collapsed, 'width:', state.width);
}

// Export for external use
export default {
  init,
  collapse,
  expand,
  toggle,
  isCollapsed,
  setToolCount,
  getContentElement,
  resetState,
  setWidth,
  getCurrentWidth,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
