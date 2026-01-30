/**
 * SprintPanel - Sprint/Story Info as Top-Level Tab
 *
 * 68-3: Extracts story-section from sidebar into its own
 * VerticalPanel with a SPRINT tab in the tab bar.
 *
 * Features:
 * - Collapsible via tab bar click
 * - Badge shows story in progress indicator
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 */

import { VerticalPanel } from './vertical-panel.js';
import { update as updateStory, init as initStory } from './sidebar/story.js';

const STORAGE_KEY = 'cyclist-sprint-panel';

let sprintPanel = null;
let panelElement = null;

// Track if there's an active story (for badge)
let hasActiveStory = false;

/**
 * SprintPanel class extending VerticalPanel
 */
class SprintPanel extends VerticalPanel {
  constructor(config) {
    super(config);
  }

  /**
   * Get badge count (1 if story active, 0 otherwise)
   * @returns {number}
   */
  getBadgeCount() {
    return hasActiveStory ? 1 : 0;
  }

  /**
   * Update badge count and notify PanelManager
   */
  updateBadgeCount() {
    const count = this.getBadgeCount();
    this.setBadgeCount(count);

    // Notify PanelManager to update tab bar badge
    if (typeof window !== 'undefined' && window.PanelManager) {
      window.PanelManager.updateBadge?.('sprint', count);
    }
  }
}

/**
 * Update panel with story data (called by sidebar story module)
 * @param {Object} story - Story data
 */
export function updatePanelDisplay(story) {
  // Track if there's an active story
  const hadActiveStory = hasActiveStory;
  hasActiveStory = !!(story?.id && story?.title);

  // Update badge if state changed
  if (sprintPanel && hasActiveStory !== hadActiveStory) {
    sprintPanel.updateBadgeCount();
  }

  // The story module handles rendering into the DOM elements
  // that are now inside the sprint-panel
  updateStory(story);
}

/**
 * Create and initialize the sprint panel
 */
export function init() {
  panelElement = document.getElementById('sprint-panel');

  if (!panelElement) {
    console.warn('[SprintPanel] Panel element not found');
    return;
  }

  sprintPanel = new SprintPanel({
    id: 'sprint',
    element: panelElement,
    storageKey: STORAGE_KEY,
    defaultWidth: 320,
    minWidth: 250,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'SPRINT',
    shortcut: 's',  // Cmd+S to toggle
    order: 4,       // Before Todos (5) and Background (6)
  });

  sprintPanel.init();

  // Initialize the story module for the new panel location
  initStory();

  // Register with PanelManager
  registerWithPanelManager();

  // Set up IPC listeners for story updates
  setupStoryListeners();

  console.log('[SprintPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  import('/js/panel-manager.js').then(PanelManager => {
    if (panelElement) {
      PanelManager.default.register({
        id: 'sprint',
        label: 'SPRINT',
        shortcut: 's',
        order: 4,
        element: panelElement,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => sprintPanel ? sprintPanel.getBadgeCount() : 0,
      });

      // Sync initial state
      if (sprintPanel && !sprintPanel.isCollapsed()) {
        PanelManager.default.open('sprint');
      }
    }
  }).catch(err => {
    console.warn('[SprintPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Set up IPC listeners for story updates
 */
function setupStoryListeners() {
  if (typeof window !== 'undefined' && window.electronAPI?.story) {
    window.electronAPI.story.onUpdate?.((_event, story) => {
      updatePanelDisplay(story);
    });
  }
}

/**
 * Collapse the panel
 */
export function collapse() {
  if (sprintPanel) {
    sprintPanel.collapse();
  }
}

/**
 * Expand the panel
 */
export function expand() {
  if (sprintPanel) {
    sprintPanel.expand();
  }
}

/**
 * Toggle panel collapse state
 */
export function toggle() {
  if (sprintPanel) {
    sprintPanel.toggle();
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return sprintPanel ? sprintPanel.isCollapsed() : false;
}

/**
 * Set panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (sprintPanel) {
    sprintPanel.setWidth(width);
  }
}

/**
 * Get current panel width
 * @returns {number}
 */
export function getCurrentWidth() {
  return sprintPanel ? sprintPanel.getCurrentWidth() : 320;
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
