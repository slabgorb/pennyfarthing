/**
 * GitPanel - Git Status as Top-Level Tab
 *
 * 68-4: Extracts git-section from sidebar into its own
 * VerticalPanel with a GIT tab in the tab bar.
 *
 * Features:
 * - Collapsible via tab bar click
 * - Badge shows total dirty file count
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 */

import { VerticalPanel } from './vertical-panel.js';
import { update as updateGit, init as initGit } from './sidebar/git.js';

const STORAGE_KEY = 'cyclist-git-panel';

let gitPanel = null;
let panelElement = null;
let containerElement = null;

// Track dirty file count for badge
let dirtyFileCount = 0;

/**
 * GitPanel class extending VerticalPanel
 */
class GitPanel extends VerticalPanel {
  constructor(config) {
    super(config);
  }

  /**
   * Get badge count (dirty file count)
   * @returns {number}
   */
  getBadgeCount() {
    return dirtyFileCount;
  }

  /**
   * Update badge count and notify PanelManager
   */
  updateBadgeCount() {
    const count = this.getBadgeCount();
    this.setBadgeCount(count);

    // Notify PanelManager to update tab bar badge
    if (typeof window !== 'undefined' && window.PanelManager) {
      window.PanelManager.updateBadge?.('git', count);
    }
  }
}

/**
 * Update panel display with git status data
 * @param {Array} repos - Array of repo status objects
 */
export function updatePanelDisplay(repos) {
  if (!repos || repos.length === 0) return;

  // Calculate total dirty files for badge
  const newDirtyCount = repos.reduce((sum, repo) => sum + (repo.dirtyFiles?.length || 0), 0);
  const countChanged = newDirtyCount !== dirtyFileCount;
  dirtyFileCount = newDirtyCount;

  // Update badge if count changed
  if (gitPanel && countChanged) {
    gitPanel.updateBadgeCount();
  }

  // The git module handles rendering into #git-repos
  updateGit(repos);
}

/**
 * Create and initialize the git panel
 */
export function init() {
  panelElement = document.getElementById('git-panel');

  if (!panelElement) {
    console.warn('[GitPanel] Panel element not found');
    return;
  }

  containerElement = panelElement.querySelector('#git-repos, .git-repos');

  gitPanel = new GitPanel({
    id: 'git',
    element: panelElement,
    storageKey: STORAGE_KEY,
    defaultWidth: 300,
    minWidth: 200,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'GIT',
    shortcut: 'r',  // Cmd+R to toggle (repos)
    order: 7,       // After Background (6)
  });

  gitPanel.init();

  // Initialize the git module for the new panel location
  initGit();

  // Register with PanelManager
  registerWithPanelManager();

  // Set up IPC listeners for git updates
  setupGitListeners();

  console.log('[GitPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  import('/js/panel-manager.js').then(PanelManager => {
    if (panelElement) {
      PanelManager.default.register({
        id: 'git',
        label: 'GIT',
        shortcut: 'r',
        order: 7,
        element: panelElement,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => gitPanel ? gitPanel.getBadgeCount() : 0,
      });

      // Sync initial state
      if (gitPanel && !gitPanel.isCollapsed()) {
        PanelManager.default.open('git');
      }
    }
  }).catch(err => {
    console.warn('[GitPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Set up IPC listeners for git updates
 */
function setupGitListeners() {
  if (typeof window !== 'undefined' && window.electronAPI?.git) {
    window.electronAPI.git.onUpdate?.((_event, data) => {
      if (data?.repos) {
        updatePanelDisplay(data.repos);
      }
    });
  }
}

/**
 * Collapse the panel
 */
export function collapse() {
  if (gitPanel) {
    gitPanel.collapse();
  }
}

/**
 * Expand the panel
 */
export function expand() {
  if (gitPanel) {
    gitPanel.expand();
  }
}

/**
 * Toggle panel collapse state
 */
export function toggle() {
  if (gitPanel) {
    gitPanel.toggle();
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return gitPanel ? gitPanel.isCollapsed() : false;
}

/**
 * Set panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (gitPanel) {
    gitPanel.setWidth(width);
  }
}

/**
 * Get current panel width
 * @returns {number}
 */
export function getCurrentWidth() {
  return gitPanel ? gitPanel.getCurrentWidth() : 300;
}

// Export for external use
export default {
  init,
  collapse,
  expand,
  toggle,
  isCollapsed,
  setWidth,
  getCurrentWidth,
  updatePanelDisplay,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
