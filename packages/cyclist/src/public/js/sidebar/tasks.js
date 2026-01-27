/**
 * Tasks Module - Todo list display from Claude's TodoWrite
 *
 * HTML elements:
 * - #todo-section - Section container (collapsible)
 * - #todo-list - Todo items list
 * - #todo-progress - Progress indicator (X/Y)
 */

/**
 * Status indicator characters
 */
const STATUS_INDICATORS = {
  completed: '\u2713',   // checkmark
  in_progress: '\u25CF', // filled circle
  pending: '\u25CB',     // empty circle
};

/**
 * Get status indicator character
 * @param {string} status - Todo status
 * @returns {string} Indicator character
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
 * @returns {boolean} True if should collapse
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
    content.textContent = todo.status === 'in_progress' ? todo.activeForm : todo.content;

    el.appendChild(indicator);
    el.appendChild(content);

    return el;
  });
}

/**
 * Update todos section in the UI
 * @param {Array} todos - Array of todo items
 */
export function update(todos) {
  const todoSection = document.getElementById('todo-section');
  const todoList = document.getElementById('todo-list');
  const todoProgress = document.getElementById('todo-progress');

  if (!todoSection || !todoList) return;

  const progress = calculateProgress(todos);
  if (todoProgress) {
    todoProgress.textContent = formatProgress(progress);
  }

  todoList.innerHTML = '';

  const elements = createTodoElements(todos);
  elements.forEach(el => todoList.appendChild(el));

  if (shouldAutoCollapse(todos)) {
    todoSection.classList.add('collapsed');
  } else {
    todoSection.classList.remove('collapsed');
  }
}

/**
 * Toggle collapse state
 */
function toggleCollapse() {
  const todoSection = document.getElementById('todo-section');
  if (todoSection) {
    todoSection.classList.toggle('collapsed');
  }
}

/**
 * Initialize tasks module
 */
export function init() {
  // Check if Electron API is available
  if (!window.electronAPI?.todos) {
    console.warn('[Tasks] Electron API (todos) not available');
    return;
  }

  // Get initial data
  window.electronAPI.todos.get().then(todos => {
    if (todos) {
      update(todos);
    }
  }).catch(err => {
    console.error('[Tasks] Failed to get initial todos:', err);
  });

  // Subscribe to updates
  window.electronAPI.todos.onUpdate((_event, todos) => {
    update(todos);
  });

  // Set up collapse toggle handler
  const sectionHeader = document.querySelector('#todo-section .section-header');
  if (sectionHeader) {
    sectionHeader.addEventListener('click', toggleCollapse);
  }

  console.log('[Tasks] Module initialized');
}

/**
 * Cleanup tasks module
 */
export function destroy() {
  const sectionHeader = document.querySelector('#todo-section .section-header');
  if (sectionHeader) {
    sectionHeader.removeEventListener('click', toggleCollapse);
  }
}

// Legacy exports
export const updateTodos = update;
