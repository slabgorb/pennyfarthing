/**
 * E8-1: Tab State Management
 *
 * Manages tab state for the tabbed workspace panel.
 * Handles tab CRUD operations, cycling, and localStorage persistence.
 */

const STORAGE_KEY = 'cyclist-tabs';

/**
 * Initial empty state
 */
const initialState = {
  tabs: [],
  activeTab: null,
  collapsed: true,
};

/**
 * Add a tab to state
 * @param {Object} state - Current tab state
 * @param {Object} tab - Tab to add { id, type, label, closeable, data? }
 * @returns {Object} New state
 */
export function addTab(state, tab, options = {}) {
  const { expand = false } = options;

  // Check for duplicate - switch to existing tab instead
  if (state.tabs.find(t => t.id === tab.id)) {
    return { ...state, activeTab: tab.id, collapsed: expand ? false : state.collapsed };
  }

  const newTabs = [...state.tabs, tab];
  return {
    tabs: newTabs,
    activeTab: tab.id,
    collapsed: expand ? false : state.collapsed, // Only expand if explicitly requested
  };
}

/**
 * Remove a tab from state
 * @param {Object} state - Current tab state
 * @param {string} tabId - ID of tab to remove
 * @returns {Object} New state
 */
export function removeTab(state, tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab || !tab.closeable) {
    return state;
  }

  const newTabs = state.tabs.filter(t => t.id !== tabId);
  let newActiveTab = state.activeTab;

  // Handle active tab switching when removing active tab
  if (state.activeTab === tabId) {
    const removedIndex = state.tabs.findIndex(t => t.id === tabId);
    if (newTabs.length > 0) {
      // Switch to next tab, or previous if at end
      newActiveTab = newTabs[Math.min(removedIndex, newTabs.length - 1)].id;
    } else {
      newActiveTab = null;
    }
  }

  return {
    tabs: newTabs,
    activeTab: newActiveTab,
    collapsed: newTabs.length === 0, // Collapse when empty
  };
}

/**
 * Set active tab
 * @param {Object} state - Current tab state
 * @param {string} tabId - ID of tab to activate
 * @returns {Object} New state
 */
export function setActiveTab(state, tabId) {
  if (state.activeTab === tabId) return state;
  if (!state.tabs.find(t => t.id === tabId)) return state;

  return {
    ...state,
    activeTab: tabId,
    // Keep current collapsed state - don't auto-expand
  };
}

/**
 * Get next tab id for cycling
 * @param {Object} state - Current tab state
 * @param {'forward' | 'backward'} direction - Cycle direction
 * @returns {string | null} Next tab ID or null
 */
export function getNextTabId(state, direction) {
  if (state.tabs.length === 0) return null;
  if (state.tabs.length === 1) return state.tabs[0].id;

  const currentIndex = state.tabs.findIndex(t => t.id === state.activeTab);
  if (currentIndex === -1) return state.tabs[0].id;

  let nextIndex;
  if (direction === 'forward') {
    nextIndex = (currentIndex + 1) % state.tabs.length;
  } else {
    nextIndex = (currentIndex - 1 + state.tabs.length) % state.tabs.length;
  }

  return state.tabs[nextIndex].id;
}

/**
 * Close active tab (convenience function)
 * @param {Object} state - Current tab state
 * @returns {Object} New state
 */
export function closeActiveTab(state) {
  if (!state.activeTab) return state;
  return removeTab(state, state.activeTab);
}

/**
 * Toggle collapse state
 * @param {Object} state - Current tab state
 * @returns {Object} New state
 */
export function toggleCollapse(state) {
  // Cannot expand when no tabs
  if (state.tabs.length === 0) return state;
  return { ...state, collapsed: !state.collapsed };
}

/**
 * Save state to localStorage
 * @param {Object} state - Tab state to save
 */
export function saveTabState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save tab state:', e);
  }
}

/**
 * Load state from localStorage
 * @returns {Object} Loaded state or initial state
 */
export function loadTabState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...initialState };

    const parsed = JSON.parse(saved);
    return {
      tabs: parsed.tabs || [],
      activeTab: parsed.activeTab ?? null,
      collapsed: true, // Always start collapsed - don't persist expand state
    };
  } catch {
    return { ...initialState };
  }
}

/**
 * Initialize tab state (load and validate)
 * Always starts collapsed regardless of saved state
 * @returns {Object} Validated state
 */
export function initTabState() {
  const state = loadTabState();
  // Always start collapsed - user can expand if needed
  state.collapsed = true;

  // Validate activeTab exists in tabs
  if (state.activeTab && !state.tabs.find(t => t.id === state.activeTab)) {
    return {
      ...state,
      activeTab: state.tabs.length > 0 ? state.tabs[0].id : null,
    };
  }

  return state;
}

/**
 * TabManager - Singleton manager for tab state
 * Wraps pure functions with stateful management and event dispatching
 */
export const TabManager = {
  _state: null,
  _listeners: [],

  /**
   * Get current state
   */
  getState() {
    if (!this._state) {
      this._state = initTabState();
    }
    return this._state;
  },

  /**
   * Update state and notify listeners
   */
  _setState(newState) {
    this._state = newState;
    saveTabState(newState);
    this._notify();
  },

  /**
   * Subscribe to state changes
   */
  subscribe(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  },

  /**
   * Notify all listeners
   */
  _notify() {
    for (const listener of this._listeners) {
      listener(this._state);
    }
  },

  /**
   * Add a tab
   * @param {Object} tab - Tab to add
   * @param {Object} options - Options { expand: boolean }
   */
  addTab(tab, options) {
    this._setState(addTab(this.getState(), tab, options));
  },

  /**
   * Remove a tab
   */
  removeTab(tabId) {
    this._setState(removeTab(this.getState(), tabId));
  },

  /**
   * Set active tab
   */
  setActiveTab(tabId) {
    this._setState(setActiveTab(this.getState(), tabId));
  },

  /**
   * Cycle to next/previous tab
   */
  cycleTab(direction) {
    const nextId = getNextTabId(this.getState(), direction);
    if (nextId) {
      this.setActiveTab(nextId);
    }
  },

  /**
   * Close active tab
   */
  closeActiveTab() {
    this._setState(closeActiveTab(this.getState()));
  },

  /**
   * Toggle collapse
   */
  toggleCollapse() {
    this._setState(toggleCollapse(this.getState()));
  },

  /**
   * Reset state (for testing/clearing)
   */
  reset() {
    this._state = { ...initialState };
    localStorage.removeItem(STORAGE_KEY);
    this._notify();
  },
};

export default TabManager;
