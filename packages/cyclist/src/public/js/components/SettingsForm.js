/**
 * Settings Form Component (Story 35-9)
 *
 * Form state management wrapper for settings panel.
 * Provides reactive form state with dirty tracking.
 *
 * Exports:
 * - SettingsForm object with state management methods
 */

// Module state
let formState = {
  initial: null,
  current: null,
  defaults: null,
  isLoading: false,
  loadError: null,
  isSaving: false,
  saveError: null,
  validationErrors: {},
};

/**
 * Settings Form API
 */
export const SettingsForm = {
  /**
   * Initialize the form with settings
   * @param {object} settings - Initial settings values
   * @param {object} defaults - Default settings values
   */
  init(settings, defaults) {
    formState.initial = JSON.parse(JSON.stringify(settings));
    formState.current = JSON.parse(JSON.stringify(settings));
    formState.defaults = defaults;
    formState.validationErrors = {};
    formState.loadError = null;
    formState.saveError = null;
  },

  /**
   * Get current form state
   * @returns {object}
   */
  getState() {
    return { ...formState };
  },

  /**
   * Update a field value
   * @param {string} path - Dot-notation path (e.g., 'display.sidebar_width')
   * @param {any} value - New value
   */
  updateField(path, value) {
    const parts = path.split('.');
    let obj = formState.current;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;

    // Clear validation error for this field
    delete formState.validationErrors[parts[parts.length - 1]];
  },

  /**
   * Get a field value
   * @param {string} path - Dot-notation path
   * @returns {any}
   */
  getField(path) {
    const parts = path.split('.');
    let obj = formState.current;
    for (const part of parts) {
      if (obj == null) return undefined;
      obj = obj[part];
    }
    return obj;
  },

  /**
   * Check if form has unsaved changes
   * @returns {boolean}
   */
  isDirty() {
    return JSON.stringify(formState.current) !== JSON.stringify(formState.initial);
  },

  /**
   * Check if form is valid (no validation errors)
   * @returns {boolean}
   */
  isValid() {
    return Object.keys(formState.validationErrors).length === 0;
  },

  /**
   * Set validation error for a field
   * @param {string} field - Field name
   * @param {string} error - Error message
   */
  setError(field, error) {
    formState.validationErrors[field] = error;
  },

  /**
   * Clear validation error for a field
   * @param {string} field - Field name
   */
  clearError(field) {
    delete formState.validationErrors[field];
  },

  /**
   * Clear all validation errors
   */
  clearAllErrors() {
    formState.validationErrors = {};
  },

  /**
   * Get all validation errors
   * @returns {object}
   */
  getErrors() {
    return { ...formState.validationErrors };
  },

  /**
   * Set loading state
   * @param {boolean} loading
   */
  setLoading(loading) {
    formState.isLoading = loading;
  },

  /**
   * Set saving state
   * @param {boolean} saving
   */
  setSaving(saving) {
    formState.isSaving = saving;
  },

  /**
   * Set load error
   * @param {string|null} error
   */
  setLoadError(error) {
    formState.loadError = error;
  },

  /**
   * Set save error
   * @param {string|null} error
   */
  setSaveError(error) {
    formState.saveError = error;
  },

  /**
   * Reset form to initial values
   */
  reset() {
    formState.current = JSON.parse(JSON.stringify(formState.initial));
    formState.validationErrors = {};
  },

  /**
   * Reset form to default values
   */
  resetToDefaults() {
    if (formState.defaults) {
      formState.current = JSON.parse(JSON.stringify(formState.defaults));
      formState.validationErrors = {};
    }
  },

  /**
   * Commit current values as initial (after successful save)
   */
  commit() {
    formState.initial = JSON.parse(JSON.stringify(formState.current));
  },
};
