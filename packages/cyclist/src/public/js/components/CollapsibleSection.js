/**
 * CollapsibleSection Component
 *
 * A reusable collapsible section with summary/detail views.
 * When collapsed, shows a compact summary. When expanded, shows full detail.
 *
 * Usage:
 *   import { CollapsibleSection } from './components/CollapsibleSection.js';
 *
 *   const section = CollapsibleSection.create({
 *     id: 'git-section',
 *     title: 'Repos',
 *     collapsed: true,
 *     onToggle: (isCollapsed) => console.log('Toggled:', isCollapsed),
 *   });
 *
 *   // Update content
 *   section.setSummary('<span class="badge">2 dirty</span>');
 *   section.setDetail('<div class="repo-list">...</div>');
 *
 *   // Or register to existing DOM element
 *   CollapsibleSection.register('git-section', {
 *     onToggle: (isCollapsed) => { ... }
 *   });
 */

/**
 * @typedef {Object} CollapsibleSectionOptions
 * @property {string} id - Unique identifier for the section
 * @property {string} title - Section title text
 * @property {boolean} [collapsed=true] - Initial collapsed state
 * @property {Function} [onToggle] - Callback when toggled (receives isCollapsed)
 * @property {string} [summaryContent] - Initial summary HTML
 * @property {string} [detailContent] - Initial detail HTML
 */

/**
 * @typedef {Object} CollapsibleSectionInstance
 * @property {HTMLElement} element - The root section element
 * @property {Function} toggle - Toggle collapsed state
 * @property {Function} expand - Expand the section
 * @property {Function} collapse - Collapse the section
 * @property {Function} isCollapsed - Check if collapsed
 * @property {Function} setSummary - Set summary content (HTML string or element)
 * @property {Function} setDetail - Set detail content (HTML string or element)
 * @property {Function} setTitle - Update the title
 * @property {Function} setBadge - Set badge text next to title
 */

// Registry of initialized sections
const sections = new Map();

/**
 * Create a new CollapsibleSection
 * @param {CollapsibleSectionOptions} options
 * @returns {CollapsibleSectionInstance}
 */
export function create(options) {
  const {
    id,
    title,
    collapsed = true,
    onToggle,
    summaryContent = '',
    detailContent = '',
  } = options;

  // Create DOM structure
  const section = document.createElement('section');
  section.id = id;
  section.className = `collapsible-section ${collapsed ? 'collapsed' : ''}`;

  section.innerHTML = `
    <div class="section-header">
      <span class="section-title">${title}</span>
      <span class="section-badge"></span>
      <span class="section-summary"></span>
      <button class="collapse-btn" aria-label="Toggle section">▼</button>
    </div>
    <div class="section-detail"></div>
  `;

  const header = section.querySelector('.section-header');
  const summaryEl = section.querySelector('.section-summary');
  const detailEl = section.querySelector('.section-detail');
  const badgeEl = section.querySelector('.section-badge');
  const titleEl = section.querySelector('.section-title');

  // Set initial content
  if (summaryContent) {
    summaryEl.innerHTML = summaryContent;
  }
  if (detailContent) {
    detailEl.innerHTML = detailContent;
  }

  // Toggle handler
  const handleToggle = () => {
    const isCurrentlyCollapsed = section.classList.contains('collapsed');
    section.classList.toggle('collapsed');
    const newState = !isCurrentlyCollapsed;

    if (onToggle) {
      onToggle(newState);
    }
  };

  header.addEventListener('click', handleToggle);

  // Create instance API
  const instance = {
    element: section,

    toggle() {
      handleToggle();
    },

    expand() {
      section.classList.remove('collapsed');
      if (onToggle) onToggle(false);
    },

    collapse() {
      section.classList.add('collapsed');
      if (onToggle) onToggle(true);
    },

    isCollapsed() {
      return section.classList.contains('collapsed');
    },

    setSummary(content) {
      if (typeof content === 'string') {
        summaryEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        summaryEl.innerHTML = '';
        summaryEl.appendChild(content);
      }
    },

    setDetail(content) {
      if (typeof content === 'string') {
        detailEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        detailEl.innerHTML = '';
        detailEl.appendChild(content);
      }
    },

    setTitle(text) {
      titleEl.textContent = text;
    },

    setBadge(text, className = '') {
      badgeEl.textContent = text || '';
      badgeEl.className = 'section-badge' + (className ? ` ${className}` : '');
      badgeEl.style.display = text ? '' : 'none';
    },
  };

  sections.set(id, instance);
  return instance;
}

/**
 * Register an existing DOM section element
 * Expects structure:
 *   <section id="..." class="collapsible-section">
 *     <div class="section-header">
 *       <span class="section-title">...</span>
 *       <span class="section-badge"></span>
 *       <span class="section-summary"></span>
 *       <button class="collapse-btn">▼</button>
 *     </div>
 *     <div class="section-detail">...</div>
 *   </section>
 *
 * @param {string} id - Element ID to register
 * @param {Object} [options]
 * @param {Function} [options.onToggle] - Toggle callback
 * @returns {CollapsibleSectionInstance|null}
 */
export function register(id, options = {}) {
  const section = document.getElementById(id);
  if (!section) {
    console.warn(`[CollapsibleSection] Element #${id} not found`);
    return null;
  }

  const header = section.querySelector('.section-header');
  const summaryEl = section.querySelector('.section-summary');
  const detailEl = section.querySelector('.section-detail, .section-content');
  const badgeEl = section.querySelector('.section-badge');
  const titleEl = section.querySelector('.section-title');

  if (!header) {
    console.warn(`[CollapsibleSection] #${id} missing .section-header`);
    return null;
  }

  const { onToggle } = options;

  // Toggle handler
  const handleToggle = () => {
    const isCurrentlyCollapsed = section.classList.contains('collapsed');
    section.classList.toggle('collapsed');
    const newState = !isCurrentlyCollapsed;

    if (onToggle) {
      onToggle(newState);
    }
  };

  header.addEventListener('click', handleToggle);

  // Create instance API
  const instance = {
    element: section,

    toggle() {
      handleToggle();
    },

    expand() {
      section.classList.remove('collapsed');
      if (onToggle) onToggle(false);
    },

    collapse() {
      section.classList.add('collapsed');
      if (onToggle) onToggle(true);
    },

    isCollapsed() {
      return section.classList.contains('collapsed');
    },

    setSummary(content) {
      if (!summaryEl) return;
      if (typeof content === 'string') {
        summaryEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        summaryEl.innerHTML = '';
        summaryEl.appendChild(content);
      }
    },

    setDetail(content) {
      if (!detailEl) return;
      if (typeof content === 'string') {
        detailEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        detailEl.innerHTML = '';
        detailEl.appendChild(content);
      }
    },

    setTitle(text) {
      if (titleEl) titleEl.textContent = text;
    },

    setBadge(text, className = '') {
      if (!badgeEl) return;
      badgeEl.textContent = text || '';
      badgeEl.className = 'section-badge' + (className ? ` ${className}` : '');
      badgeEl.style.display = text ? '' : 'none';
    },
  };

  sections.set(id, instance);
  return instance;
}

/**
 * Get a registered section instance
 * @param {string} id
 * @returns {CollapsibleSectionInstance|undefined}
 */
export function get(id) {
  return sections.get(id);
}

/**
 * Unregister a section
 * @param {string} id
 */
export function unregister(id) {
  sections.delete(id);
}

// Default export as namespace
export const CollapsibleSection = {
  create,
  register,
  get,
  unregister,
};

export default CollapsibleSection;
