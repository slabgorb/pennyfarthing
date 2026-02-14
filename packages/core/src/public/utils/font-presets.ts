/**
 * Font Presets - MSSCI-12769
 *
 * Font customization system for Cyclist with UI and code font presets,
 * Tailwind-like size scale, and global persistence.
 */

// =============================================================================
// Types
// =============================================================================

export interface FontPreset {
  id: string;
  name: string;
  fontFamily: string;
  isCustom?: boolean;
}

export type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl';

export interface FontSettings {
  uiFont: string;
  codeFont: string;
  uiFontSize: FontSize;
  codeFontSize: FontSize;
  customUiFont?: string;
  customCodeFont?: string;
}

export interface FontSizeScale {
  xs: string;
  sm: string;
  base: string;
  lg: string;
  xl: string;
}

// =============================================================================
// Font Presets
// =============================================================================

export const UI_FONT_PRESETS: FontPreset[] = [
  {
    id: 'system',
    name: 'System',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'inter',
    name: 'Inter',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  {
    id: 'custom',
    name: 'Custom',
    fontFamily: '',
    isCustom: true,
  },
];

export const CODE_FONT_PRESETS: FontPreset[] = [
  {
    id: 'system-mono',
    name: 'System Mono',
    fontFamily: "ui-monospace, 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace",
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Monaco, monospace",
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    fontFamily: "'Fira Code', ui-monospace, 'SF Mono', Monaco, monospace",
  },
  {
    id: 'custom',
    name: 'Custom',
    fontFamily: '',
    isCustom: true,
  },
];

// =============================================================================
// Font Size Scale (Tailwind-like)
// =============================================================================

export const FONT_SIZE_SCALE: FontSizeScale = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
};

const VALID_SIZES: FontSize[] = ['xs', 'sm', 'base', 'lg', 'xl'];

// =============================================================================
// Sanitization
// =============================================================================

/**
 * Sanitize custom font family input to prevent CSS injection.
 * Removes characters that could break out of font-family context.
 */
export function sanitizeFontFamily(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Remove dangerous characters that could break CSS context
  // Allow: letters, numbers, spaces, quotes, commas, hyphens, underscores
  return input
    .replace(/[;{}()<>\\]/g, '')  // Remove CSS-breaking chars
    .replace(/javascript:/gi, '') // Remove script protocol
    .replace(/expression\s*\(/gi, '') // Remove IE expression()
    .trim()
    .slice(0, 500); // Limit length
}

// =============================================================================
// Default Settings
// =============================================================================

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  uiFont: 'system',
  codeFont: 'system-mono',
  uiFontSize: 'base',
  codeFontSize: 'base',
};

// =============================================================================
// In-Memory State
// =============================================================================

let currentSettings: FontSettings = { ...DEFAULT_FONT_SETTINGS };

// =============================================================================
// UI Font Functions
// =============================================================================

export function getUIFont(): string {
  return currentSettings.uiFont;
}

export function setUIFont(presetId: string, customFamily?: string): void {
  currentSettings.uiFont = presetId;
  if (presetId === 'custom' && customFamily) {
    currentSettings.customUiFont = customFamily;
  }
  applyUIFont(presetId, customFamily);
  persistSettings();
}

export function getCustomUIFont(): string | undefined {
  return currentSettings.customUiFont;
}

// =============================================================================
// Code Font Functions
// =============================================================================

export function getCodeFont(): string {
  return currentSettings.codeFont;
}

export function setCodeFont(presetId: string, customFamily?: string): void {
  currentSettings.codeFont = presetId;
  if (presetId === 'custom' && customFamily) {
    currentSettings.customCodeFont = customFamily;
  }
  applyCodeFont(presetId, customFamily);
  persistSettings();
}

export function getCustomCodeFont(): string | undefined {
  return currentSettings.customCodeFont;
}

// =============================================================================
// Font Size Functions
// =============================================================================

export function getUIFontSize(): FontSize {
  return currentSettings.uiFontSize;
}

export function setUIFontSize(size: FontSize): void {
  if (!VALID_SIZES.includes(size)) {
    throw new Error(`Invalid font size: ${size}. Must be one of: ${VALID_SIZES.join(', ')}`);
  }
  currentSettings.uiFontSize = size;
  applyFontSizes(currentSettings.uiFontSize, currentSettings.codeFontSize);
  persistSettings();
}

export function getCodeFontSize(): FontSize {
  return currentSettings.codeFontSize;
}

export function setCodeFontSize(size: FontSize): void {
  if (!VALID_SIZES.includes(size)) {
    throw new Error(`Invalid font size: ${size}. Must be one of: ${VALID_SIZES.join(', ')}`);
  }
  currentSettings.codeFontSize = size;
  applyFontSizes(currentSettings.uiFontSize, currentSettings.codeFontSize);
  persistSettings();
}

