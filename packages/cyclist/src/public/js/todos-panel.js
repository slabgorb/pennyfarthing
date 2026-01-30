/**
 * TodosPanel - Todos as Top-Level Tab
 *
 * 68-2: Extracts todo-section from sidebar into its own
 * VerticalPanel with a TODOS tab in the tab bar.
 *
 * Features:
 * - Collapsible via tab bar click
 * - Badge shows todo progress (completed/total)
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 */

import { VerticalPanel } from './vertical-panel.js';
import {
  update as updateTodos,
  calculateProgress,
  formatProgress,
  createTodoElements,
  clearTasks,
} from './sidebar/tasks.js';

const STORAGE_KEY = 'cyclist-todos-panel';

let todosPanel = null;
let panelElement = null;
let containerElement = null;
let progressElement = null;

// Track current todos for badge count
let currentTodos = [];

/**
 * TodosPanel class extending VerticalPanel
 */
class TodosPanel extends VerticalPanel {
  constructor(config) {
    super(config);
    this._todoCount = 0;
  }

  /**
   * Get badge count (incomplete todos)
   * @returns {number}
   */
  getBadgeCount() {
    const progress = calculateProgress(currentTodos);
    // Show remaining (not completed) as badge
    return progress.total - progress.completed;
  }

  /**
   * Update badge count and notify PanelManager
   */
  updateBadgeCount() {
    const count = this.getBadgeCount();
    this._todoCount = count;
    this.setBadgeCount(count);

    // Notify PanelManager to update tab bar badge
    if (typeof window !== 'undefined' && window.PanelManager) {
      window.PanelManager.updateBadge?.('todos', count);
    }
  }
}

/**
 * Render todos into the panel container
 * @param {Array} todos - Array of todo items
 */
function renderTodos(todos) {
  if (!containerElement) return;

  containerElement.innerHTML = '';

  if (todos.length === 0) {
    containerElement.innerHTML = '<div class="todos-empty">No tasks</div>';
    return;
  }

  const elements = createTodoElements(todos);
  elements.forEach(el => containerElement.appendChild(el));
}

/**
 * Update panel display with current todos
 * @param {Array} todos - Array of todo items
 */
function updatePanelDisplay(todos) {
  currentTodos = todos || [];

  renderTodos(currentTodos);

  // Update progress text
  if (progressElement) {
    const progress = calculateProgress(currentTodos);
    progressElement.textContent = formatProgress(progress);
  }

  if (todosPanel) {
    todosPanel.updateBadgeCount();
  }
}

/**
 * Create and initialize the todos panel
 */
export function init() {
  panelElement = document.getElementById('todos-panel');

  if (!panelElement) {
    console.warn('[TodosPanel] Panel element not found');
    return;
  }

  containerElement = panelElement.querySelector('#todos-list, .todos-list');
  progressElement = panelElement.querySelector('#todos-progress, .todos-progress');

  todosPanel = new TodosPanel({
    id: 'todos',
    element: panelElement,
    storageKey: STORAGE_KEY,
    defaultWidth: 300,
    minWidth: 200,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'TODOS',
    shortcut: 't',  // Cmd+T to toggle
    order: 5,       // Before Background (6)
  });

  todosPanel.init();

  // Register with PanelManager
  registerWithPanelManager();

  // Set up Electron IPC listeners
  setupTodoListeners();

  // Get initial data
  loadInitialTodos();

  console.log('[TodosPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  import('/js/panel-manager.js').then(PanelManager => {
    if (panelElement) {
      PanelManager.default.register({
        id: 'todos',
        label: 'TODOS',
        shortcut: 't',
        order: 5,
        element: panelElement,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => todosPanel ? todosPanel.getBadgeCount() : 0,
      });

      // Sync initial state
      if (todosPanel && !todosPanel.isCollapsed()) {
        PanelManager.default.open('todos');
      }
    }
  }).catch(err => {
    console.warn('[TodosPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Set up Electron IPC listeners for todo updates
 */
function setupTodoListeners() {
  if (typeof window !== 'undefined' && window.electronAPI?.todos) {
    window.electronAPI.todos.onUpdate((_event, todos) => {
      updatePanelDisplay(todos);
    });
  }
}

/**
 * Load initial todos from Electron
 */
function loadInitialTodos() {
  if (typeof window !== 'undefined' && window.electronAPI?.todos) {
    window.electronAPI.todos.get().then(todos => {
      if (todos) {
        updatePanelDisplay(todos);
      }
    }).catch(err => {
      console.error('[TodosPanel] Failed to get initial todos:', err);
    });
  }
}

/**
 * Collapse the panel
 */
export function collapse() {
  if (todosPanel) {
    todosPanel.collapse();
  }
}

/**
 * Expand the panel
 */
export function expand() {
  if (todosPanel) {
    todosPanel.expand();
  }
}

/**
 * Toggle panel collapse state
 */
export function toggle() {
  if (todosPanel) {
    todosPanel.toggle();
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return todosPanel ? todosPanel.isCollapsed() : false;
}

/**
 * Set panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (todosPanel) {
    todosPanel.setWidth(width);
  }
}

/**
 * Get current panel width
 * @returns {number}
 */
export function getCurrentWidth() {
  return todosPanel ? todosPanel.getCurrentWidth() : 300;
}

/**
 * Clear all todos from panel (called on context clear)
 */
export function clear() {
  currentTodos = [];
  updatePanelDisplay([]);
  clearTasks(); // Also clear legacy sidebar if present
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
  clear,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
