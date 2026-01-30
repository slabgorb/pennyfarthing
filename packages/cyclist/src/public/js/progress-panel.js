/**
 * ProgressPanel - Combined Todos + BikeLane as Top-Level Tab
 *
 * 68-2/68-4: Combines todo progress tracking with workflow (bikelane)
 * visualization in a single PROGRESS panel.
 *
 * Features:
 * - Collapsible via tab bar click
 * - Badge shows incomplete todo count
 * - BikeLane workflow visualization at top
 * - Todo list below workflow
 * - Persists collapse state to localStorage
 * - Integrates with PanelManager for tab bar display
 */

import { VerticalPanel } from './vertical-panel.js';
import {
  calculateProgress,
  formatProgress,
  createTodoElements,
  clearTasks,
} from './sidebar/tasks.js';
import {
  update as updateBikelane,
  renderPhaseProgress,
  formatWorkflowType,
} from './sidebar/bikelane.js';

const STORAGE_KEY = 'cyclist-progress-panel';

let progressPanel = null;
let panelElement = null;
let todosContainer = null;
let bikelaneContainer = null;
let progressCountElement = null;

// Track current state
let currentTodos = [];
let currentWorkflow = null;

/**
 * ProgressPanel class extending VerticalPanel
 */
class ProgressPanel extends VerticalPanel {
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
      window.PanelManager.updateBadge?.('progress', count);
    }
  }
}

/**
 * Render todos into the panel container
 * @param {Array} todos - Array of todo items
 */
function renderTodos(todos) {
  if (!todosContainer) return;

  todosContainer.innerHTML = '';

  if (todos.length === 0) {
    todosContainer.innerHTML = '<div class="todos-empty">No tasks</div>';
    return;
  }

  const elements = createTodoElements(todos);
  elements.forEach(el => todosContainer.appendChild(el));
}

/**
 * Render bikelane workflow visualization
 * @param {Object|null} workflow - Workflow data
 */
function renderWorkflow(workflow) {
  if (!bikelaneContainer) return;

  if (!workflow) {
    bikelaneContainer.style.display = 'none';
    return;
  }

  bikelaneContainer.style.display = '';

  // Update workflow type badge
  const badge = bikelaneContainer.querySelector('.workflow-type-badge');
  if (badge) {
    badge.textContent = formatWorkflowType(workflow.type);
    badge.setAttribute('data-workflow-type', workflow.type || '');
  }

  // Update phase progress visualization
  const progress = bikelaneContainer.querySelector('.phase-progress');
  if (progress) {
    progress.innerHTML = renderPhaseProgress(workflow.phases);
  }
}

/**
 * Update panel display with current todos
 * @param {Array} todos - Array of todo items
 */
export function updateTodosDisplay(todos) {
  currentTodos = todos || [];

  renderTodos(currentTodos);

  // Update progress text
  if (progressCountElement) {
    const progress = calculateProgress(currentTodos);
    progressCountElement.textContent = formatProgress(progress);
  }

  if (progressPanel) {
    progressPanel.updateBadgeCount();
  }
}

/**
 * Update panel display with workflow data
 * @param {Object|null} workflow - Workflow data
 */
export function updateWorkflowDisplay(workflow) {
  currentWorkflow = workflow;
  renderWorkflow(currentWorkflow);
}

/**
 * Create and initialize the progress panel
 */
export function init() {
  panelElement = document.getElementById('progress-panel');

  if (!panelElement) {
    console.warn('[ProgressPanel] Panel element not found');
    return;
  }

  todosContainer = panelElement.querySelector('#todos-list, .todos-list');
  bikelaneContainer = panelElement.querySelector('#bikelane-container, .bikelane-container');
  progressCountElement = panelElement.querySelector('#progress-count, .progress-count');

  progressPanel = new ProgressPanel({
    id: 'progress',
    element: panelElement,
    storageKey: STORAGE_KEY,
    defaultWidth: 300,
    minWidth: 200,
    position: 'right',
    resizable: true,
    collapsible: true,
    label: 'PROGRESS',
    shortcut: 'p',  // Cmd+P to toggle (progress)
    order: 5,       // Before Background (6)
  });

  progressPanel.init();

  // Register with PanelManager
  registerWithPanelManager();

  // Set up Electron IPC listeners
  setupListeners();

  // Get initial data
  loadInitialData();

  console.log('[ProgressPanel] Initialized');
}

/**
 * Register with PanelManager for tab bar integration
 */
function registerWithPanelManager() {
  import('/js/panel-manager.js').then(PanelManager => {
    if (panelElement) {
      PanelManager.default.register({
        id: 'progress',
        label: 'PROGRESS',
        shortcut: 'p',
        order: 5,
        element: panelElement,
        onOpen: () => expand(),
        onClose: () => collapse(),
        getBadgeCount: () => progressPanel ? progressPanel.getBadgeCount() : 0,
      });

      // Sync initial state
      if (progressPanel && !progressPanel.isCollapsed()) {
        PanelManager.default.open('progress');
      }
    }
  }).catch(err => {
    console.warn('[ProgressPanel] Could not register with PanelManager:', err);
  });
}

/**
 * Set up Electron IPC listeners for updates
 */
function setupListeners() {
  if (typeof window !== 'undefined') {
    // Todo updates
    if (window.electronAPI?.todos) {
      window.electronAPI.todos.onUpdate((_event, todos) => {
        updateTodosDisplay(todos);
      });
    }

    // Story updates (contains workflow data)
    if (window.electronAPI?.story) {
      window.electronAPI.story.onUpdate((_event, data) => {
        if (data?.workflow) {
          updateWorkflowDisplay(data.workflow);
        }
      });
    }
  }
}

/**
 * Load initial data from Electron
 */
function loadInitialData() {
  if (typeof window !== 'undefined') {
    // Load initial todos
    if (window.electronAPI?.todos) {
      window.electronAPI.todos.get().then(todos => {
        if (todos) {
          updateTodosDisplay(todos);
        }
      }).catch(err => {
        console.error('[ProgressPanel] Failed to get initial todos:', err);
      });
    }

    // Load initial story/workflow data
    if (window.electronAPI?.story) {
      window.electronAPI.story.get().then(data => {
        if (data?.workflow) {
          updateWorkflowDisplay(data.workflow);
        }
      }).catch(err => {
        console.error('[ProgressPanel] Failed to get initial story:', err);
      });
    }
  }
}

/**
 * Collapse the panel
 */
export function collapse() {
  if (progressPanel) {
    progressPanel.collapse();
  }
}

/**
 * Expand the panel
 */
export function expand() {
  if (progressPanel) {
    progressPanel.expand();
  }
}

/**
 * Toggle panel collapse state
 */
export function toggle() {
  if (progressPanel) {
    progressPanel.toggle();
  }
}

/**
 * Check if panel is collapsed
 * @returns {boolean}
 */
export function isCollapsed() {
  return progressPanel ? progressPanel.isCollapsed() : false;
}

/**
 * Set panel width
 * @param {number} width
 */
export function setWidth(width) {
  if (progressPanel) {
    progressPanel.setWidth(width);
  }
}

/**
 * Get current panel width
 * @returns {number}
 */
export function getCurrentWidth() {
  return progressPanel ? progressPanel.getCurrentWidth() : 300;
}

/**
 * Clear all data from panel (called on context clear)
 */
export function clear() {
  currentTodos = [];
  currentWorkflow = null;
  updateTodosDisplay([]);
  updateWorkflowDisplay(null);
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
  updateTodosDisplay,
  updateWorkflowDisplay,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
