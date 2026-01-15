/**
 * Panel Manager - Centralized panel registration and coordination
 *
 * Architecture:
 * - Panels register themselves with the manager
 * - Tab bar reads from manager to render tabs
 * - 35-5: Multiple panels can be open simultaneously (no mutual exclusion)
 * - Supports different display modes (overlay, push, side-by-side)
 * - Persists state to localStorage
 *
 * Usage:
 *   import PanelManager from '/js/panel-manager.js';
 *
 *   // Register a panel
 *   PanelManager.register({
 *     id: 'diff-panel',
 *     label: 'DIFFS',
 *     shortcut: '2',  // Cmd+2
 *     order: 2,       // Tab order
 *     element: document.getElementById('diff-panel'),
 *     onOpen: () => { ... },
 *     onClose: () => { ... },
 *     getBadgeCount: () => diffCount,
 *   });
 *
 *   // Toggle a panel
 *   PanelManager.toggle('diff-panel');
 *
 *   // Listen for changes
 *   PanelManager.on('panel-changed', ({ panelId, isOpen }) => { ... });
 */

const STORAGE_KEY = 'cyclist-panel-manager';

// Display modes
export const DisplayMode = {
  OVERLAY: 'overlay',   // Panel overlays content (default)
  PUSH: 'push',         // Panel pushes content aside
  FLOAT: 'float',       // Panel floats (future)
};

// Internal state
const state = {
  panels: new Map(),       // Registered panels
  activePanel: null,       // Currently open panel ID (or null)
  displayMode: DisplayMode.OVERLAY,
  listeners: new Map(),    // Event listeners
};

/**
 * Load persisted state
 */
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.displayMode = parsed.displayMode || DisplayMode.OVERLAY;
      // Don't restore activePanel - start with all closed
      return parsed;
    }
  } catch (e) {
    console.warn('[PanelManager] Failed to load state:', e);
  }
  return {};
}

/**
 * Save state to localStorage
 */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      displayMode: state.displayMode,
      activePanel: state.activePanel,
      // Per-panel settings (width, etc) are saved by panels themselves
    }));
  } catch (e) {
    console.warn('[PanelManager] Failed to save state:', e);
  }
}

/**
 * Emit an event to listeners
 */
function emit(event, data) {
  const handlers = state.listeners.get(event) || [];
  handlers.forEach(fn => {
    try {
      fn(data);
    } catch (e) {
      console.error(`[PanelManager] Error in ${event} handler:`, e);
    }
  });
}

/**
 * Register a panel with the manager
 * @param {Object} config - Panel configuration
 * @param {string} config.id - Unique panel ID
 * @param {string} config.label - Display label for tab
 * @param {string} [config.shortcut] - Keyboard shortcut number (e.g., '1' for Cmd+1)
 * @param {number} [config.order] - Tab order (lower = first)
 * @param {HTMLElement} config.element - Panel DOM element
 * @param {Function} [config.onOpen] - Called when panel opens
 * @param {Function} [config.onClose] - Called when panel closes
 * @param {Function} [config.getBadgeCount] - Returns current badge count
 */
export function register(config) {
  if (!config.id || !config.element) {
    console.error('[PanelManager] Panel registration requires id and element');
    return;
  }

  const panel = {
    id: config.id,
    label: config.label || config.id,
    shortcut: config.shortcut || null,
    order: config.order ?? 999,
    element: config.element,
    onOpen: config.onOpen || (() => {}),
    onClose: config.onClose || (() => {}),
    getBadgeCount: config.getBadgeCount || (() => 0),
    isOpen: false,
  };

  state.panels.set(config.id, panel);
  console.log('[PanelManager] Registered panel:', config.id);

  emit('panel-registered', { panelId: config.id, panel });
}

/**
 * Unregister a panel
 */
export function unregister(panelId) {
  if (state.activePanel === panelId) {
    close(panelId);
  }
  state.panels.delete(panelId);
  emit('panel-unregistered', { panelId });
}

