/**
 * Diff Panel - Collapsible, resizable panel for displaying diffs
 *
 * 35-5: Now uses VerticalPanel base class for unified panel behavior
 *
 * Features:
 * - Click button to collapse/expand
 * - Drag handle to resize width
 * - Drag to near-zero width to collapse
 * - Shows diff count badge
 * - Persists width and collapsed state to localStorage
 */

// 35-5: Import VerticalPanel base class for unified panel pattern
// DiffPanel uses VerticalPanel's persistence and resize patterns
import { VerticalPanel } from './vertical-panel.js';

const STORAGE_KEY = 'cyclist-diff-panel';
const MIN_WIDTH = 150;
const COLLAPSE_THRESHOLD = 50;
const DEFAULT_WIDTH = 350;

let panel = null;
let resizeHandle = null;
let collapseBtn = null;
let expandBtn = null;
let countBadge = null;
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
    console.warn('[DiffPanel] Failed to load state:', e);
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
    console.warn('[DiffPanel] Failed to save state:', e);
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

  console.log('[DiffPanel] Collapsed');
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

  console.log('[DiffPanel] Expanded to', width);
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
 * Update the diff count badge
 * @param {number} count - Number of diffs
 */
export function setDiffCount(count) {
  if (countBadge) {
    countBadge.textContent = count > 0 ? count : '';
  }

  // Update PanelManager badge count (tab bar reads from this)
  if (window.panelBadgeCounts?.setDiffCount) {
    window.panelBadgeCounts.setDiffCount(count);
  }
}

/**
 * Get the content element for rendering diffs
 * @returns {HTMLElement|null}
 */
export function getContentElement() {
  return contentEl;
}

/**
 * Render diff content into the panel
 * @param {HTMLElement|string} content - Content to render
 */
export function setContent(content) {
  if (!contentEl) return;

  if (typeof content === 'string') {
    contentEl.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    contentEl.innerHTML = '';
    contentEl.appendChild(content);
  }
}

/**
 * Clear diff content
 */
export function clearContent() {
  if (!contentEl) return;
  contentEl.innerHTML = '';
  setDiffCount(0);
}

/**
 * Reset diff panel state for session clear (23-2)
 * Clears content and resets count badge
 */
export function resetState() {
  clearContent();
  console.log('[DiffPanel] State reset');
}

/**
 * Show the panel with content (auto-expands if collapsed)
 * @param {HTMLElement|string} content - Content to render
 */
export function showDiff(content) {
  setContent(content);
  expand();
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
 * Initialize diff panel
 */
export function init() {
  panel = document.getElementById('diff-panel');
  resizeHandle = document.getElementById('diff-panel-resize');
  collapseBtn = document.getElementById('diff-panel-collapse');
  expandBtn = document.getElementById('diff-panel-expand');
  countBadge = document.getElementById('diff-panel-count');
  contentEl = document.getElementById('diff-panel-content');

  if (!panel) {
    console.warn('[DiffPanel] Panel element not found');
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
  const header = panel.querySelector('.diff-panel-header');
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

  console.log('[DiffPanel] Initialized, collapsed:', state.collapsed, 'width:', state.width);
}

// Export for external use
export default {
  init,
  collapse,
  expand,
  toggle,
  isCollapsed,
  setDiffCount,
  getContentElement,
  setContent,
  clearContent,
  resetState,
  showDiff,
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
