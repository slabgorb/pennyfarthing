/**
 * E8-2: Diff Viewer Component
 *
 * Renders side-by-side diff when Claude modifies files via Edit or Write tools.
 * Automatically opens diff panel when file changes are detected.
 */

import DiffPanel from '../diff-panel.js';
import FilePanel from '../file-panel.js';

// =============================================================================
// Tool Detection
// =============================================================================

/**
 * Detect if a tool_use message is an Edit tool
 * @param {Object} message - SDK tool_use message
 * @returns {boolean}
 */
export function detectEditTool(message) {
  return message.type === 'tool_use' && message.tool_name === 'Edit';
}

/**
 * Detect if a tool_use message is a Write tool
 * @param {Object} message - SDK tool_use message
 * @returns {boolean}
 */
export function detectWriteTool(message) {
  return message.type === 'tool_use' && message.tool_name === 'Write';
}

// =============================================================================
// Data Extraction
// =============================================================================

/**
 * Extract DiffData from an Edit tool_use message
 * @param {Object} message - SDK tool_use message with Edit input
 * @param {Object} [context] - Optional context with startLine
 * @param {number} [context.startLine] - Starting line number in the actual file (1-indexed)
 * @returns {Object} DiffData object
 */
export function extractDiffDataFromEdit(message, context) {
  const input = message.input;
  return {
    id: message.tool_id,
    filePath: input.file_path,
    oldContent: input.old_string,
    newContent: input.new_string,
    toolType: 'Edit',
    timestamp: Date.now(),
    startLine: context?.startLine,
  };
}

/**
 * Extract DiffData from a Write tool_use message
 * @param {Object} message - SDK tool_use message with Write input
 * @returns {Object} DiffData object
 */
export function extractDiffDataFromWrite(message) {
  const input = message.input;
  return {
    id: message.tool_id,
    filePath: input.file_path,
    oldContent: '', // Write creates new content
    newContent: input.content,
    toolType: 'Write',
    timestamp: Date.now(),
    isNewFile: true,
  };
}

// =============================================================================
// State Management
// =============================================================================

// Store diffs for the current session
const diffs = [];

// Callback for when a diff is added (used by ChangedFilesList)
let onDiffAddedCallback = null;

// Callback for when diffs are removed (used by ChangedFilesList)
let onDiffsRemovedCallback = null;

/**
 * Set callback for when diff is added
 * @param {Function} callback - Function to call with diffData
 */
export function setOnDiffAdded(callback) {
  onDiffAddedCallback = callback;
}

/**
 * Set callback for when diffs are removed
 * @param {Function} callback - Function to call with array of removed file paths
 */
export function setOnDiffsRemoved(callback) {
  onDiffsRemovedCallback = callback;
}

/**
 * Get count of unique files with diffs
 * @returns {number} Number of unique file paths
 */
function getUniqueFileCount() {
  const uniquePaths = new Set(diffs.map(d => d.filePath));
  return uniquePaths.size;
}

/**
 * Update all count badges (diff panel and file panel)
 */
function updateCountBadges() {
  DiffPanel.setDiffCount(diffs.length);
  FilePanel.setFileCount(getUniqueFileCount());
}

/**
 * Handle incoming diff data - store and notify listeners
 * @param {Object} diffData - DiffData from tool message
 */
export function handleDiffUpdate(diffData) {
  // Add to diffs list
  diffs.push(diffData);

  // Update count badges on both panels
  updateCountBadges();

  // Notify listeners (ChangedFilesList will handle selection and rendering)
  if (onDiffAddedCallback) {
    onDiffAddedCallback(diffData);
  }
}

/**
 * Get all diffs in current session
 * @returns {Array} Array of diff data
 */
export function getDiffs() {
  return [...diffs];
}

/**
 * Clear all diffs
 */
export function clearDiffs() {
  diffs.length = 0;
  DiffPanel.clearContent();
  updateCountBadges();
}

/**
 * Remove diffs for specific file paths (e.g., after git commit)
 * @param {string[]} filePaths - Array of file paths to remove
 * @returns {number} Number of diffs removed
 */
export function removeDiffsForFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) return 0;

  const pathSet = new Set(filePaths);
  const initialLength = diffs.length;
  const removedPaths = [];

  // Filter out diffs for committed files
  for (let i = diffs.length - 1; i >= 0; i--) {
    if (pathSet.has(diffs[i].filePath)) {
      removedPaths.push(diffs[i].filePath);
      diffs.splice(i, 1);
    }
  }

  const removed = initialLength - diffs.length;

  // Update count badges on both panels
  updateCountBadges();

  // Clear content if no diffs remain
  if (diffs.length === 0) {
    DiffPanel.clearContent();
  }

  // Notify listeners
  if (removed > 0 && onDiffsRemovedCallback) {
    onDiffsRemovedCallback(removedPaths);
  }

  return removed;
}

// =============================================================================
// Diff Computation
// =============================================================================

/**
 * Compute diff between two strings
 * Returns array of { type: 'unchanged' | 'added' | 'removed', line: string, lineNumber: number }
 *
 * @param {string} oldContent - Original content
 * @param {string} newContent - Modified content
 * @param {Object} [options] - Options for diff computation
 * @param {number} [options.startLine] - Starting line number in the actual file (1-indexed, defaults to 1)
 * @returns {Array} Array of diff lines
 */
