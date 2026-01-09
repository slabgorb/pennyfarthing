/**
 * Diff Panel - Collapsible bottom panel for displaying diffs
 *
 * Features:
 * - Click button to collapse/expand
 * - Shows diff count badge
 * - Persists collapsed state to localStorage
 */

const STORAGE_KEY = 'cyclist-diff-panel';

let panel = null;
let collapseBtn = null;
let expandBtn = null;
let countBadge = null;
let contentEl = null;

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
  return { collapsed: true };
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

  panel.classList.remove('collapsed');
  if (expandBtn) {
    expandBtn.classList.remove('visible');
  }

  const state = loadState();
  state.collapsed = false;
  saveState(state);

  console.log('[DiffPanel] Expanded');
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
  if (!countBadge) return;
  countBadge.textContent = count > 0 ? count : '';
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
 * Show the panel with content (auto-expands if collapsed)
 * @param {HTMLElement|string} content - Content to render
 */
export function showDiff(content) {
  setContent(content);
  expand();
}

/**
 * Initialize diff panel
 */
export function init() {
  panel = document.getElementById('diff-panel');
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

  console.log('[DiffPanel] Initialized, collapsed:', state.collapsed);
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
  showDiff,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
