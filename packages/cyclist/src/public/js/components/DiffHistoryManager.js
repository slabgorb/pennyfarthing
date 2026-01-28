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
// MSSCI-12468: Enhanced Combined Diff with Context Lines
// =============================================================================

/**
 * @typedef {Object} DiffLine
 * @property {'context' | 'added' | 'removed'} type - Line type
 * @property {string} line - Line content
 * @property {number} [oldLineNumber] - Line number in old content
 * @property {number} [newLineNumber] - Line number in new content
 */

/**
 * @typedef {Object} HunkHeader
 * @property {number} oldStart - Start line in old content
 * @property {number} oldCount - Number of lines from old content
 * @property {number} newStart - Start line in new content
 * @property {number} newCount - Number of lines from new content
 */

/**
 * @typedef {Object} DiffHunk
 * @property {HunkHeader} header - Hunk header info
 * @property {DiffLine[]} lines - Lines in this hunk
 */

/**
 * @typedef {Object} CombinedDiffResult
 * @property {string} filePath - Path to the file
 * @property {string} originalContent - Original content
 * @property {string} finalContent - Final content
 * @property {DiffHunk[]} hunks - Array of diff hunks
 * @property {number} totalChanges - Total number of additions + deletions
 */

/**
 * Compute LCS (Longest Common Subsequence) for diff algorithm
 * @param {string[]} oldLines - Old content lines
 * @param {string[]} newLines - New content lines
 * @returns {number[][]} LCS table
 */
function computeLCS(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Backtrack through LCS table to get diff operations
 * @param {string[]} oldLines - Old content lines
 * @param {string[]} newLines - New content lines
 * @param {number[][]} dp - LCS table
 * @returns {DiffLine[]} Raw diff lines (no context trimming yet)
 */
function backtrackLCS(oldLines, newLines, dp) {
  const result = [];
  let i = oldLines.length;
  let j = newLines.length;
  let oldLineNum = oldLines.length;
  let newLineNum = newLines.length;

  // Backtrack from bottom-right to top-left
  const ops = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'context', line: oldLines[i - 1], oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'added', line: newLines[j - 1], oldIdx: -1, newIdx: j - 1 });
      j--;
    } else {
      ops.unshift({ type: 'removed', line: oldLines[i - 1], oldIdx: i - 1, newIdx: -1 });
      i--;
    }
  }

  // Convert to DiffLine with proper line numbers
  let currentOld = 1;
  let currentNew = 1;
  for (const op of ops) {
    if (op.type === 'context') {
      result.push({
        type: 'context',
        line: op.line,
        oldLineNumber: currentOld,
        newLineNumber: currentNew,
      });
      currentOld++;
      currentNew++;
    } else if (op.type === 'removed') {
      result.push({
        type: 'removed',
        line: op.line,
        oldLineNumber: currentOld,
        newLineNumber: undefined,
      });
      currentOld++;
    } else if (op.type === 'added') {
      result.push({
        type: 'added',
        line: op.line,
        oldLineNumber: undefined,
        newLineNumber: currentNew,
      });
      currentNew++;
    }
  }

  return result;
}

/**
 * Group diff lines into hunks with context
 * @param {DiffLine[]} diffLines - All diff lines
 * @param {number} contextLines - Number of context lines to include
 * @returns {DiffHunk[]} Array of hunks
 */
function groupIntoHunks(diffLines, contextLines) {
  if (diffLines.length === 0) return [];

  // Find change indices
  const changeIndices = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== 'context') {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) return [];

  // Group changes into hunks
  const hunks = [];
  let hunkStart = Math.max(0, changeIndices[0] - contextLines);
  let lastChangeEnd = changeIndices[0];

  for (let i = 1; i < changeIndices.length; i++) {
    const idx = changeIndices[i];
    // If this change is within context range of the previous, extend the hunk
    if (idx - lastChangeEnd <= contextLines * 2) {
      lastChangeEnd = idx;
    } else {
      // Create hunk for previous group
      const hunkEnd = Math.min(diffLines.length, lastChangeEnd + contextLines + 1);
      hunks.push(createHunk(diffLines, hunkStart, hunkEnd));

      // Start new hunk
      hunkStart = Math.max(0, idx - contextLines);
      lastChangeEnd = idx;
    }
  }

  // Create final hunk
  const hunkEnd = Math.min(diffLines.length, lastChangeEnd + contextLines + 1);
  hunks.push(createHunk(diffLines, hunkStart, hunkEnd));

  return hunks;
}

