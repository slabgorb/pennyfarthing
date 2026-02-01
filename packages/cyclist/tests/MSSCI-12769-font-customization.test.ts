/**
 * MSSCI-12769: Font Customization
 *
 * Tests for font customization system including UI font and code font selection,
 * size scale, persistence, and immediate application.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: UI font selector with presets: System, Inter, custom
 * - AC2: Code font selector with presets: System mono, JetBrains Mono, Fira Code, custom
 * - AC3: Global persistence (not per-project)
 * - AC4: Tailwind-like size scale (xs/sm/base/lg/xl)
 * - AC5: Immediate apply without restart
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Type Definitions (expected interface for font customization)
// =============================================================================

/**
 * Font preset configuration
 */
export interface FontPreset {
  id: string;
  name: string;
  fontFamily: string;
  isCustom?: boolean;
}

/**
 * Font size scale (Tailwind-like)
 */
export type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl';

/**
 * Font settings for persistence
 */
export interface FontSettings {
  uiFont: string;        // Preset ID or custom font family
  codeFont: string;      // Preset ID or custom font family
  uiFontSize: FontSize;
  codeFontSize: FontSize;
  customUiFont?: string; // Custom font family if using 'custom' preset
  customCodeFont?: string;
}

/**
 * CSS variable mapping for font sizes
 */
export interface FontSizeScale {
  xs: string;
  sm: string;
  base: string;
  lg: string;
  xl: string;
}

// =============================================================================
// AC1: UI Font Selector with Presets
// =============================================================================

