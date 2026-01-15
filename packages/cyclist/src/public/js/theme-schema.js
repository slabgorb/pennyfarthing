/**
 * Theme Schema Definition and Validation
 *
 * Defines the comprehensive JSON schema for color themes and provides
 * validation functions to ensure themes conform to the expected structure.
 *
 * Story 35-7: Custom Styling Themes
 */

// =============================================================================
// Required Color Fields
// =============================================================================

/**
 * Required UI colors that every theme must define
 */
export const REQUIRED_UI_COLORS = [
  'bgPrimary',
  'bgSecondary',
  'bgTertiary',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'accent',
  'accentHover',
  'border',
  'borderFocus',
  'shadow',
];

/**
 * Required panel colors
 */
export const REQUIRED_PANEL_COLORS = [
  'sidebarBg',
  'messageBg',
  'toolBg',
  'headerBg',
  'footerBg',
];

/**
 * Required status colors
 */
export const REQUIRED_STATUS_COLORS = [
  'success',
  'warning',
  'error',
  'info',
];

/**
 * Required terminal colors (16 ANSI + extras)
 */
export const REQUIRED_TERMINAL_COLORS = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

/**
 * Required syntax highlighting colors
 */
export const REQUIRED_SYNTAX_COLORS = [
  'keyword',
  'string',
  'number',
  'comment',
  'function',
  'variable',
  'type',
  'operator',
  'punctuation',
  'tag',
  'attribute',
  'property',
];

// =============================================================================
// Color Validation
// =============================================================================

/**
 * Validate if a string is a valid CSS color
 * Supports: hex (#fff, #ffffff), rgb(), rgba(), hsl(), hsla()
 *
 * @param {string} color - Color string to validate
 * @returns {boolean} True if valid color format
 */
export function isValidColor(color) {
  if (typeof color !== 'string') return false;

  // Hex colors: #fff or #ffffff (case insensitive)
  const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  if (hexPattern.test(color)) return true;

  // RGB: rgb(255, 255, 255) or rgb(255,255,255)
  const rgbPattern = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;
  if (rgbPattern.test(color)) return true;

  // RGBA: rgba(255, 255, 255, 0.5)
  const rgbaPattern = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/;
  if (rgbaPattern.test(color)) return true;

  // HSL: hsl(360, 100%, 50%)
  const hslPattern = /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/;
  if (hslPattern.test(color)) return true;

  // HSLA: hsla(360, 100%, 50%, 0.5)
  const hslaPattern = /^hsla\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*,\s*[\d.]+\s*\)$/;
  if (hslaPattern.test(color)) return true;

  return false;
}

// =============================================================================
// Theme Schema
// =============================================================================

/**
 * Complete theme schema definition
 * Documents all required and optional fields
 */
export const ColorThemeSchema = {
  type: 'object',
  required: ['id', 'name', 'ui', 'panels', 'status', 'terminal', 'syntax'],
  properties: {
    // Metadata
    id: { type: 'string', description: 'Unique identifier (kebab-case)' },
    name: { type: 'string', description: 'Display name' },
    description: { type: 'string', description: 'Theme description (optional)' },
    author: { type: 'string', description: 'Theme author (optional)' },
    version: { type: 'string', description: 'Theme version (optional)' },
    extends: { type: 'string', description: 'Base theme to inherit from (optional)' },

    // Color sections
    ui: {
      type: 'object',
      required: REQUIRED_UI_COLORS,
      description: 'UI colors (backgrounds, text, borders, accents)',
    },
    panels: {
      type: 'object',
      required: REQUIRED_PANEL_COLORS,
      description: 'Panel-specific background colors',
    },
    status: {
      type: 'object',
      required: REQUIRED_STATUS_COLORS,
      description: 'Status indicator colors',
    },
    terminal: {
      type: 'object',
      required: REQUIRED_TERMINAL_COLORS,
      description: 'Terminal colors (16 ANSI + extras)',
    },
    syntax: {
      type: 'object',
      required: REQUIRED_SYNTAX_COLORS,
      description: 'Syntax highlighting colors',
    },
  },
};

// =============================================================================
// Theme Validation
// =============================================================================

/**
 * Validate a theme against the schema
 *
 * @param {object} theme - Theme object to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateTheme(theme) {
  const errors = [];
  const warnings = [];

  // Check required top-level fields
  if (!theme.id) {
    errors.push('Missing required field: id');
  }
  if (!theme.name) {
    errors.push('Missing required field: name');
  }

  // Check optional metadata fields
  if (!theme.description) {
    warnings.push('Missing optional field: description');
  }
  if (!theme.author) {
    warnings.push('Missing optional field: author');
  }

  // Validate UI section
  if (!theme.ui) {
    errors.push('Missing required section: ui');
  } else {
    for (const color of REQUIRED_UI_COLORS) {
      if (!theme.ui[color]) {
        errors.push(`Missing required ui color: ${color}`);
      } else if (!isValidColor(theme.ui[color])) {
        errors.push(`Invalid color format for ui.${color}: ${theme.ui[color]}`);
      }
    }
  }

  // Validate panels section
  if (!theme.panels) {
    errors.push('Missing required section: panels');
  } else {
    for (const color of REQUIRED_PANEL_COLORS) {
      if (!theme.panels[color]) {
        errors.push(`Missing required panel color: ${color}`);
      } else if (!isValidColor(theme.panels[color])) {
        errors.push(`Invalid color format for panels.${color}: ${theme.panels[color]}`);
      }
    }
  }

  // Validate status section
  if (!theme.status) {
    errors.push('Missing required section: status');
  } else {
    for (const color of REQUIRED_STATUS_COLORS) {
      if (!theme.status[color]) {
        errors.push(`Missing required status color: ${color}`);
      } else if (!isValidColor(theme.status[color])) {
        errors.push(`Invalid color format for status.${color}: ${theme.status[color]}`);
      }
    }
  }

  // Validate terminal section
  if (!theme.terminal) {
    errors.push('Missing required section: terminal');
  } else {
    for (const color of REQUIRED_TERMINAL_COLORS) {
      if (!theme.terminal[color]) {
        errors.push(`Missing required terminal color: ${color}`);
      } else if (!isValidColor(theme.terminal[color])) {
        errors.push(`Invalid color format for terminal.${color}: ${theme.terminal[color]}`);
      }
    }
  }

  // Validate syntax section
  if (!theme.syntax) {
    errors.push('Missing required section: syntax');
  } else {
    for (const color of REQUIRED_SYNTAX_COLORS) {
      if (!theme.syntax[color]) {
        errors.push(`Missing required syntax color: ${color}`);
      } else if (!isValidColor(theme.syntax[color])) {
        errors.push(`Invalid color format for syntax.${color}: ${theme.syntax[color]}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
