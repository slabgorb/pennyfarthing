/**
 * Font Settings Module (Story 35-6)
 *
 * Applies user font preferences to the UI via CSS custom properties.
 * Loads settings from IPC (Electron) or REST API (browser).
 */

console.log('[FontSettings] Module loaded');

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
      console.log('[FontSettings] Loaded via IPC:', settings?.display?.font_ui, settings?.display?.font_mono);
    } else {
      // Fall back to REST API
      const response = await fetch('/api/settings');
      if (response.ok) {
        settings = await response.json();
        console.log('[FontSettings] Loaded via REST:', settings?.display?.font_ui, settings?.display?.font_mono);
      }
    }

    if (settings) {
      applyFontSettings(settings);
      console.log('[FontSettings] Applied fonts');
    }

    // Listen for settings changes
    if (window.electronAPI?.settings?.onChanged) {
      window.electronAPI.settings.onChanged((newSettings) => {
        console.log('[FontSettings] Settings changed:', newSettings?.display?.font_ui, newSettings?.display?.font_mono);
        applyFontSettings(newSettings);
      });
    }
  } catch (err) {
    console.warn('[FontSettings] Failed to load:', err);
  }
}

// Auto-initialize when DOM is ready
// Note: ES modules are deferred, so DOMContentLoaded may have already fired.
// We also need to wait for window.electronAPI to be available (from preload).
if (typeof document !== 'undefined') {
  // Function to check and initialize
  const tryInit = () => {
    if (window.electronAPI?.settings?.get) {
      initFontSettings();
    } else {
      // electronAPI not ready yet, try again shortly
      setTimeout(tryInit, 10);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
}
