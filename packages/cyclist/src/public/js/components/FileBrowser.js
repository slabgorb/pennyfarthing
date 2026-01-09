/**
 * E8-3: File Browser Component
 *
 * Provides a tree view of the project directory in the left panel.
 * Users can navigate directories, view file structure, and click files to open them.
 */

// =============================================================================
// Type Definitions (for documentation)
// =============================================================================

/**
 * @typedef {Object} DirectoryEntry
 * @property {string} name - Filename or directory name
 * @property {string} path - Absolute path
 * @property {'file'|'directory'} type - Entry type
 * @property {boolean} [isModified] - True if file has been modified
 */

/**
 * @typedef {Object} DirectoryListing
 * @property {string} path - Directory path that was listed
 * @property {DirectoryEntry[]} entries - Array of entries
 */

/**
 * @typedef {Object} TreeState
 * @property {Set<string>} expandedDirs - Set of expanded directory paths
 * @property {Object<string, DirectoryListing>} cachedListings - Cached directory listings
 * @property {string} rootPath - Project root directory
 * @property {Set<string>} modifiedFiles - Set of modified file paths
 */

// =============================================================================
// Tree State Management
// =============================================================================

/**
 * Create initial tree state
 * @param {string} rootPath - Root directory path
 * @returns {TreeState}
 */
export function createInitialTreeState(rootPath) {
  return {
    expandedDirs: new Set(),
    cachedListings: {},
    rootPath,
    modifiedFiles: new Set(),
  };
}

/**
 * Toggle directory expansion
 * @param {TreeState} state - Current state
 * @param {string} dirPath - Directory path to toggle
 * @returns {TreeState} New state
 */
export function toggleDirectory(state, dirPath) {
  const newExpandedDirs = new Set(state.expandedDirs);

  if (newExpandedDirs.has(dirPath)) {
    newExpandedDirs.delete(dirPath);
  } else {
    newExpandedDirs.add(dirPath);
  }

  return {
    ...state,
    expandedDirs: newExpandedDirs,
  };
}

/**
 * Check if directory is expanded
 * @param {TreeState} state - Current state
 * @param {string} dirPath - Directory path
 * @returns {boolean}
 */
export function isDirectoryExpanded(state, dirPath) {
  return state.expandedDirs.has(dirPath);
}

/**
 * Cache directory listing
 * @param {TreeState} state - Current state
 * @param {DirectoryListing} listing - Listing to cache
 * @returns {TreeState} New state
 */
export function cacheDirectoryListing(state, listing) {
  return {
    ...state,
    cachedListings: {
      ...state.cachedListings,
      [listing.path]: listing,
    },
  };
}

/**
 * Get cached directory listing
 * @param {TreeState} state - Current state
 * @param {string} path - Directory path
 * @returns {DirectoryListing|undefined}
 */
export function getCachedListing(state, path) {
  return state.cachedListings[path];
}

/**
 * Check if listing is cached
 * @param {TreeState} state - Current state
 * @param {string} path - Directory path
 * @returns {boolean}
 */
export function hasCache(state, path) {
  return path in state.cachedListings;
}

/**
 * Mark file as modified
 * @param {TreeState} state - Current state
 * @param {string} filePath - File path
 * @returns {TreeState} New state
 */
export function markFileModified(state, filePath) {
  const newModifiedFiles = new Set(state.modifiedFiles);
  newModifiedFiles.add(filePath);
  return {
    ...state,
    modifiedFiles: newModifiedFiles,
  };
}

/**
 * Check if file is modified
 * @param {TreeState} state - Current state
 * @param {string} filePath - File path
 * @returns {boolean}
 */
export function isFileModified(state, filePath) {
  return state.modifiedFiles.has(filePath);
}

// =============================================================================
// Entry Filtering and Sorting
// =============================================================================

/**
 * Filter entries (AC4: no default filtering - return all)
 * @param {DirectoryEntry[]} entries - Entries to filter
 * @returns {DirectoryEntry[]}
 */
export function filterEntries(entries) {
  // AC4: All files shown (no default filtering)
  return entries;
}

/**
 * Sort entries: directories first, then alphabetically (case-insensitive)
 * @param {DirectoryEntry[]} entries - Entries to sort
 * @returns {DirectoryEntry[]}
 */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    // Directories first
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    // Then alphabetically (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

// =============================================================================
// Icon Helpers
// =============================================================================

/**
 * Get file icon based on entry type and extension
 * @param {DirectoryEntry} entry - Entry to get icon for
 * @param {boolean} [isExpanded=false] - Whether directory is expanded
 * @returns {string}
 */
