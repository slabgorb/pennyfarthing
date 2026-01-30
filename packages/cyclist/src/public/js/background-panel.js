/**
 * BackgroundPanel - Background Tasks as Top-Level Tab
 *
 * 68-1: Extracts background-tasks section from sidebar into its own
 * VerticalPanel with a BACKGROUND tab in the tab bar.
 *
 * Features:
 * - Collapsible via tab bar click
 * - Badge shows active task count
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 */

import { VerticalPanel } from './vertical-panel.js';
import {
  renderBackgroundTasksPanel,
  getBackgroundTasks,
  addBackgroundTask,
  updateBackgroundTask,
  dismissBackgroundTask,
  connectWebSocket,
  init as initBackgroundTasks,
} from './sidebar/background-tasks.js';

const STORAGE_KEY = 'cyclist-background-panel';

let backgroundPanel = null;
let panelElement = null;
let containerElement = null;

/**
 * BackgroundPanel class extending VerticalPanel
 */
class BackgroundPanel extends VerticalPanel {
  constructor(config) {
    super(config);
    this._taskCount = 0;
  }

  /**
   * Get badge count (active task count)
   * @returns {number}
   */
  getBadgeCount() {
    const tasks = getBackgroundTasks();
    return tasks.length;
  }

  /**
   * Update badge count and notify PanelManager
   */
  updateBadgeCount() {
    const count = this.getBadgeCount();
    this._taskCount = count;
    this.setBadgeCount(count);

    // Notify PanelManager to update tab bar badge
    if (typeof window !== 'undefined' && window.PanelManager) {
      window.PanelManager.updateBadge?.('background', count);
    }
  }
}

/**
 * Handle click events on the panel (dismiss buttons)
 * @param {Event} event
 */
function handlePanelClick(event) {
  const dismissBtn = event.target.closest('[data-dismiss]');
  if (dismissBtn) {
    const taskId = dismissBtn.dataset.dismiss;
    dismissBackgroundTask(taskId);
    updatePanelDisplay();
  }
}

/**
 * Update panel display with current tasks
 */
function updatePanelDisplay() {
  if (containerElement) {
    const tasks = getBackgroundTasks();
    containerElement.innerHTML = renderBackgroundTasksPanel(tasks);
  }

  if (backgroundPanel) {
    backgroundPanel.updateBadgeCount();
  }
}

/**
 * Create and initialize the background panel
 */
export function init() {
  panelElement = document.getElementById('background-panel');

  if (!panelElement) {
    console.warn('[BackgroundPanel] Panel element not found');
    return;
  }

  containerElement = panelElement.querySelector('#background-tasks-container, .background-tasks-container');

  backgroundPanel = new BackgroundPanel({
    id: 'background',
    element: panelElement,
    storageKey: STORAGE_KEY,
    defaultWidth: 300,
    minWidth: 200,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'BACKGROUND',
    shortcut: 'g',  // Cmd+G to toggle
    order: 6,
  });

  backgroundPanel.init();

  // Set up click handler for dismiss buttons
  if (containerElement) {
    containerElement.addEventListener('click', handlePanelClick);
  }

  // Register with PanelManager
  registerWithPanelManager();

  // Initialize task display
  updatePanelDisplay();

  // Set up task update listener
  setupTaskUpdateListener();

  console.log('[BackgroundPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  import('/js/panel-manager.js').then(PanelManager => {
    if (panelElement) {
      PanelManager.default.register({
        id: 'background',
        label: 'BACKGROUND',
        shortcut: 'g',
        order: 6,
        element: panelElement,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => backgroundPanel ? backgroundPanel.getBadgeCount() : 0,
      });

      // Sync initial state
      if (backgroundPanel && !backgroundPanel.isCollapsed()) {
        PanelManager.default.open('background');
      }
    }
  }).catch(err => {
    console.warn('[BackgroundPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Set up listener for task updates (WebSocket/IPC)
 */
function setupTaskUpdateListener() {
  // Override the module's update functions to also update our display
  const originalAdd = addBackgroundTask;
  const originalUpdate = updateBackgroundTask;

  // Create a MutationObserver to watch for task changes
  // This is a lightweight way to sync without modifying the original module
  if (containerElement) {
    const observer = new MutationObserver(() => {
      if (backgroundPanel) {
        backgroundPanel.updateBadgeCount();
      }
    });

    observer.observe(containerElement, {
      childList: true,
      subtree: true,
    });
  }

  // Also subscribe to IPC events if available (Electron mode)
  if (typeof window !== 'undefined' && window.electronAPI?.backgroundTask) {
    window.electronAPI.backgroundTask.onStarted?.((_event, task) => {
      updatePanelDisplay();
    });

    window.electronAPI.backgroundTask.onCompleted?.((_event, task) => {
      updatePanelDisplay();
    });
  }
}

/**
 * Collapse the panel
 */
export function collapse() {
  if (backgroundPanel) {
    backgroundPanel.collapse();
  }
}

/**
 * Expand the panel
 */
export function expand() {
  if (backgroundPanel) {
    backgroundPanel.expand();
  }
}

/**
 * Toggle panel collapse state
 */
export function toggle() {
  if (backgroundPanel) {
    backgroundPanel.toggle();
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return backgroundPanel ? backgroundPanel.isCollapsed() : false;
}

/**
 * Set panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (backgroundPanel) {
    backgroundPanel.setWidth(width);
  }
}

/**
 * Get current panel width
 * @returns {number}
 */
export function getCurrentWidth() {
  return backgroundPanel ? backgroundPanel.getCurrentWidth() : 300;
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
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
