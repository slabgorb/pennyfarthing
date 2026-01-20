/**
 * Theme Manager
 *
 * Manages color themes including built-in themes, custom themes,
 * theme inheritance, import/export, and CSS variable application.
 *
 * Story 35-7: Custom Styling Themes
 */

import { validateTheme } from './theme-schema.js';
import { settingsSync, STORAGE_KEYS } from './settings-sync.js';

// =============================================================================
// Built-in Themes
// =============================================================================

/**
 * Dark theme - default dark color scheme
 */
const darkTheme = {
  id: 'dark',
  name: 'Dark',
  description: 'Default dark theme with deep blue-gray tones',
  author: 'Cyclist',
  version: '1.0.0',
  ui: {
    bgPrimary: '#1a1a2e',
    bgSecondary: '#16213e',
    bgTertiary: '#0f0f1a',
    textPrimary: '#e4e4e7',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    accent: '#4f46e5',
    accentHover: '#6366f1',
    border: '#27272a',
    borderFocus: '#4f46e5',
    shadow: 'rgba(0,0,0,0.3)',
  },
  panels: {
    sidebarBg: '#16213e',
    messageBg: '#1a1a2e',
    toolBg: '#0f0f1a',
    headerBg: '#16213e',
    footerBg: '#16213e',
  },
  status: {
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    info: '#3b82f6',
  },
  terminal: {
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
    brightWhite: '#fafafa',
  },
  syntax: {
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#5c6370',
    function: '#61afef',
    variable: '#e06c75',
    type: '#e5c07b',
    operator: '#56b6c2',
    punctuation: '#abb2bf',
    tag: '#e06c75',
    attribute: '#d19a66',
    property: '#61afef',
  },
};

/**
 * Light theme - bright color scheme for daytime use
 */
const lightTheme = {
  id: 'light',
  name: 'Light',
  description: 'Bright theme for daytime use',
  author: 'Cyclist',
  version: '1.0.0',
  ui: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f5f5f7',
    bgTertiary: '#e8e8ed',
    textPrimary: '#1a1a2e',
    textSecondary: '#52525b',
    textMuted: '#a1a1aa',
    accent: '#4f46e5',
    accentHover: '#4338ca',
    border: '#d4d4d8',
    borderFocus: '#4f46e5',
    shadow: 'rgba(0,0,0,0.1)',
  },
  panels: {
    sidebarBg: '#f5f5f7',
    messageBg: '#ffffff',
    toolBg: '#e8e8ed',
    headerBg: '#f5f5f7',
    footerBg: '#f5f5f7',
  },
  status: {
    success: '#16a34a',
    warning: '#ca8a04',
    error: '#dc2626',
    info: '#2563eb',
  },
  terminal: {
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
    brightWhite: '#ffffff',
  },
  syntax: {
    keyword: '#7c3aed',
    string: '#16a34a',
    number: '#c2410c',
    comment: '#6b7280',
    function: '#2563eb',
    variable: '#dc2626',
    type: '#b45309',
    operator: '#0891b2',
    punctuation: '#374151',
    tag: '#dc2626',
    attribute: '#c2410c',
    property: '#2563eb',
  },
};

/**
 * Solarized theme - precision colors for machine and people
 */
