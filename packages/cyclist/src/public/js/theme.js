/**
 * Theme Configuration System
 *
 * Manages color themes for the Cyclist dashboard.
 * Themes are applied by updating CSS custom properties on :root.
 */

import { settingsSync, STORAGE_KEYS } from './settings-sync.js';

// Theme definitions
const themes = {
  dark: {
    bgPrimary: '#1a1a2e',
    bgSecondary: '#16213e',
    bgTerminal: '#0f0f1a',
    textPrimary: '#e4e4e7',
    textSecondary: '#a1a1aa',
    accent: '#4f46e5',
    border: '#27272a',
    statusReady: '#22c55e',
    statusWorking: '#eab308',
    statusError: '#ef4444'
  },
  light: {
    bgPrimary: '#f5f5f7',
    bgSecondary: '#e8e8ed',
    bgTerminal: '#ffffff',
    textPrimary: '#1a1a2e',
    textSecondary: '#52525b',
    accent: '#4f46e5',
    border: '#d4d4d8',
    statusReady: '#16a34a',
    statusWorking: '#ca8a04',
    statusError: '#dc2626'
  }
};

// Terminal theme palettes (for xterm.js)
const terminalThemes = {
  dark: {
    background: '#0f0f1a',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    cursorAccent: '#0f0f1a',
    selectionBackground: '#4f46e5',
    black: '#1a1a2e',
    red: '#ff6b6b',
    green: '#69db7c',
    yellow: '#ffd43b',
    blue: '#4f46e5',
    magenta: '#cc5de8',
    cyan: '#22b8cf',
    white: '#e4e4e7',
    brightBlack: '#52525b',
    brightRed: '#ff8787',
    brightGreen: '#8ce99a',
    brightYellow: '#ffe066',
    brightBlue: '#748ffc',
    brightMagenta: '#da77f2',
    brightCyan: '#66d9e8',
    brightWhite: '#fafafa'
  },
  light: {
    background: '#ffffff',
    foreground: '#1a1a2e',
    cursor: '#1a1a2e',
    cursorAccent: '#ffffff',
    selectionBackground: '#4f46e5',
    black: '#1a1a2e',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#f5f5f7',
    brightBlack: '#52525b',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff'
  }
};

// Default theme
const DEFAULT_THEME = 'dark';

// Current theme state
let currentTheme = DEFAULT_THEME;

/**
 * Convert camelCase to kebab-case for CSS property names
 * @param {string} str - camelCase string
 * @returns {string} kebab-case string
 */
function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Apply a theme by updating CSS custom properties
 * @param {string} themeName - Name of theme to apply ('dark', 'light')
 * @returns {boolean} True if theme was applied successfully
 */
function applyTheme(themeName) {
  const theme = themes[themeName];

  if (!theme) {
    console.warn(`Theme "${themeName}" not found, using ${DEFAULT_THEME}`);
    return applyTheme(DEFAULT_THEME);
  }

  // Update CSS custom properties on :root
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    const cssProperty = `--${toKebabCase(key)}`;
    root.style.setProperty(cssProperty, value);
  });

  // Save preference via settings-sync (cross-tab broadcast)
  settingsSync.set(STORAGE_KEYS.THEME, themeName);

  // Update current theme state
  currentTheme = themeName;

  // Dispatch custom event for other modules
  window.dispatchEvent(new CustomEvent('themechange', {
    detail: { theme: themeName }
  }));

  return true;
}

/**
 * Load and apply saved theme preference
 * Falls back to default theme if no preference saved
 */
function loadTheme() {
  let savedTheme = DEFAULT_THEME;

  const stored = settingsSync.get(STORAGE_KEYS.THEME);
  if (stored && themes[stored]) {
    savedTheme = stored;
  }

  applyTheme(savedTheme);
}

/**
 * Get the current theme name
 * @returns {string} Current theme name
 */
function getCurrentTheme() {
  return currentTheme;
}

/**
 * Get list of available theme names
 * @returns {string[]} Array of theme names
 */
function getAvailableThemes() {
  return Object.keys(themes);
}

/**
 * Get terminal theme for current or specified theme
 * @param {string} [themeName] - Theme name (defaults to current theme)
 * @returns {Object} Terminal theme object for xterm.js
 */
function getTerminalTheme(themeName) {
  const name = themeName || currentTheme;
  return terminalThemes[name] || terminalThemes[DEFAULT_THEME];
}

// Export for other modules
window.themeManager = {
  applyTheme,
  loadTheme,
  getCurrentTheme,
  getAvailableThemes,
  getTerminalTheme
};

// Auto-load theme on script load (before DOMContentLoaded for faster apply)
loadTheme();
