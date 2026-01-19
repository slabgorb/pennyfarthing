/**
 * SettingsPanel - Collapsible settings panel (right side, after sidebar)
 *
 * 35-9: Converts settings from slide-in overlay to VerticalPanel-based collapsible panel
 *
 * Features:
 * - Collapsible via tab bar or Cmd+4
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 * - Loads settings on expand, manages dirty state
 */

import { VerticalPanel } from './vertical-panel.js';
import { SettingsPanel as SettingsForm } from './components/SettingsPanel.js';

const STORAGE_KEY = 'cyclist-settings-panel';

let settingsPanel = null;

/**
 * Extended VerticalPanel for Settings with form loading behavior
 */
class SettingsPanelWrapper extends VerticalPanel {
  constructor(config) {
    super(config);
    this._settingsLoaded = false;
  }

  /**
   * Called when panel expands - load settings
   */
  onExpand() {
    // Load settings when panel opens (if not already loaded)
    if (!this._settingsLoaded && SettingsForm) {
      SettingsForm.load();
      this._settingsLoaded = true;
    }
  }

  /**
   * Called when panel collapses - handle dirty state
   */
  onCollapse() {
    // If dirty, the SettingsForm component handles the confirmation dialog
    // For now, just mark as needing reload next time
    this._settingsLoaded = false;
  }
}

/**
 * Create and initialize the settings panel
 */
export function init() {
  const element = document.getElementById('settings-panel');

  if (!element) {
    console.warn('[SettingsPanel] Settings panel element not found');
    return;
  }

  settingsPanel = new SettingsPanelWrapper({
    id: 'settings-panel',
    element: element,
    storageKey: STORAGE_KEY,
    defaultWidth: 320,
    minWidth: 280,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'Settings',
    shortcut: '4',  // Cmd+4 to toggle settings
    order: 6,       // After sidebar (order 5)
  });

  settingsPanel.init();

  // Register with PanelManager
  registerWithPanelManager();

  // Initialize the settings form component
  if (SettingsForm) {
    SettingsForm.init();
    // If panel starts expanded, load themes immediately
    if (!settingsPanel.isCollapsed()) {
      SettingsForm.load();
      settingsPanel._settingsLoaded = true;
    }
  }

  console.log('[SettingsPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  // Dynamic import to avoid circular dependency
  // Use relative path for compatibility with both browser and test environments
  import('./panel-manager.js').then(PanelManager => {
    const element = document.getElementById('settings-panel');
    if (element) {
      PanelManager.default.register({
        id: 'settings-panel',
        label: 'SETTINGS',
        shortcut: '4',
        order: 6,
        element: element,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => (SettingsForm?.isDirty?.() ? 1 : 0),  // Show badge when dirty
      });
    }
  }).catch(err => {
    console.warn('[SettingsPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Collapse the settings panel
 */
export function collapse() {
  if (settingsPanel) {
    settingsPanel.collapse();
  }
}

/**
 * Expand the settings panel
 */
export function expand() {
  if (settingsPanel) {
    settingsPanel.expand();
  }
}

/**
 * Toggle settings panel collapse state
 */
export function toggle() {
  if (settingsPanel) {
    settingsPanel.toggle();
  }
}

/**
 * Check if settings panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return settingsPanel ? settingsPanel.isCollapsed() : true;
}

/**
 * Set settings panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (settingsPanel) {
    settingsPanel.setWidth(width);
  }
}

/**
 * Get current settings panel width
 * @returns {number}
 */
export function getCurrentWidth() {
  return settingsPanel ? settingsPanel.getCurrentWidth() : 320;
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