/**
 * Get all registered panels, sorted by order
 * @returns {Array} Sorted array of panel configs
 */
export function getPanels() {
  return Array.from(state.panels.values()).sort((a, b) => a.order - b.order);
}

/**
 * Get a specific panel
 */
export function getPanel(panelId) {
  return state.panels.get(panelId);
}

/**
 * Open a panel
 * 35-5: Changed to allow multiple panels open simultaneously (no mutual exclusion)
 */
export function open(panelId) {
  const panel = state.panels.get(panelId);
  if (!panel) {
    console.warn('[PanelManager] Unknown panel:', panelId);
    return;
  }

  // 35-5: Removed mutual exclusion - all panels can be open simultaneously
  // Each panel manages its own collapsed state independently

  // Open the requested panel
  panel.isOpen = true;
  panel.element.classList.remove('collapsed');

  // Call panel's onOpen hook
  panel.onOpen();

  saveState();
  emit('panel-changed', { panelId, isOpen: true });
  emit('panel-opened', { panelId });

  console.log('[PanelManager] Opened panel:', panelId);
}

/**
 * Close a panel
 */
export function close(panelId) {
  const panel = state.panels.get(panelId);
  if (!panel) return;

  panel.isOpen = false;
  panel.element.classList.add('collapsed');

  if (state.activePanel === panelId) {
    state.activePanel = null;
  }

  // Call panel's onClose hook
  panel.onClose();

  saveState();
  emit('panel-changed', { panelId, isOpen: false });
  emit('panel-closed', { panelId });

  console.log('[PanelManager] Closed panel:', panelId);
}

/**
 * Toggle a panel open/closed
 */
export function toggle(panelId) {
  const panel = state.panels.get(panelId);
  if (!panel) return;

  if (panel.isOpen) {
    close(panelId);
  } else {
    open(panelId);
  }
}

/**
 * Close all panels
 */
export function closeAll() {
  for (const panel of state.panels.values()) {
    if (panel.isOpen) {
      close(panel.id);
    }
  }
}

/**
 * Check if a panel is open
 */
export function isOpen(panelId) {
  const panel = state.panels.get(panelId);
  return panel ? panel.isOpen : false;
}

/**
 * Get the currently active panel ID
 */
export function getActivePanel() {
  return state.activePanel;
}

/**
 * Set display mode
 */
export function setDisplayMode(mode) {
  if (!Object.values(DisplayMode).includes(mode)) {
    console.warn('[PanelManager] Invalid display mode:', mode);
    return;
  }
  state.displayMode = mode;
  saveState();
  emit('display-mode-changed', { mode });
}

/**
 * Get current display mode
 */
export function getDisplayMode() {
  return state.displayMode;
}

/**
 * Subscribe to an event
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Unsubscribe function
 */
export function on(event, handler) {
  if (!state.listeners.has(event)) {
    state.listeners.set(event, []);
  }
  state.listeners.get(event).push(handler);

  // Return unsubscribe function
  return () => {
    const handlers = state.listeners.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  };
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboard(e) {
  // Cmd/Ctrl + number for panel shortcuts
  if (e.metaKey || e.ctrlKey) {
    for (const panel of state.panels.values()) {
      if (panel.shortcut && e.key === panel.shortcut) {
        e.preventDefault();
        toggle(panel.id);
        return;
      }
    }
  }

  // Escape to close active panel
  if (e.key === 'Escape' && state.activePanel) {
    e.preventDefault();
    close(state.activePanel);
  }
}

/**
 * Initialize the panel manager
 */
export function init() {
  loadState();

  // Set up keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  console.log('[PanelManager] Initialized');
}

// Export as default object and named exports
export default {
  DisplayMode,
  register,
  unregister,
  getPanels,
  getPanel,
  open,
  close,
  toggle,
  closeAll,
  isOpen,
  getActivePanel,
  setDisplayMode,
  getDisplayMode,
  on,
  init,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
