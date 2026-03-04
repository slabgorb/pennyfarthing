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

  'solarized-dark': {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    variant: 'dark',
    colors: {
      bgPrimary: '#002B36',
      bgSecondary: '#073642',
      bgTertiary: '#001E27',
      textPrimary: '#839496',
      textSecondary: '#657B83',
      textMuted: '#586E75',
      accent: '#2B9ED8',
      accentHover: '#2AA198',
      border: '#094959',
      borderFocus: '#2B9ED8',
    },
    terminalColors: {
      background: '#002B36',
      foreground: '#839496',
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
    },
  },

  'solarized-light': {
    id: 'solarized-light',
    name: 'Solarized Light',
    variant: 'light',
    colors: {
      bgPrimary: '#FDF6E3',
      bgSecondary: '#EEE8D5',
      bgTertiary: '#DDD6C1',
      textPrimary: '#475B62',
      textSecondary: '#586E75',
      textMuted: '#93A1A1',
      accent: '#0B69AD',
      accentHover: '#2AA198',
      border: '#D3CBB8',
      borderFocus: '#0B69AD',
    },
    terminalColors: {
      background: '#FDF6E3',
      foreground: '#657B83',
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#FDF6E3',
    },
  },

  monokai: {
    id: 'monokai',
    name: 'Monokai',
    variant: 'dark',
    colors: {
      bgPrimary: '#272822',
      bgSecondary: '#1E1F1C',
      bgTertiary: '#171813',
      textPrimary: '#F8F8F2',
      textSecondary: '#CFCFC2',
      textMuted: '#75715E',
      accent: '#A6E22E',
      accentHover: '#E6DB74',
      border: '#3E3D32',
      borderFocus: '#A6E22E',
    },
    terminalColors: {
      background: '#272822',
      foreground: '#F8F8F2',
      black: '#272822',
      red: '#F92672',
      green: '#A6E22E',
      yellow: '#F4BF75',
      blue: '#66D9EF',
      magenta: '#AE81FF',
      cyan: '#A1EFE4',
      white: '#F8F8F2',
    },
  },

  'one-dark': {
    id: 'one-dark',
    name: 'One Dark',
    variant: 'dark',
    colors: {
      bgPrimary: '#282C34',
      bgSecondary: '#21252B',
      bgTertiary: '#1B1D23',
      textPrimary: '#ABB2BF',
      textSecondary: '#9DA5B4',
      textMuted: '#636D83',
      accent: '#61AFEF',
      accentHover: '#528BFF',
      border: '#3E4451',
      borderFocus: '#61AFEF',
    },
    terminalColors: {
      background: '#282C34',
      foreground: '#ABB2BF',
      black: '#3F4451',
      red: '#E06C75',
      green: '#98C379',
      yellow: '#E5C07B',
      blue: '#61AFEF',
      magenta: '#C678DD',
      cyan: '#56B6C2',
      white: '#ABB2BF',
    },
  },

  'one-light': {
    id: 'one-light',
    name: 'One Light',
    variant: 'light',
    colors: {
      bgPrimary: '#FAFAFA',
      bgSecondary: '#F0F0F0',
      bgTertiary: '#E5E5E6',
      textPrimary: '#383A42',
      textSecondary: '#4F525D',
      textMuted: '#A0A1A7',
      accent: '#3367D6',
      accentHover: '#526FFF',
      border: '#D3D3D4',
      borderFocus: '#3367D6',
    },
    terminalColors: {
      background: '#FAFAFA',
      foreground: '#383A42',
      black: '#383A42',
      red: '#E45649',
      green: '#50A14F',
      yellow: '#C18401',
      blue: '#4078F2',
      magenta: '#A626A4',
      cyan: '#0184BC',
      white: '#FAFAFA',
    },
  },

  'github-dark': {
    id: 'github-dark',
    name: 'GitHub Dark',
    variant: 'dark',
    colors: {
      bgPrimary: '#0D1117',
      bgSecondary: '#161B22',
      bgTertiary: '#010409',
      textPrimary: '#C9D1D9',
      textSecondary: '#8B949E',
      textMuted: '#6E7681',
      accent: '#58A6FF',
      accentHover: '#79C0FF',
      border: '#30363D',
      borderFocus: '#58A6FF',
    },
    terminalColors: {
      background: '#0D1117',
      foreground: '#C9D1D9',
      black: '#484F58',
      red: '#FF7B72',
      green: '#7EE787',
      yellow: '#D29922',
      blue: '#58A6FF',
      magenta: '#BC8CFF',
      cyan: '#39C5CF',
      white: '#C9D1D9',
    },
  },

  'github-light': {
    id: 'github-light',
    name: 'GitHub Light',
    variant: 'light',
    colors: {
      bgPrimary: '#FFFFFF',
      bgSecondary: '#F6F8FA',
      bgTertiary: '#EAEEF2',
      textPrimary: '#1F2328',
      textSecondary: '#656D76',
      textMuted: '#8C959F',
      accent: '#0969DA',
      accentHover: '#0550AE',
      border: '#D0D7DE',
      borderFocus: '#0969DA',
    },
    terminalColors: {
      background: '#FFFFFF',
      foreground: '#1F2328',
      black: '#24292F',
      red: '#CF222E',
      green: '#1A7F37',
      yellow: '#9A6700',
      blue: '#0969DA',
      magenta: '#8250DF',
      cyan: '#1B7C83',
      white: '#FFFFFF',
    },
  },

  'rose-pine': {
    id: 'rose-pine',
    name: 'Rosé Pine',
    variant: 'dark',
    colors: {
      bgPrimary: '#191724',
      bgSecondary: '#1F1D2E',
      bgTertiary: '#26233A',
      textPrimary: '#E0DEF4',
      textSecondary: '#908CAA',
      textMuted: '#6E6A86',
      accent: '#C4A7E7',
      accentHover: '#EB6F92',
      border: '#403D52',
      borderFocus: '#C4A7E7',
    },
    terminalColors: {
      background: '#191724',
      foreground: '#E0DEF4',
      black: '#26233A',
      red: '#EB6F92',
      green: '#31748F',
      yellow: '#F6C177',
      blue: '#9CCFD8',
      magenta: '#C4A7E7',
      cyan: '#EBBCBA',
      white: '#E0DEF4',
    },
  },

  'rose-pine-dawn': {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    variant: 'light',
    colors: {
      bgPrimary: '#FAF4ED',
      bgSecondary: '#FFFAF3',
      bgTertiary: '#F2E9E1',
      textPrimary: '#575279',
      textSecondary: '#797593',
      textMuted: '#9893A5',
      accent: '#735E8C',
      accentHover: '#B4637A',
      border: '#DFDAD9',
      borderFocus: '#735E8C',
    },
    terminalColors: {
      background: '#FAF4ED',
      foreground: '#575279',
      black: '#575279',
      red: '#B4637A',
      green: '#286983',
      yellow: '#EA9D34',
      blue: '#56949F',
      magenta: '#907AA9',
      cyan: '#D7827E',
      white: '#FAF4ED',
    },
  },

  kanagawa: {
    id: 'kanagawa',
    name: 'Kanagawa',
    variant: 'dark',
    colors: {
      bgPrimary: '#1F1F28',
      bgSecondary: '#2A2A37',
      bgTertiary: '#16161D',
      textPrimary: '#DCD7BA',
      textSecondary: '#C8C093',
      textMuted: '#727169',
      accent: '#7E9CD8',
      accentHover: '#7FB4CA',
      border: '#363646',
      borderFocus: '#7E9CD8',
    },
    terminalColors: {
      background: '#1F1F28',
      foreground: '#DCD7BA',
      black: '#16161D',
      red: '#C34043',
      green: '#76946A',
      yellow: '#C0A36E',
      blue: '#7E9CD8',
      magenta: '#957FB8',
      cyan: '#6A9589',
      white: '#DCD7BA',
    },
  },

  'ayu-dark': {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    variant: 'dark',
    colors: {
      bgPrimary: '#0B0E14',
      bgSecondary: '#0D1017',
      bgTertiary: '#060810',
      textPrimary: '#BFBDB6',
      textSecondary: '#9B9B9B',
      textMuted: '#636A72',
      accent: '#E6B450',
      accentHover: '#FFB454',
      border: '#1C1F27',
      borderFocus: '#E6B450',
    },
    terminalColors: {
      background: '#0B0E14',
      foreground: '#BFBDB6',
      black: '#01060E',
      red: '#EA6C73',
      green: '#91B362',
      yellow: '#F9AF4F',
      blue: '#53BDFA',
      magenta: '#D2A6FF',
      cyan: '#90E1C6',
      white: '#C7C7C7',
    },
  },

  'ayu-light': {
    id: 'ayu-light',
    name: 'Ayu Light',
    variant: 'light',
    colors: {
      bgPrimary: '#FCFCFC',
      bgSecondary: '#F3F4F5',
      bgTertiary: '#E7E8E9',
      textPrimary: '#5C6166',
      textSecondary: '#787B80',
      textMuted: '#ABB0B6',
      accent: '#9E5E08',
      accentHover: '#F2AE49',
      border: '#D8D8D8',
      borderFocus: '#9E5E08',
    },
    terminalColors: {
      background: '#FCFCFC',
      foreground: '#5C6166',
      black: '#1A1F29',
      red: '#F07171',
      green: '#86B300',
      yellow: '#F2AE49',
      blue: '#399EE6',
      magenta: '#A37ACC',
      cyan: '#4CBF99',
      white: '#FCFCFC',
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
      send?: (channel: string, data: unknown) => void;
      invoke?: (channel: string, data: unknown) => Promise<unknown>;
      font?: {
        save: (settings: unknown) => Promise<boolean>;
        load: () => Promise<unknown>;
        getSettingsPath: () => Promise<string>;
      };
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
