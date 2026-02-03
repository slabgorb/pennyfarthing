/**
 * Color Presets - MSSCI-12768
 *
 * 8 built-in color presets for the Cyclist theme system.
 * Each preset includes UI colors, terminal colors, and WCAG contrast validation.
 */

// =============================================================================
// Types
// =============================================================================

export interface ColorPreset {
  id: string;
  name: string;
  variant: 'dark' | 'light';
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    border: string;
    borderFocus: string;
  };
  terminalColors: {
    background: string;
    foreground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
  };
}

export interface ContrastResult {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

export interface PresetContrastValidation {
  textOnBgPrimary: ContrastResult;
  accentOnBgPrimary: ContrastResult;
}

export interface ContrastReport {
  presetId: string;
  checks: PresetContrastValidation;
  allPass: boolean;
}

// =============================================================================
// Color Presets
// =============================================================================

export const DEFAULT_PRESET = 'midnight';

export const COLOR_PRESETS: Record<string, ColorPreset> = {
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    variant: 'dark',
    colors: {
      bgPrimary: '#1a1a2e',
      bgSecondary: '#16213e',
      bgTertiary: '#0f0f1a',
      textPrimary: '#e4e4e7',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      accent: '#818cf8',
      accentHover: '#a5b4fc',
      border: '#27272a',
      borderFocus: '#818cf8',
    },
    terminalColors: {
      background: '#0f0f1a',
      foreground: '#e4e4e7',
      black: '#1a1a2e',
      red: '#ff6b6b',
      green: '#69db7c',
      yellow: '#ffd43b',
      blue: '#818cf8',
      magenta: '#cc5de8',
      cyan: '#22b8cf',
      white: '#e4e4e7',
    },
  },

  daylight: {
    id: 'daylight',
    name: 'Daylight',
    variant: 'light',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f4f4f5',
      bgTertiary: '#e4e4e7',
      textPrimary: '#18181b',
      textSecondary: '#3f3f46',
      textMuted: '#71717a',
      accent: '#4f46e5',
      accentHover: '#4338ca',
      border: '#d4d4d8',
      borderFocus: '#4f46e5',
    },
    terminalColors: {
      background: '#ffffff',
      foreground: '#18181b',
      black: '#18181b',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#9333ea',
      cyan: '#0891b2',
      white: '#f4f4f5',
    },
  },

  'high-contrast': {
    id: 'high-contrast',
    name: 'High Contrast',
    variant: 'dark',
    colors: {
      bgPrimary: '#000000',
      bgSecondary: '#0a0a0a',
      bgTertiary: '#141414',
      textPrimary: '#ffffff',
      textSecondary: '#e5e5e5',
      textMuted: '#a3a3a3',
      accent: '#ffff00',
      accentHover: '#ffff66',
      border: '#404040',
      borderFocus: '#ffff00',
    },
    terminalColors: {
      background: '#000000',
      foreground: '#ffffff',
      black: '#000000',
      red: '#ff0000',
      green: '#00ff00',
      yellow: '#ffff00',
      blue: '#0080ff',
      magenta: '#ff00ff',
      cyan: '#00ffff',
      white: '#ffffff',
    },
  },

  dracula: {
    id: 'dracula',
    name: 'Dracula',
    variant: 'dark',
    colors: {
      bgPrimary: '#282A36',
      bgSecondary: '#21222C',
      bgTertiary: '#191A21',
      textPrimary: '#F8F8F2',
      textSecondary: '#BFBFBF',
      textMuted: '#6272A4',
      accent: '#BD93F9',
      accentHover: '#CAA9FA',
      border: '#44475A',
      borderFocus: '#BD93F9',
    },
    terminalColors: {
      background: '#282A36',
      foreground: '#F8F8F2',
      black: '#21222C',
      red: '#FF5555',
      green: '#50FA7B',
      yellow: '#F1FA8C',
      blue: '#BD93F9',
      magenta: '#FF79C6',
      cyan: '#8BE9FD',
      white: '#F8F8F2',
    },
  },

  nord: {
    id: 'nord',
    name: 'Nord',
    variant: 'dark',
    colors: {
      bgPrimary: '#2E3440',
      bgSecondary: '#3B4252',
      bgTertiary: '#434C5E',
      textPrimary: '#ECEFF4',
      textSecondary: '#D8DEE9',
      textMuted: '#4C566A',
      accent: '#88C0D0',
      accentHover: '#8FBCBB',
      border: '#4C566A',
      borderFocus: '#88C0D0',
    },
    terminalColors: {
      background: '#2E3440',
      foreground: '#ECEFF4',
      black: '#3B4252',
      red: '#BF616A',
      green: '#A3BE8C',
      yellow: '#EBCB8B',
      blue: '#81A1C1',
      magenta: '#B48EAD',
      cyan: '#88C0D0',
      white: '#ECEFF4',
    },
  },

  gruvbox: {
    id: 'gruvbox',
    name: 'Gruvbox',
    variant: 'dark',
    colors: {
      bgPrimary: '#1D2021',
      bgSecondary: '#282828',
      bgTertiary: '#3C3836',
      textPrimary: '#EBDBB2',
      textSecondary: '#D5C4A1',
      textMuted: '#928374',
      accent: '#8EC07C',
      accentHover: '#B8BB26',
      border: '#504945',
      borderFocus: '#8EC07C',
    },
    terminalColors: {
      background: '#1D2021',
      foreground: '#EBDBB2',
      black: '#282828',
      red: '#CC241D',
      green: '#98971A',
      yellow: '#D79921',
      blue: '#458588',
      magenta: '#B16286',
      cyan: '#689D6A',
      white: '#EBDBB2',
    },
  },

  catppuccin: {
    id: 'catppuccin',
    name: 'Catppuccin',
    variant: 'dark',
    colors: {
      bgPrimary: '#1E1E2E',
      bgSecondary: '#181825',
      bgTertiary: '#11111B',
      textPrimary: '#CDD6F4',
      textSecondary: '#BAC2DE',
      textMuted: '#6C7086',
      accent: '#89B4FA',
      accentHover: '#74C7EC',
      border: '#45475A',
      borderFocus: '#89B4FA',
    },
    terminalColors: {
      background: '#1E1E2E',
      foreground: '#CDD6F4',
      black: '#45475A',
      red: '#F38BA8',
      green: '#A6E3A1',
      yellow: '#F9E2AF',
      blue: '#89B4FA',
      magenta: '#F5C2E7',
      cyan: '#94E2D5',
      white: '#CDD6F4',
    },
  },

  'tokyo-night': {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    variant: 'dark',
    colors: {
      bgPrimary: '#1A1B26',
      bgSecondary: '#16161E',
      bgTertiary: '#13131A',
      textPrimary: '#A9B1D6',
      textSecondary: '#9AA5CE',
      textMuted: '#565F89',
      accent: '#7AA2F7',
      accentHover: '#7DCFFF',
      border: '#292E42',
      borderFocus: '#7AA2F7',
    },
    terminalColors: {
      background: '#1A1B26',
      foreground: '#A9B1D6',
      black: '#32344A',
      red: '#F7768E',
      green: '#9ECE6A',
      yellow: '#E0AF68',
      blue: '#7AA2F7',
      magenta: '#BB9AF7',
      cyan: '#7DCFFF',
      white: '#A9B1D6',
    },
  },
};

