/**
 * Settings Panel Form Component (Story 35-9)
 *
 * Settings form with loading states, error states, dirty tracking, and save/cancel.
 * Now works as content inside a VerticalPanel (managed by settings-panel.js).
 *
 * Architecture:
 * - IPC primary, HTTP fallback (no localStorage)
 * - 4 sections: Display, Fonts, Notifications, Advanced
 * - Visibility managed by VerticalPanel wrapper (settings-panel.js)
 *
 * Exports:
 * - SettingsPanel object with all methods
 * - DEFAULT_SETTINGS constant
 * - validateSidebarWidth function
 * - isIPCAvailable function
 * - MIN_LOADING_DURATION constant
 */

// Default settings for reset functionality
export const DEFAULT_SETTINGS = {
  workflow: {
    handoff_mode: 'manual',
  },
  display: {
    show_flow: true,
    show_ocean: false,
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

// Minimum loading duration to prevent flash (ms)
export const MIN_LOADING_DURATION = 150;

// Module state (visibility now managed by VerticalPanel wrapper)
let isDirtyState = false;
let initialSettings = null;
let currentSettings = null;
let isLoadingState = false;
let isSavingState = false;

/**
 * Check if IPC is available (Electron environment)
 * @returns {boolean}
 */
export function isIPCAvailable() {
  return !!(typeof window !== 'undefined' && window.electronAPI?.settings);
}

/**
 * Validate sidebar width value
 * @param {number} value - The sidebar width value to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSidebarWidth(value) {
  const num = Number(value);
  if (isNaN(num) || num < 200 || num > 500) {
    return {
      valid: false,
      error: 'Must be between 200 and 500',
    };
  }
  return { valid: true };
}

/**
 * Settings Panel API
 */
export const SettingsPanel = {
  /**
   * Initialize the settings panel form
   * Sets up event listeners for form controls (visibility managed by VerticalPanel)
   */
  init() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    // Wire up cancel button (resets form to initial values)
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancel());
    }

    // Wire up save button
    const saveBtn = panel.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.save());
    }

    // Wire up retry button
    const retryBtn = panel.querySelector('.settings-retry, .retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.load());
    }

    // Wire up use defaults button
    const useDefaultsBtn = panel.querySelector('[data-action="use-defaults"]');
    if (useDefaultsBtn) {
      useDefaultsBtn.addEventListener('click', () => this.useDefaults());
    }

    // Wire up reset button
    const resetBtn = panel.querySelector('[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.showResetConfirmation());
    }

    // Wire up form inputs for dirty tracking
    this.setupDirtyTracking();
  },

  /**
   * Setup dirty tracking on form inputs
   */
  setupDirtyTracking() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    const inputs = panel.querySelectorAll('input, select');
    inputs.forEach((input) => {
      input.addEventListener('change', () => this.checkDirty());
      input.addEventListener('input', () => this.checkDirty());
    });
  },

  /**
   * Check if form is dirty and update indicator
   */
  checkDirty() {
    const current = this.getFormValues();
    isDirtyState = JSON.stringify(current) !== JSON.stringify(initialSettings);
    this.updateDirtyIndicator();
    return isDirtyState;
  },

  /**
   * Cancel changes and reset form to initial values
   */
  cancel() {
    if (initialSettings) {
      this.populateForm(initialSettings);
      isDirtyState = false;
      this.updateDirtyIndicator();
    }
  },

  /**
   * Check if form has unsaved changes
   * @returns {boolean}
   */
  isDirty() {
    return isDirtyState;
  },

  /**
   * Check if settings are currently loading
   * @returns {boolean}
   */
  isLoading() {
    return isLoadingState;
  },

  /**
   * Check if settings are currently being saved
   * @returns {boolean}
   */
  isSaving() {
    return isSavingState;
  },

  /**
   * Update the dirty indicator in the panel header
   */
  updateDirtyIndicator() {
    const title = document.querySelector('.settings-title, #settings-title');
    if (title) {
      if (isDirtyState) {
        if (!title.textContent.endsWith('*')) {
          title.textContent = title.textContent + '*';
        }
      } else {
        title.textContent = title.textContent.replace(/\*$/, '');
      }
    }

    // Enable/disable save button
    const saveBtn = document.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.disabled = !isDirtyState;
    }

    // Dispatch dirty event
    const panel = document.getElementById('settings-panel');
    if (panel) {
      panel.dispatchEvent(new CustomEvent('settings:dirty', { detail: { dirty: isDirtyState } }));
    }
  },

  /**
   * Show loading state
   */
  showLoading() {
    isLoadingState = true;
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    const loading = panel.querySelector('.settings-loading');
    const form = panel.querySelector('.settings-form');
    const error = panel.querySelector('.settings-error');

    if (loading) loading.classList.remove('hidden');
    if (form) form.classList.add('hidden');
    if (error) error.classList.add('hidden');

    // Set aria-busy
    panel.setAttribute('aria-busy', 'true');
  },

  /**
   * Hide loading state
   */
  hideLoading() {
    isLoadingState = false;
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    const loading = panel.querySelector('.settings-loading');
    const form = panel.querySelector('.settings-form');

    if (loading) loading.classList.add('hidden');
    if (form) form.classList.remove('hidden');

    // Clear aria-busy
    panel.setAttribute('aria-busy', 'false');
  },

  /**
   * Show error state
   * @param {string} message - Error message to display
   */
  showError(message) {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    const loading = panel.querySelector('.settings-loading');
    const form = panel.querySelector('.settings-form');
    const error = panel.querySelector('.settings-error');
    const errorText = panel.querySelector('.error-text');

    if (loading) loading.classList.add('hidden');
    if (form) form.classList.add('hidden');
    if (error) error.classList.remove('hidden');
    if (errorText) errorText.textContent = message;

    // Clear aria-busy
    panel.setAttribute('aria-busy', 'false');
  },

  /**
   * Load settings via IPC (primary)
   * @returns {Promise<object|null>}
   */
  async loadViaIPC() {
    if (!isIPCAvailable()) return null;

    try {
      const settings = await window.electronAPI.settings.get();
      return settings;
    } catch (err) {
      console.error('IPC settings load failed:', err);
      return null;
    }
  },

  /**
   * Load settings via HTTP API (fallback)
   * @returns {Promise<object|null>}
   */
  async loadViaHTTP() {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error('HTTP settings load failed:', err);
      return null;
    }
  },

  /**
   * Load settings from backend
   */
  async load() {
    this.showLoading();

    const startTime = Date.now();

    // Try IPC first, then HTTP fallback
    let settings = null;
    if (isIPCAvailable()) {
      settings = await this.loadViaIPC();
    }
    if (!settings) {
      settings = await this.loadViaHTTP();
    }

    // Ensure minimum loading duration
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_LOADING_DURATION) {
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DURATION - elapsed));
    }

    if (settings) {
      initialSettings = JSON.parse(JSON.stringify(settings));
      currentSettings = settings;
      this.populateForm(settings);
      this.hideLoading();
      isDirtyState = false;
      this.updateDirtyIndicator();
    } else {
      this.showError('Failed to load settings');
    }
  },

  /**
   * Use default settings (when load fails)
   */
  useDefaults() {
    initialSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.populateForm(DEFAULT_SETTINGS);
    this.hideLoading();

    // Hide error state
    const error = document.querySelector('.settings-error');
    if (error) error.classList.add('hidden');

    const form = document.querySelector('.settings-form');
    if (form) form.classList.remove('hidden');

    isDirtyState = false;
    this.updateDirtyIndicator();
  },

  /**
   * Populate form with settings values
   * @param {object} settings
   */
  populateForm(settings) {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    // Display settings
    const showFlow = panel.querySelector('#show_flow');
    if (showFlow) showFlow.checked = settings.display?.show_flow ?? DEFAULT_SETTINGS.display.show_flow;

    const showOcean = panel.querySelector('#show_ocean');
    if (showOcean) showOcean.checked = settings.display?.show_ocean ?? DEFAULT_SETTINGS.display.show_ocean;

    const sidebarWidth = panel.querySelector('#sidebar_width');
    if (sidebarWidth) sidebarWidth.value = settings.display?.sidebar_width ?? DEFAULT_SETTINGS.display.sidebar_width;

    // Font settings
    const fontUi = panel.querySelector('#font_ui');
    if (fontUi) fontUi.value = settings.display?.font_ui ?? DEFAULT_SETTINGS.display.font_ui;

    const fontMono = panel.querySelector('#font_mono');
    if (fontMono) fontMono.value = settings.display?.font_mono ?? DEFAULT_SETTINGS.display.font_mono;

    // Notification settings
    const phaseChange = panel.querySelector('#phase_change');
    if (phaseChange) phaseChange.checked = settings.notifications?.phase_change ?? DEFAULT_SETTINGS.notifications.phase_change;

    const sound = panel.querySelector('#sound');
    if (sound) sound.checked = settings.notifications?.sound ?? DEFAULT_SETTINGS.notifications.sound;
  },

  /**
   * Get current form values
   * @returns {object}
   */
  getFormValues() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return {};

    return {
      display: {
        show_flow: panel.querySelector('#show_flow')?.checked ?? DEFAULT_SETTINGS.display.show_flow,
        show_ocean: panel.querySelector('#show_ocean')?.checked ?? DEFAULT_SETTINGS.display.show_ocean,
        sidebar_width: parseInt(panel.querySelector('#sidebar_width')?.value, 10) || DEFAULT_SETTINGS.display.sidebar_width,
        font_ui: panel.querySelector('#font_ui')?.value ?? DEFAULT_SETTINGS.display.font_ui,
        font_mono: panel.querySelector('#font_mono')?.value ?? DEFAULT_SETTINGS.display.font_mono,
      },
      notifications: {
        phase_change: panel.querySelector('#phase_change')?.checked ?? DEFAULT_SETTINGS.notifications.phase_change,
        sound: panel.querySelector('#sound')?.checked ?? DEFAULT_SETTINGS.notifications.sound,
      },
    };
  },

  /**
   * Validate all form fields
   * @returns {{valid: boolean, errors: object}}
   */
  validate() {
    const values = this.getFormValues();
    const errors = {};

    // Validate sidebar width
    const sidebarResult = validateSidebarWidth(values.display.sidebar_width);
    if (!sidebarResult.valid) {
      errors.sidebar_width = sidebarResult.error;
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },

  /**
   * Show validation errors in the form
   * @param {object} errors - Map of field name to error message
   */
  showValidationErrors(errors) {
    // Clear existing errors
    document.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    document.querySelectorAll('.validation-error').forEach((el) => el.remove());

    // Show new errors
    for (const [field, message] of Object.entries(errors)) {
      const input = document.getElementById(field);
      if (input) {
        input.classList.add('has-error');
        input.setAttribute('aria-invalid', 'true');

        // Import and show ValidationMessage
        import('./ValidationMessage.js').then(({ ValidationMessage }) => {
          ValidationMessage.show(input, message);
        });
      }
    }
  },

  /**
   * Save settings
   * @returns {Promise<boolean>} Success status
   */
  async save() {
    // Validate first
    const validation = this.validate();
    if (!validation.valid) {
      this.showValidationErrors(validation.errors);
      return false;
    }

    isSavingState = true;
    const values = this.getFormValues();

    try {
      // Try IPC first, then HTTP
      if (isIPCAvailable()) {
        await window.electronAPI.settings.save(values);
      } else {
        const response = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }

      // Update initial settings (no longer dirty)
      initialSettings = JSON.parse(JSON.stringify(values));
      isDirtyState = false;
      this.updateDirtyIndicator();

      // Dispatch save event
      const panel = document.getElementById('settings-panel');
      if (panel) {
        panel.dispatchEvent(new CustomEvent('settings:save', { detail: values }));
      }

      return true;
    } catch (err) {
      console.error('Settings save failed:', err);
      this.showSaveError();
      return false;
    } finally {
      isSavingState = false;
    }
  },

  /**
   * Show save error toast
   */
  async showSaveError() {
    const { Toast } = await import('./Toast.js');
    Toast.show({
      message: 'Failed to save settings',
      type: 'error',
      action: {
        label: 'Retry',
        onClick: () => this.save(),
      },
    });
  },

  /**
   * Show reset confirmation dialog
   */
  async showResetConfirmation() {
    const { ConfirmDialog } = await import('./ConfirmDialog.js');
    const result = await ConfirmDialog.show({
      title: 'Reset to Defaults?',
      message: 'This will restore all settings to their original values:\n\n• Display: Show TDD Flow, 300px sidebar\n• Fonts: System defaults\n• Notifications: Phase changes only\n\nThis cannot be undone.',
      buttons: [
        { label: 'Cancel', value: 'cancel', variant: 'secondary' },
        { label: 'Reset', value: 'reset', variant: 'danger' },
      ],
    });

    if (result === 'reset') {
      this.resetToDefaults();
    }
  },

  /**
   * Reset form to default values
   */
  resetToDefaults() {
    this.populateForm(DEFAULT_SETTINGS);
    isDirtyState = true;
    this.updateDirtyIndicator();
  },
};

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SettingsPanel.init());
  } else {
    SettingsPanel.init();
  }
}