describe('AC1: UI Font Selector', () => {
  describe('Preset definitions', () => {
    it('should have System font preset', async () => {
      const { UI_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const systemPreset = UI_FONT_PRESETS.find((p: FontPreset) => p.id === 'system');
      expect(systemPreset).toBeDefined();
      expect(systemPreset?.name).toBe('System');
      expect(systemPreset?.fontFamily).toContain('system-ui');
    });

    it('should have Inter font preset', async () => {
      const { UI_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const interPreset = UI_FONT_PRESETS.find((p: FontPreset) => p.id === 'inter');
      expect(interPreset).toBeDefined();
      expect(interPreset?.name).toBe('Inter');
      expect(interPreset?.fontFamily).toContain('Inter');
    });

    it('should have custom font option', async () => {
      const { UI_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const customPreset = UI_FONT_PRESETS.find((p: FontPreset) => p.id === 'custom');
      expect(customPreset).toBeDefined();
      expect(customPreset?.isCustom).toBe(true);
    });
  });

  describe('Font selection', () => {
    it('should return current UI font preset', async () => {
      const { getUIFont } = await import('../src/public/js/font-presets.js');

      const current = getUIFont();
      expect(current).toBeDefined();
      expect(typeof current).toBe('string');
    });

    it('should set UI font to preset', async () => {
      const { setUIFont, getUIFont } = await import('../src/public/js/font-presets.js');

      setUIFont('inter');
      expect(getUIFont()).toBe('inter');
    });

    it('should set UI font to custom value', async () => {
      const { setUIFont, getUIFont, getCustomUIFont } = await import('../src/public/js/font-presets.js');

      setUIFont('custom', 'Helvetica Neue');
      expect(getUIFont()).toBe('custom');
      expect(getCustomUIFont()).toBe('Helvetica Neue');
    });
  });
});

// =============================================================================
// AC2: Code Font Selector with Presets
// =============================================================================

describe('AC2: Code Font Selector', () => {
  describe('Preset definitions', () => {
    it('should have System mono font preset', async () => {
      const { CODE_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const systemPreset = CODE_FONT_PRESETS.find((p: FontPreset) => p.id === 'system-mono');
      expect(systemPreset).toBeDefined();
      expect(systemPreset?.name).toBe('System Mono');
      expect(systemPreset?.fontFamily).toContain('monospace');
    });

    it('should have JetBrains Mono font preset', async () => {
      const { CODE_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const jetbrainsPreset = CODE_FONT_PRESETS.find((p: FontPreset) => p.id === 'jetbrains-mono');
      expect(jetbrainsPreset).toBeDefined();
      expect(jetbrainsPreset?.name).toBe('JetBrains Mono');
      expect(jetbrainsPreset?.fontFamily).toContain('JetBrains Mono');
    });

    it('should have Fira Code font preset', async () => {
      const { CODE_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const firaPreset = CODE_FONT_PRESETS.find((p: FontPreset) => p.id === 'fira-code');
      expect(firaPreset).toBeDefined();
      expect(firaPreset?.name).toBe('Fira Code');
      expect(firaPreset?.fontFamily).toContain('Fira Code');
    });

    it('should have custom code font option', async () => {
      const { CODE_FONT_PRESETS } = await import('../src/public/js/font-presets.js');

      const customPreset = CODE_FONT_PRESETS.find((p: FontPreset) => p.id === 'custom');
      expect(customPreset).toBeDefined();
      expect(customPreset?.isCustom).toBe(true);
    });
  });

  describe('Font selection', () => {
    it('should return current code font preset', async () => {
      const { getCodeFont } = await import('../src/public/js/font-presets.js');

      const current = getCodeFont();
      expect(current).toBeDefined();
      expect(typeof current).toBe('string');
    });

    it('should set code font to preset', async () => {
      const { setCodeFont, getCodeFont } = await import('../src/public/js/font-presets.js');

      setCodeFont('jetbrains-mono');
      expect(getCodeFont()).toBe('jetbrains-mono');
    });

    it('should set code font to custom value', async () => {
      const { setCodeFont, getCodeFont, getCustomCodeFont } = await import('../src/public/js/font-presets.js');

      setCodeFont('custom', 'Monaco');
      expect(getCodeFont()).toBe('custom');
      expect(getCustomCodeFont()).toBe('Monaco');
    });
  });
});

// =============================================================================
// AC3: Global Persistence (not per-project)
// =============================================================================

describe('AC3: Global Persistence', () => {
  it('should have saveFontSettings and loadFontSettings exports', async () => {
    const { saveFontSettings, loadFontSettings } = await import('../src/public/js/font-presets.js');

    expect(typeof saveFontSettings).toBe('function');
    expect(typeof loadFontSettings).toBe('function');
  });

  it('should NOT persist to project-specific config.local.yaml', async () => {
    const { getFontSettingsPath } = await import('../src/public/js/font-presets.js');

    const path = getFontSettingsPath();
    // Should be in user's home directory, not project directory
    expect(path).toContain(process.env.HOME || '~');
    expect(path).not.toContain('config.local.yaml');
  });

  it('should update in-memory state when applyFontSettings is called', async () => {
    const { applyFontSettings, getUIFont, getCodeFont, getUIFontSize, getCodeFontSize } = await import('../src/public/js/font-presets.js');

    const settings: FontSettings = {
      uiFont: 'inter',
      codeFont: 'fira-code',
      uiFontSize: 'lg',
      codeFontSize: 'sm',
    };

    applyFontSettings(settings);

    // In-memory state should be updated
    expect(getUIFont()).toBe('inter');
    expect(getCodeFont()).toBe('fira-code');
    expect(getUIFontSize()).toBe('lg');
    expect(getCodeFontSize()).toBe('sm');
  });

  it('should provide default settings when no saved settings exist', async () => {
    const { loadFontSettings, DEFAULT_FONT_SETTINGS } = await import('../src/public/js/font-presets.js');

    // Without IPC, loadFontSettings returns defaults
    const loaded = await loadFontSettings();

    expect(loaded.uiFont).toBe(DEFAULT_FONT_SETTINGS.uiFont);
    expect(loaded.codeFont).toBe(DEFAULT_FONT_SETTINGS.codeFont);
    expect(loaded.uiFontSize).toBe(DEFAULT_FONT_SETTINGS.uiFontSize);
    expect(loaded.codeFontSize).toBe(DEFAULT_FONT_SETTINGS.codeFontSize);
  });
});

// =============================================================================
// AC4: Tailwind-like Size Scale
// =============================================================================

describe('AC4: Font Size Scale', () => {
  describe('Size scale definitions', () => {
    it('should define all Tailwind-like sizes', async () => {
      const { FONT_SIZE_SCALE } = await import('../src/public/js/font-presets.js');

      expect(FONT_SIZE_SCALE).toHaveProperty('xs');
      expect(FONT_SIZE_SCALE).toHaveProperty('sm');
      expect(FONT_SIZE_SCALE).toHaveProperty('base');
      expect(FONT_SIZE_SCALE).toHaveProperty('lg');
      expect(FONT_SIZE_SCALE).toHaveProperty('xl');
    });

    it('should have progressively larger sizes', async () => {
      const { FONT_SIZE_SCALE } = await import('../src/public/js/font-presets.js');

      // Parse rem values and verify progression
      const parseRem = (s: string) => parseFloat(s.replace('rem', ''));

      expect(parseRem(FONT_SIZE_SCALE.xs)).toBeLessThan(parseRem(FONT_SIZE_SCALE.sm));
      expect(parseRem(FONT_SIZE_SCALE.sm)).toBeLessThan(parseRem(FONT_SIZE_SCALE.base));
      expect(parseRem(FONT_SIZE_SCALE.base)).toBeLessThan(parseRem(FONT_SIZE_SCALE.lg));
      expect(parseRem(FONT_SIZE_SCALE.lg)).toBeLessThan(parseRem(FONT_SIZE_SCALE.xl));
    });

    it('should use rem units for accessibility', async () => {
      const { FONT_SIZE_SCALE } = await import('../src/public/js/font-presets.js');

      Object.values(FONT_SIZE_SCALE).forEach((size) => {
        expect(size).toMatch(/rem$/);
      });
    });
  });

  describe('Size selection', () => {
    it('should get/set UI font size', async () => {
      const { setUIFontSize, getUIFontSize } = await import('../src/public/js/font-presets.js');

      setUIFontSize('lg');
      expect(getUIFontSize()).toBe('lg');
    });

    it('should get/set code font size', async () => {
      const { setCodeFontSize, getCodeFontSize } = await import('../src/public/js/font-presets.js');

      setCodeFontSize('sm');
      expect(getCodeFontSize()).toBe('sm');
    });

    it('should reject invalid size values', async () => {
      const { setUIFontSize } = await import('../src/public/js/font-presets.js');

      expect(() => setUIFontSize('huge' as FontSize)).toThrow();
    });
  });
});

// =============================================================================
// AC5: Immediate Apply Without Restart
// =============================================================================

describe('AC5: Immediate Application', () => {
  beforeEach(() => {
    // Set up minimal DOM
    document.documentElement.style.cssText = '';
  });

  describe('CSS variable updates', () => {
    it('should update --font-ui CSS variable immediately', async () => {
      const { applyUIFont } = await import('../src/public/js/font-presets.js');

      applyUIFont('inter');

      const rootStyle = getComputedStyle(document.documentElement);
      expect(rootStyle.getPropertyValue('--font-ui')).toContain('Inter');
    });

    it('should update --font-mono CSS variable immediately', async () => {
      const { applyCodeFont } = await import('../src/public/js/font-presets.js');

      applyCodeFont('jetbrains-mono');

      const rootStyle = getComputedStyle(document.documentElement);
      expect(rootStyle.getPropertyValue('--font-mono')).toContain('JetBrains Mono');
    });

    it('should update font size CSS variables', async () => {
      const { applyFontSizes } = await import('../src/public/js/font-presets.js');

      applyFontSizes('lg', 'sm');

      const rootStyle = getComputedStyle(document.documentElement);
      expect(rootStyle.getPropertyValue('--font-size-ui')).toBeTruthy();
      expect(rootStyle.getPropertyValue('--font-size-code')).toBeTruthy();
    });
  });

  describe('Full settings application', () => {
    it('should apply all font settings at once', async () => {
      const { applyFontSettings } = await import('../src/public/js/font-presets.js');

      const settings: FontSettings = {
        uiFont: 'inter',
        codeFont: 'fira-code',
        uiFontSize: 'lg',
        codeFontSize: 'base',
      };

      applyFontSettings(settings);

      const rootStyle = getComputedStyle(document.documentElement);
      expect(rootStyle.getPropertyValue('--font-ui')).toContain('Inter');
      expect(rootStyle.getPropertyValue('--font-mono')).toContain('Fira Code');
    });

    it('should not require page reload', async () => {
      const { applyFontSettings } = await import('../src/public/js/font-presets.js');

      const reloadSpy = vi.spyOn(window.location, 'reload');

      applyFontSettings({
        uiFont: 'system',
        codeFont: 'system-mono',
        uiFontSize: 'base',
        codeFontSize: 'base',
      });

      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('should apply custom fonts correctly', async () => {
      const { applyFontSettings } = await import('../src/public/js/font-presets.js');

      applyFontSettings({
        uiFont: 'custom',
        codeFont: 'custom',
        uiFontSize: 'base',
        codeFontSize: 'base',
        customUiFont: 'Georgia',
        customCodeFont: 'Courier New',
      });

      const rootStyle = getComputedStyle(document.documentElement);
      expect(rootStyle.getPropertyValue('--font-ui')).toContain('Georgia');
      expect(rootStyle.getPropertyValue('--font-mono')).toContain('Courier New');
    });
  });

  describe('IPC integration', () => {
    it('should send font change to main process via IPC', async () => {
      const mockIpcSend = vi.fn();
      (window as any).electronAPI = { send: mockIpcSend };

      const { notifyFontChange } = await import('../src/public/js/font-presets.js');

      notifyFontChange('ui', 'inter');

      expect(mockIpcSend).toHaveBeenCalledWith('font-change', {
        type: 'ui',
        presetId: 'inter',
      });
    });

    it('should persist via IPC when settings change', async () => {
      const mockIpcInvoke = vi.fn().mockResolvedValue(true);
      (window as any).electronAPI = { invoke: mockIpcInvoke };

      const { setUIFont } = await import('../src/public/js/font-presets.js');

      await setUIFont('inter');

      expect(mockIpcInvoke).toHaveBeenCalledWith('save-font-settings', expect.any(Object));
    });
  });
});

// =============================================================================
// FontPicker Component Tests
// =============================================================================

describe('FontPicker Component', () => {
  it('should render font picker component', async () => {
    const { FontPicker } = await import('../src/public/components/FontPicker/index.js');

    expect(FontPicker).toBeDefined();
    expect(typeof FontPicker).toBe('function');
  });

  it('should accept currentFont prop', async () => {
    const { FontPicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render } = await import('@testing-library/react');

    const { container } = render(
      React.createElement(FontPicker, {
        type: 'ui',
        currentFont: 'inter',
        onSelect: () => {},
      })
    );

    expect(container.querySelector('.font-picker')).toBeTruthy();
  });

  it('should call onSelect when font is chosen', async () => {
    const { FontPicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render, fireEvent } = await import('@testing-library/react');

    const onSelect = vi.fn();
    const { container } = render(
      React.createElement(FontPicker, {
        type: 'ui',
        currentFont: 'system',
        onSelect,
      })
    );

    // Open dropdown using the main button (not option buttons)
    const mainButton = container.querySelector('.font-picker-button');
    if (mainButton) fireEvent.click(mainButton);

    // Select Inter option
    const interOption = container.querySelector('[data-font-id="inter"]');
    if (interOption) fireEvent.click(interOption);

    expect(onSelect).toHaveBeenCalledWith('inter');
  });

  it('should show font preview in dropdown options', async () => {
    const { FontPicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render, fireEvent } = await import('@testing-library/react');

    const { container } = render(
      React.createElement(FontPicker, {
        type: 'ui',
        currentFont: 'system',
        onSelect: () => {},
      })
    );

    // Open dropdown
    const mainButton = container.querySelector('.font-picker-button');
    if (mainButton) fireEvent.click(mainButton);

    const options = container.querySelectorAll('.font-picker-option');

    // Each option should have font-family style (either from preset or inherit)
    expect(options.length).toBeGreaterThan(0);
    options.forEach((option) => {
      expect(option.getAttribute('style')).toBeTruthy();
    });
  });

  it('should show custom font input when custom is selected', async () => {
    const { FontPicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render } = await import('@testing-library/react');

    const { container } = render(
      React.createElement(FontPicker, {
        type: 'ui',
        currentFont: 'custom',
        customFont: 'Arial',
        onSelect: () => {},
        onCustomFontChange: () => {},
      })
    );

    // Custom font input should be visible
    const customInput = container.querySelector('.font-picker-custom-input');
    expect(customInput).toBeTruthy();
  });
});

// =============================================================================
// FontSizePicker Component Tests
// =============================================================================

describe('FontSizePicker Component', () => {
  it('should render size picker component', async () => {
    const { FontSizePicker } = await import('../src/public/components/FontPicker/index.js');

    expect(FontSizePicker).toBeDefined();
  });

  it('should display all size options', async () => {
    const { FontSizePicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render } = await import('@testing-library/react');

    const { container } = render(
      React.createElement(FontSizePicker, {
        currentSize: 'base',
        onSelect: () => {},
      })
    );

    // Check for all size buttons by data-size attribute
    expect(container.querySelector('[data-size="xs"]')).toBeTruthy();
    expect(container.querySelector('[data-size="sm"]')).toBeTruthy();
    expect(container.querySelector('[data-size="base"]')).toBeTruthy();
    expect(container.querySelector('[data-size="lg"]')).toBeTruthy();
    expect(container.querySelector('[data-size="xl"]')).toBeTruthy();
  });

  it('should highlight current size', async () => {
    const { FontSizePicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render, getByRole } = await import('@testing-library/react');

    const { container } = render(
      React.createElement(FontSizePicker, {
        currentSize: 'lg',
        onSelect: () => {},
      })
    );

    const lgButton = container.querySelector('[data-size="lg"]');
    expect(lgButton?.classList.contains('active')).toBe(true);
  });

  it('should call onSelect with size value', async () => {
    const { FontSizePicker } = await import('../src/public/components/FontPicker/index.js');
    const React = await import('react');
    const { render, fireEvent } = await import('@testing-library/react');

    const onSelect = vi.fn();
    const { container } = render(
      React.createElement(FontSizePicker, {
        currentSize: 'base',
        onSelect,
      })
    );

    const xlButton = container.querySelector('[data-size="xl"]');
    if (xlButton) fireEvent.click(xlButton);

    expect(onSelect).toHaveBeenCalledWith('xl');
  });
});

// =============================================================================
// Sanitization
// =============================================================================

describe('Font Family Sanitization', () => {
  it('should sanitize dangerous characters from custom font input', async () => {
    const { sanitizeFontFamily } = await import('../src/public/js/font-presets.js');

    // Should remove CSS-breaking characters
    expect(sanitizeFontFamily('Arial; body { display: none }')).toBe('Arial body  display: none');
    expect(sanitizeFontFamily('Arial{}')).toBe('Arial');
    expect(sanitizeFontFamily('Arial<script>')).toBe('Arialscript');
  });

  it('should remove javascript: protocol', async () => {
    const { sanitizeFontFamily } = await import('../src/public/js/font-presets.js');

    expect(sanitizeFontFamily('javascript:alert(1)')).toBe('alert1');
  });

  it('should handle normal font family values', async () => {
    const { sanitizeFontFamily } = await import('../src/public/js/font-presets.js');

    expect(sanitizeFontFamily('Arial')).toBe('Arial');
    expect(sanitizeFontFamily("'Helvetica Neue', sans-serif")).toBe("'Helvetica Neue', sans-serif");
    expect(sanitizeFontFamily('Georgia, serif')).toBe('Georgia, serif');
  });

  it('should limit length to prevent DoS', async () => {
    const { sanitizeFontFamily } = await import('../src/public/js/font-presets.js');

    const longInput = 'A'.repeat(1000);
    expect(sanitizeFontFamily(longInput).length).toBeLessThanOrEqual(500);
  });

  it('should handle empty/invalid input', async () => {
    const { sanitizeFontFamily } = await import('../src/public/js/font-presets.js');

    expect(sanitizeFontFamily('')).toBe('');
    expect(sanitizeFontFamily(null as unknown as string)).toBe('');
    expect(sanitizeFontFamily(undefined as unknown as string)).toBe('');
  });
});

// =============================================================================
// Integration: Settings Panel
// =============================================================================

describe('Settings Panel Integration', () => {
  beforeEach(() => {
    // Mock electronAPI for SettingsPanel
    (window as any).electronAPI = {
      settings: {
        get: vi.fn().mockResolvedValue({
          workflow: {},
          notifications: {},
          pennyfarthing: { theme: 'firefly' },
        }),
        save: vi.fn().mockResolvedValue(true),
        getThemeMetadata: vi.fn().mockResolvedValue([]),
        onChanged: vi.fn(),
      },
      config: {
        loadProjectConfig: vi.fn().mockResolvedValue('midnight'),
        saveProjectConfig: vi.fn().mockResolvedValue(true),
      },
      font: {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(true),
      },
    };
  });

  it('should include font customization section in settings panel', async () => {
    const { SettingsPanel } = await import('../src/public/components/panels/SettingsPanel.js');
    const React = await import('react');
    const { render, waitFor } = await import('@testing-library/react');

    const { container } = render(React.createElement(SettingsPanel, {}));

    // Wait for settings to load
    await waitFor(() => {
      // Should have a "Fonts" section
      const headings = container.querySelectorAll('h4');
      const hasFont = Array.from(headings).some(h => /fonts/i.test(h.textContent || ''));
      expect(hasFont).toBe(true);
    });
  });

  it('should show both UI and Code font pickers', async () => {
    const { SettingsPanel } = await import('../src/public/components/panels/SettingsPanel.js');
    const React = await import('react');
    const { render, waitFor } = await import('@testing-library/react');

    const { container } = render(React.createElement(SettingsPanel, {}));

    await waitFor(() => {
      const labels = container.querySelectorAll('label');
      const hasUiFont = Array.from(labels).some(l => /ui font/i.test(l.textContent || ''));
      const hasCodeFont = Array.from(labels).some(l => /code font/i.test(l.textContent || ''));
      expect(hasUiFont).toBe(true);
      expect(hasCodeFont).toBe(true);
    });
  });

  it('should render FontPicker components', async () => {
    const { SettingsPanel } = await import('../src/public/components/panels/SettingsPanel.js');
    const React = await import('react');
    const { render, waitFor } = await import('@testing-library/react');

    const { container } = render(React.createElement(SettingsPanel, {}));

    await waitFor(() => {
      // Should have font picker components
      const fontPickers = container.querySelectorAll('.font-picker');
      expect(fontPickers.length).toBeGreaterThanOrEqual(2);
    });
  });
});
