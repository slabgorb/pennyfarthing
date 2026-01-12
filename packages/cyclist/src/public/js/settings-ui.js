/**
 * Settings UI Module (Story 24-1, 24-5)
 *
 * Handles the settings form UI logic including:
 * - Loading settings into form fields
 * - Extracting values from form fields
 * - Form submission handling
 * - Communication with main process via IPC
 * - Theme browser initialization (24-5)
 */

import {
  renderThemeBrowser,
  filterThemesBySearch,
  filterThemesByCategory,
} from './components/ThemeBrowser.js';

/**
 * @typedef {Object} CyclistSettings
 * @property {Object} workflow
 * @property {boolean} workflow.auto_handoff
 * @property {boolean} workflow.handoff_confirm
 * @property {Object} display
 * @property {boolean} display.show_flow
 * @property {boolean} display.show_ocean
 * @property {number} display.sidebar_width
 * @property {Object} notifications
 * @property {boolean} notifications.phase_change
 * @property {boolean} notifications.sound
 * @property {Object} pennyfarthing
 * @property {string} pennyfarthing.theme
 */

// Module-level state for theme browser
let themeBrowserState = {
  themes: [],
  filteredThemes: [],
  searchQuery: '',
  selectedCategory: 'All',
  selectedThemeId: null,
  isLoading: true,
};

/**
 * Load settings values into form fields
 * @param {CyclistSettings} settings - Settings object to load
 */
export function loadFormValues(settings) {
  const form = document.getElementById('settings-form');
  if (!form) return;

  // Workflow settings
  const autoHandoff = form.querySelector('#auto_handoff');
  if (autoHandoff) {
    autoHandoff.checked = settings.workflow?.auto_handoff ?? false;
  }

  const handoffConfirm = form.querySelector('#handoff_confirm');
  if (handoffConfirm) {
    handoffConfirm.checked = settings.workflow?.handoff_confirm ?? true;
  }

  // Display settings
  const showFlow = form.querySelector('#show_flow');
  if (showFlow) {
    showFlow.checked = settings.display?.show_flow ?? true;
  }

  const showOcean = form.querySelector('#show_ocean');
  if (showOcean) {
    showOcean.checked = settings.display?.show_ocean ?? false;
  }

  const sidebarWidth = form.querySelector('#sidebar_width');
  if (sidebarWidth) {
    sidebarWidth.value = settings.display?.sidebar_width ?? 300;
  }

  // Notifications settings
  const phaseChange = form.querySelector('#phase_change');
  if (phaseChange) {
    phaseChange.checked = settings.notifications?.phase_change ?? true;
  }

  const sound = form.querySelector('#sound');
  if (sound) {
    sound.checked = settings.notifications?.sound ?? false;
  }

  // Pennyfarthing settings - update hidden input and browser state
  const theme = form.querySelector('#theme');
  const themeId = settings.pennyfarthing?.theme ?? 'alice-in-wonderland';
  if (theme) {
    theme.value = themeId;
  }

  // Update browser state if themes are loaded
  if (themeBrowserState.themes.length > 0) {
    setInitialTheme(themeId);
  }
}

/**
 * Extract current form values as settings object
 * @returns {CyclistSettings} Current form values as settings object
 */
export function getFormValues() {
  const form = document.getElementById('settings-form');
  if (!form) {
    return getDefaultSettings();
  }

  return {
    workflow: {
      auto_handoff: form.querySelector('#auto_handoff')?.checked ?? false,
      handoff_confirm: form.querySelector('#handoff_confirm')?.checked ?? true,
    },
    display: {
      show_flow: form.querySelector('#show_flow')?.checked ?? true,
      show_ocean: form.querySelector('#show_ocean')?.checked ?? false,
      sidebar_width: parseInt(form.querySelector('#sidebar_width')?.value ?? '300', 10),
    },
    notifications: {
      phase_change: form.querySelector('#phase_change')?.checked ?? true,
      sound: form.querySelector('#sound')?.checked ?? false,
    },
    pennyfarthing: {
      theme: getSelectedTheme(),
    },
  };
}

/**
 * Get default settings
 * @returns {CyclistSettings} Default settings
 */
function getDefaultSettings() {
  return {
    workflow: {
      auto_handoff: false,
      handoff_confirm: true,
    },
    display: {
      show_flow: true,
      show_ocean: false,
      sidebar_width: 300,
    },
    notifications: {
      phase_change: true,
      sound: false,
    },
    pennyfarthing: {
      theme: 'alice-in-wonderland',
    },
  };
}

