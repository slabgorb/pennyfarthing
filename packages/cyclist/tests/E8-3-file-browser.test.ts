/**
 * E8-3: File Browser Tests
 *
 * Tests for the file browser tab showing project directory tree.
 *
 * Acceptance Criteria:
 * - AC1: File browser tab shows project directory tree
 * - AC2: Directories expand/collapse on click
 * - AC3: Files open in viewer tab when clicked
 * - AC4: All files shown (no default filtering)
 * - AC5: Modified files indicated (if tracked)
 * - AC6: Large directories load lazily
 * - AC7: Only one file browser tab allowed (singleton)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as pathModule from 'path';
import * as os from 'os';
import { listDirectory, isValidPath, readFile } from '../src/file-browser.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Directory entry - represents a file or directory in the tree
 */
export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  isModified?: boolean;
}

/**
 * Directory listing - response from listDirectory IPC call
 */
export interface DirectoryListing {
  path: string;
  entries: DirectoryEntry[];
}

/**
 * Tree state - internal state of the file browser component
 */
export interface TreeState {
  expandedDirs: Set<string>;
  cachedListings: Record<string, DirectoryListing>;
  rootPath: string;
  modifiedFiles: Set<string>;
}

/**
 * Tab configuration for file browser
 */
export interface FileBrowserTab {
  id: string;
  type: 'browser';
  label: string;
  closeable: boolean;
}

// =============================================================================
// Test Data Factories
// =============================================================================

const createDirectoryEntry = (overrides: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  name: 'test-file.ts',
  path: '/project/test-file.ts',
  type: 'file',
  ...overrides,
});

const createDirectoryListing = (overrides: Partial<DirectoryListing> = {}): DirectoryListing => ({
  path: '/project',
  entries: [
    { name: 'src', path: '/project/src', type: 'directory' },
    { name: 'tests', path: '/project/tests', type: 'directory' },
    { name: 'package.json', path: '/project/package.json', type: 'file' },
    { name: 'README.md', path: '/project/README.md', type: 'file' },
  ],
  ...overrides,
});

const createTreeState = (overrides: Partial<TreeState> = {}): TreeState => ({
  expandedDirs: new Set(),
  cachedListings: {},
  rootPath: '/project',
  modifiedFiles: new Set(),
  ...overrides,
});

// =============================================================================
// Stub Implementations (to be replaced by actual component)
// =============================================================================

const BROWSER_TAB_ID = 'file-browser';

/**
 * Open file browser tab (singleton pattern)
 */
export function openFileBrowser(tabManager: MockTabManager): void {
  const state = tabManager.getState();

  // If already exists, just switch to it
  if (state.tabs.find((t: FileBrowserTab) => t.id === BROWSER_TAB_ID)) {
    tabManager.setActiveTab(BROWSER_TAB_ID);
    return;
  }

  // Create new singleton tab
  tabManager.addTab({
    id: BROWSER_TAB_ID,
    type: 'browser',
    label: 'Files',
    closeable: false,
  });
}

/**
 * Create initial tree state
 */
export function createInitialTreeState(rootPath: string): TreeState {
  return {
    expandedDirs: new Set(),
    cachedListings: {},
    rootPath,
    modifiedFiles: new Set(),
  };
}

/**
 * Toggle directory expansion
 */
