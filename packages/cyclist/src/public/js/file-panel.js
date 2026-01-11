/**
 * File Panel - Collapsible, resizable left panel for file browser
 *
 * Features:
 * - Click button to collapse/expand
 * - Drag handle to resize width
 * - Drag to near-zero width to collapse
 * - Persists width preference to localStorage
 */

const STORAGE_KEY = 'cyclist-file-panel';
// Read CSS variables for consistent panel sizing
const rootStyles = typeof getComputedStyle !== 'undefined' ? getComputedStyle(document.documentElement) : null;
const MIN_WIDTH = parseInt(rootStyles?.getPropertyValue('--panel-min-width') || '150', 10);
const COLLAPSE_THRESHOLD = 50;
const DEFAULT_WIDTH = parseInt(rootStyles?.getPropertyValue('--panel-default-width') || '280', 10);

let panel = null;
let resizeHandle = null;
let collapseBtn = null;
let expandBtn = null;
let countBadge = null;
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
    console.warn('[FilePanel] Failed to load state:', e);
  }
  return { width: DEFAULT_WIDTH, collapsed: true };
}

/**
 * Save panel state to localStorage
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[FilePanel] Failed to save state:', e);
  }
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
 * Collapse the panel
 */
function collapse() {
  if (!panel) return;

  panel.classList.add('collapsed');

  const state = loadState();
  state.collapsed = true;
  saveState(state);

  console.log('[FilePanel] Collapsed');
}

/**
 * Expand the panel
 */
function expand() {
  if (!panel) return;

  const state = loadState();
  const width = state.width || DEFAULT_WIDTH;

  panel.style.width = `${width}px`;
  panel.classList.remove('collapsed');

  state.collapsed = false;
  saveState(state);

  console.log('[FilePanel] Expanded to', width);
}

/**
 * Toggle collapse state
 */
function toggle() {
  if (!panel) return;

  if (panel.classList.contains('collapsed')) {
    expand();
  } else {
    collapse();
  }
}

/**
 * Update the changed file count badge
 * @param {number} count - Number of changed files
 */
export function setFileCount(count) {
  if (!countBadge) return;
  countBadge.textContent = count > 0 ? count : '';
  countBadge.style.display = count > 0 ? 'inline-flex' : 'none';
}

/**
 * Reset file panel state for session clear (23-2)
 * Clears the file list DOM and resets the count badge
 */
export function resetState() {
  // Clear the file list content
  const fileList = document.getElementById('file-list');
  if (fileList) {
    fileList.innerHTML = '';
  }
  // Reset count badge
  setFileCount(0);
  console.log('[FilePanel] State reset');
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
function onResizeEnd(e) {
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
 * Initialize file panel
 */
export function init() {
  panel = document.getElementById('file-panel');
  resizeHandle = document.getElementById('file-panel-resize');
  collapseBtn = document.getElementById('file-panel-collapse');
  expandBtn = document.getElementById('file-panel-expand');
  countBadge = document.getElementById('file-panel-count');

  if (!panel) {
    console.warn('[FilePanel] Panel element not found');
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
  } else {
    panel.classList.remove('collapsed');
  }

  // Set up header click to collapse (entire header is clickable)
  const header = panel.querySelector('.file-panel-header');
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

  console.log('[FilePanel] Initialized, collapsed:', state.collapsed);
}

// Export for external use
export default {
  init,
  collapse,
  expand,
  toggle,
  setWidth,
  getCurrentWidth,
  setFileCount,
  resetState,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
