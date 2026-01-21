/**
 * MessagePanel - Collapsible message view panel (center)
 *
 * 35-5: Wraps the message view in a VerticalPanel for consistent panel behavior
 *
 * Features:
 * - Collapsible via Cmd+4 keyboard shortcut
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 * - Safety: Cannot be collapsed if it's the last visible panel
 */

import { VerticalPanel } from './vertical-panel.js';
// MSSCI-11946: settings-sync import for cross-tab persistence (via VerticalPanel)
import { settingsSync } from './settings-sync.js';

const STORAGE_KEY = 'cyclist-message-panel';

let messagePanel = null;

/**
 * Create and initialize the message panel
 */
export function init() {
  const element = document.getElementById('message-panel');

  if (!element) {
    console.warn('[MessagePanel] Message panel element not found');
    return;
  }

  messagePanel = new VerticalPanel({
    id: 'message-panel',
    element: element,
    storageKey: STORAGE_KEY,
    defaultWidth: 600,
    minWidth: 400,
    position: 'center',
    resizable: false,  // Center panel doesn't resize - it fills remaining space
    collapsible: true,
    label: 'Message',
    shortcut: '4',
    order: 4,
  });

  messagePanel.init();

  // Register with PanelManager
  registerWithPanelManager();

  console.log('[MessagePanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  // Dynamic import to avoid circular dependency
  import('/js/panel-manager.js').then(PanelManager => {
    const element = document.getElementById('message-panel');
    if (element) {
      PanelManager.default.register({
        id: 'message-panel',
        label: 'MESSAGE',
        shortcut: '4',
        order: 4,
        element: element,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => 0,
      });
    }
  }).catch(err => {
    console.warn('[MessagePanel] Could not register with PanelManager:', err);
  });
}

/**
 * Collapse the message panel
 */
export function collapse() {
  if (messagePanel) {
    messagePanel.collapse();
  }
}

/**
 * Expand the message panel
 */
export function expand() {
  if (messagePanel) {
    messagePanel.expand();
  }
}

/**
 * Toggle message panel collapse state
 */
export function toggle() {
  if (messagePanel) {
    messagePanel.toggle();
  }
}

/**
 * Check if message panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return messagePanel ? messagePanel.isCollapsed() : false;
}

// Export for external use
export default {
  init,
  collapse,
  expand,
  toggle,
  isCollapsed,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