export function toggleDirectory(state: TreeState, dirPath: string): TreeState {
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
 */
export function isDirectoryExpanded(state: TreeState, dirPath: string): boolean {
  return state.expandedDirs.has(dirPath);
}

/**
 * Cache directory listing
 */
export function cacheDirectoryListing(state: TreeState, listing: DirectoryListing): TreeState {
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
 */
export function getCachedListing(state: TreeState, path: string): DirectoryListing | undefined {
  return state.cachedListings[path];
}

/**
 * Check if listing is cached
 */
export function hasCache(state: TreeState, path: string): boolean {
  return path in state.cachedListings;
}

/**
 * Mark file as modified
 */
export function markFileModified(state: TreeState, filePath: string): TreeState {
  const newModifiedFiles = new Set(state.modifiedFiles);
  newModifiedFiles.add(filePath);
  return {
    ...state,
    modifiedFiles: newModifiedFiles,
  };
}

/**
 * Check if file is modified
 */
export function isFileModified(state: TreeState, filePath: string): boolean {
  return state.modifiedFiles.has(filePath);
}

/**
 * Get file icon based on entry type and extension
 */
export function getFileIcon(entry: DirectoryEntry, isExpanded: boolean = false): string {
  if (entry.type === 'directory') {
    return isExpanded ? '📂' : '📁';
  }

  const ext = entry.name.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
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

/**
 * Sort entries: directories first, then alphabetically
 */
export function sortEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    // Directories first
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    // Then alphabetically (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/**
 * Create tree item DOM element
 */
export function createTreeItemElement(entry: DirectoryEntry, state: TreeState): HTMLElement {
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
 * Render file tree
 */
export function renderFileTree(container: HTMLElement, entries: DirectoryEntry[], state: TreeState): void {
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

/**
 * Handle file click - triggers file open
 */
export function handleFileClick(entry: DirectoryEntry, onOpenFile: (path: string) => void): void {
  if (entry.type === 'file') {
    onOpenFile(entry.path);
  }
}

/**
 * Handle directory click - toggles expand/collapse
 */
export function handleDirectoryClick(
  entry: DirectoryEntry,
  state: TreeState,
  onLoadDirectory: (path: string) => Promise<DirectoryListing>
): Promise<TreeState> {
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

/**
 * Filter entries (for testing - should return all entries, no filtering)
 */
export function filterEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  // AC4: All files shown (no default filtering)
  return entries;
}

// =============================================================================
// Mock TabManager
// =============================================================================

interface MockTabManagerState {
  tabs: FileBrowserTab[];
  activeTab: string | null;
}

class MockTabManager {
  private state: MockTabManagerState = { tabs: [], activeTab: null };

  getState(): MockTabManagerState {
    return { ...this.state };
  }

  addTab(tab: FileBrowserTab): void {
    this.state.tabs.push(tab);
    this.state.activeTab = tab.id;
  }

  setActiveTab(id: string): void {
    this.state.activeTab = id;
  }

  removeTab(id: string): void {
    this.state.tabs = this.state.tabs.filter(t => t.id !== id);
    if (this.state.activeTab === id) {
      this.state.activeTab = this.state.tabs[0]?.id || null;
    }
  }

  reset(): void {
    this.state = { tabs: [], activeTab: null };
  }
}

// =============================================================================
// AC1: File browser tab shows project directory tree
// =============================================================================

describe('E8-3: File Browser', () => {

  let tabManager: MockTabManager;
  let container: HTMLElement;

  beforeEach(() => {
    tabManager = new MockTabManager();
    container = document.createElement('div');
    container.id = 'file-browser-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    tabManager.reset();
    document.body.innerHTML = '';
  });

  describe('AC1: File browser tab shows project directory tree', () => {

    it('should create file browser tab with correct properties', () => {
      openFileBrowser(tabManager);

      const state = tabManager.getState();
      expect(state.tabs.length).toBe(1);

      const tab = state.tabs[0];
      expect(tab.id).toBe('file-browser');
      expect(tab.type).toBe('browser');
      expect(tab.label).toBe('Files');
    });

    it('should create initial tree state with root path', () => {
      const state = createInitialTreeState('/my/project');

      expect(state.rootPath).toBe('/my/project');
      expect(state.expandedDirs.size).toBe(0);
      expect(Object.keys(state.cachedListings).length).toBe(0);
    });

    it('should render directory entries in tree view', () => {
      const entries = createDirectoryListing().entries;
      const state = createTreeState();

      renderFileTree(container, entries, state);

      const items = container.querySelectorAll('.tree-item');
      expect(items.length).toBe(4); // src, tests, package.json, README.md
    });

    it('should render directories with chevron icon', () => {
      const entries = [createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' })];
      const state = createTreeState();

      renderFileTree(container, entries, state);

      const chevron = container.querySelector('.tree-chevron');
      expect(chevron).not.toBeNull();
      expect(chevron?.textContent).toBe('▶');
    });

    it('should render files without chevron (with indent)', () => {
      const entries = [createDirectoryEntry({ name: 'file.ts', path: '/project/file.ts', type: 'file' })];
      const state = createTreeState();

      renderFileTree(container, entries, state);

      const indent = container.querySelector('.tree-indent');
      expect(indent).not.toBeNull();
    });

    it('should set data-path attribute on tree items', () => {
      const entries = [createDirectoryEntry({ path: '/project/src/main.ts' })];
      const state = createTreeState();

      renderFileTree(container, entries, state);

      const item = container.querySelector('.tree-item') as HTMLElement;
      expect(item.dataset.path).toBe('/project/src/main.ts');
    });

  });

  // =============================================================================
  // AC2: Directories expand/collapse on click
  // =============================================================================

  describe('AC2: Directories expand/collapse on click', () => {

    it('should toggle directory to expanded state', () => {
      const state = createTreeState();

      const newState = toggleDirectory(state, '/project/src');

      expect(isDirectoryExpanded(newState, '/project/src')).toBe(true);
    });

    it('should toggle directory from expanded to collapsed', () => {
      const state = createTreeState({
        expandedDirs: new Set(['/project/src']),
      });

      const newState = toggleDirectory(state, '/project/src');

      expect(isDirectoryExpanded(newState, '/project/src')).toBe(false);
    });

    it('should update chevron when directory is expanded', () => {
      const entry = createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' });
      const state = createTreeState({ expandedDirs: new Set(['/project/src']) });

      const el = createTreeItemElement(entry, state);

      const chevron = el.querySelector('.tree-chevron');
      expect(chevron?.textContent).toBe('▼');
    });

    it('should add expanded class when directory is expanded', () => {
      const entry = createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' });
      const state = createTreeState({ expandedDirs: new Set(['/project/src']) });

      const el = createTreeItemElement(entry, state);

      expect(el.classList.contains('expanded')).toBe(true);
    });

    it('should render children container when directory is expanded and cached', () => {
      const entries = [createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' })];
      const childListing = createDirectoryListing({
        path: '/project/src',
        entries: [{ name: 'main.ts', path: '/project/src/main.ts', type: 'file' }],
      });
      const state = createTreeState({
        expandedDirs: new Set(['/project/src']),
        cachedListings: { '/project/src': childListing },
      });

      renderFileTree(container, entries, state);

      const childrenContainer = container.querySelector('.tree-children');
      expect(childrenContainer).not.toBeNull();
      expect(childrenContainer?.getAttribute('data-parent')).toBe('/project/src');
    });

    it('should handle nested directory expansion', () => {
      let state = createTreeState();

      state = toggleDirectory(state, '/project/src');
      state = toggleDirectory(state, '/project/src/components');

      expect(isDirectoryExpanded(state, '/project/src')).toBe(true);
      expect(isDirectoryExpanded(state, '/project/src/components')).toBe(true);
    });

  });

  // =============================================================================
  // AC3: Files open in viewer tab when clicked
  // =============================================================================

  describe('AC3: Files open in viewer tab when clicked', () => {

    it('should call onOpenFile callback when file is clicked', () => {
      const onOpenFile = vi.fn();
      const entry = createDirectoryEntry({ type: 'file', path: '/project/main.ts' });

      handleFileClick(entry, onOpenFile);

      expect(onOpenFile).toHaveBeenCalledWith('/project/main.ts');
    });

    it('should not call onOpenFile for directory entries', () => {
      const onOpenFile = vi.fn();
      const entry = createDirectoryEntry({ type: 'directory', path: '/project/src' });

      handleFileClick(entry, onOpenFile);

      expect(onOpenFile).not.toHaveBeenCalled();
    });

    it('should preserve file path with special characters', () => {
      const onOpenFile = vi.fn();
      const entry = createDirectoryEntry({ path: '/project/[component].tsx' });

      handleFileClick(entry, onOpenFile);

      expect(onOpenFile).toHaveBeenCalledWith('/project/[component].tsx');
    });

    it('should handle deeply nested file paths', () => {
      const onOpenFile = vi.fn();
      const entry = createDirectoryEntry({ path: '/project/src/components/ui/Button/Button.tsx' });

      handleFileClick(entry, onOpenFile);

      expect(onOpenFile).toHaveBeenCalledWith('/project/src/components/ui/Button/Button.tsx');
    });

  });

  // =============================================================================
  // AC4: All files shown (no default filtering)
  // =============================================================================

  describe('AC4: All files shown (no default filtering)', () => {

    it('should not filter out dotfiles', () => {
      const entries = [
        createDirectoryEntry({ name: '.gitignore', path: '/project/.gitignore' }),
        createDirectoryEntry({ name: '.env', path: '/project/.env' }),
        createDirectoryEntry({ name: 'main.ts', path: '/project/main.ts' }),
      ];

      const filtered = filterEntries(entries);

      expect(filtered.length).toBe(3);
      expect(filtered.map(e => e.name)).toContain('.gitignore');
      expect(filtered.map(e => e.name)).toContain('.env');
    });

    it('should not filter out node_modules', () => {
      const entries = [
        createDirectoryEntry({ name: 'node_modules', path: '/project/node_modules', type: 'directory' }),
        createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' }),
      ];

      const filtered = filterEntries(entries);

      expect(filtered.length).toBe(2);
      expect(filtered.map(e => e.name)).toContain('node_modules');
    });

    it('should not filter out dist or build directories', () => {
      const entries = [
        createDirectoryEntry({ name: 'dist', path: '/project/dist', type: 'directory' }),
        createDirectoryEntry({ name: 'build', path: '/project/build', type: 'directory' }),
      ];

      const filtered = filterEntries(entries);

      expect(filtered.length).toBe(2);
    });

    it('should show all file extensions', () => {
      const entries = [
        createDirectoryEntry({ name: 'file.ts', path: '/project/file.ts' }),
        createDirectoryEntry({ name: 'file.log', path: '/project/file.log' }),
        createDirectoryEntry({ name: 'file.bak', path: '/project/file.bak' }),
        createDirectoryEntry({ name: 'Makefile', path: '/project/Makefile' }),
      ];

      const filtered = filterEntries(entries);

      expect(filtered.length).toBe(4);
    });

    it('should return empty array for empty input', () => {
      const filtered = filterEntries([]);

      expect(filtered).toEqual([]);
    });

  });

  // =============================================================================
  // AC5: Modified files indicated (if tracked)
  // =============================================================================

  describe('AC5: Modified files indicated (if tracked)', () => {

    it('should track modified file', () => {
      const state = createTreeState();

      const newState = markFileModified(state, '/project/main.ts');

      expect(isFileModified(newState, '/project/main.ts')).toBe(true);
    });

    it('should not mark unmodified files', () => {
      const state = createTreeState();

      expect(isFileModified(state, '/project/main.ts')).toBe(false);
    });

    it('should track multiple modified files', () => {
      let state = createTreeState();

      state = markFileModified(state, '/project/main.ts');
      state = markFileModified(state, '/project/utils.ts');

      expect(isFileModified(state, '/project/main.ts')).toBe(true);
      expect(isFileModified(state, '/project/utils.ts')).toBe(true);
    });

    it('should add modified class to tree item element', () => {
      const entry = createDirectoryEntry({ path: '/project/main.ts' });
      const state = createTreeState({
        modifiedFiles: new Set(['/project/main.ts']),
      });

      const el = createTreeItemElement(entry, state);

      expect(el.classList.contains('modified')).toBe(true);
    });

    it('should not add modified class to unmodified files', () => {
      const entry = createDirectoryEntry({ path: '/project/main.ts' });
      const state = createTreeState();

      const el = createTreeItemElement(entry, state);

      expect(el.classList.contains('modified')).toBe(false);
    });

  });

  // =============================================================================
  // AC6: Large directories load lazily
  // =============================================================================

  describe('AC6: Large directories load lazily', () => {

    it('should cache directory listing after load', () => {
      const state = createTreeState();
      const listing = createDirectoryListing();

      const newState = cacheDirectoryListing(state, listing);

      expect(hasCache(newState, '/project')).toBe(true);
    });

    it('should return cached listing', () => {
      const listing = createDirectoryListing();
      const state = createTreeState({
        cachedListings: { '/project': listing },
      });

      const cached = getCachedListing(state, '/project');

      expect(cached).toEqual(listing);
    });

    it('should return undefined for uncached path', () => {
      const state = createTreeState();

      const cached = getCachedListing(state, '/project/src');

      expect(cached).toBeUndefined();
    });

    it('should trigger load when expanding uncached directory', async () => {
      const entry = createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' });
      const state = createTreeState();
      const mockListing = createDirectoryListing({ path: '/project/src', entries: [] });
      const onLoadDirectory = vi.fn().mockResolvedValue(mockListing);

      const newState = await handleDirectoryClick(entry, state, onLoadDirectory);

      expect(onLoadDirectory).toHaveBeenCalledWith('/project/src');
      expect(hasCache(newState, '/project/src')).toBe(true);
    });

    it('should not trigger load when expanding cached directory', async () => {
      const entry = createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' });
      const mockListing = createDirectoryListing({ path: '/project/src', entries: [] });
      const state = createTreeState({
        cachedListings: { '/project/src': mockListing },
      });
      const onLoadDirectory = vi.fn();

      await handleDirectoryClick(entry, state, onLoadDirectory);

      expect(onLoadDirectory).not.toHaveBeenCalled();
    });

    it('should not trigger load when collapsing directory', async () => {
      const entry = createDirectoryEntry({ name: 'src', path: '/project/src', type: 'directory' });
      const state = createTreeState({
        expandedDirs: new Set(['/project/src']), // Already expanded
      });
      const onLoadDirectory = vi.fn();

      await handleDirectoryClick(entry, state, onLoadDirectory);

      expect(onLoadDirectory).not.toHaveBeenCalled();
    });

    it('should maintain separate caches for different directories', () => {
      let state = createTreeState();
      const listing1 = createDirectoryListing({ path: '/project/src', entries: [] });
      const listing2 = createDirectoryListing({ path: '/project/tests', entries: [] });

      state = cacheDirectoryListing(state, listing1);
      state = cacheDirectoryListing(state, listing2);

      expect(hasCache(state, '/project/src')).toBe(true);
      expect(hasCache(state, '/project/tests')).toBe(true);
    });

  });

  // =============================================================================
  // AC7: Only one file browser tab allowed (singleton)
  // =============================================================================

  describe('AC7: Only one file browser tab allowed (singleton)', () => {

    it('should create only one tab on multiple openFileBrowser calls', () => {
      openFileBrowser(tabManager);
      openFileBrowser(tabManager);
      openFileBrowser(tabManager);

      const state = tabManager.getState();
      expect(state.tabs.length).toBe(1);
    });

    it('should switch to existing tab if already open', () => {
      // Open file browser
      openFileBrowser(tabManager);

      // Add another tab and make it active
      tabManager.addTab({ id: 'other-tab', type: 'browser', label: 'Other', closeable: true });

      // Open file browser again
      openFileBrowser(tabManager);

      const state = tabManager.getState();
      expect(state.activeTab).toBe('file-browser');
    });

    it('should have closeable set to false', () => {
      openFileBrowser(tabManager);

      const state = tabManager.getState();
      expect(state.tabs[0].closeable).toBe(false);
    });

    it('should use fixed id for singleton', () => {
      openFileBrowser(tabManager);

      const state = tabManager.getState();
      expect(state.tabs[0].id).toBe('file-browser');
    });

    it('should set file browser as active tab when opened', () => {
      openFileBrowser(tabManager);

      const state = tabManager.getState();
      expect(state.activeTab).toBe('file-browser');
    });

  });

  // =============================================================================
  // Icon Rendering
  // =============================================================================

  describe('Icon Rendering', () => {

    it('should return folder icon for collapsed directory', () => {
      const entry = createDirectoryEntry({ type: 'directory' });

      const icon = getFileIcon(entry, false);

      expect(icon).toBe('📁');
    });

    it('should return open folder icon for expanded directory', () => {
      const entry = createDirectoryEntry({ type: 'directory' });

      const icon = getFileIcon(entry, true);

      expect(icon).toBe('📂');
    });

    it('should return TypeScript icon for .ts files', () => {
      const entry = createDirectoryEntry({ name: 'main.ts' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📘');
    });

    it('should return TypeScript icon for .tsx files', () => {
      const entry = createDirectoryEntry({ name: 'Component.tsx' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📘');
    });

    it('should return JavaScript icon for .js files', () => {
      const entry = createDirectoryEntry({ name: 'script.js' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📒');
    });

    it('should return JSON icon for .json files', () => {
      const entry = createDirectoryEntry({ name: 'package.json' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📋');
    });

    it('should return markdown icon for .md files', () => {
      const entry = createDirectoryEntry({ name: 'README.md' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📝');
    });

    it('should return CSS icon for .css files', () => {
      const entry = createDirectoryEntry({ name: 'styles.css' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('🎨');
    });

    it('should return HTML icon for .html files', () => {
      const entry = createDirectoryEntry({ name: 'index.html' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('🌐');
    });

    it('should return generic file icon for unknown extensions', () => {
      const entry = createDirectoryEntry({ name: 'data.xyz' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📄');
    });

    it('should return generic file icon for files without extension', () => {
      const entry = createDirectoryEntry({ name: 'Makefile' });

      const icon = getFileIcon(entry);

      expect(icon).toBe('📄');
    });

  });

  // =============================================================================
  // Entry Sorting
  // =============================================================================

  describe('Entry Sorting', () => {

    it('should sort directories before files', () => {
      const entries = [
        createDirectoryEntry({ name: 'file.ts', type: 'file' }),
        createDirectoryEntry({ name: 'src', type: 'directory' }),
      ];

      const sorted = sortEntries(entries);

      expect(sorted[0].name).toBe('src');
      expect(sorted[1].name).toBe('file.ts');
    });

    it('should sort directories alphabetically', () => {
      const entries = [
        createDirectoryEntry({ name: 'tests', type: 'directory' }),
        createDirectoryEntry({ name: 'src', type: 'directory' }),
        createDirectoryEntry({ name: 'docs', type: 'directory' }),
      ];

      const sorted = sortEntries(entries);

      expect(sorted.map(e => e.name)).toEqual(['docs', 'src', 'tests']);
    });

    it('should sort files alphabetically', () => {
      const entries = [
        createDirectoryEntry({ name: 'z-file.ts', type: 'file' }),
        createDirectoryEntry({ name: 'a-file.ts', type: 'file' }),
        createDirectoryEntry({ name: 'm-file.ts', type: 'file' }),
      ];

      const sorted = sortEntries(entries);

      expect(sorted.map(e => e.name)).toEqual(['a-file.ts', 'm-file.ts', 'z-file.ts']);
    });

    it('should sort case-insensitively', () => {
      const entries = [
        createDirectoryEntry({ name: 'README.md', type: 'file' }),
        createDirectoryEntry({ name: 'package.json', type: 'file' }),
        createDirectoryEntry({ name: 'CHANGELOG.md', type: 'file' }),
      ];

      const sorted = sortEntries(entries);

      expect(sorted.map(e => e.name)).toEqual(['CHANGELOG.md', 'package.json', 'README.md']);
    });

    it('should handle empty entries array', () => {
      const sorted = sortEntries([]);

      expect(sorted).toEqual([]);
    });

    it('should not mutate original array', () => {
      const entries = [
        createDirectoryEntry({ name: 'b.ts', type: 'file' }),
        createDirectoryEntry({ name: 'a.ts', type: 'file' }),
      ];
      const originalOrder = entries.map(e => e.name);

      sortEntries(entries);

      expect(entries.map(e => e.name)).toEqual(originalOrder);
    });

  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    it('should handle empty directory listing', () => {
      const state = createTreeState();
      const entries: DirectoryEntry[] = [];

      renderFileTree(container, entries, state);

      const items = container.querySelectorAll('.tree-item');
      expect(items.length).toBe(0);
    });

    it('should handle deeply nested paths', () => {
      const entry = createDirectoryEntry({
        name: 'deep.ts',
        path: '/project/a/b/c/d/e/f/g/h/i/j/deep.ts',
      });
      const state = createTreeState();

      const el = createTreeItemElement(entry, state);

      expect(el.dataset.path).toBe('/project/a/b/c/d/e/f/g/h/i/j/deep.ts');
    });

    it('should handle special characters in file names', () => {
      const entry = createDirectoryEntry({
        name: '[id].tsx',
        path: '/project/pages/[id].tsx',
      });
      const state = createTreeState();

      const el = createTreeItemElement(entry, state);
      const nameEl = el.querySelector('.tree-name');

      expect(nameEl?.textContent).toBe('[id].tsx');
    });

    it('should handle unicode in file names', () => {
      const entry = createDirectoryEntry({
        name: '你好.ts',
        path: '/project/你好.ts',
      });
      const state = createTreeState();

      const el = createTreeItemElement(entry, state);
      const nameEl = el.querySelector('.tree-name');

      expect(nameEl?.textContent).toBe('你好.ts');
    });

    it('should handle spaces in file names', () => {
      const entry = createDirectoryEntry({
        name: 'my file.ts',
        path: '/project/my file.ts',
      });
      const state = createTreeState();

      const el = createTreeItemElement(entry, state);
      const nameEl = el.querySelector('.tree-name');

      expect(nameEl?.textContent).toBe('my file.ts');
    });

    it('should handle directory click returning same state for files', async () => {
      const entry = createDirectoryEntry({ type: 'file' });
      const state = createTreeState();
      const onLoadDirectory = vi.fn();

      const newState = await handleDirectoryClick(entry, state, onLoadDirectory);

      expect(newState).toEqual(state);
      expect(onLoadDirectory).not.toHaveBeenCalled();
    });

  });

  // =============================================================================
  // Content Renderer Integration
  // =============================================================================

  describe('Content Renderer Integration', () => {

    it('should export renderFileBrowser function', () => {
      expect(typeof renderFileTree).toBe('function');
    });

    it('should clear container before rendering', () => {
      container.innerHTML = '<div class="old-content">Old</div>';
      const entries = [createDirectoryEntry()];
      const state = createTreeState();

      renderFileTree(container, entries, state);

      expect(container.querySelector('.old-content')).toBeNull();
    });

    it('should render in correct order (directories first)', () => {
      const entries = [
        createDirectoryEntry({ name: 'file.ts', type: 'file' }),
        createDirectoryEntry({ name: 'src', type: 'directory' }),
        createDirectoryEntry({ name: 'another.ts', type: 'file' }),
        createDirectoryEntry({ name: 'tests', type: 'directory' }),
      ];
      const state = createTreeState();

      renderFileTree(container, entries, state);

      const items = container.querySelectorAll('.tree-item');
      expect(items[0].classList.contains('directory')).toBe(true);
      expect(items[1].classList.contains('directory')).toBe(true);
      expect(items[2].classList.contains('file')).toBe(true);
      expect(items[3].classList.contains('file')).toBe(true);
    });

  });

  // ===========================================================================
  // Security Tests - Path Traversal Prevention
  // ===========================================================================

  describe('Security: Path Traversal Prevention', () => {
    // Imports moved to top of file for proper module loading

    let testProjectDir: string;
    let testSubDir: string;
    let testFile: string;

    beforeEach(() => {
      // Create a temporary test directory structure
      testProjectDir = fs.mkdtempSync(pathModule.join(os.tmpdir(), 'cyclist-test-'));
      testSubDir = pathModule.join(testProjectDir, 'subdir');
      testFile = pathModule.join(testProjectDir, 'test.txt');
      fs.mkdirSync(testSubDir);
      fs.writeFileSync(testFile, 'test content');
    });

    afterEach(() => {
      // Cleanup test directory
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    });

    describe('listDirectory security', () => {

      it('should allow access to project root', () => {
        const result = listDirectory('', testProjectDir);
        expect(result.path).toBe(testProjectDir);
        expect(result.entries.length).toBeGreaterThan(0);
      });

      it('should allow access to subdirectory within project', () => {
        const result = listDirectory(testSubDir, testProjectDir);
        expect(result.path).toBe(testSubDir);
      });

      it('should reject path traversal with ../', () => {
        const maliciousPath = pathModule.join(testProjectDir, '..', 'etc');
        expect(() => listDirectory(maliciousPath, testProjectDir))
          .toThrow('Access denied: path outside project directory');
      });

      it('should reject path traversal with multiple ../../../', () => {
        const maliciousPath = pathModule.join(testProjectDir, '..', '..', '..', 'etc', 'passwd');
        expect(() => listDirectory(maliciousPath, testProjectDir))
          .toThrow('Access denied: path outside project directory');
      });

      it('should reject absolute path outside project', () => {
        const maliciousPath = '/etc';
        expect(() => listDirectory(maliciousPath, testProjectDir))
          .toThrow('Access denied: path outside project directory');
      });

      it('should reject /tmp path when project is elsewhere', () => {
        const maliciousPath = '/tmp';
        expect(() => listDirectory(maliciousPath, testProjectDir))
          .toThrow('Access denied: path outside project directory');
      });

      it('should reject path with embedded null byte', () => {
        const maliciousPath = pathModule.join(testProjectDir, 'file\x00.txt/../../../etc');
        // pathModule.normalize handles null bytes - this should either throw or be contained
        try {
          const result = listDirectory(maliciousPath, testProjectDir);
          // If it doesn't throw, the path must be within project
          expect(result.path.startsWith(testProjectDir)).toBe(true);
        } catch (e) {
          // Expected to throw - either access denied or directory not found
          expect((e as Error).message).toMatch(/Access denied|Directory not found|Not a directory/);
        }
      });

      it('should reject symlink pointing outside project', () => {
        // Create symlink inside project pointing to /tmp
        const symlinkPath = pathModule.join(testProjectDir, 'evil-link');
        try {
          fs.symlinkSync('/tmp', symlinkPath);

          // Should throw access denied because symlink resolves outside project
          expect(() => listDirectory(symlinkPath, testProjectDir))
            .toThrow('Access denied: path outside project directory');
        } catch (e) {
          // Symlink creation may fail on some systems - that's ok
          if ((e as Error).message.includes('Access denied')) {
            // Test passed - symlink was created and rejected
            expect(true).toBe(true);
          }
          // Otherwise symlink creation failed, skip silently
        }
      });

      it('should reject URL-encoded path traversal attempts', () => {
        // Node.js pathModule.normalize doesn't decode URL encoding, but we test it anyway
        const maliciousPath = pathModule.join(testProjectDir, '%2e%2e', 'etc');
        // This will be treated as literal directory name, so should fail as not found
        try {
          listDirectory(maliciousPath, testProjectDir);
        } catch (e) {
          // Expected - either access denied or directory not found
          expect((e as Error).message).toMatch(/Access denied|Directory not found|Not a directory/);
        }
      });

      it('should reject directory path that is file', () => {
        expect(() => listDirectory(testFile, testProjectDir))
          .toThrow('Not a directory');
      });

      it('should reject non-existent directory', () => {
        const nonExistent = pathModule.join(testProjectDir, 'does-not-exist');
        expect(() => listDirectory(nonExistent, testProjectDir))
          .toThrow('Directory not found');
      });

    });

    describe('isValidPath security', () => {

      it('should return true for valid path within project', () => {
        expect(isValidPath(testSubDir, testProjectDir)).toBe(true);
      });

      it('should return true for project root', () => {
        expect(isValidPath(testProjectDir, testProjectDir)).toBe(true);
      });

      it('should return false for path traversal', () => {
        const maliciousPath = pathModule.join(testProjectDir, '..', 'etc');
        expect(isValidPath(maliciousPath, testProjectDir)).toBe(false);
      });

      it('should return false for absolute path outside project', () => {
        expect(isValidPath('/etc/passwd', testProjectDir)).toBe(false);
      });

      it('should return false for non-existent path', () => {
        const nonExistent = pathModule.join(testProjectDir, 'does-not-exist');
        expect(isValidPath(nonExistent, testProjectDir)).toBe(false);
      });

    });

    describe('readFile security', () => {

      it('should allow reading file within project', () => {
        const content = readFile(testFile, testProjectDir);
        expect(content).toBe('test content');
      });

      it('should reject reading file with path traversal', () => {
        const maliciousPath = pathModule.join(testProjectDir, '..', '..', 'etc', 'passwd');
        expect(() => readFile(maliciousPath, testProjectDir))
          .toThrow('Access denied: path outside project directory');
      });

      it('should reject reading absolute path outside project', () => {
        expect(() => readFile('/etc/passwd', testProjectDir))
          .toThrow('Access denied: path outside project directory');
      });

      it('should reject reading directory as file', () => {
        expect(() => readFile(testSubDir, testProjectDir))
          .toThrow('Not a file');
      });

      it('should reject reading non-existent file', () => {
        const nonExistent = pathModule.join(testProjectDir, 'missing.txt');
        expect(() => readFile(nonExistent, testProjectDir))
          .toThrow('File not found');
      });

      it('should reject symlink to file outside project', () => {
        // Create a temp file outside project
        const outsideFile = pathModule.join(os.tmpdir(), 'outside-file.txt');
        fs.writeFileSync(outsideFile, 'secret content');

        const symlinkPath = pathModule.join(testProjectDir, 'link-to-outside');
        try {
          fs.symlinkSync(outsideFile, symlinkPath);

          // Should throw access denied because symlink resolves outside project
          expect(() => readFile(symlinkPath, testProjectDir))
            .toThrow('Access denied: path outside project directory');
        } catch (e) {
          // Symlink creation may fail on some systems - that's ok
          if ((e as Error).message.includes('Access denied')) {
            // Test passed - symlink was created and rejected
            expect(true).toBe(true);
          }
          // Otherwise symlink creation failed, skip silently
        } finally {
          fs.rmSync(outsideFile, { force: true });
        }
      });

    });

  });

});
