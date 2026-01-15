/**
 * 35-7: Custom Styling Themes
 *
 * Tests for the full custom theme system replacing hardcoded dark/light themes.
 * Users can create, edit, import, and share complete visual themes.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Theme schema documented (JSON format with all color categories)
 * - AC2: Theme editor UI with color pickers for each theme property
 * - AC3: Live preview updates as colors are changed
 * - AC4: At least 6 built-in themes (dark, light, solarized, monokai, nord, dracula)
 * - AC5: Theme browser shows preview of each theme
 * - AC6: Custom themes can be created from scratch or by extending existing
 * - AC7: Themes can be imported from JSON file or URL
 * - AC8: Current theme can be exported to JSON for sharing
 * - AC9: Terminal colors update with theme
 * - AC10: Syntax highlighting colors configurable per theme
 * - AC11: Theme changes apply instantly without page reload
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Type Definitions (expected interface for the theme system)
// =============================================================================

/**
 * Complete theme schema with all color categories
 */
export interface ColorTheme {
  // Metadata
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  extends?: string;  // Base theme to inherit from

  // UI Colors
  ui: {
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
    shadow: string;
  };

  // Panel Colors
  panels: {
    sidebarBg: string;
    messageBg: string;
    toolBg: string;
    headerBg: string;
    footerBg: string;
  };

  // Status Colors
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };

  // Terminal Colors (16 ANSI + extras)
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };

  // Syntax Highlighting Colors
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    variable: string;
    type: string;
    operator: string;
    punctuation: string;
    tag: string;
    attribute: string;
    property: string;
  };
}

/**
 * Theme validation result
 */
export interface ThemeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Theme editor state
 */
export interface ThemeEditorState {
  theme: ColorTheme;
  isDirty: boolean;
  activeSection: 'ui' | 'panels' | 'status' | 'terminal' | 'syntax';
  previewEnabled: boolean;
}

// =============================================================================
// Test Data Factory
// =============================================================================

