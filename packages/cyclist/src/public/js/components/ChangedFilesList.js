/**
 * Changed Files List Component
 *
 * Displays files that Claude has modified. Clicking a file
 * shows its diff in the Diff Panel.
 *
 * Master-detail pattern: this is the master list,
 * DiffPanel is the detail view.
 */

import * as DiffViewer from './DiffViewer.js';
import * as DiffPanel from '../diff-panel.js';

let container = null;
let selectedFilePath = null;

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
 * Select a file and show its diff
 * @param {string} filePath - Path to select
 * @param {Object} options - Selection options
 * @param {boolean} options.focus - Whether to focus the selected item (default: false)
 */
export function selectFile(filePath, { focus = false } = {}) {
  selectedFilePath = filePath;
  render();

  // Show diff for this file (but don't auto-expand the panel)
  const diffs = DiffViewer.getDiffs().filter(d => d.filePath === filePath);
  if (diffs.length > 0) {
    // Show most recent diff for this file
    const mostRecent = diffs[diffs.length - 1];
    DiffViewer.renderDiff(DiffPanel.getContentElement(), mostRecent);
    // Don't auto-expand - user controls panel visibility
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
    selectFile(item.dataset.filepath, { focus: true });
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
      // Already selected, just ensure diff is shown
      if (selectedFilePath) {
        selectFile(selectedFilePath, { focus: true });
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
 * @param {Object} diffData - The diff data that was added
 */
export function handleDiffAdded(diffData) {
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
 */
export function clear() {
  selectedFilePath = null;
  render();
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

  // Set up accessibility attributes
  container.setAttribute('role', 'listbox');
  container.setAttribute('aria-label', 'Changed files');

  // Event listeners
  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', handleKeydown);

  // Initial render
  render();

  console.log('[ChangedFilesList] Initialized');
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
