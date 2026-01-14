/**
 * ThemePicker Component
 * Story 35-1: Contextual Settings Placement
 *
 * Lightweight theme selector that appears on persona section click.
 * Shows recent themes and a link to browse all themes.
 */

/** Current theme ID */
let currentTheme = null;

/** Recent theme IDs (max 5) */
let recentThemes = [];

/** Theme metadata cache */
let themeMetadata = [];

/**
 * Initialize the theme picker component
 */
export async function init() {
  const picker = document.getElementById('theme-picker');
  if (!picker) return;

  // Load theme metadata
  await loadThemeMetadata();

  // Set up close button handler
  const closeBtn = picker.querySelector('[data-action="close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });
  }

  // Set up browse all button handler
  const browseBtn = picker.querySelector('[data-action="browse-all"]');
  if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openThemeBrowser();
    });
  }

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible()) {
      hide();
    }
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (isVisible() && !picker.contains(e.target)) {
      const personaSection = document.getElementById('persona-section');
      if (!personaSection?.contains(e.target)) {
        hide();
      }
    }
  });

  console.log('[ThemePicker] Initialized');
}

/**
 * Load theme metadata from API
 */
async function loadThemeMetadata() {
  try {
    if (window.electronAPI?.settings?.getThemeMetadata) {
      themeMetadata = await window.electronAPI.settings.getThemeMetadata();
    } else {
      const response = await fetch('/api/settings/themes');
      if (response.ok) {
        themeMetadata = await response.json();
      }
    }
  } catch (err) {
    console.error('[ThemePicker] Failed to load theme metadata:', err);
    themeMetadata = [];
  }
}

/**
 * Show the theme picker
 */
export function show() {
  const picker = document.getElementById('theme-picker');
  if (!picker) return;

  // Render recent themes
  renderRecentThemes();

  picker.style.display = 'block';
}

/**
 * Hide the theme picker
 */
export function hide() {
  const picker = document.getElementById('theme-picker');
  if (picker) {
    picker.style.display = 'none';
  }
}

/**
 * Check if theme picker is visible
 */
export function isVisible() {
  const picker = document.getElementById('theme-picker');
  return picker && picker.style.display !== 'none';
}

/**
 * Set current theme
 * @param {string} themeId - Theme ID
 */
export function setCurrentTheme(themeId) {
  currentTheme = themeId;
  // Add to recent themes if not already there
  if (!recentThemes.includes(themeId)) {
    recentThemes = [themeId, ...recentThemes.slice(0, 4)];
  }
}

/**
 * Get current theme
 * @returns {string|null} Current theme ID
 */
export function getCurrentTheme() {
  return currentTheme;
}

/**
 * Render recent themes in the picker
 */
function renderRecentThemes() {
  const container = document.querySelector('#theme-picker .recent-themes');
  if (!container) return;

  // Get themes to display (current + recent, deduplicated)
  const themesToShow = [];
  if (currentTheme) {
    themesToShow.push(currentTheme);
  }
  for (const theme of recentThemes) {
    if (!themesToShow.includes(theme) && themesToShow.length < 5) {
      themesToShow.push(theme);
    }
  }

  // Clear and render
  container.innerHTML = '';
  for (const themeId of themesToShow) {
    const metadata = themeMetadata.find(t => t.id === themeId);
    const themeName = metadata?.name || humanize(themeId);

    const btn = document.createElement('button');
    btn.className = 'recent-theme-btn' + (themeId === currentTheme ? ' active' : '');
    btn.textContent = themeName;
    btn.addEventListener('click', () => selectTheme(themeId));
    container.appendChild(btn);
  }
}

/**
 * Select a theme
 * @param {string} themeId - Theme ID to select
 */
async function selectTheme(themeId) {
  try {
    // Update via settings API
    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save({ pennyfarthing: { theme: themeId } });
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pennyfarthing: { theme: themeId } }),
      });
    }

    setCurrentTheme(themeId);
    hide();

    // Trigger persona refresh if available
    if (window.refreshPersona) {
      window.refreshPersona();
    }
  } catch (err) {
    console.error('[ThemePicker] Failed to update theme:', err);
  }
}

/**
 * Open full theme browser
 */
function openThemeBrowser() {
  hide();
  // Open settings window to theme section
  if (window.electronAPI?.settings?.openWindow) {
    window.electronAPI.settings.openWindow();
  }
}

/**
 * Humanize a slug string
 * @param {string} str - Slug string
 * @returns {string} Humanized string
 */
function humanize(str) {
  if (!str) return '';
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
}