// =============================================================================
// Preset Access Functions
// =============================================================================

export function getPreset(id: string): ColorPreset | undefined {
  return COLOR_PRESETS[id];
}

export function getPresetIds(): string[] {
  return Object.keys(COLOR_PRESETS);
}

// =============================================================================
// WCAG Contrast Functions
// =============================================================================

/**
 * Parse hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

/**
 * Calculate relative luminance per WCAG 2.0
 */
function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Check contrast ratio between two colors
 */
export function checkContrast(foreground: string, background: string): ContrastResult {
  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}

/**
 * Validate contrast ratios for a preset
 */
export function validatePresetContrast(preset: ColorPreset): PresetContrastValidation {
  return {
    textOnBgPrimary: checkContrast(preset.colors.textPrimary, preset.colors.bgPrimary),
    accentOnBgPrimary: checkContrast(preset.colors.accent, preset.colors.bgPrimary),
  };
}

/**
 * Get full contrast report for a preset
 */
export function getContrastReport(preset: ColorPreset): ContrastReport {
  const checks = validatePresetContrast(preset);
  return {
    presetId: preset.id,
    checks,
    allPass: checks.textOnBgPrimary.passesAA && checks.accentOnBgPrimary.passesAA,
  };
}

// =============================================================================
// Preset Application
// =============================================================================

/**
 * Apply a preset to the document
 */