/**
 * Get currently selected theme from browser or hidden input
 * @returns {string} Selected theme ID
 */
export function getSelectedTheme() {
  // First check browser state
  if (themeBrowserState.selectedThemeId) {
    return themeBrowserState.selectedThemeId;
  }
  // Fall back to hidden input
  const themeInput = document.getElementById('theme');
  return themeInput?.value ?? 'alice-in-wonderland';
}

/**
 * Set the initial theme in the browser (highlight current selection)
 * @param {string} themeId - Theme ID to select
 */
export function setInitialTheme(themeId) {
  themeBrowserState.selectedThemeId = themeId;

  // Update hidden input
  const themeInput = document.getElementById('theme');
  if (themeInput) {
    themeInput.value = themeId;
  }

  // Re-render if container exists
  const container = document.getElementById('theme-browser-container');
  if (container && themeBrowserState.themes.length > 0) {
    renderThemeBrowserUI(container);
  }
}

/**
 * Load theme metadata from main process (24-5)
 * @returns {Promise<Array>} Theme metadata array
 */
export async function loadThemeMetadata() {
  if (window.electronAPI?.settings?.getThemeMetadata) {
    try {
      const themes = await window.electronAPI.settings.getThemeMetadata();
      return themes;
    } catch (err) {
      console.error('Failed to load theme metadata:', err);
      return [];
    }
  }
  return [];
}

/**
 * Render the theme browser UI
 * @param {HTMLElement} container - Container element
 */
function renderThemeBrowserUI(container) {
  renderThemeBrowser(container, themeBrowserState, {
    onSelect: (themeId) => {
      themeBrowserState.selectedThemeId = themeId;
      // Update hidden input for form submission
      const themeInput = document.getElementById('theme');
      if (themeInput) {
        themeInput.value = themeId;
      }
      // Re-render to show selection
      renderThemeBrowserUI(container);
    },
    onApply: (themeId) => {
      // Apply is handled by form submission, but we can update state
      themeBrowserState.selectedThemeId = themeId;
      const themeInput = document.getElementById('theme');
      if (themeInput) {
        themeInput.value = themeId;
      }
    },
    onCancel: () => {
      // Cancel closes the settings window
      window.close();
    },
  });
}

/**
 * Initialize the theme browser (24-5)
 * Replaces the old dropdown with a searchable browser
 */
export async function initThemeBrowser() {
  const container = document.getElementById('theme-browser-container');
  if (!container) return;

  // Show loading state
  themeBrowserState.isLoading = true;
  renderThemeBrowserUI(container);

  // Load theme metadata
  const themes = await loadThemeMetadata();

  // Update state
  themeBrowserState.themes = themes;
  themeBrowserState.filteredThemes = themes;
  themeBrowserState.isLoading = false;

  // Get current theme from hidden input
  const themeInput = document.getElementById('theme');
  if (themeInput?.value) {
    themeBrowserState.selectedThemeId = themeInput.value;
  }

  // Render browser
  renderThemeBrowserUI(container);
}

/**
 * Handle form submission
 * @param {Event} event - Submit event
 */
async function handleSubmit(event) {
  event.preventDefault();

  const settings = getFormValues();

  // Send to main process via IPC
  if (window.electronAPI?.settings?.save) {
    await window.electronAPI.settings.save(settings);
  }

  // Close the settings window
  window.close();
}

/**
 * Handle cancel button click
 */
function handleCancel() {
  window.close();
}

/**
 * Initialize the settings UI
 * Sets up event listeners and loads initial settings
 */
export async function initSettingsUI() {
  const form = document.getElementById('settings-form');
  const cancelBtn = document.getElementById('cancel-btn');

  // Set up form submission
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  // Set up cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel);
  }

  // Initialize theme browser (24-5) instead of dropdown
  await initThemeBrowser();

  // Load current settings from main process
  if (window.electronAPI?.settings?.get) {
    try {
      const settings = await window.electronAPI.settings.get();
      loadFormValues(settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
      // Use defaults on error
      loadFormValues(getDefaultSettings());
    }
  } else {
    // No IPC available (testing or web mode) - use defaults
    loadFormValues(getDefaultSettings());
  }

  // Listen for settings changes from main process
  if (window.electronAPI?.settings?.onChanged) {
    window.electronAPI.settings.onChanged((settings) => {
      loadFormValues(settings);
    });
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsUI);
  } else {
    initSettingsUI();
  }
}