/**
 * Create a single hunk from diff lines
 * @param {DiffLine[]} diffLines - All diff lines
 * @param {number} start - Start index
 * @param {number} end - End index (exclusive)
 * @returns {DiffHunk}
 */
function createHunk(diffLines, start, end) {
  const lines = diffLines.slice(start, end);

  // Calculate header values
  let oldStart = 0, oldCount = 0, newStart = 0, newCount = 0;

  for (const line of lines) {
    if (line.type === 'context') {
      if (oldStart === 0) oldStart = line.oldLineNumber;
      if (newStart === 0) newStart = line.newLineNumber;
      oldCount++;
      newCount++;
    } else if (line.type === 'removed') {
      if (oldStart === 0) oldStart = line.oldLineNumber;
      oldCount++;
    } else if (line.type === 'added') {
      if (newStart === 0) newStart = line.newLineNumber;
      newCount++;
    }
  }

  // Handle edge case where hunk starts with addition
  if (oldStart === 0 && lines.length > 0) {
    // Find first context or removed line for oldStart
    for (const line of lines) {
      if (line.oldLineNumber) {
        oldStart = line.oldLineNumber;
        break;
      }
    }
    if (oldStart === 0) oldStart = 1;
  }
  if (newStart === 0 && lines.length > 0) {
    for (const line of lines) {
      if (line.newLineNumber) {
        newStart = line.newLineNumber;
        break;
      }
    }
    if (newStart === 0) newStart = 1;
  }

  return {
    header: { oldStart, oldCount, newStart, newCount },
    lines,
  };
}

/**
 * Compute combined diff with context lines (MSSCI-12468)
 *
 * @param {string} oldContent - Original content
 * @param {string} newContent - Final content
 * @param {Object} [options] - Options
 * @param {number} [options.contextLines=3] - Number of context lines
 * @returns {CombinedDiffResult}
 */
export function computeCombinedDiff(oldContent, newContent, options = {}) {
  const contextLines = options.contextLines ?? 3;

  // Normalize line endings
  const normalizedOld = oldContent.replace(/\r\n/g, '\n');
  const normalizedNew = newContent.replace(/\r\n/g, '\n');

  // Handle empty content
  if (!normalizedOld && !normalizedNew) {
    return {
      filePath: '',
      originalContent: oldContent,
      finalContent: newContent,
      hunks: [],
      totalChanges: 0,
    };
  }

  // Split into lines
  const oldLines = normalizedOld ? normalizedOld.split('\n') : [];
  const newLines = normalizedNew ? normalizedNew.split('\n') : [];

  // Handle identical content
  if (normalizedOld === normalizedNew) {
    return {
      filePath: '',
      originalContent: oldContent,
      finalContent: newContent,
      hunks: [],
      totalChanges: 0,
    };
  }

  // Compute LCS-based diff
  const dp = computeLCS(oldLines, newLines);
  const diffLines = backtrackLCS(oldLines, newLines, dp);

  // Group into hunks
  const hunks = groupIntoHunks(diffLines, contextLines);

  // Count changes
  let totalChanges = 0;
  for (const line of diffLines) {
    if (line.type !== 'context') {
      totalChanges++;
    }
  }

  return {
    filePath: '',
    originalContent: oldContent,
    finalContent: newContent,
    hunks,
    totalChanges,
  };
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
  computeCombinedDiff,
};