export function applyPreset(presetId: string): void {
  const preset = getPreset(presetId);
  if (!preset) {
    console.error(`[color-presets] Unknown preset: ${presetId}`);
    return;
  }

  const root = document.documentElement;

  // Add transition class
  root.classList.add('theme-transition');

  // Set data attributes
  root.setAttribute('data-preset', preset.id);
  root.setAttribute('data-variant', preset.variant);

  // Apply UI colors
  root.style.setProperty('--bg-primary', preset.colors.bgPrimary);
  root.style.setProperty('--bg-secondary', preset.colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', preset.colors.bgTertiary);
  root.style.setProperty('--text-primary', preset.colors.textPrimary);
  root.style.setProperty('--text-secondary', preset.colors.textSecondary);
  root.style.setProperty('--text-muted', preset.colors.textMuted);
  root.style.setProperty('--accent', preset.colors.accent);
  root.style.setProperty('--accent-hover', preset.colors.accentHover);
  root.style.setProperty('--border', preset.colors.border);
  root.style.setProperty('--border-focus', preset.colors.borderFocus);

  // Apply terminal colors
  root.style.setProperty('--terminal-background', preset.terminalColors.background);
  root.style.setProperty('--terminal-foreground', preset.terminalColors.foreground);
  root.style.setProperty('--terminal-black', preset.terminalColors.black);
  root.style.setProperty('--terminal-red', preset.terminalColors.red);
  root.style.setProperty('--terminal-green', preset.terminalColors.green);
  root.style.setProperty('--terminal-yellow', preset.terminalColors.yellow);
  root.style.setProperty('--terminal-blue', preset.terminalColors.blue);
  root.style.setProperty('--terminal-magenta', preset.terminalColors.magenta);
  root.style.setProperty('--terminal-cyan', preset.terminalColors.cyan);
  root.style.setProperty('--terminal-white', preset.terminalColors.white);

  // Dispatch event
  window.dispatchEvent(new CustomEvent('presetChange', { detail: { presetId } }));
}

// =============================================================================
// Preset Cycling
// =============================================================================

export function cyclePreset(currentId: string, direction: 'forward' | 'backward'): string {
  const ids = getPresetIds();
  const currentIndex = ids.indexOf(currentId);

  if (currentIndex === -1) {
    return ids[0];
  }

  if (direction === 'forward') {
    return ids[(currentIndex + 1) % ids.length];
  } else {
    return ids[(currentIndex - 1 + ids.length) % ids.length];
  }
}

// =============================================================================
// Keyboard Shortcut
// =============================================================================

let shortcutHandler: ((e: KeyboardEvent) => void) | null = null;

export function registerThemeShortcut(
  onCycle: (direction: 'forward' | 'backward') => void
): () => void {
  shortcutHandler = (e: KeyboardEvent) => {
    // Cmd/Ctrl+Shift+T
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      if (e.altKey) {
        onCycle('backward');
      } else {
        onCycle('forward');
      }
    }
  };

  document.addEventListener('keydown', shortcutHandler);

  return () => {
    if (shortcutHandler) {
      document.removeEventListener('keydown', shortcutHandler);
      shortcutHandler = null;
    }
  };
}

// =============================================================================
// Project Persistence (IPC)
// =============================================================================

declare global {
  interface Window {
    electronAPI?: {
      config?: {
        saveProjectConfig: (key: string, value: string) => Promise<boolean>;
        loadProjectConfig: (key: string) => Promise<string | null>;
      };
      theme?: {
        onPresetChanged: (callback: (presetId: string) => void) => () => void;
        broadcastPreset: (presetId: string) => void;
      };
    };
  }
}

export async function savePresetToProject(presetId: string): Promise<boolean> {
  if (!getPreset(presetId)) {
    throw new Error(`Invalid preset id: ${presetId}`);
  }

  try {
    // Use REST API to save color preset to settings
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: { colorPreset: presetId } }),
    });
    return response.ok;
  } catch (err) {
    console.error('[color-presets] Failed to save preset:', err);
    return false;
  }
}

export async function loadPresetFromProject(): Promise<string> {
  try {
    // Use REST API to load color preset from settings
    const response = await fetch('/api/settings');
    if (response.ok) {
      const settings = await response.json();
      const presetId = settings?.display?.colorPreset;
      return presetId && getPreset(presetId) ? presetId : DEFAULT_PRESET;
    }
    return DEFAULT_PRESET;
  } catch (err) {
    console.error('[color-presets] Failed to load preset:', err);
    return DEFAULT_PRESET;
  }
}

// =============================================================================
// Window Sync (WebSocket)
// =============================================================================

export function subscribeToPresetChanges(
  callback: (presetId: string) => void
): () => void {
  // Connect to settings WebSocket for real-time sync
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if ((data.type === 'init' || data.type === 'update') && data.settings?.display?.colorPreset) {
        callback(data.settings.display.colorPreset);
      }
    } catch {
      // Ignore parse errors
    }
  };

  return () => ws.close();
}

export function broadcastPresetChange(presetId: string): void {
  // Broadcast is handled by the settings API - when we PATCH, it broadcasts via WebSocket
  console.log('[color-presets] Preset changed:', presetId);
}

export function initPresetSync(): void {
  subscribeToPresetChanges((presetId) => {
    applyPreset(presetId);
  });
}