export function getFileIcon(entry, isExpanded = false) {
  if (entry.type === 'directory') {
    return isExpanded ? '📂' : '📁';
  }

  const ext = entry.name.split('.').pop()?.toLowerCase();
  const iconMap = {
    ts: '📘',
    tsx: '📘',
    js: '📒',
    jsx: '📒',
    json: '📋',
    md: '📝',
    css: '🎨',
    html: '🌐',
  };

  return iconMap[ext || ''] || '📄';
}

// =============================================================================
// DOM Rendering
// =============================================================================

/**
 * Create tree item DOM element
 * @param {DirectoryEntry} entry - Entry to render
 * @param {TreeState} state - Current tree state
 * @returns {HTMLElement}
 */
export function createTreeItemElement(entry, state) {
  const el = document.createElement('div');
  el.className = `tree-item ${entry.type}`;
  el.dataset.path = entry.path;

  if (entry.type === 'directory') {
    const isExpanded = isDirectoryExpanded(state, entry.path);
    if (isExpanded) el.classList.add('expanded');

    const chevron = document.createElement('span');
    chevron.className = 'tree-chevron';
    chevron.textContent = isExpanded ? '▼' : '▶';
    el.appendChild(chevron);
  } else {
    // Indent for files (no chevron)
    const indent = document.createElement('span');
    indent.className = 'tree-indent';
    el.appendChild(indent);
  }

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = getFileIcon(entry, isDirectoryExpanded(state, entry.path));
  el.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = entry.name;
  el.appendChild(name);

  // Add modified indicator
  if (isFileModified(state, entry.path)) {
    el.classList.add('modified');
  }

  return el;
}

/**
 * Render file tree recursively
 * @param {HTMLElement} container - Container element
 * @param {DirectoryEntry[]} entries - Entries to render
 * @param {TreeState} state - Current tree state
 */
export function renderFileTree(container, entries, state) {
  container.innerHTML = '';

  const sortedEntries = sortEntries(entries);

  for (const entry of sortedEntries) {
    const item = createTreeItemElement(entry, state);
    container.appendChild(item);

    // If directory is expanded and we have cached children, render them
    if (entry.type === 'directory' && isDirectoryExpanded(state, entry.path)) {
      const cachedListing = getCachedListing(state, entry.path);
      if (cachedListing) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        childrenContainer.dataset.parent = entry.path;
        renderFileTree(childrenContainer, cachedListing.entries, state);
        container.appendChild(childrenContainer);
      }
    }
  }
}

// =============================================================================
// Click Handlers
// =============================================================================

/**
 * Handle file click - triggers file open
 * @param {DirectoryEntry} entry - Clicked entry
 * @param {function(string): void} onOpenFile - Callback for opening file
 */
export function handleFileClick(entry, onOpenFile) {
  if (entry.type === 'file') {
    onOpenFile(entry.path);
  }
}

/**
 * Handle directory click - toggles expand/collapse
 * @param {DirectoryEntry} entry - Clicked entry
 * @param {TreeState} state - Current state
 * @param {function(string): Promise<DirectoryListing>} onLoadDirectory - Callback for loading directory
 * @returns {Promise<TreeState>} New state
 */
export function handleDirectoryClick(entry, state, onLoadDirectory) {
  if (entry.type !== 'directory') {
    return Promise.resolve(state);
  }

  const newState = toggleDirectory(state, entry.path);

  // If expanding and not cached, load directory
  if (isDirectoryExpanded(newState, entry.path) && !hasCache(newState, entry.path)) {
    return onLoadDirectory(entry.path).then(listing => {
      return cacheDirectoryListing(newState, listing);
    });
  }

  return Promise.resolve(newState);
}

// =============================================================================
// File Browser Component
// =============================================================================

// Global tree state for the component
let treeState = null;

/**
 * Initialize file browser with root path
 * @param {string} rootPath - Project root directory
 */
function initFileBrowser(rootPath) {
  treeState = createInitialTreeState(rootPath);
}

/**
 * Render file browser into container
 * @param {HTMLElement} container - Container element
 */
async function renderFileBrowser(container) {
  container.innerHTML = '';
  container.className = 'file-browser';

  const treeContainer = document.createElement('div');
  treeContainer.className = 'file-tree';
  container.appendChild(treeContainer);

  // Get root path from electronAPI if available
  if (!treeState && window.electronAPI?.fileBrowser) {
    try {
      // Get the project directory from the main process
      const listing = await window.electronAPI.fileBrowser.listDirectory('');
      initFileBrowser(listing.path);
      treeState = cacheDirectoryListing(treeState, listing);
    } catch (err) {
      console.error('[FileBrowser] Failed to load root directory:', err);
      treeContainer.innerHTML = '<div class="file-browser-error">Failed to load directory</div>';
      return;
    }
  }

  if (!treeState) {
    treeContainer.innerHTML = '<div class="file-browser-empty">No project loaded</div>';
    return;
  }

  // Get root listing
  const rootListing = getCachedListing(treeState, treeState.rootPath);
  if (rootListing) {
    renderFileTree(treeContainer, rootListing.entries, treeState);
    attachEventListeners(treeContainer);
  }
}

