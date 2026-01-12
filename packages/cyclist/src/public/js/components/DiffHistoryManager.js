/**
 * 24-3: Diff History Manager
 *
 * Manages file edit history for the diff viewer, enabling navigation
 * between multiple edits to the same file during a session.
 *
 * Features:
 * - Track multiple diffs per file
 * - Navigate between partial diffs
 * - Combined diff view (original -> current)
 * - Original and current file views
 * - Keyboard navigation (j/k, arrows, Home/End)
 */

// =============================================================================
// Type Definitions (JSDoc for JavaScript)
// =============================================================================

/**
 * @typedef {Object} DiffData
 * @property {string} id - Unique identifier for this diff
 * @property {string} filePath - Full path to the file
 * @property {string} oldContent - Content before the edit
 * @property {string} newContent - Content after the edit
 * @property {'Edit' | 'Write'} toolType - Tool that created this diff
 * @property {number} timestamp - When the diff occurred
 * @property {boolean} [isNewFile] - True if this is a new file (Write tool)
 */

/**
 * @typedef {Object} FileHistory
 * @property {string} filePath - Path to the file being tracked
 * @property {string} originalContent - Content before any edits in this session
 * @property {DiffData[]} diffs - Array of diffs in chronological order
 * @property {number} currentIndex - Currently selected diff index
 */

/**
 * @typedef {'partial' | 'combined' | 'original' | 'current'} ViewMode
 */

/**
 * @typedef {Object} ViewState
 * @property {ViewMode} mode - Current view mode
 */

// =============================================================================
// State Management
// =============================================================================

/**
 * Create a new file history tracking object
 * @param {string} filePath - Path to the file
 * @returns {FileHistory}
 */
export function createFileHistory(filePath) {
  return {
    filePath,
    originalContent: '',
    diffs: [],
    currentIndex: -1,
  };
}

/**
 * Add a diff to the file history
 * @param {FileHistory} history - File history object to modify
 * @param {DiffData} diff - Diff data to add
 */
export function addDiffToHistory(history, diff) {
  // Track original content from the first diff
  if (history.diffs.length === 0) {
    history.originalContent = diff.oldContent;
  }
  history.diffs.push(diff);
  // Always point to the most recent diff
  history.currentIndex = history.diffs.length - 1;
}

/**
 * Get the currently selected diff
 * @param {FileHistory} history - File history object
 * @returns {DiffData} Current diff
 */
export function getCurrentDiff(history) {
  return history.diffs[history.currentIndex];
}

// =============================================================================
// Navigation
// =============================================================================

/**
 * Navigate to the previous diff
 * @param {FileHistory} history - File history object to modify
 * @returns {boolean} True if navigation occurred, false if already at first
 */
export function navigatePrevious(history) {
  if (history.currentIndex > 0) {
    history.currentIndex--;
    return true;
  }
  return false;
}

/**
 * Navigate to the next diff
 * @param {FileHistory} history - File history object to modify
 * @returns {boolean} True if navigation occurred, false if already at last
 */
export function navigateNext(history) {
  if (history.currentIndex < history.diffs.length - 1) {
    history.currentIndex++;
    return true;
  }
  return false;
}

/**
 * Check if there is a previous diff to navigate to
 * @param {FileHistory} history - File history object
 * @returns {boolean}
 */
export function hasPrevious(history) {
  return history.currentIndex > 0;
}

/**
 * Check if there is a next diff to navigate to
 * @param {FileHistory} history - File history object
 * @returns {boolean}
 */
export function hasNext(history) {
  return history.currentIndex < history.diffs.length - 1;
}

/**
 * Get position indicator string (e.g., "Edit 2 of 5")
 * @param {FileHistory} history - File history object
 * @returns {string}
 */
export function getPositionIndicator(history) {
  return `Edit ${history.currentIndex + 1} of ${history.diffs.length}`;
}

/**
 * Handle keyboard navigation
 * @param {FileHistory} history - File history object to modify
 * @param {string} key - Key that was pressed
 * @returns {boolean} True if navigation occurred
 */
export function handleKeyboardNavigation(history, key) {
  switch (key) {
    case 'ArrowLeft':
    case 'k':
      return navigatePrevious(history);
    case 'ArrowRight':
    case 'j':
      return navigateNext(history);
    case 'Home':
      if (history.currentIndex !== 0) {
        history.currentIndex = 0;
        return true;
      }
      return false;
    case 'End':
      if (history.currentIndex !== history.diffs.length - 1) {
        history.currentIndex = history.diffs.length - 1;
        return true;
      }
      return false;
    default:
      return false;
  }
}

// =============================================================================
// Combined/Content Views
// =============================================================================

/**
 * Get combined diff from original content to current content
 * @param {FileHistory} history - File history object
 * @returns {DiffData} Synthetic diff representing all changes
 */
export function getCombinedDiff(history) {
  const lastDiff = history.diffs[history.diffs.length - 1];
  return {
    id: 'combined',
    filePath: history.filePath,
    oldContent: history.originalContent,
    newContent: lastDiff.newContent,
    toolType: 'Edit',
    timestamp: lastDiff.timestamp,
    isNewFile: history.originalContent === '',
  };
}

