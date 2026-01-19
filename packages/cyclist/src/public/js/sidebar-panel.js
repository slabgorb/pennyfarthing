/**
 * SidebarPanel - Collapsible sidebar panel (right side)
 *
 * 35-5: Converts the existing sidebar to a VerticalPanel-based collapsible panel
 *
 * Features:
 * - Collapsible via button or Cmd+B / Cmd+5
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 */

import { VerticalPanel } from './vertical-panel.js';

const STORAGE_KEY = 'cyclist-sidebar-panel';

let sidebarPanel = null;

/**
 * Create and initialize the sidebar panel
 */
export function init() {
  const element = document.getElementById('sidebar');

  if (!element) {
    console.warn('[SidebarPanel] Sidebar element not found');
    return;
  }

  sidebarPanel = new VerticalPanel({
    id: 'sidebar',
    element: element,
    storageKey: STORAGE_KEY,
    defaultWidth: 300,
    minWidth: 200,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'STORY INFO',
    shortcut: 'b',  // Cmd+B to toggle sidebar
    order: 5,
  });

  sidebarPanel.init();

  // Register with PanelManager
  registerWithPanelManager();

  console.log('[SidebarPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  // Dynamic import to avoid circular dependency
  import('/js/panel-manager.js').then(PanelManager => {
    const element = document.getElementById('sidebar');
    if (element) {
      PanelManager.default.register({
        id: 'sidebar',
        label: 'SIDEBAR',
        shortcut: 'b',
        order: 5,
        element: element,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => 0,
      });
    }
  }).catch(err => {
    console.warn('[SidebarPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Collapse the sidebar
 */
export function collapse() {
  if (sidebarPanel) {
    sidebarPanel.collapse();
  }
}

/**
 * Expand the sidebar
 */
export function expand() {
  if (sidebarPanel) {
    sidebarPanel.expand();
  }
}

/**
 * Toggle sidebar collapse state
 */
export function toggle() {
  if (sidebarPanel) {
    sidebarPanel.toggle();
  }
}

/**
 * Check if sidebar is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return sidebarPanel ? sidebarPanel.isCollapsed() : false;
}

/**
 * Set sidebar width
 * @param {number} width
 */
export function setWidth(width) {
  if (sidebarPanel) {
    sidebarPanel.setWidth(width);
  }
}

/**
 * Get current sidebar width
 * @returns {number}
 */
export function getCurrentWidth() {
  return sidebarPanel ? sidebarPanel.getCurrentWidth() : 300;
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
