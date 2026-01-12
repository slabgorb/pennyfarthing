/**
 * Changed Files List Component
 *
 * Displays files that Claude has modified. Clicking a file
 * shows its diff in the Diff Panel.
 *
 * Master-detail pattern: this is the master list,
 * DiffPanel is the detail view.
 *
 * 24-3: Now integrates with DiffHistoryManager for multi-edit navigation.
 */

import * as DiffViewer from './DiffViewer.js';
import * as DiffPanel from '../diff-panel.js';
import {
  createFileHistory,
  addDiffToHistory,
  getCurrentDiff,
  navigatePrevious,
  navigateNext,
  hasPrevious,
  hasNext,
  getPositionIndicator,
  getCombinedDiff,
} from './DiffHistoryManager.js';

let container = null;
let selectedFilePath = null;

// 24-3: Track file histories for navigation
const fileHistories = new Map();
let currentViewMode = 'partial'; // 'partial' or 'combined'

// Navigation UI elements
let navBar = null;
let prevBtn = null;
let nextBtn = null;
let indicatorEl = null;
let viewBtns = null;

/**
 * Get filename from full path
 * @param {string} filePath - Full file path
 * @returns {string} Just the filename
 */
function getFilename(filePath) {
  return filePath.split('/').pop() || filePath;
}

/**
 * Group diffs by file path
 * @returns {Object} Map of filePath -> array of diffs
 */
function getFileChanges() {
  const diffs = DiffViewer.getDiffs();
  const grouped = {};

  for (const diff of diffs) {
    if (!grouped[diff.filePath]) {
      grouped[diff.filePath] = [];
    }
    grouped[diff.filePath].push(diff);
  }

  return grouped;
}

/**
 * Render the changed files list
 */
function render() {
  if (!container) return;

  const fileChanges = getFileChanges();
  const filePaths = Object.keys(fileChanges);

  // Empty state
  if (filePaths.length === 0) {
    container.innerHTML = '<div class="changed-files-empty">No changes yet</div>';
    return;
  }

  // Sort by most recent edit (last diff timestamp)
  filePaths.sort((a, b) => {
    const aLast = fileChanges[a][fileChanges[a].length - 1].timestamp || 0;
    const bLast = fileChanges[b][fileChanges[b].length - 1].timestamp || 0;
    return bLast - aLast; // Most recent first
  });

  // Render list
  container.innerHTML = filePaths.map((filePath, index) => {
    const count = fileChanges[filePath].length;
    const isSelected = filePath === selectedFilePath;
    const filename = getFilename(filePath);
    const icon = isSelected ? '●' : '○';
    const badge = count > 1 ? `(${count})` : '';

    return `
      <div class="changed-file-item ${isSelected ? 'selected' : ''}"
           data-filepath="${filePath}"
           data-index="${index}"
           title="${filePath}"
           role="option"
           tabindex="${isSelected ? '0' : '-1'}"
           aria-selected="${isSelected}">
        <span class="changed-file-icon">${icon}</span>
        <span class="changed-file-name">${filename}</span>
        ${badge ? `<span class="changed-file-badge">${badge}</span>` : ''}
      </div>
    `;
  }).join('');
}

/**
 * 24-3: Update navigation UI based on current file history
 */
function updateNavigationUI() {
  if (!navBar || !selectedFilePath) {
    if (navBar) navBar.classList.remove('visible');
    return;
  }

  const history = fileHistories.get(selectedFilePath);
  if (!history || history.diffs.length <= 1) {
    // Hide nav bar for single edits
    navBar.classList.remove('visible');
    return;
  }

  // Show nav bar for multiple edits
  navBar.classList.add('visible');

  // Update buttons
  if (prevBtn) prevBtn.disabled = !hasPrevious(history);
  if (nextBtn) nextBtn.disabled = !hasNext(history);

  // Update indicator
  if (indicatorEl) indicatorEl.textContent = getPositionIndicator(history);
}

/**
 * 24-3: Render the current diff based on view mode
 */
function renderCurrentDiff() {
  if (!selectedFilePath) return;

  const history = fileHistories.get(selectedFilePath);
  if (!history || history.diffs.length === 0) return;

  const contentEl = DiffPanel.getContentElement();
  if (!contentEl) return;

  if (currentViewMode === 'combined' && history.diffs.length > 1) {
    // Show combined diff (original -> current)
    const combinedDiff = getCombinedDiff(history);
    DiffViewer.renderDiff(contentEl, combinedDiff);
  } else {
    // Show current partial diff
    const currentDiff = getCurrentDiff(history);
    DiffViewer.renderDiff(contentEl, currentDiff);
  }

  updateNavigationUI();
}

/**
 * Select a file and show its diff
 * @param {string} filePath - Path to select
 * @param {Object} options - Selection options
 * @param {boolean} options.focus - Whether to focus the selected item (default: false)
 * @param {boolean} options.autoExpand - Whether to auto-expand collapsed panel (default: true for user clicks)
 */
export function selectFile(filePath, { focus = false, autoExpand = false } = {}) {
  selectedFilePath = filePath;
  render();

  // 24-3: Render using history manager
  renderCurrentDiff();

  // Auto-expand if requested (27-1: auto-expand on user file click)
  if (autoExpand && DiffPanel.isCollapsed()) {
    DiffPanel.expand();
  }

  // Only focus when explicitly requested (user interaction)
  if (focus) {
    const selectedEl = container?.querySelector('.changed-file-item.selected');
    if (selectedEl) {
      selectedEl.focus();
    }
  }
}

/**
 * Get current selection
 * @returns {string|null} Selected file path
 */