export function computeDiff(oldContent, newContent, options) {
  // Normalize startLine: treat 0 or negative as 1
  const startLine = Math.max(1, options?.startLine || 1);
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  // Handle empty case
  if (oldLines.length === 0 && newLines.length === 0) {
    return [];
  }

  // If content is identical, return unchanged lines
  if (oldContent === newContent) {
    return oldLines.map((line, i) => ({
      type: 'unchanged',
      line,
      lineNumber: startLine + i,
    }));
  }

  // Simple diff: mark old as removed, new as added
  // A real implementation would use LCS or similar algorithm
  const result = [];

  oldLines.forEach((line, i) => {
    result.push({ type: 'removed', line, lineNumber: startLine + i });
  });

  newLines.forEach((line, i) => {
    result.push({ type: 'added', line, lineNumber: startLine + i });
  });

  return result;
}

// =============================================================================
// Language Detection
// =============================================================================

/**
 * Get file extension from path
 * @param {string} filePath - File path
 * @returns {string} Extension without dot
 */
export function getFileExtension(filePath) {
  const filename = filePath.split('/').pop() || '';
  if (filename.startsWith('.')) {
    return filename.slice(1); // .gitignore -> gitignore
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
export function getLanguageClass(ext) {
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

// =============================================================================
// DOM Rendering (Unified Diff / Git Diff Style)
// =============================================================================

/**
 * Create a unified diff line DOM element
 * @param {Object} line - Diff line { type, line, lineNumber }
 * @returns {HTMLElement} Diff line element
 */
export function createDiffLineElement(line) {
  const el = document.createElement('div');
  el.className = `diff-line ${line.type}`;

  // Line number gutter (story 35-10)
  const lineNum = document.createElement('span');
  lineNum.className = 'diff-line-number';
  lineNum.textContent = line.lineNumber != null ? String(line.lineNumber) : '';

  const prefix = document.createElement('span');
  prefix.className = 'diff-line-prefix';

  // Git diff style prefixes
  if (line.type === 'added') {
    prefix.textContent = '+';
  } else if (line.type === 'removed') {
    prefix.textContent = '-';
  } else {
    prefix.textContent = ' ';
  }

  const content = document.createElement('span');
  content.className = 'diff-line-content';
  content.textContent = line.line;

  el.appendChild(lineNum);
  el.appendChild(prefix);
  el.appendChild(content);

  return el;
}

/**
 * Render unified diff content into container (git diff style)
 * @param {HTMLElement} container - Container element
 * @param {Object} diffData - DiffData object
 */
export function renderDiff(container, diffData) {
  const ext = getFileExtension(diffData.filePath);
  const langClass = getLanguageClass(ext);

  // Create viewer wrapper
  const viewer = document.createElement('div');
  viewer.className = `diff-viewer ${langClass}`;

  // File header with clickable path
  const header = document.createElement('div');
  header.className = 'diff-file-header';

  const filePathLink = document.createElement('a');
  filePathLink.className = 'file-path file-path-link';
  filePathLink.href = '#';
  filePathLink.textContent = diffData.filePath;
  filePathLink.title = 'Click to open in $EDITOR';
  filePathLink.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log(`[DiffViewer] Click handler fired for: ${diffData.filePath}`);

    try {
      // MSSCI-12467: Use REST API to open file in $EDITOR
      const response = await fetch('/api/files/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: diffData.filePath }),
      });

      const result = await response.json();
      console.log(`[DiffViewer] openFile result:`, result);

      if (!result.success) {
        console.error(`[DiffViewer] Failed to open file: ${diffData.filePath}`, result.error);
        filePathLink.title = `Failed to open: ${result.error || 'unknown error'}`;
        filePathLink.classList.add('file-path-error');
        setTimeout(() => filePathLink.classList.remove('file-path-error'), 3000);
      } else {
        // Brief visual feedback on success
        filePathLink.title = `Opened in ${result.editor}`;
      }
    } catch (err) {
      console.error(`[DiffViewer] Failed to open file: ${diffData.filePath}`, err);
      filePathLink.title = 'Failed to open file - server error';
      filePathLink.classList.add('file-path-error');
      setTimeout(() => filePathLink.classList.remove('file-path-error'), 3000);
    }
  });

  header.appendChild(filePathLink);
  viewer.appendChild(header);

  // New file indicator
  if (diffData.isNewFile || diffData.oldContent === '') {
    const newFileEl = document.createElement('div');
    newFileEl.className = 'diff-new-file';
    newFileEl.textContent = 'New file';
    viewer.appendChild(newFileEl);
  }

  // Compute and render unified diff with actual file line numbers
  const diff = computeDiff(diffData.oldContent, diffData.newContent, { startLine: diffData.startLine });

  // Render removed lines first, then added lines (unified style)
  const removedLines = diff.filter(d => d.type === 'removed');
  const addedLines = diff.filter(d => d.type === 'added');

  for (const line of removedLines) {
    viewer.appendChild(createDiffLineElement(line));
  }

  for (const line of addedLines) {
    viewer.appendChild(createDiffLineElement(line));
  }

  container.innerHTML = '';
  container.appendChild(viewer);
}

// =============================================================================
// IPC Integration
// =============================================================================

/**
 * Initialize DiffViewer IPC listeners
 * Listens for diff:update events from main process
 */
export function init() {
  if (window.electronAPI?.diff?.onUpdate) {
    window.electronAPI.diff.onUpdate((_event, data) => {
      handleDiffUpdate(data);
    });
    console.log('[DiffViewer] IPC listener registered');
  } else {
    console.log('[DiffViewer] No electronAPI.diff available - running without IPC');
  }
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded
    init();
  }
}

export default {
  init,
  detectEditTool,
  detectWriteTool,
  extractDiffDataFromEdit,
  extractDiffDataFromWrite,
  handleDiffUpdate,
  getDiffs,
  clearDiffs,
  removeDiffsForFiles,
  setOnDiffAdded,
  setOnDiffsRemoved,
  computeDiff,
  getFileExtension,
  getLanguageClass,
  createDiffLineElement,
  renderDiff,
};
