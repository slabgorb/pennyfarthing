/**
 * Settings Section Component (Story 35-9)
 *
 * Collapsible section wrapper for organizing settings into logical groups.
 *
 * Exports:
 * - SettingsSection object with toggle and state methods
 */

/**
 * Settings Section API
 */
export const SettingsSection = {
  /**
   * Initialize all settings sections
   */
  init() {
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => {
      const header = section.querySelector('.section-header');
      if (header) {
        header.addEventListener('click', () => this.toggle(section.dataset.section));
      }
    });
  },

  /**
   * Toggle a section open/closed
   * @param {string} sectionId - The section identifier
   */
  toggle(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (!section) return;

    const isCollapsed = section.classList.contains('collapsed');
    if (isCollapsed) {
      this.expand(sectionId);
    } else {
      this.collapse(sectionId);
    }
  },

  /**
   * Expand a section
   * @param {string} sectionId
   */
  expand(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (!section) return;

    section.classList.remove('collapsed');
    section.setAttribute('aria-expanded', 'true');

    const content = section.querySelector('.section-content');
    if (content) {
      content.style.display = 'block';
    }
  },

  /**
   * Collapse a section
   * @param {string} sectionId
   */
  collapse(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (!section) return;

    section.classList.add('collapsed');
    section.setAttribute('aria-expanded', 'false');

    const content = section.querySelector('.section-content');
    if (content) {
      content.style.display = 'none';
    }
  },

  /**
   * Check if a section is expanded
   * @param {string} sectionId
   * @returns {boolean}
   */
  isExpanded(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    return section ? !section.classList.contains('collapsed') : false;
  },

  /**
   * Expand all sections
   */
  expandAll() {
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => {
      this.expand(section.dataset.section);
    });
  },

  /**
   * Collapse all sections
   */
  collapseAll() {
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => {
      this.collapse(section.dataset.section);
    });
  },
};

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SettingsSection.init());
  } else {
    SettingsSection.init();
  }
}