export function getSelectedFile() {
  return selectedFilePath;
}

/**
 * Handle click on file item
 * @param {Event} e - Click event
 */
function handleClick(e) {
  const item = e.target.closest('.changed-file-item');
  if (item) {
    // 27-1: Auto-expand diff panel when user clicks a file
    selectFile(item.dataset.filepath, { focus: true, autoExpand: true });
  }
}

/**
 * Handle keyboard navigation
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeydown(e) {
  const items = container?.querySelectorAll('.changed-file-item');
  if (!items || items.length === 0) return;

  const currentIndex = Array.from(items).findIndex(
    item => item.dataset.filepath === selectedFilePath
  );

  let nextIndex = currentIndex;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      nextIndex = Math.min(currentIndex + 1, items.length - 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      nextIndex = Math.max(currentIndex - 1, 0);
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      // Already selected, ensure diff is shown and panel is expanded (27-1)
      if (selectedFilePath) {
        selectFile(selectedFilePath, { focus: true, autoExpand: true });
      }
      return;
    case 'Home':
      e.preventDefault();
      nextIndex = 0;
      break;
    case 'End':
      e.preventDefault();
      nextIndex = items.length - 1;
      break;
    default:
      return;
  }

  if (nextIndex !== currentIndex && items[nextIndex]) {
    selectFile(items[nextIndex].dataset.filepath, { focus: true });
  }
}

/**
 * Handle new diff added - auto-select and render
 * 24-3: Now tracks file history for navigation
 * @param {Object} diffData - The diff data that was added
 */
export function handleDiffAdded(diffData) {
  // 24-3: Add to file history
  let history = fileHistories.get(diffData.filePath);
  if (!history) {
    history = createFileHistory(diffData.filePath);
    fileHistories.set(diffData.filePath, history);
  }
  addDiffToHistory(history, diffData);

  // Always select the newly changed file
  selectFile(diffData.filePath);
}

/**
 * Handle diffs removed (e.g., after git commit)
 * Re-renders the list and adjusts selection if needed
 * @param {string[]} removedPaths - Array of file paths that were removed
 */
export function handleDiffsRemoved(removedPaths) {
  // Check if currently selected file was removed
  if (selectedFilePath && removedPaths.includes(selectedFilePath)) {
    // Get remaining files
    const fileChanges = getFileChanges();
    const remainingPaths = Object.keys(fileChanges);

    if (remainingPaths.length > 0) {
      // Select the first remaining file
      selectFile(remainingPaths[0]);
    } else {
      // No files left, clear selection
      selectedFilePath = null;
      DiffPanel.clearContent();
    }
  }

  // Re-render the list
  render();
}

/**
 * Clear all changes and reset state
 * 24-3: Also clears file histories
 */
export function clear() {
  selectedFilePath = null;
  fileHistories.clear();
  currentViewMode = 'partial';
  if (navBar) navBar.classList.remove('visible');
  render();
}

/**
 * 24-3: Handle navigation button clicks
 */
function handleNavPrev() {
  if (!selectedFilePath) return;
  const history = fileHistories.get(selectedFilePath);
  if (history && navigatePrevious(history)) {
    renderCurrentDiff();
  }
}

function handleNavNext() {
  if (!selectedFilePath) return;
  const history = fileHistories.get(selectedFilePath);
  if (history && navigateNext(history)) {
    renderCurrentDiff();
  }
}

function handleViewModeChange(mode) {
  currentViewMode = mode;
  // Update button states
  if (viewBtns) {
    viewBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }
  renderCurrentDiff();
}

/**
 * 24-3: Handle keyboard navigation for diffs
 */
function handleDiffKeydown(e) {
  if (!selectedFilePath) return;
  const history = fileHistories.get(selectedFilePath);
  if (!history || history.diffs.length <= 1) return;

  // Only handle arrow keys when not in an input or contenteditable
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  if (e.key === 'ArrowLeft' || e.key === 'k') {
    if (navigatePrevious(history)) {
      e.preventDefault();
      renderCurrentDiff();
    }
  } else if (e.key === 'ArrowRight' || e.key === 'j') {
    if (navigateNext(history)) {
      e.preventDefault();
      renderCurrentDiff();
    }
  }
}

/**
 * Initialize the component
 */
export function init() {
  container = document.getElementById('changed-files-list');
  if (!container) {
    console.warn('[ChangedFilesList] Container not found');
    return;
  }

  // 24-3: Get navigation UI elements
  navBar = document.getElementById('diff-nav-bar');
  prevBtn = document.getElementById('diff-nav-prev');
  nextBtn = document.getElementById('diff-nav-next');
  indicatorEl = document.getElementById('diff-nav-indicator');
  viewBtns = document.querySelectorAll('.diff-view-btn');

  // Set up accessibility attributes
  container.setAttribute('role', 'listbox');
  container.setAttribute('aria-label', 'Changed files');

  // Event listeners
  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', handleKeydown);

  // 24-3: Navigation button listeners
  if (prevBtn) prevBtn.addEventListener('click', handleNavPrev);
  if (nextBtn) nextBtn.addEventListener('click', handleNavNext);

  // 24-3: View mode button listeners
  if (viewBtns) {
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => handleViewModeChange(btn.dataset.mode));
    });
  }

  // 24-3: Global keyboard navigation for diffs (left/right arrows, j/k)
  document.addEventListener('keydown', handleDiffKeydown);

  // Initial render
  render();

  console.log('[ChangedFilesList] Initialized with diff history navigation');
}

export default {
  init,
  selectFile,
  getSelectedFile,
  handleDiffAdded,
  handleDiffsRemoved,
  clear,
  render,
};