/**
 * Get the current file content (from the latest diff)
 * @param {FileHistory} history - File history object
 * @returns {string} Current file content
 */
export function getCurrentContent(history) {
  const lastDiff = history.diffs[history.diffs.length - 1];
  return lastDiff.newContent;
}

// =============================================================================
// View State Management
// =============================================================================

/**
 * Create a new view state object
 * @returns {ViewState}
 */
export function createViewState() {
  return { mode: 'partial' };
}

/**
 * Set the view mode
 * @param {ViewState} state - View state object to modify
 * @param {ViewMode} mode - New view mode
 */
export function setViewMode(state, mode) {
  state.mode = mode;
}

// =============================================================================
// Rendering
// =============================================================================

/**
 * Get file extension from path
 * @param {string} filePath - File path
 * @returns {string} Extension without dot
 */
function getFileExtension(filePath) {
  const filename = filePath.split('/').pop() || '';
  if (filename.startsWith('.')) {
    return filename.slice(1);
  }
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts.pop() || '';
}

/**
 * Get CSS language class for syntax highlighting
 * @param {string} ext - File extension
 * @returns {string} CSS class name
 */
function getLanguageClass(ext) {
  const langMap = {
    ts: 'lang-typescript',
    tsx: 'lang-typescript',
    js: 'lang-javascript',
    jsx: 'lang-javascript',
    css: 'lang-css',
    html: 'lang-html',
    json: 'lang-json',
    md: 'lang-markdown',
  };
  return langMap[ext] || 'lang-plain';
}

/**
 * Render navigation controls (prev/next buttons and position indicator)
 * @param {HTMLElement} container - Container element
 * @param {FileHistory} history - File history object
 */
export function renderNavigationControls(container, history) {
  // Hide navigation if only one edit
  if (history.diffs.length <= 1) {
    container.innerHTML = '<div class="diff-nav hidden"></div>';
    return;
  }

  const prevDisabled = !hasPrevious(history) ? 'disabled' : '';
  const nextDisabled = !hasNext(history) ? 'disabled' : '';

  container.innerHTML = `
    <div class="diff-nav">
      <button class="diff-nav-prev" ${prevDisabled}>&lt;</button>
      <span class="diff-nav-indicator">${getPositionIndicator(history)}</span>
      <button class="diff-nav-next" ${nextDisabled}>&gt;</button>
    </div>
  `;
}

/**
 * Render view mode tabs
 * @param {HTMLElement} container - Container element
 * @param {ViewState} state - Current view state
 */
export function renderViewModeTabs(container, state) {
  /** @type {ViewMode[]} */
  const modes = ['partial', 'combined', 'original', 'current'];

  container.innerHTML = `
    <div class="diff-view-tabs">
      ${modes.map(mode => `
        <button class="diff-view-tab ${state.mode === mode ? 'active' : ''}"
                data-mode="${mode}">
          ${mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      `).join('')}
    </div>
  `;
}

/**
 * Render diff content based on view mode
 * @param {HTMLElement} container - Container element
 * @param {FileHistory} history - File history object
 * @param {ViewMode} mode - View mode to render
 */
export function renderDiffWithMode(container, history, mode) {
  const ext = getFileExtension(history.filePath);
  const langClass = getLanguageClass(ext);

  switch (mode) {
    case 'combined': {
      const combined = getCombinedDiff(history);
      const viewer = document.createElement('div');
      viewer.className = `diff-viewer ${langClass}`;
      viewer.innerHTML = `
        <div class="diff-line removed"><span class="diff-line-content">${combined.oldContent || '(empty)'}</span></div>
        <div class="diff-line added"><span class="diff-line-content">${combined.newContent}</span></div>
      `;
      container.innerHTML = '';
      container.appendChild(viewer);
      return;
    }

    case 'original': {
      const content = history.originalContent || '(new file - no original content)';
      const viewer = document.createElement('div');
      viewer.className = `file-viewer ${langClass}`;
      viewer.innerHTML = `<pre class="file-content">${content}</pre>`;
      container.innerHTML = '';
      container.appendChild(viewer);
      return;
    }

    case 'current': {
      const content = getCurrentContent(history);
      const viewer = document.createElement('div');
      viewer.className = `file-viewer ${langClass}`;
      viewer.innerHTML = `<pre class="file-content">${content}</pre>`;
      container.innerHTML = '';
      container.appendChild(viewer);
      return;
    }

    case 'partial':
    default: {
      const diff = getCurrentDiff(history);
      const viewer = document.createElement('div');
      viewer.className = `diff-viewer ${langClass}`;
      viewer.innerHTML = `
        <div class="diff-line removed"><span class="diff-line-content">${diff.oldContent}</span></div>
        <div class="diff-line added"><span class="diff-line-content">${diff.newContent}</span></div>
      `;
      container.innerHTML = '';
      container.appendChild(viewer);
      return;
    }
  }
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  createFileHistory,
  addDiffToHistory,
  getCurrentDiff,
  navigatePrevious,
  navigateNext,
  hasPrevious,
  hasNext,
  getPositionIndicator,
  getCombinedDiff,
  getCurrentContent,
  handleKeyboardNavigation,
  createViewState,
  setViewMode,
  renderNavigationControls,
  renderViewModeTabs,
  renderDiffWithMode,
};
