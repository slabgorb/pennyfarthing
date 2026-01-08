/**
 * E8-1: Tab Container Component
 *
 * Renders the tab bar and content panel.
 * Handles click events, keyboard navigation, and DOM updates.
 */

import TabManager from '../tabs.js';

/**
 * Keyboard event detection helpers
 */
export function isCtrlTab(event) {
  return event.key === 'Tab' && event.ctrlKey && !event.shiftKey;
}

export function isCtrlShiftTab(event) {
  return event.key === 'Tab' && event.ctrlKey && event.shiftKey;
}

export function isCtrlW(event) {
  return event.key === 'w' && event.ctrlKey;
}

/**
 * Create tab DOM element
 * @param {Object} tab - Tab data { id, type, label, closeable }
 * @param {boolean} isActive - Whether this tab is active
 * @returns {HTMLElement} Tab element
 */
export function createTabElement(tab, isActive) {
  const el = document.createElement('div');
  el.className = 'tab';
  if (isActive) el.classList.add('active');
  el.dataset.tabId = tab.id;
  el.dataset.tabType = tab.type;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = tab.label;
  el.appendChild(label);

  if (tab.closeable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close tab (Ctrl+W)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      TabManager.removeTab(tab.id);
    });
    el.appendChild(closeBtn);
  }

  // Click to switch tabs
  el.addEventListener('click', () => {
    TabManager.setActiveTab(tab.id);
  });

  return el;
}

/**
 * Render tab bar
 * @param {Object} state - Tab state
 */
export function renderTabBar(state) {
  const tabBarTabs = document.getElementById('tab-bar-tabs');
  if (!tabBarTabs) return;

  tabBarTabs.innerHTML = '';
  for (const tab of state.tabs) {
    const el = createTabElement(tab, tab.id === state.activeTab);
    tabBarTabs.appendChild(el);
  }
}

/**
 * Render tab content
 * For E8-1, this renders placeholder content.
 * E8-2, E8-3, E8-4 will register content renderers.
 * @param {Object} state - Tab state
 */
export function renderTabContent(state) {
  const tabContent = document.getElementById('tab-content');
  if (!tabContent) return;

  if (!state.activeTab) {
    tabContent.innerHTML = '';
    return;
  }

  const activeTab = state.tabs.find(t => t.id === state.activeTab);
  if (!activeTab) {
    tabContent.innerHTML = '';
    return;
  }

  // Check for registered content renderer
  const renderer = contentRenderers[activeTab.type];
  if (renderer) {
    renderer(tabContent, activeTab);
  } else {
    // Placeholder content for E8-1
    tabContent.innerHTML = `<div class="tab-placeholder">Content for ${activeTab.type} tab: ${activeTab.label}</div>`;
  }
}

/**
 * Update panel collapse state in DOM
 * @param {Object} state - Tab state
 */
function updateCollapseState(state) {
  const tabPanel = document.getElementById('tab-panel');
  const toggleBtn = document.getElementById('tab-panel-toggle');

  if (!tabPanel) return;

  if (state.collapsed) {
    tabPanel.classList.add('collapsed');
  } else {
    tabPanel.classList.remove('collapsed');
  }

  // Update toggle button icon
  if (toggleBtn) {
    toggleBtn.textContent = state.collapsed ? '▲' : '▼';
    toggleBtn.title = state.collapsed ? 'Expand panel' : 'Collapse panel';
  }
}

/**
 * Full render of tab panel
 * @param {Object} state - Tab state
 */
export function render(state) {
  renderTabBar(state);
  renderTabContent(state);
  updateCollapseState(state);
}

/**
 * Content renderer registry
 * Other modules can register renderers for their tab types
 */
const contentRenderers = {};

/**
 * Register a content renderer for a tab type
 * @param {string} type - Tab type ('diff', 'file', 'browser')
 * @param {Function} renderer - Function(container, tab) to render content
 */
export function registerContentRenderer(type, renderer) {
  contentRenderers[type] = renderer;
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
  if (isCtrlTab(event)) {
    event.preventDefault();
    TabManager.cycleTab('forward');
  } else if (isCtrlShiftTab(event)) {
    event.preventDefault();
    TabManager.cycleTab('backward');
  } else if (isCtrlW(event)) {
    const state = TabManager.getState();
    // Only handle if we have tabs and active tab is closeable
    if (state.tabs.length > 0 && state.activeTab) {
      const activeTab = state.tabs.find(t => t.id === state.activeTab);
      if (activeTab && activeTab.closeable) {
        event.preventDefault();
        TabManager.closeActiveTab();
      }
    }
  }
}

/**
 * Initialize tab container
 */
export function init() {
  // Subscribe to state changes
  TabManager.subscribe((state) => {
    render(state);
  });

  // Set up collapse toggle
  const toggleBtn = document.getElementById('tab-panel-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      TabManager.toggleCollapse();
    });
  }

  // Set up keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Initial render
  render(TabManager.getState());

  console.log('[TabContainer] Initialized');
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded (e.g., module loaded after DOMContentLoaded)
    init();
  }
}

export default {
  init,
  render,
  renderTabBar,
  renderTabContent,
  createTabElement,
  registerContentRenderer,
  isCtrlTab,
  isCtrlShiftTab,
  isCtrlW,
};
