/**
 * Collapsed Sections Persistence
 *
 * Saves and loads collapsed section states from .pennyfarthing/config.local.yaml
 * via the settings API.
 */

// In-memory cache of collapsed states
let collapsedStates = {};

// Debounce timer for saving
let saveTimer = null;

/**
 * Load collapsed states from API
 */
async function loadCollapsedStates() {
  try {
    const response = await fetch('/api/settings/collapsed');
    if (response.ok) {
      collapsedStates = await response.json();
      applyCollapsedStates();
    }
  } catch (err) {
    console.warn('[CollapsedSections] Failed to load states:', err);
  }
}

/**
 * Apply loaded collapsed states to DOM
 */
function applyCollapsedStates() {
  for (const [sectionId, isCollapsed] of Object.entries(collapsedStates)) {
    const section = document.getElementById(sectionId);
    if (section) {
      if (isCollapsed) {
        section.classList.add('collapsed');
      } else {
        section.classList.remove('collapsed');
      }
    }
  }
}

/**
 * Save collapsed states to API (debounced)
 */
function saveCollapsedStates() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/settings/collapsed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collapsedStates),
      });
    } catch (err) {
      console.warn('[CollapsedSections] Failed to save states:', err);
    }
  }, 500); // Debounce 500ms
}

/**
 * Set collapsed state for a section
 * @param {string} sectionId - The section element ID
 * @param {boolean} isCollapsed - Whether the section is collapsed
 */
function setCollapsed(sectionId, isCollapsed) {
  collapsedStates[sectionId] = isCollapsed;
  saveCollapsedStates();
}

/**
 * Toggle collapsed state for a section
 * @param {string} sectionId - The section element ID
 * @returns {boolean} New collapsed state
 */
function toggleCollapsed(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return false;

  const isCollapsed = section.classList.toggle('collapsed');
  setCollapsed(sectionId, isCollapsed);
  return isCollapsed;
}

/**
 * Initialize a collapsible section with persistence
 * @param {string} sectionId - The section element ID
 */
function initCollapsibleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  const header = section.querySelector('.section-header');
  if (!header) return;

  // Set up click handler on header (or just collapse button)
  const collapseBtn = header.querySelector('.collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCollapsed(sectionId);
    });
  } else {
    // No dedicated button, whole header toggles
    header.addEventListener('click', () => {
      toggleCollapsed(sectionId);
    });
  }
}

/**
 * Initialize all collapsible sections and load saved states
 */
async function initCollapsedSections() {
  // Load saved states first
  await loadCollapsedStates();

  // Find all collapsible sections and set up handlers
  const sections = document.querySelectorAll('.collapsible-section');
  sections.forEach((section) => {
    if (section.id) {
      initCollapsibleSection(section.id);
    }
  });

  console.log('[CollapsedSections] Initialized', sections.length, 'sections');
}

// Export for external use
window.collapsedSections = {
  init: initCollapsedSections,
  load: loadCollapsedStates,
  save: saveCollapsedStates,
  set: setCollapsed,
  toggle: toggleCollapsed,
  initSection: initCollapsibleSection,
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCollapsedSections);
} else {
  initCollapsedSections();
}
