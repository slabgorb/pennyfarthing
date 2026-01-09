/**
 * E8-2: Diff Viewer Component
 *
 * Renders side-by-side diff when Claude modifies files via Edit or Write tools.
 * Automatically opens diff panel when file changes are detected.
 */

import DiffPanel from '../diff-panel.js';

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
 * @returns {Object} DiffData object
 */
export function extractDiffDataFromEdit(message) {
  const input = message.input;
  return {
    id: message.tool_id,
    filePath: input.file_path,
    oldContent: input.old_string,
    newContent: input.new_string,
    toolType: 'Edit',
    timestamp: Date.now(),
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
// Tab Creation
// =============================================================================

// Store diffs for the current session
const diffs = [];

/**
 * Handle incoming diff data - render to diff panel
 * @param {Object} diffData - DiffData from tool message
 */
export function handleDiffUpdate(diffData) {
  // Add to diffs list
  diffs.push(diffData);

  // Get the panel content element
  const container = DiffPanel.getContentElement();
  if (!container) {
    console.warn('[DiffViewer] Diff panel content element not found');
    return;
  }

  // Render the diff
  renderDiff(container, diffData);

  // Update count and expand panel
  DiffPanel.setDiffCount(diffs.length);
  DiffPanel.expand();
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
 * @returns {Array} Array of diff lines
 */
export function computeDiff(oldContent, newContent) {
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
      lineNumber: i + 1,
    }));
  }

  // Simple diff: mark old as removed, new as added
  // A real implementation would use LCS or similar algorithm
  const result = [];

  oldLines.forEach((line, i) => {
    result.push({ type: 'removed', line, lineNumber: i + 1 });
  });

  newLines.forEach((line, i) => {
    result.push({ type: 'added', line, lineNumber: i + 1 });
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
 * @param {Object} line - Diff line { type, line }
 * @returns {HTMLElement} Diff line element
 */
export function createDiffLineElement(line) {
  const el = document.createElement('div');
  el.className = `diff-line ${line.type}`;

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

  // File header
  const header = document.createElement('div');
  header.className = 'diff-file-header';
  header.innerHTML = `<span class="file-path">${diffData.filePath}</span>`;
  viewer.appendChild(header);

  // New file indicator
  if (diffData.isNewFile || diffData.oldContent === '') {
    const newFileEl = document.createElement('div');
    newFileEl.className = 'diff-new-file';
    newFileEl.textContent = 'New file';
    viewer.appendChild(newFileEl);
  }

  // Compute and render unified diff
  const diff = computeDiff(diffData.oldContent, diffData.newContent);

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
  computeDiff,
  getFileExtension,
  getLanguageClass,
  createDiffLineElement,
  renderDiff,
};