const solarizedTheme = {
  id: 'solarized',
  name: 'Solarized',
  description: 'Precision colors designed for both readability and beauty',
  author: 'Ethan Schoonover',
  version: '1.0.0',
  ui: {
    bgPrimary: '#002b36',
    bgSecondary: '#073642',
    bgTertiary: '#002028',
    textPrimary: '#839496',
    textSecondary: '#657b83',
    textMuted: '#586e75',
    accent: '#268bd2',
    accentHover: '#2aa198',
    border: '#073642',
    borderFocus: '#268bd2',
    shadow: 'rgba(0,0,0,0.3)',
  },
  panels: {
    sidebarBg: '#073642',
    messageBg: '#002b36',
    toolBg: '#002028',
    headerBg: '#073642',
    footerBg: '#073642',
  },
  status: {
    success: '#859900',
    warning: '#b58900',
    error: '#dc322f',
    info: '#268bd2',
  },
  terminal: {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#839496',
    cursorAccent: '#002b36',
    selectionBackground: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
  syntax: {
    keyword: '#859900',
    string: '#2aa198',
    number: '#d33682',
    comment: '#586e75',
    function: '#268bd2',
    variable: '#b58900',
    type: '#cb4b16',
    operator: '#839496',
    punctuation: '#657b83',
    tag: '#268bd2',
    attribute: '#b58900',
    property: '#2aa198',
  },
};

/**
 * Monokai theme - dark theme with vibrant accent colors
 */
const monokaiTheme = {
  id: 'monokai',
  name: 'Monokai',
  description: 'Classic dark theme with vibrant accent colors',
  author: 'Wimer Hazenberg',
  version: '1.0.0',
  ui: {
    bgPrimary: '#272822',
    bgSecondary: '#3e3d32',
    bgTertiary: '#1e1f1c',
    textPrimary: '#f8f8f2',
    textSecondary: '#cfcfc2',
    textMuted: '#75715e',
    accent: '#a6e22e',
    accentHover: '#c2f44d',
    border: '#3e3d32',
    borderFocus: '#a6e22e',
    shadow: 'rgba(0,0,0,0.4)',
  },
  panels: {
    sidebarBg: '#3e3d32',
    messageBg: '#272822',
    toolBg: '#1e1f1c',
    headerBg: '#3e3d32',
    footerBg: '#3e3d32',
  },
  status: {
    success: '#a6e22e',
    warning: '#e6db74',
    error: '#f92672',
    info: '#66d9ef',
  },
  terminal: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#272822',
    selectionBackground: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
  syntax: {
    keyword: '#f92672',
    string: '#e6db74',
    number: '#ae81ff',
    comment: '#75715e',
    function: '#a6e22e',
    variable: '#f8f8f2',
    type: '#66d9ef',
    operator: '#f92672',
    punctuation: '#f8f8f2',
    tag: '#f92672',
    attribute: '#a6e22e',
    property: '#66d9ef',
  },
};

/**
 * Nord theme - arctic, north-bluish color palette
 */
const nordTheme = {
  id: 'nord',
  name: 'Nord',
  description: 'Arctic, north-bluish color palette',
  author: 'Arctic Ice Studio',
  version: '1.0.0',
  ui: {
    bgPrimary: '#2e3440',
    bgSecondary: '#3b4252',
    bgTertiary: '#242933',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textMuted: '#4c566a',
    accent: '#88c0d0',
    accentHover: '#8fbcbb',
    border: '#4c566a',
    borderFocus: '#88c0d0',
    shadow: 'rgba(0,0,0,0.3)',
  },
  panels: {
    sidebarBg: '#3b4252',
    messageBg: '#2e3440',
    toolBg: '#242933',
    headerBg: '#3b4252',
    footerBg: '#3b4252',
  },
  status: {
    success: '#a3be8c',
    warning: '#ebcb8b',
    error: '#bf616a',
    info: '#81a1c1',
  },
  terminal: {
    background: '#2e3440',
    foreground: '#eceff4',
    cursor: '#eceff4',
    cursorAccent: '#2e3440',
    selectionBackground: '#4c566a',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
  syntax: {
    keyword: '#81a1c1',
    string: '#a3be8c',
    number: '#b48ead',
    comment: '#616e88',
    function: '#88c0d0',
    variable: '#d8dee9',
    type: '#8fbcbb',
    operator: '#81a1c1',
    punctuation: '#eceff4',
    tag: '#81a1c1',
    attribute: '#8fbcbb',
    property: '#88c0d0',
  },
};

/**
 * Dracula theme - dark theme with saturated colors
 */
const draculaTheme = {
  id: 'dracula',
  name: 'Dracula',
  description: 'Dark theme with saturated colors',
  author: 'Zeno Rocha',
  version: '1.0.0',
  ui: {
    bgPrimary: '#282a36',
    bgSecondary: '#44475a',
    bgTertiary: '#21222c',
    textPrimary: '#f8f8f2',
    textSecondary: '#6272a4',
    textMuted: '#6272a4',
    accent: '#bd93f9',
    accentHover: '#ff79c6',
    border: '#44475a',
    borderFocus: '#bd93f9',
    shadow: 'rgba(0,0,0,0.4)',
  },
  panels: {
    sidebarBg: '#44475a',
    messageBg: '#282a36',
    toolBg: '#21222c',
    headerBg: '#44475a',
    footerBg: '#44475a',
  },
  status: {
    success: '#50fa7b',
    warning: '#f1fa8c',
    error: '#ff5555',
    info: '#8be9fd',
  },
  terminal: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  syntax: {
    keyword: '#ff79c6',
    string: '#f1fa8c',
    number: '#bd93f9',
    comment: '#6272a4',
    function: '#50fa7b',
    variable: '#f8f8f2',
    type: '#8be9fd',
    operator: '#ff79c6',
    punctuation: '#f8f8f2',
    tag: '#ff79c6',
    attribute: '#50fa7b',
    property: '#8be9fd',
  },
};

/**
 * All built-in themes
 */
export const BUILT_IN_THEMES = {
  dark: darkTheme,
  light: lightTheme,
  solarized: solarizedTheme,
  monokai: monokaiTheme,
  nord: nordTheme,
  dracula: draculaTheme,
};

// =============================================================================
// State
// =============================================================================

let currentTheme = darkTheme;
let originalTheme = null; // For preview revert

// Configurable document reference for testing
let _testDocument = null;

/**
 * Set the document reference (for testing)
 * @param {Document} doc - Document to use
 */
export function setDocument(doc) {
  _testDocument = doc;
}

/**
 * Get the current document reference
 * @returns {Document} Current document
 */
function getDocument() {
  // Try test document first, then global document
  if (_testDocument) return _testDocument;

  // In browser/test environment, access document dynamically
  // This allows tests to stub/mock the global document
  const doc = typeof globalThis !== 'undefined' && globalThis.document
    ? globalThis.document
    : (typeof document !== 'undefined' ? document : null);

  return doc;
}

// =============================================================================
// Theme Access
// =============================================================================

/**
 * Get a built-in theme by ID
 * @param {string} id - Theme ID
 * @returns {object|null} Theme object or null if not found
 */
export function getBuiltInTheme(id) {
  return BUILT_IN_THEMES[id] || null;
}

/**
 * Get current theme ID
 * @returns {string} Current theme ID
 */
export function getCurrentThemeId() {
  return currentTheme.id;
}

/**
 * Get current theme object
 * @returns {object} Current theme
 */
export function getCurrentTheme() {
  return { ...currentTheme };
}

// =============================================================================
// Custom Themes
// =============================================================================

/**
 * Get all custom themes from settings-sync
 * @returns {object[]} Array of custom themes
 */
export function getCustomThemes() {
  const stored = settingsSync.get(STORAGE_KEYS.CUSTOM_THEMES);
  if (stored && Array.isArray(stored)) {
    return stored;
  }
  return [];
}

/**
 * Get a custom theme by ID
 * @param {string} id - Theme ID
 * @returns {object|null} Theme object or null if not found
 */
export function getCustomTheme(id) {
  const themes = getCustomThemes();
  return themes.find(t => t.id === id) || null;
}

/**
 * Save a custom theme to settings-sync (cross-tab broadcast)
 * @param {object} theme - Theme to save
 * @returns {boolean} True if saved successfully
 */
export function saveCustomTheme(theme) {
  const themes = getCustomThemes();
  const existingIndex = themes.findIndex(t => t.id === theme.id);

  if (existingIndex >= 0) {
    themes[existingIndex] = theme;
  } else {
    themes.push(theme);
  }

  settingsSync.set(STORAGE_KEYS.CUSTOM_THEMES, themes);
  return true;
}

/**
 * Delete a custom theme
 * @param {string} id - Theme ID to delete
 * @returns {boolean} True if deleted (false if built-in or not found)
 */
export function deleteCustomTheme(id) {
  // Don't allow deleting built-in themes
  if (BUILT_IN_THEMES[id]) {
    return false;
  }

  const themes = getCustomThemes();
  const filtered = themes.filter(t => t.id !== id);

  if (filtered.length === themes.length) {
    return false; // Not found
  }

  settingsSync.set(STORAGE_KEYS.CUSTOM_THEMES, filtered);
  return true;
}

// =============================================================================
// Theme Creation
// =============================================================================

/**
 * Create a new theme with default values
 * @param {string} id - Theme ID
 * @param {string} name - Theme display name
 * @returns {object} New theme object
 */
export function createNewTheme(id, name) {
  return {
    ...JSON.parse(JSON.stringify(darkTheme)),
    id,
    name,
    description: '',
    author: '',
    version: '1.0.0',
  };
}

/**
 * Extend an existing theme with overrides
 * @param {object} baseTheme - Theme to extend
 * @param {object} overrides - Properties to override
 * @returns {object} New theme with overrides applied
 */
export function extendTheme(baseTheme, overrides) {
  const extended = JSON.parse(JSON.stringify(baseTheme));

  // Apply overrides deeply
  if (overrides.id) extended.id = overrides.id;
  if (overrides.name) extended.name = overrides.name;
  if (overrides.description !== undefined) extended.description = overrides.description;
  if (overrides.author !== undefined) extended.author = overrides.author;
  if (overrides.version !== undefined) extended.version = overrides.version;

  extended.extends = baseTheme.id;

  // Deep merge color sections
  if (overrides.ui) {
    extended.ui = { ...extended.ui, ...overrides.ui };
  }
  if (overrides.panels) {
    extended.panels = { ...extended.panels, ...overrides.panels };
  }
  if (overrides.status) {
    extended.status = { ...extended.status, ...overrides.status };
  }
  if (overrides.terminal) {
    extended.terminal = { ...extended.terminal, ...overrides.terminal };
  }
  if (overrides.syntax) {
    extended.syntax = { ...extended.syntax, ...overrides.syntax };
  }

  return extended;
}

/**
 * Resolve theme inheritance chain
 * @param {object} theme - Theme with potential extends field
 * @returns {object} Fully resolved theme
 */
export function resolveThemeInheritance(theme) {
  if (!theme.extends) {
    return theme;
  }

  const baseTheme = BUILT_IN_THEMES[theme.extends] || getCustomTheme(theme.extends);
  if (!baseTheme) {
    console.warn(`Base theme "${theme.extends}" not found`);
    return theme;
  }

  // Recursively resolve base theme
  const resolvedBase = resolveThemeInheritance(baseTheme);

  // Merge theme on top of resolved base
  return extendTheme(resolvedBase, theme);
}

// =============================================================================
// Theme Application
// =============================================================================

/**
 * Convert camelCase to kebab-case
 * @param {string} str - camelCase string
 * @returns {string} kebab-case string
 */
function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Apply a theme by updating CSS custom properties
 * @param {object} theme - Theme to apply
 * @param {Document} [doc] - Optional document reference (for testing)
 * @returns {boolean} True if applied successfully
 */
export function applyTheme(theme, doc) {
  const resolved = resolveThemeInheritance(theme);
  const root = (doc || getDocument()).documentElement;

  // Apply UI colors
  for (const [key, value] of Object.entries(resolved.ui)) {
    root.style.setProperty(`--${toKebabCase(key)}`, value);
  }

  // Apply panel colors
  for (const [key, value] of Object.entries(resolved.panels)) {
    root.style.setProperty(`--${toKebabCase(key)}`, value);
  }

  // Apply status colors
  for (const [key, value] of Object.entries(resolved.status)) {
    root.style.setProperty(`--status-${toKebabCase(key)}`, value);
  }

  // Apply terminal colors
  for (const [key, value] of Object.entries(resolved.terminal)) {
    root.style.setProperty(`--terminal-${toKebabCase(key)}`, value);
  }

  // Apply syntax colors
  for (const [key, value] of Object.entries(resolved.syntax)) {
    root.style.setProperty(`--syntax-${toKebabCase(key)}`, value);
  }

  // Save preference via settings-sync (cross-tab broadcast)
  settingsSync.set(STORAGE_KEYS.COLOR_THEME, resolved.id);

  currentTheme = resolved;

  // Dispatch theme change event
  window.dispatchEvent(new CustomEvent('themechange', {
    detail: { theme: resolved.id },
  }));

  // Dispatch terminal theme change event
  window.dispatchEvent(new CustomEvent('terminalThemeChange', {
    detail: { theme: getTerminalTheme(resolved) },
  }));

  return true;
}

/**
 * Apply theme preview (temporary, can be reverted)
 * @param {object} theme - Theme to preview
 * @param {Document} [doc] - Optional document reference (for testing)
 */
export function applyThemePreview(theme, doc) {
  if (!originalTheme) {
    originalTheme = currentTheme;
  }

  const resolved = resolveThemeInheritance(theme);
  const root = (doc || getDocument()).documentElement;

  // Apply all colors
  for (const [key, value] of Object.entries(resolved.ui)) {
    root.style.setProperty(`--${toKebabCase(key)}`, value);
  }
  for (const [key, value] of Object.entries(resolved.panels)) {
    root.style.setProperty(`--${toKebabCase(key)}`, value);
  }
  for (const [key, value] of Object.entries(resolved.status)) {
    root.style.setProperty(`--status-${toKebabCase(key)}`, value);
  }
  for (const [key, value] of Object.entries(resolved.terminal)) {
    root.style.setProperty(`--terminal-${toKebabCase(key)}`, value);
  }
  for (const [key, value] of Object.entries(resolved.syntax)) {
    root.style.setProperty(`--syntax-${toKebabCase(key)}`, value);
  }

  // Dispatch preview event
  window.dispatchEvent(new CustomEvent('themePreview', {
    detail: { theme: resolved },
  }));
}

/**
 * Revert theme preview to original
 */
export function revertThemePreview() {
  if (originalTheme) {
    applyTheme(originalTheme);
    originalTheme = null;
  }
}

/**
 * Load saved theme on startup
 */
export function loadSavedTheme() {
  const savedId = settingsSync.get(STORAGE_KEYS.COLOR_THEME);
  if (savedId) {
    const theme = BUILT_IN_THEMES[savedId] || getCustomTheme(savedId);
    if (theme) {
      applyTheme(theme);
      return;
    }
  }

  // Fall back to dark theme
  applyTheme(darkTheme);
}

// =============================================================================
// Terminal Theme
// =============================================================================

/**
 * Get terminal theme from a color theme
 * @param {object} theme - Color theme
 * @returns {object} Terminal theme object
 */
export function getTerminalTheme(theme) {
  const resolved = resolveThemeInheritance(theme);
  return { ...resolved.terminal };
}

/**
 * Get xterm.js compatible theme object
 * @param {object} theme - Color theme
 * @returns {object} xterm.js theme object
 */
export function getXtermTheme(theme) {
  const resolved = resolveThemeInheritance(theme);
  return {
    background: resolved.terminal.background,
    foreground: resolved.terminal.foreground,
    cursor: resolved.terminal.cursor,
    cursorAccent: resolved.terminal.cursorAccent,
    selectionBackground: resolved.terminal.selectionBackground,
    black: resolved.terminal.black,
    red: resolved.terminal.red,
    green: resolved.terminal.green,
    yellow: resolved.terminal.yellow,
    blue: resolved.terminal.blue,
    magenta: resolved.terminal.magenta,
    cyan: resolved.terminal.cyan,
    white: resolved.terminal.white,
    brightBlack: resolved.terminal.brightBlack,
    brightRed: resolved.terminal.brightRed,
    brightGreen: resolved.terminal.brightGreen,
    brightYellow: resolved.terminal.brightYellow,
    brightBlue: resolved.terminal.brightBlue,
    brightMagenta: resolved.terminal.brightMagenta,
    brightCyan: resolved.terminal.brightCyan,
    brightWhite: resolved.terminal.brightWhite,
  };
}

// =============================================================================
// Syntax Theme
// =============================================================================

/**
 * Get syntax highlighting theme from a color theme
 * @param {object} theme - Color theme
 * @returns {object} Syntax highlighting colors
 */
export function getSyntaxTheme(theme) {
  const resolved = resolveThemeInheritance(theme);
  return { ...resolved.syntax };
}

// =============================================================================
// Import/Export
// =============================================================================

/**
 * Import theme from JSON string
 * @param {string} json - JSON string
 * @returns {{ success: boolean, theme?: object, error?: string, errors?: string[] }}
 */
export async function importThemeFromJSON(json) {
  try {
    const theme = JSON.parse(json);
    const validation = validateTheme(theme);

    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    // Check for ID conflicts
    if (BUILT_IN_THEMES[theme.id] || getCustomTheme(theme.id)) {
      theme.id = `${theme.id}-${Date.now()}`;
    }

    return {
      success: true,
      theme,
    };
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON: ${e.message}`,
    };
  }
}

/**
 * Import theme from URL
 * @param {string} url - URL to fetch theme from
 * @returns {{ success: boolean, theme?: object, error?: string, errors?: string[] }}
 */
export async function importThemeFromURL(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch: ${response.status}`,
      };
    }

    const theme = await response.json();
    const validation = validateTheme(theme);

    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    // Check for ID conflicts
    if (BUILT_IN_THEMES[theme.id] || getCustomTheme(theme.id)) {
      theme.id = `${theme.id}-${Date.now()}`;
    }

    return {
      success: true,
      theme,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to fetch theme: ${e.message}`,
    };
  }
}

/**
 * Import theme from File object
 * @param {File} file - File object
 * @returns {Promise<{ success: boolean, theme?: object, error?: string, errors?: string[] }>}
 */
export async function importThemeFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = await importThemeFromJSON(e.target.result);
      resolve(result);
    };
    reader.onerror = () => {
      resolve({
        success: false,
        error: 'Failed to read file',
      });
    };
    reader.readAsText(file);
  });
}

/**
 * Export theme to JSON string
 * @param {object} theme - Theme to export
 * @param {{ pretty?: boolean }} options - Export options
 * @returns {string} JSON string
 */
export function exportThemeToJSON(theme, options = {}) {
  if (options.pretty) {
    return JSON.stringify(theme, null, 2);
  }
  return JSON.stringify(theme);
}

/**
 * Download theme as JSON file
 * @param {object} theme - Theme to download
 */
export function downloadThemeAsFile(theme) {
  const json = exportThemeToJSON(theme, { pretty: true });
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = getDocument().createElement('a');
  a.href = url;
  a.download = `${theme.id}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Copy theme JSON to clipboard
 * @param {object} theme - Theme to copy
 * @returns {Promise<boolean>} True if copied successfully
 */
export async function copyThemeToClipboard(theme) {
  try {
    const json = exportThemeToJSON(theme, { pretty: true });
    await navigator.clipboard.writeText(json);
    return true;
  } catch (e) {
    console.warn('Could not copy to clipboard:', e);
    return false;
  }
}

// =============================================================================
// Initialize
// =============================================================================

// Auto-load theme on script load (only in browser, not during tests)
// Tests should call loadSavedTheme() explicitly if needed
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__VITEST__) {
  loadSavedTheme();
}