// =============================================================================
// Apply Functions (CSS Variables)
// =============================================================================

export function applyUIFont(presetId: string, customFamily?: string): void {
  const preset = UI_FONT_PRESETS.find(p => p.id === presetId);
  if (!preset) {
    console.error(`[font-presets] Unknown UI font preset: ${presetId}`);
    return;
  }

  const fontFamily = preset.isCustom && customFamily
    ? sanitizeFontFamily(customFamily)
    : preset.fontFamily;
  document.documentElement.style.setProperty('--font-ui', fontFamily);
}

export function applyCodeFont(presetId: string, customFamily?: string): void {
  const preset = CODE_FONT_PRESETS.find(p => p.id === presetId);
  if (!preset) {
    console.error(`[font-presets] Unknown code font preset: ${presetId}`);
    return;
  }

  const fontFamily = preset.isCustom && customFamily
    ? sanitizeFontFamily(customFamily)
    : preset.fontFamily;
  document.documentElement.style.setProperty('--font-mono', fontFamily);
}

export function applyFontSizes(uiSize: FontSize, codeSize: FontSize): void {
  document.documentElement.style.setProperty('--font-size-ui', FONT_SIZE_SCALE[uiSize]);
  document.documentElement.style.setProperty('--font-size-code', FONT_SIZE_SCALE[codeSize]);
}

export function applyFontSettings(settings: FontSettings): void {
  // Apply UI font
  const uiPreset = UI_FONT_PRESETS.find(p => p.id === settings.uiFont);
  if (uiPreset) {
    const uiFontFamily = uiPreset.isCustom && settings.customUiFont
      ? sanitizeFontFamily(settings.customUiFont)
      : uiPreset.fontFamily;
    document.documentElement.style.setProperty('--font-ui', uiFontFamily);
  }

  // Apply code font
  const codePreset = CODE_FONT_PRESETS.find(p => p.id === settings.codeFont);
  if (codePreset) {
    const codeFontFamily = codePreset.isCustom && settings.customCodeFont
      ? sanitizeFontFamily(settings.customCodeFont)
      : codePreset.fontFamily;
    document.documentElement.style.setProperty('--font-mono', codeFontFamily);
  }

  // Apply sizes
  applyFontSizes(settings.uiFontSize, settings.codeFontSize);

  // Update in-memory state
  currentSettings = { ...settings };
}

// =============================================================================
// IPC Integration
// =============================================================================

declare global {
  interface Window {
    electronAPI?: {
      send?: (channel: string, data: unknown) => void;
      invoke?: (channel: string, data: unknown) => Promise<unknown>;
      font?: {
        save: (settings: FontSettings) => Promise<boolean>;
        load: () => Promise<FontSettings | null>;
        getSettingsPath: () => Promise<string>;
      };
    };
  }
}

export function notifyFontChange(type: 'ui' | 'code', presetId: string): void {
  // Font change is broadcast via settings WebSocket
  console.log('[font-presets] Font changed:', type, presetId);
}

// =============================================================================
// Persistence Functions
// =============================================================================

export async function saveFontSettings(settings: FontSettings): Promise<void> {
  currentSettings = { ...settings };
  try {
    // Use REST API to save font settings
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: { fonts: settings } }),
    });
  } catch (err) {
    console.error('[font-presets] Failed to save settings:', err);
  }
}

/**
 * Helper to persist current settings (async but not awaited for better UX)
 */
function persistSettings(): void {
  saveFontSettings(currentSettings).catch(() => {
    // Error already logged in saveFontSettings
  });
}

export async function loadFontSettings(): Promise<FontSettings> {
  try {
    // Use REST API to load font settings
    const response = await fetch('/api/settings');
    if (response.ok) {
      const settings = await response.json();
      if (settings?.display?.fonts) {
        currentSettings = { ...settings.display.fonts };
        return currentSettings;
      }
    }
  } catch (err) {
    console.error('[font-presets] Failed to load settings:', err);
  }
  return { ...DEFAULT_FONT_SETTINGS };
}

export function getFontSettingsPath(): string {
  // Global settings path (in user's home directory)
  const home = typeof process !== 'undefined' ? process.env.HOME : '~';
  return `${home}/.config/cyclist/font-settings.yaml`;
}

// =============================================================================
// Preset Lookup Helpers
// =============================================================================

export function getUIFontPreset(id: string): FontPreset | undefined {
  return UI_FONT_PRESETS.find(p => p.id === id);
}

export function getCodeFontPreset(id: string): FontPreset | undefined {
  return CODE_FONT_PRESETS.find(p => p.id === id);
}

export function getUIFontPresetIds(): string[] {
  return UI_FONT_PRESETS.map(p => p.id);
}

export function getCodeFontPresetIds(): string[] {
  return CODE_FONT_PRESETS.map(p => p.id);
}
