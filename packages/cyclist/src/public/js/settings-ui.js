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
 * @property {'auto' | 'manual'} workflow.handoff_mode
 * @property {Object} display
 * @property {boolean} display.show_flow
 * @property {number} display.sidebar_width
 * @property {string} display.font_ui
 * @property {string} display.font_mono
 * @property {Object} notifications
 * @property {boolean} notifications.phase_change
 * @property {boolean} notifications.sound
 * @property {Object} pennyfarthing
 * @property {string} pennyfarthing.theme
 */

// =============================================================================
// Font Preview (Story 35-6)
// =============================================================================

/**
 * Update font preview when selection changes
 * @param {string} selectId - ID of the font select element
 */
function updateFontPreview(selectId) {
  const select = document.getElementById(selectId);
  const preview = document.getElementById(`${selectId}_preview`);
  if (select && preview) {
    const fontValue = select.value;
    preview.style.fontFamily = `"${fontValue}", ${selectId === 'font_mono' ? 'monospace' : 'sans-serif'}`;
  }
}

/**
 * Initialize font select change listeners
 */
function initFontPreviews() {
  const fontUiSelect = document.getElementById('font_ui');
  const fontMonoSelect = document.getElementById('font_mono');

  if (fontUiSelect) {
    fontUiSelect.addEventListener('change', () => updateFontPreview('font_ui'));
  }
  if (fontMonoSelect) {
    fontMonoSelect.addEventListener('change', () => updateFontPreview('font_mono'));
  }
}

// Module-level state for theme browser
let themeBrowserState = {
  themes: [],
  filteredThemes: [],
  favorites: [],  // Theme IDs marked as favorites (24-7)
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

  // Workflow settings - radio buttons for handoff_mode
  const handoffMode = settings.workflow?.handoff_mode ?? 'manual';
  const autoRadio = form.querySelector('#handoff_mode_auto');
  const manualRadio = form.querySelector('#handoff_mode_manual');
  if (autoRadio && manualRadio) {
    autoRadio.checked = handoffMode === 'auto';
    manualRadio.checked = handoffMode === 'manual';
  }

  // Display settings
  const showFlow = form.querySelector('#show_flow');
  if (showFlow) {
    showFlow.checked = settings.display?.show_flow ?? true;
  }

  const sidebarWidth = form.querySelector('#sidebar_width');
  if (sidebarWidth) {
    sidebarWidth.value = settings.display?.sidebar_width ?? 300;
  }

  // Font settings (35-6)
  const fontUi = form.querySelector('#font_ui');
  if (fontUi) {
    fontUi.value = settings.display?.font_ui ?? 'system-ui';
    updateFontPreview('font_ui');
  }

  const fontMono = form.querySelector('#font_mono');
  if (fontMono) {
    fontMono.value = settings.display?.font_mono ?? 'SF Mono';
    updateFontPreview('font_mono');
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

  // Load favorites from settings (24-7)
  const favorites = settings.pennyfarthing?.favorites ?? [];
  themeBrowserState.favorites = favorites;

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

  // Get handoff_mode from radio buttons
  const autoRadio = form.querySelector('#handoff_mode_auto');
  const handoffMode = autoRadio?.checked ? 'auto' : 'manual';

  return {
    workflow: {
      handoff_mode: handoffMode,
    },
    display: {
      show_flow: form.querySelector('#show_flow')?.checked ?? true,
      sidebar_width: parseInt(form.querySelector('#sidebar_width')?.value ?? '300', 10),
      font_ui: form.querySelector('#font_ui')?.value ?? 'system-ui',
      font_mono: form.querySelector('#font_mono')?.value ?? 'SF Mono',
    },
    notifications: {
      phase_change: form.querySelector('#phase_change')?.checked ?? true,
      sound: form.querySelector('#sound')?.checked ?? false,
    },
    pennyfarthing: {
      theme: getSelectedTheme(),
      favorites: themeBrowserState.favorites || [],
    },
  };
}

/**
 * Get default settings
 * @returns {CyclistSettings} Default settings
 */
// Export getDefaultSettings so tests can access it
export function getDefaultSettings() {
  return {
    workflow: {
      handoff_mode: 'manual',
    },
    display: {
      show_flow: true,
      sidebar_width: 300,
      font_ui: 'system-ui',
      font_mono: 'SF Mono',
    },
    notifications: {
      phase_change: true,
      sound: false,
    },
    pennyfarthing: {
      theme: 'alice-in-wonderland',
      favorites: [],
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
      // Find full theme data for preview panel
      themeBrowserState.selectedThemeData = themeBrowserState.themes.find(t => t.id === themeId) || null;
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
    onFavoriteToggle: async (themeId, isFavorite) => {
      // Update local state (24-7)
      if (isFavorite) {
        if (!themeBrowserState.favorites.includes(themeId)) {
          themeBrowserState.favorites = [...themeBrowserState.favorites, themeId];
        }
      } else {
        themeBrowserState.favorites = themeBrowserState.favorites.filter(id => id !== themeId);
      }

      // Save immediately via IPC so favorites persist
      if (window.electronAPI?.settings?.save) {
        const currentSettings = getFormValues();
        await window.electronAPI.settings.save(currentSettings);
      }

      // Re-render to show updated state
      renderThemeBrowserUI(container);
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

  // Initialize font preview listeners (35-6)
  initFontPreviews();

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
