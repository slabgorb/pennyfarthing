/**
 * Font Settings Module (Story 35-6)
 *
 * Applies user font preferences to the UI via CSS custom properties.
 * Loads settings from IPC (Electron) or REST API (browser).
 */

/**
 * Apply font settings to the document
 * @param {Object} settings - CyclistSettings object
 */
export function applyFontSettings(settings) {
  const root = document.documentElement;

  // Apply UI font
  const fontUi = settings?.display?.font_ui;
  if (fontUi) {
    // Build font stack with fallbacks
    const fontUiStack = `"${fontUi}", system-ui, -apple-system, sans-serif`;
    root.style.setProperty('--font-ui', fontUiStack);
  }

  // Apply monospace font
  const fontMono = settings?.display?.font_mono;
  if (fontMono) {
    // Build font stack with fallbacks
    const fontMonoStack = `"${fontMono}", Monaco, 'Courier New', monospace`;
    root.style.setProperty('--font-mono', fontMonoStack);
  }
}

/**
 * Initialize font settings on page load
 * Fetches settings and applies fonts
 */
export async function initFontSettings() {
  try {
    let settings;

    // Try IPC first (Electron)
    if (window.electronAPI?.settings?.get) {
      settings = await window.electronAPI.settings.get();
    } else {
      // Fall back to REST API
      const response = await fetch('/api/settings');
      if (response.ok) {
        settings = await response.json();
      }
    }

    if (settings) {
      applyFontSettings(settings);
    }

    // Listen for settings changes
    if (window.electronAPI?.settings?.onChanged) {
      window.electronAPI.settings.onChanged(applyFontSettings);
    }
  } catch (err) {
    console.warn('Failed to load font settings:', err);
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFontSettings);
  } else {
    initFontSettings();
  }
}