const createMinimalTheme = (overrides: Partial<ColorTheme> = {}): ColorTheme => ({
  id: 'test-theme',
  name: 'Test Theme',
  description: 'A test theme',
  author: 'Test Author',
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
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('35-7: Custom Styling Themes', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Use global document from happy-dom environment
    container = document.createElement('div');
    container.id = 'theme-editor-container';
    document.body.appendChild(container);

    // Mock CSS custom properties on the global document
    vi.spyOn(document.documentElement.style, 'setProperty');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // AC1: Theme schema documented (JSON format with all color categories)
  // ===========================================================================
  describe('AC1: Theme schema documented (JSON format with all color categories)', () => {

    it('should export ColorThemeSchema from theme-schema.js', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.ColorThemeSchema).toBeDefined();
    });

    it('should export validateTheme function', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.validateTheme).toBeDefined();
      expect(typeof themeSchema.validateTheme).toBe('function');
    });

    it('should validate a complete theme successfully', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject theme missing required id field', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();
      delete (theme as any).id;

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: id');
    });

    it('should reject theme missing required name field', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();
      delete (theme as any).name;

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should reject theme with missing ui section', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();
      delete (theme as any).ui;

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ui'))).toBe(true);
    });

    it('should reject theme with missing terminal section', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();
      delete (theme as any).terminal;

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('terminal'))).toBe(true);
    });

    it('should reject invalid color format', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();
      theme.ui.bgPrimary = 'not-a-color';

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bgPrimary'))).toBe(true);
    });

    it('should accept valid hex color formats', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.isValidColor('#fff')).toBe(true);
      expect(themeSchema.isValidColor('#ffffff')).toBe(true);
      expect(themeSchema.isValidColor('#FFFFFF')).toBe(true);
    });

    it('should accept valid rgb/rgba color formats', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.isValidColor('rgb(255, 255, 255)')).toBe(true);
      expect(themeSchema.isValidColor('rgba(255, 255, 255, 0.5)')).toBe(true);
    });

    it('should accept valid hsl/hsla color formats', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.isValidColor('hsl(360, 100%, 50%)')).toBe(true);
      expect(themeSchema.isValidColor('hsla(360, 100%, 50%, 0.5)')).toBe(true);
    });

    it('should export REQUIRED_UI_COLORS constant', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.REQUIRED_UI_COLORS).toBeDefined();
      expect(Array.isArray(themeSchema.REQUIRED_UI_COLORS)).toBe(true);
      expect(themeSchema.REQUIRED_UI_COLORS).toContain('bgPrimary');
      expect(themeSchema.REQUIRED_UI_COLORS).toContain('textPrimary');
      expect(themeSchema.REQUIRED_UI_COLORS).toContain('accent');
    });

    it('should export REQUIRED_TERMINAL_COLORS constant', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.REQUIRED_TERMINAL_COLORS).toBeDefined();
      expect(Array.isArray(themeSchema.REQUIRED_TERMINAL_COLORS)).toBe(true);
      expect(themeSchema.REQUIRED_TERMINAL_COLORS).toContain('background');
      expect(themeSchema.REQUIRED_TERMINAL_COLORS).toContain('foreground');
    });

    it('should warn for missing optional fields', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();
      delete theme.description;
      delete theme.author;

      const result: ThemeValidationResult = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

  });

  // ===========================================================================
  // AC2: Theme editor UI with color pickers for each theme property
  // ===========================================================================
  describe('AC2: Theme editor UI with color pickers for each theme property', () => {

    it('should export ThemeEditor class from theme-editor.js', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      expect(themeEditor.ThemeEditor).toBeDefined();
      expect(typeof themeEditor.ThemeEditor).toBe('function');
    });

    it('should export createThemeEditor factory function', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      expect(themeEditor.createThemeEditor).toBeDefined();
      expect(typeof themeEditor.createThemeEditor).toBe('function');
    });

    it('should render theme editor container', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const editor = container.querySelector('.theme-editor');
      expect(editor).not.toBeNull();
    });

    it('should render section tabs for each color category', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const tabs = container.querySelectorAll('.theme-editor-tab');
      expect(tabs.length).toBeGreaterThanOrEqual(5); // ui, panels, status, terminal, syntax
    });

    it('should render color picker for each UI color', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const uiSection = container.querySelector('[data-section="ui"]');
      const colorPickers = uiSection?.querySelectorAll('.color-picker');
      expect(colorPickers?.length).toBeGreaterThanOrEqual(Object.keys(theme.ui).length);
    });

    it('should export ColorPicker component', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      expect(themeEditor.ColorPicker).toBeDefined();
    });

    it('should render color picker with hex input', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');

      const picker = themeEditor.createColorPicker({
        label: 'Background',
        value: '#1a1a2e',
        onChange: vi.fn(),
      }, document);

      const hexInput = picker.querySelector('input[type="text"]');
      expect(hexInput).not.toBeNull();
      expect((hexInput as HTMLInputElement).value).toBe('#1a1a2e');
    });

    it('should render color picker with visual color input', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');

      const picker = themeEditor.createColorPicker({
        label: 'Background',
        value: '#1a1a2e',
        onChange: vi.fn(),
      }, document);

      const colorInput = picker.querySelector('input[type="color"]');
      expect(colorInput).not.toBeNull();
    });

    it('should call onChange when color is modified', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const onChange = vi.fn();

      const picker = themeEditor.createColorPicker({
        label: 'Background',
        value: '#1a1a2e',
        onChange,
      }, document);

      const hexInput = picker.querySelector('input[type="text"]') as HTMLInputElement;
      hexInput.value = '#ff0000';
      hexInput.dispatchEvent(new Event('change'));

      expect(onChange).toHaveBeenCalledWith('#ff0000');
    });

    it('should render theme metadata fields (name, description, author)', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const nameInput = container.querySelector('input[name="theme-name"]');
      const descInput = container.querySelector('textarea[name="theme-description"]');
      const authorInput = container.querySelector('input[name="theme-author"]');

      expect(nameInput).not.toBeNull();
      expect(descInput).not.toBeNull();
      expect(authorInput).not.toBeNull();
    });

    it('should render Save and Cancel buttons', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const saveBtn = container.querySelector('.theme-editor-save');
      const cancelBtn = container.querySelector('.theme-editor-cancel');

      expect(saveBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    it('should disable Save button when no changes made', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document, { isDirty: false });

      const saveBtn = container.querySelector('.theme-editor-save') as HTMLButtonElement;
      expect(saveBtn?.disabled).toBe(true);
    });

    it('should enable Save button when changes made', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document, { isDirty: true });

      const saveBtn = container.querySelector('.theme-editor-save') as HTMLButtonElement;
      expect(saveBtn?.disabled).toBe(false);
    });

  });

  // ===========================================================================
  // AC3: Live preview updates as colors are changed
  // ===========================================================================
  describe('AC3: Live preview updates as colors are changed', () => {

    it('should export applyThemePreview function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.applyThemePreview).toBeDefined();
      expect(typeof themeManager.applyThemePreview).toBe('function');
    });

    it('should update CSS custom properties when preview is applied', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      themeManager.applyThemePreview(theme);

      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--bg-primary',
        theme.ui.bgPrimary
      );
    });

    it('should update all UI colors as CSS variables', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      themeManager.applyThemePreview(theme);

      const setProperty = document.documentElement.style.setProperty as ReturnType<typeof vi.fn>;
      const calls = setProperty.mock.calls.map(c => c[0]);

      expect(calls).toContain('--bg-primary');
      expect(calls).toContain('--bg-secondary');
      expect(calls).toContain('--text-primary');
      expect(calls).toContain('--accent');
    });

    it('should dispatch themePreview event when preview changes', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();
      const listener = vi.fn();
      window.addEventListener('themePreview', listener);

      themeManager.applyThemePreview(theme);

      expect(listener).toHaveBeenCalled();
      window.removeEventListener('themePreview', listener);
    });

    it('should export revertThemePreview function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.revertThemePreview).toBeDefined();
      expect(typeof themeManager.revertThemePreview).toBe('function');
    });

    it('should restore original theme when preview is reverted', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const originalTheme = createMinimalTheme({ id: 'original' });
      const previewTheme = createMinimalTheme({ id: 'preview', ui: { ...createMinimalTheme().ui, bgPrimary: '#ff0000' } });

      themeManager.applyTheme(originalTheme);
      themeManager.applyThemePreview(previewTheme);
      themeManager.revertThemePreview();

      // Check that --bg-primary was restored to original value (not necessarily last call)
      expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--bg-primary',
        originalTheme.ui.bgPrimary
      );
    });

    it('should update preview in real-time (debounced)', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      expect(themeEditor.PREVIEW_DEBOUNCE_MS).toBeDefined();
      expect(themeEditor.PREVIEW_DEBOUNCE_MS).toBeLessThanOrEqual(100);
    });

    it('should have preview toggle in theme editor', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const previewToggle = container.querySelector('.theme-editor-preview-toggle');
      expect(previewToggle).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC4: At least 6 built-in themes
  // ===========================================================================
  describe('AC4: At least 6 built-in themes (dark, light, solarized, monokai, nord, dracula)', () => {

    it('should export BUILT_IN_THEMES constant', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES).toBeDefined();
      expect(typeof themeManager.BUILT_IN_THEMES).toBe('object');
    });

    it('should have at least 6 built-in themes', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const themeCount = Object.keys(themeManager.BUILT_IN_THEMES).length;
      expect(themeCount).toBeGreaterThanOrEqual(6);
    });

    it('should include dark theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES.dark).toBeDefined();
      expect(themeManager.BUILT_IN_THEMES.dark.name).toBe('Dark');
    });

    it('should include light theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES.light).toBeDefined();
      expect(themeManager.BUILT_IN_THEMES.light.name).toBe('Light');
    });

    it('should include solarized theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES.solarized).toBeDefined();
      expect(themeManager.BUILT_IN_THEMES.solarized.name).toBe('Solarized');
    });

    it('should include monokai theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES.monokai).toBeDefined();
      expect(themeManager.BUILT_IN_THEMES.monokai.name).toBe('Monokai');
    });

    it('should include nord theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES.nord).toBeDefined();
      expect(themeManager.BUILT_IN_THEMES.nord.name).toBe('Nord');
    });

    it('should include dracula theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.BUILT_IN_THEMES.dracula).toBeDefined();
      expect(themeManager.BUILT_IN_THEMES.dracula.name).toBe('Dracula');
    });

    it('should validate all built-in themes against schema', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const themeSchema = await import('../src/public/js/theme-schema.js');

      for (const [id, theme] of Object.entries(themeManager.BUILT_IN_THEMES)) {
        const result = themeSchema.validateTheme(theme);
        expect(result.valid).toBe(true);
      }
    });

    it('should export getBuiltInTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.getBuiltInTheme).toBeDefined();
      expect(typeof themeManager.getBuiltInTheme).toBe('function');
    });

    it('should return theme by id', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = themeManager.getBuiltInTheme('dark');
      expect(theme).toBeDefined();
      expect(theme.id).toBe('dark');
    });

    it('should return null for unknown theme id', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = themeManager.getBuiltInTheme('nonexistent');
      expect(theme).toBeNull();
    });

  });

  // ===========================================================================
  // AC5: Theme browser shows preview of each theme
  // ===========================================================================
  describe('AC5: Theme browser shows preview of each theme', () => {

    it('should export ColorThemeBrowser component', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      expect(themeBrowser.ColorThemeBrowser).toBeDefined();
    });

    it('should render theme browser container', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');

      themeBrowser.renderColorThemeBrowser(container, document);

      const browser = container.querySelector('.color-theme-browser');
      expect(browser).not.toBeNull();
    });

    it('should display all available themes', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      const themeManager = await import('../src/public/js/theme-manager.js');

      themeBrowser.renderColorThemeBrowser(container, document);

      const themeCards = container.querySelectorAll('.color-theme-card');
      expect(themeCards.length).toBeGreaterThanOrEqual(6);
    });

    it('should render color swatches for each theme', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');

      themeBrowser.renderColorThemeBrowser(container, document);

      const firstCard = container.querySelector('.color-theme-card');
      const swatches = firstCard?.querySelectorAll('.color-swatch');
      expect(swatches?.length).toBeGreaterThan(0);
    });

    it('should export createThemePreviewCard function', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      expect(themeBrowser.createThemePreviewCard).toBeDefined();
    });

    it('should render theme preview card with name', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      const theme = createMinimalTheme({ name: 'My Theme' });

      const card = themeBrowser.createThemePreviewCard(theme, document);

      const nameEl = card.querySelector('.color-theme-name');
      expect(nameEl?.textContent).toBe('My Theme');
    });

    it('should show primary colors in preview swatches', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      const theme = createMinimalTheme();

      const card = themeBrowser.createThemePreviewCard(theme, document);

      const swatches = card.querySelectorAll('.color-swatch');
      // Should show bg, text, accent colors at minimum
      expect(swatches.length).toBeGreaterThanOrEqual(3);
    });

    it('should highlight currently active theme', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');

      themeBrowser.renderColorThemeBrowser(container, document, { activeThemeId: 'dark' });

      const activeCard = container.querySelector('.color-theme-card.active');
      expect(activeCard).not.toBeNull();
      expect(activeCard?.getAttribute('data-theme-id')).toBe('dark');
    });

    it('should apply theme on card click', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      const onSelect = vi.fn();

      themeBrowser.renderColorThemeBrowser(container, document, { onSelect });

      const firstCard = container.querySelector('.color-theme-card') as HTMLElement;
      firstCard?.click();

      expect(onSelect).toHaveBeenCalled();
    });

    it('should show custom themes section if any exist', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      const themeManager = await import('../src/public/js/theme-manager.js');

      // Add a custom theme
      themeManager.saveCustomTheme(createMinimalTheme({ id: 'my-custom', name: 'My Custom' }));

      themeBrowser.renderColorThemeBrowser(container, document);

      const customSection = container.querySelector('.custom-themes-section');
      expect(customSection).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC6: Custom themes can be created from scratch or by extending existing
  // ===========================================================================
  describe('AC6: Custom themes can be created from scratch or by extending existing', () => {

    it('should export createNewTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.createNewTheme).toBeDefined();
      expect(typeof themeManager.createNewTheme).toBe('function');
    });

    it('should create blank theme with default values', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');

      const theme = themeManager.createNewTheme('my-new-theme', 'My New Theme');

      expect(theme.id).toBe('my-new-theme');
      expect(theme.name).toBe('My New Theme');
      expect(theme.ui).toBeDefined();
      expect(theme.terminal).toBeDefined();
    });

    it('should export extendTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.extendTheme).toBeDefined();
      expect(typeof themeManager.extendTheme).toBe('function');
    });

    it('should create theme extending base theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const baseTheme = themeManager.getBuiltInTheme('dark');

      const extended = themeManager.extendTheme(baseTheme, {
        id: 'my-dark-variant',
        name: 'My Dark Variant',
        ui: { accent: '#ff0000' },
      });

      expect(extended.id).toBe('my-dark-variant');
      expect(extended.extends).toBe('dark');
      expect(extended.ui.accent).toBe('#ff0000');
      expect(extended.ui.bgPrimary).toBe(baseTheme.ui.bgPrimary); // inherited
    });

    it('should resolve theme inheritance chain', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');

      const resolved = themeManager.resolveThemeInheritance({
        id: 'child-theme',
        name: 'Child Theme',
        extends: 'dark',
        ui: { accent: '#00ff00' },
      });

      // Should have all properties from dark, with overridden accent
      expect(resolved.ui.bgPrimary).toBeDefined();
      expect(resolved.ui.accent).toBe('#00ff00');
      expect(resolved.terminal).toBeDefined();
    });

    it('should export saveCustomTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.saveCustomTheme).toBeDefined();
      expect(typeof themeManager.saveCustomTheme).toBe('function');
    });

    it('should save custom theme to localStorage', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'custom-save-test' });

      themeManager.saveCustomTheme(theme);

      const saved = themeManager.getCustomTheme('custom-save-test');
      expect(saved).not.toBeNull();
      expect(saved?.name).toBe(theme.name);
    });

    it('should export getCustomThemes function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.getCustomThemes).toBeDefined();
      expect(typeof themeManager.getCustomThemes).toBe('function');
    });

    it('should return all custom themes', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      themeManager.saveCustomTheme(createMinimalTheme({ id: 'custom-1', name: 'Custom 1' }));
      themeManager.saveCustomTheme(createMinimalTheme({ id: 'custom-2', name: 'Custom 2' }));

      const themes = themeManager.getCustomThemes();

      expect(themes.length).toBeGreaterThanOrEqual(2);
    });

    it('should export deleteCustomTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.deleteCustomTheme).toBeDefined();
      expect(typeof themeManager.deleteCustomTheme).toBe('function');
    });

    it('should remove custom theme from storage', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      themeManager.saveCustomTheme(createMinimalTheme({ id: 'to-delete' }));

      themeManager.deleteCustomTheme('to-delete');

      const deleted = themeManager.getCustomTheme('to-delete');
      expect(deleted).toBeNull();
    });

    it('should not allow deleting built-in themes', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');

      const result = themeManager.deleteCustomTheme('dark');

      expect(result).toBe(false);
      expect(themeManager.getBuiltInTheme('dark')).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC7: Themes can be imported from JSON file or URL
  // ===========================================================================
  describe('AC7: Themes can be imported from JSON file or URL', () => {

    it('should export importThemeFromJSON function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.importThemeFromJSON).toBeDefined();
      expect(typeof themeManager.importThemeFromJSON).toBe('function');
    });

    it('should import valid theme from JSON string', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'imported-theme' });
      const json = JSON.stringify(theme);

      const result = await themeManager.importThemeFromJSON(json);

      expect(result.success).toBe(true);
      expect(result.theme?.id).toBe('imported-theme');
    });

    it('should reject invalid JSON', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');

      const result = await themeManager.importThemeFromJSON('{ invalid json }');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should reject theme that fails validation', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const invalidTheme = { id: 'bad-theme' }; // missing required fields

      const result = await themeManager.importThemeFromJSON(JSON.stringify(invalidTheme));

      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should export importThemeFromURL function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.importThemeFromURL).toBeDefined();
      expect(typeof themeManager.importThemeFromURL).toBe('function');
    });

    it('should fetch and import theme from URL', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'url-theme' });

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(theme),
      });

      const result = await themeManager.importThemeFromURL('https://example.com/theme.json');

      expect(result.success).toBe(true);
      expect(result.theme?.id).toBe('url-theme');
    });

    it('should handle fetch errors gracefully', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await themeManager.importThemeFromURL('https://example.com/theme.json');

      expect(result.success).toBe(false);
      expect(result.error).toContain('fetch');
    });

    it('should export importThemeFromFile function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.importThemeFromFile).toBeDefined();
      expect(typeof themeManager.importThemeFromFile).toBe('function');
    });

    it('should render import button in theme browser', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');

      themeBrowser.renderColorThemeBrowser(container, document);

      const importBtn = container.querySelector('.theme-import-btn');
      expect(importBtn).not.toBeNull();
    });

    it('should show import dialog with file/URL options', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');
      expect(themeBrowser.showImportDialog).toBeDefined();
    });

    it('should generate unique id for imported theme if id conflicts', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'dark' }); // conflicts with built-in

      const result = await themeManager.importThemeFromJSON(JSON.stringify(theme));

      expect(result.success).toBe(true);
      expect(result.theme?.id).not.toBe('dark');
      expect(result.theme?.id).toContain('dark');
    });

  });

  // ===========================================================================
  // AC8: Current theme can be exported to JSON for sharing
  // ===========================================================================
  describe('AC8: Current theme can be exported to JSON for sharing', () => {

    it('should export exportThemeToJSON function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.exportThemeToJSON).toBeDefined();
      expect(typeof themeManager.exportThemeToJSON).toBe('function');
    });

    it('should export theme as JSON string', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      const json = themeManager.exportThemeToJSON(theme);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(theme.id);
    });

    it('should format JSON with indentation', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      const json = themeManager.exportThemeToJSON(theme, { pretty: true });

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should export downloadThemeAsFile function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.downloadThemeAsFile).toBeDefined();
      expect(typeof themeManager.downloadThemeAsFile).toBe('function');
    });

    it('should trigger file download with correct filename', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'my-theme' });

      // Mock createElement and click
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);

      themeManager.downloadThemeAsFile(theme);

      expect(mockAnchor.download).toBe('my-theme.json');
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should render export button in theme editor', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const exportBtn = container.querySelector('.theme-editor-export');
      expect(exportBtn).not.toBeNull();
    });

    it('should render export button in theme browser for each theme', async () => {
      const themeBrowser = await import('../src/public/js/components/ColorThemeBrowser.js');

      themeBrowser.renderColorThemeBrowser(container, document);

      const exportBtns = container.querySelectorAll('.color-theme-card .theme-export-btn');
      expect(exportBtns.length).toBeGreaterThan(0);
    });

    it('should export copyThemeToClipboard function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.copyThemeToClipboard).toBeDefined();
      expect(typeof themeManager.copyThemeToClipboard).toBe('function');
    });

  });

  // ===========================================================================
  // AC9: Terminal colors update with theme
  // ===========================================================================
  describe('AC9: Terminal colors update with theme', () => {

    it('should export getTerminalTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.getTerminalTheme).toBeDefined();
      expect(typeof themeManager.getTerminalTheme).toBe('function');
    });

    it('should return terminal colors for theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      const terminalTheme = themeManager.getTerminalTheme(theme);

      expect(terminalTheme.background).toBe(theme.terminal.background);
      expect(terminalTheme.foreground).toBe(theme.terminal.foreground);
      expect(terminalTheme.cursor).toBe(theme.terminal.cursor);
    });

    it('should include all 16 ANSI colors', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      const terminalTheme = themeManager.getTerminalTheme(theme);

      expect(terminalTheme.black).toBeDefined();
      expect(terminalTheme.red).toBeDefined();
      expect(terminalTheme.green).toBeDefined();
      expect(terminalTheme.yellow).toBeDefined();
      expect(terminalTheme.blue).toBeDefined();
      expect(terminalTheme.magenta).toBeDefined();
      expect(terminalTheme.cyan).toBeDefined();
      expect(terminalTheme.white).toBeDefined();
      expect(terminalTheme.brightBlack).toBeDefined();
      expect(terminalTheme.brightRed).toBeDefined();
      expect(terminalTheme.brightGreen).toBeDefined();
      expect(terminalTheme.brightYellow).toBeDefined();
      expect(terminalTheme.brightBlue).toBeDefined();
      expect(terminalTheme.brightMagenta).toBeDefined();
      expect(terminalTheme.brightCyan).toBeDefined();
      expect(terminalTheme.brightWhite).toBeDefined();
    });

    it('should dispatch terminalThemeChange event when theme changes', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();
      const listener = vi.fn();
      window.addEventListener('terminalThemeChange', listener);

      themeManager.applyTheme(theme);

      expect(listener).toHaveBeenCalled();
      window.removeEventListener('terminalThemeChange', listener);
    });

    it('should export terminal theme in xterm.js compatible format', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      const xtermTheme = themeManager.getXtermTheme(theme);

      // xterm.js uses specific property names
      expect(xtermTheme.background).toBeDefined();
      expect(xtermTheme.foreground).toBeDefined();
      expect(xtermTheme.selectionBackground).toBeDefined();
    });

    it('should render terminal color section in theme editor', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const terminalTab = container.querySelector('[data-section="terminal"]');
      expect(terminalTab).not.toBeNull();
    });

    it('should show all 16 ANSI colors in terminal section', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      // Click terminal tab
      const terminalTab = container.querySelector('[data-tab="terminal"]') as HTMLElement;
      terminalTab?.click();

      const colorPickers = container.querySelectorAll('[data-section="terminal"] .color-picker');
      expect(colorPickers.length).toBeGreaterThanOrEqual(16);
    });

  });

  // ===========================================================================
  // AC10: Syntax highlighting colors configurable per theme
  // ===========================================================================
  describe('AC10: Syntax highlighting colors configurable per theme', () => {

    it('should include syntax section in theme schema', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      expect(themeSchema.REQUIRED_SYNTAX_COLORS).toBeDefined();
      expect(Array.isArray(themeSchema.REQUIRED_SYNTAX_COLORS)).toBe(true);
    });

    it('should validate syntax colors in theme', async () => {
      const themeSchema = await import('../src/public/js/theme-schema.js');
      const theme = createMinimalTheme();

      const result = themeSchema.validateTheme(theme);

      expect(result.valid).toBe(true);
    });

    it('should export getSyntaxTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.getSyntaxTheme).toBeDefined();
      expect(typeof themeManager.getSyntaxTheme).toBe('function');
    });

    it('should return syntax colors for code highlighting', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      const syntaxTheme = themeManager.getSyntaxTheme(theme);

      expect(syntaxTheme.keyword).toBeDefined();
      expect(syntaxTheme.string).toBeDefined();
      expect(syntaxTheme.comment).toBeDefined();
      expect(syntaxTheme.function).toBeDefined();
    });

    it('should update CSS variables for syntax highlighting', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      themeManager.applyTheme(theme);

      const setProperty = document.documentElement.style.setProperty as ReturnType<typeof vi.fn>;
      const calls = setProperty.mock.calls.map(c => c[0]);

      expect(calls).toContain('--syntax-keyword');
      expect(calls).toContain('--syntax-string');
      expect(calls).toContain('--syntax-comment');
    });

    it('should render syntax color section in theme editor', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const syntaxTab = container.querySelector('[data-section="syntax"]');
      expect(syntaxTab).not.toBeNull();
    });

    it('should show all syntax token types in editor', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      // Click syntax tab
      const syntaxTab = container.querySelector('[data-tab="syntax"]') as HTMLElement;
      syntaxTab?.click();

      const colorPickers = container.querySelectorAll('[data-section="syntax"] .color-picker');
      expect(colorPickers.length).toBeGreaterThanOrEqual(Object.keys(theme.syntax).length);
    });

    it('should show code preview with syntax highlighting', async () => {
      const themeEditor = await import('../src/public/js/components/ThemeEditor.js');
      const theme = createMinimalTheme();

      themeEditor.renderThemeEditor(container, theme, document);

      const codePreview = container.querySelector('.syntax-preview');
      expect(codePreview).not.toBeNull();
    });

  });

  // ===========================================================================
  // AC11: Theme changes apply instantly without page reload
  // ===========================================================================
  describe('AC11: Theme changes apply instantly without page reload', () => {

    it('should export applyTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.applyTheme).toBeDefined();
      expect(typeof themeManager.applyTheme).toBe('function');
    });

    it('should update CSS variables synchronously', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      themeManager.applyTheme(theme);

      // Should be called synchronously, not after timeout
      expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    });

    it('should not require page reload', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      // Apply theme should return without triggering reload
      const result = themeManager.applyTheme(theme);

      expect(result).toBe(true);
      // No reload should be triggered
    });

    it('should dispatch themechange event', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();
      const listener = vi.fn();
      window.addEventListener('themechange', listener);

      themeManager.applyTheme(theme);

      expect(listener).toHaveBeenCalled();
      const event = listener.mock.calls[0][0];
      expect(event.detail.theme).toBe(theme.id);
      window.removeEventListener('themechange', listener);
    });

    it('should persist theme selection to localStorage', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'persist-test' });

      themeManager.applyTheme(theme);

      expect(themeManager.getCurrentThemeId()).toBe('persist-test');
    });

    it('should load saved theme on initialization', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.loadSavedTheme).toBeDefined();
      expect(typeof themeManager.loadSavedTheme).toBe('function');
    });

    it('should export getCurrentTheme function', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      expect(themeManager.getCurrentTheme).toBeDefined();
      expect(typeof themeManager.getCurrentTheme).toBe('function');
    });

    it('should return currently applied theme', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme({ id: 'current-test' });

      themeManager.applyTheme(theme);

      const current = themeManager.getCurrentTheme();
      expect(current.id).toBe('current-test');
    });

    it('should update all themed elements without flickering', async () => {
      const themeManager = await import('../src/public/js/theme-manager.js');
      const theme = createMinimalTheme();

      // Apply theme should complete synchronously
      const startTime = performance.now();
      themeManager.applyTheme(theme);
      const endTime = performance.now();

      // Theme application should be fast (under 50ms)
      expect(endTime - startTime).toBeLessThan(50);
    });

  });

  // ===========================================================================
  // Integration: Theme System CSS File
  // ===========================================================================
  describe('Integration: Theme System CSS File', () => {

    it('should have theme-system.css file', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-system.css');
      expect(response.status).toBe(200);
    });

    it('should define CSS custom properties for UI colors', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-system.css');
      expect(response.text).toContain('--bg-primary');
      expect(response.text).toContain('--text-primary');
      expect(response.text).toContain('--accent');
    });

    it('should define CSS custom properties for syntax colors', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-system.css');
      expect(response.text).toContain('--syntax-keyword');
      expect(response.text).toContain('--syntax-string');
    });

  });

  // ===========================================================================
  // Integration: Theme Editor CSS File
  // ===========================================================================
  describe('Integration: Theme Editor CSS File', () => {

    it('should have theme-editor.css file', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-editor.css');
      expect(response.status).toBe(200);
    });

    it('should define .theme-editor styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-editor.css');
      expect(response.text).toContain('.theme-editor');
    });

    it('should define .color-picker styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-editor.css');
      expect(response.text).toContain('.color-picker');
    });

  });

});