/**
 * Attach click event listeners to tree items
 * @param {HTMLElement} container - Tree container
 */
function attachEventListeners(container) {
  container.addEventListener('click', async (e) => {
    const treeItem = e.target.closest('.tree-item');
    if (!treeItem) return;

    const path = treeItem.dataset.path;
    const isDirectory = treeItem.classList.contains('directory');

    if (isDirectory) {
      // Create entry object from DOM
      const entry = {
        name: treeItem.querySelector('.tree-name')?.textContent || '',
        path,
        type: 'directory',
      };

      // Load directory via IPC if available
      const onLoadDirectory = async (dirPath) => {
        if (window.electronAPI?.fileBrowser) {
          return window.electronAPI.fileBrowser.listDirectory(dirPath);
        }
        return { path: dirPath, entries: [] };
      };

      treeState = await handleDirectoryClick(entry, treeState, onLoadDirectory);

      // Re-render the tree (event listener already attached via delegation)
      renderFileTree(container, getCachedListing(treeState, treeState.rootPath)?.entries || [], treeState);
    } else {
      // File click - open in viewer tab
      const entry = {
        name: treeItem.querySelector('.tree-name')?.textContent || '',
        path,
        type: 'file',
      };

      handleFileClick(entry, (filePath) => {
        if (window.electronAPI?.fileBrowser) {
          window.electronAPI.fileBrowser.openFile(filePath);
        }
      });
    }
  });
}

// =============================================================================
// IPC Integration
// =============================================================================

/**
 * Initialize the left panel file tree
 * Renders directly into #file-panel-tree
 */
async function initLeftPanelTree() {
  const treeContainer = document.getElementById('file-panel-tree');
  if (!treeContainer) {
    console.log('[FileBrowser] Left panel tree container not found');
    return;
  }

  // Get root path from electronAPI if available
  if (!treeState && window.electronAPI?.fileBrowser) {
    try {
      const listing = await window.electronAPI.fileBrowser.listDirectory('');
      initFileBrowser(listing.path);
      treeState = cacheDirectoryListing(treeState, listing);
      console.log('[FileBrowser] Loaded root directory:', listing.path);
    } catch (err) {
      console.error('[FileBrowser] Failed to load root directory:', err);
      treeContainer.innerHTML = '<div class="file-browser-error">Failed to load directory</div>';
      return;
    }
  }

  if (!treeState) {
    treeContainer.innerHTML = '<div class="file-browser-empty">No project loaded</div>';
    return;
  }

  // Get root listing and render
  const rootListing = getCachedListing(treeState, treeState.rootPath);
  if (rootListing) {
    renderFileTree(treeContainer, rootListing.entries, treeState);
    attachEventListeners(treeContainer);
    console.log('[FileBrowser] Left panel tree initialized');
  }
}

/**
 * Initialize FileBrowser IPC listeners and left panel
 * Listens for diff updates to track modified files
 */
export function init() {
  // Initialize the left panel file tree
  initLeftPanelTree();

  // Listen for diff updates to track modified files (AC5)
  if (window.electronAPI?.diff?.onUpdate) {
    window.electronAPI.diff.onUpdate((_event, data) => {
      if (treeState && data.filePath) {
        treeState = markFileModified(treeState, data.filePath);
        // Refresh the tree to show modified indicator
        const container = document.getElementById('file-panel-tree');
        if (container && treeState) {
          const rootListing = getCachedListing(treeState, treeState.rootPath);
          if (rootListing) {
            renderFileTree(container, rootListing.entries, treeState);
            // Event listener already attached via delegation - no need to re-attach
          }
        }
      }
    });
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

// =============================================================================
// Exports
// =============================================================================

export default {
  init,
  createInitialTreeState,
  toggleDirectory,
  isDirectoryExpanded,
  cacheDirectoryListing,
  getCachedListing,
  hasCache,
  markFileModified,
  isFileModified,
  filterEntries,
  sortEntries,
  getFileIcon,
  createTreeItemElement,
  renderFileTree,
  handleFileClick,
  handleDirectoryClick,
};
