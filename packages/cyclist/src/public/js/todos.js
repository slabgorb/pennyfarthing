/**
 * B-17: Todo Visualizer Module - Electron IPC client for todo list display
 *
 * Displays Claude's TodoWrite tool usage in the sidebar.
 * Updates in real-time as Claude modifies todos.
 */

/**
 * Status indicator characters
 */
const STATUS_INDICATORS = {
  completed: '✓',
  in_progress: '●',
  pending: '○',
};

/**
 * Get status indicator character for a todo status
 * @param {string} status - Todo status: 'completed' | 'in_progress' | 'pending'
 * @returns {string} The indicator character
 */
export function getStatusIndicator(status) {
  return STATUS_INDICATORS[status] || STATUS_INDICATORS.pending;
}

/**
 * Calculate progress from todos array
 * @param {Array} todos - Array of todo items
 * @returns {{completed: number, total: number}} Progress object
 */
export function calculateProgress(todos) {
  const completed = todos.filter(t => t.status === 'completed').length;
  return { completed, total: todos.length };
}

/**
 * Format progress as string "(X/Y)"
 * @param {{completed: number, total: number}} progress - Progress object
 * @returns {string} Formatted progress string
 */
export function formatProgress(progress) {
  return `(${progress.completed}/${progress.total})`;
}

/**
 * Determine if section should auto-collapse
 * @param {Array} todos - Array of todo items
 * @returns {boolean} True if section should be collapsed
 */
export function shouldAutoCollapse(todos) {
  return todos.length === 0;
}

/**
 * Create DOM elements for todos
 * @param {Array} todos - Array of todo items
 * @returns {HTMLElement[]} Array of todo item elements
 */
export function createTodoElements(todos) {
  return todos.map(todo => {
    const el = document.createElement('div');
    el.className = `todo-item todo-${todo.status}`;
    if (todo.status === 'in_progress') {
      el.classList.add('todo-in-progress');
    }
    el.dataset.status = todo.status;

    const indicator = document.createElement('span');
    indicator.className = 'todo-indicator';
    indicator.textContent = getStatusIndicator(todo.status);

    const content = document.createElement('span');
    content.className = 'todo-content';
    // Show activeForm for in-progress tasks, content for others
    content.textContent = todo.status === 'in_progress' ? todo.activeForm : todo.content;

    el.appendChild(indicator);
    el.appendChild(content);

    return el;
  });
}

/**
 * Update todos section in the UI
 * @param {Array} todos - Array of todo items from IPC
 */
export function updateTodos(todos) {
  const todoSection = document.getElementById('todo-section');
  const todoList = document.getElementById('todo-list');
  const todoProgress = document.getElementById('todo-progress');

  if (!todoSection || !todoList) return;

  // Update progress count
  const progress = calculateProgress(todos);
  if (todoProgress) {
    todoProgress.textContent = formatProgress(progress);
  }

  // Clear existing items
  todoList.innerHTML = '';

  // Create and append new items
  const elements = createTodoElements(todos);
  elements.forEach(el => todoList.appendChild(el));

  // Handle auto-collapse
  if (shouldAutoCollapse(todos)) {
    todoSection.classList.add('collapsed');
  } else {
    todoSection.classList.remove('collapsed');
  }
}

/**
 * Toggle collapse state of todo section
 */
function toggleCollapse() {
  const todoSection = document.getElementById('todo-section');
  if (todoSection) {
    todoSection.classList.toggle('collapsed');
  }
}

/**
 * Initialize todos via Electron IPC
 */
async function initTodos() {
  // Check if Electron API is available
  if (!window.electronAPI?.todos) {
    console.warn('Electron API (todos) not available');
    return;
  }

  // Get initial data
  try {
    const todos = await window.electronAPI.todos.get();
    if (todos) {
      updateTodos(todos);
    }
  } catch (err) {
    console.error('Failed to get initial todos:', err);
  }

  // Subscribe to updates from main process
  window.electronAPI.todos.onUpdate((_event, todos) => {
    updateTodos(todos);
  });

  // Set up collapse toggle handler
  const sectionHeader = document.querySelector('#todo-section .section-header');
  if (sectionHeader) {
    sectionHeader.addEventListener('click', toggleCollapse);
  }

  console.log('Todos IPC connected');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initTodos();
});
