/**
 * B-24-5: Theme Browser with Search
 *
 * Tests for the theme browser component that replaces the simple dropdown
 * with a searchable, filterable grid of 101 themes.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Theme browser displays all themes in grid/list view
 * - AC2: Search box filters themes by name (fuzzy match)
 * - AC3: Category filter dropdown narrows results
 * - AC4: Each theme card shows name, description, category, tier
 * - AC5: Clicking a theme selects it with visual highlight
 * - AC6: Apply button saves selection and closes browser
 * - AC7: Browser integrates with existing settings panel
 * - AC8: Keyboard navigation works (arrow keys, Enter to select)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';

// =============================================================================
// Type Definitions (expected interface from ThemeBrowser component)
// =============================================================================

/**
 * Theme metadata - returned from IPC channel settings:getThemeMetadata
 */
export interface ThemeMetadata {
  id: string;           // kebab-case filename (e.g., "alice-in-wonderland")
  name: string;         // Display name (e.g., "Alice in Wonderland")
  description: string;  // Short description
  source: string;       // Source material
  tier: 'S' | 'A' | 'B' | 'U';  // Quality tier
  category: string;     // Derived category (TV Series, Film, Literature, etc.)
  agentCount: number;   // Number of agents defined
}

/**
 * Theme browser state
 */
export interface ThemeBrowserState {
  themes: ThemeMetadata[];
  filteredThemes: ThemeMetadata[];
  searchQuery: string;
  selectedCategory: string;
  selectedThemeId: string | null;
  isLoading: boolean;
}

/**
 * Theme browser configuration
 */
export interface ThemeBrowserConfig {
  onSelect: (themeId: string) => void;
  onApply: (themeId: string) => void;
  onCancel: () => void;
  initialThemeId?: string;
}

// =============================================================================
// Test Data Factory
// =============================================================================

const createThemeMetadata = (overrides: Partial<ThemeMetadata> = {}): ThemeMetadata => ({
  id: 'alice-in-wonderland',
  name: 'Alice in Wonderland',
  description: 'Characters from Lewis Carroll\'s classic tale',
  source: 'Alice\'s Adventures in Wonderland by Lewis Carroll',
  tier: 'S',
  category: 'Literature',
  agentCount: 10,
  ...overrides,
});

const createMockThemes = (): ThemeMetadata[] => [
  createThemeMetadata({
    id: 'alice-in-wonderland',
    name: 'Alice in Wonderland',
    category: 'Literature',
    tier: 'S',
  }),
  createThemeMetadata({
    id: 'star-trek-tng',
    name: 'Star Trek TNG',
    description: 'The Next Generation crew',
    category: 'TV Series',
    tier: 'A',
  }),
  createThemeMetadata({
    id: 'breaking-bad',
    name: 'Breaking Bad',
    description: 'Characters from the AMC drama',
    category: 'TV Series',
    tier: 'A',
  }),
  createThemeMetadata({
    id: 'lord-of-the-rings',
    name: 'Lord of the Rings',
    description: 'Middle-earth characters',
    category: 'Literature',
    tier: 'S',
  }),
  createThemeMetadata({
    id: 'greek-mythology',
    name: 'Greek Mythology',
    description: 'Gods and heroes of ancient Greece',
    category: 'Mythology',
    tier: 'B',
  }),
  createThemeMetadata({
    id: 'the-office',
    name: 'The Office',
    description: 'Dunder Mifflin employees',
    category: 'TV Series',
    tier: 'A',
  }),
];

const createThemeBrowserState = (overrides: Partial<ThemeBrowserState> = {}): ThemeBrowserState => ({
  themes: createMockThemes(),
  filteredThemes: createMockThemes(),
  searchQuery: '',
  selectedCategory: 'All',
  selectedThemeId: null,
  isLoading: false,
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('B-24-5: Theme Browser with Search', () => {
  let document: Document;
  let container: HTMLElement;

  beforeEach(() => {
    const window = new Window();
    document = window.document;
    container = document.createElement('div');
    container.id = 'theme-browser-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ===========================================================================
  // AC1: Theme browser displays all themes in grid/list view
  // ===========================================================================
  describe('AC1: Theme browser displays all themes in grid/list view', () => {

    it('should export ThemeBrowser class from components/ThemeBrowser.js', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.ThemeBrowser).toBeDefined();
      expect(typeof themeBrowser.ThemeBrowser).toBe('function');
    });

    it('should export createThemeBrowser factory function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.createThemeBrowser).toBeDefined();
      expect(typeof themeBrowser.createThemeBrowser).toBe('function');
    });

    it('should render theme grid container', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeGrid(container, state);

      const grid = container.querySelector('.theme-grid');
      expect(grid).not.toBeNull();
    });

    it('should render one card per theme', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeGrid(container, state);

      const cards = container.querySelectorAll('.theme-card');
      expect(cards.length).toBe(state.themes.length);
    });

    it('should display loading state when isLoading is true', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState({ isLoading: true });

      themeBrowser.renderThemeGrid(container, state);

      const loading = container.querySelector('.theme-browser-loading');
      expect(loading).not.toBeNull();
    });

    it('should display empty state when no themes match', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState({ filteredThemes: [] });

      themeBrowser.renderThemeGrid(container, state);

      const empty = container.querySelector('.theme-browser-empty');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('No themes found');
    });

    it('should have IPC channel for theme metadata', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.GET_THEME_METADATA).toBe('settings:getThemeMetadata');
    });

    it('should expose getThemeMetadata in preload API', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.settings?.getThemeMetadata).toBeDefined();
      expect(typeof preload.electronAPI?.settings?.getThemeMetadata).toBe('function');
    });

    it('should export loadThemeMetadata function from main', async () => {
      const main = await import('../src/main.js');
      expect(main.loadThemeMetadata).toBeDefined();
      expect(typeof main.loadThemeMetadata).toBe('function');
    });

    it('should cache theme metadata after first load', async () => {
      const main = await import('../src/main.js');
      expect(main.getThemeMetadataCache).toBeDefined();

      // First call should load
      await main.loadThemeMetadata();
      const cached = main.getThemeMetadataCache();

      expect(cached).not.toBeNull();
      expect(Array.isArray(cached)).toBe(true);
    });

  });

  // ===========================================================================
  // AC2: Search box filters themes by name (fuzzy match)
  // ===========================================================================
  describe('AC2: Search box filters themes by name (fuzzy match)', () => {

    it('should render search input', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const searchInput = container.querySelector('.theme-search-input') as HTMLInputElement;
      expect(searchInput).not.toBeNull();
      expect(searchInput?.type).toBe('text');
      expect(searchInput?.placeholder).toContain('Search');
    });

    it('should export filterThemesBySearch function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.filterThemesBySearch).toBeDefined();
      expect(typeof themeBrowser.filterThemesBySearch).toBe('function');
    });

    it('should filter themes by exact name match', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const filtered = themeBrowser.filterThemesBySearch(themes, 'Alice');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('alice-in-wonderland');
    });

    it('should filter themes case-insensitively', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const filtered = themeBrowser.filterThemesBySearch(themes, 'alice');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('alice-in-wonderland');
    });

    it('should support fuzzy matching (partial words)', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      // "trek" should match "Star Trek TNG"
      const filtered = themeBrowser.filterThemesBySearch(themes, 'trek');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('star-trek-tng');
    });

    it('should match multiple terms (AND logic)', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      // "star tng" should match "Star Trek TNG"
      const filtered = themeBrowser.filterThemesBySearch(themes, 'star tng');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('star-trek-tng');
    });

    it('should return empty array when no matches', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const filtered = themeBrowser.filterThemesBySearch(themes, 'nonexistent');

      expect(filtered.length).toBe(0);
    });

    it('should return all themes for empty query', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const filtered = themeBrowser.filterThemesBySearch(themes, '');

      expect(filtered.length).toBe(themes.length);
    });

    it('should also search in description', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      // "Dunder" is in The Office description
      const filtered = themeBrowser.filterThemesBySearch(themes, 'Dunder');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('the-office');
    });

    it('should debounce search input', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.SEARCH_DEBOUNCE_MS).toBeDefined();
      expect(themeBrowser.SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
    });

  });

  // ===========================================================================
  // AC3: Category filter dropdown narrows results
  // ===========================================================================
  describe('AC3: Category filter dropdown narrows results', () => {

    it('should render category filter dropdown', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const categoryDropdown = container.querySelector('.theme-category-filter') as HTMLSelectElement;
      expect(categoryDropdown).not.toBeNull();
      expect(categoryDropdown?.tagName.toLowerCase()).toBe('select');
    });

    it('should have "All" as default category option', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const categoryDropdown = container.querySelector('.theme-category-filter') as HTMLSelectElement;
      const allOption = categoryDropdown?.querySelector('option[value="All"]');
      expect(allOption).not.toBeNull();
    });

    it('should export extractCategories function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.extractCategories).toBeDefined();
      expect(typeof themeBrowser.extractCategories).toBe('function');
    });

    it('should extract unique categories from themes', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const categories = themeBrowser.extractCategories(themes);

      expect(categories).toContain('Literature');
      expect(categories).toContain('TV Series');
      expect(categories).toContain('Mythology');
      // No duplicates
      expect(new Set(categories).size).toBe(categories.length);
    });

    it('should export filterThemesByCategory function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.filterThemesByCategory).toBeDefined();
      expect(typeof themeBrowser.filterThemesByCategory).toBe('function');
    });

    it('should filter themes by category', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const filtered = themeBrowser.filterThemesByCategory(themes, 'TV Series');

      expect(filtered.length).toBe(3); // Star Trek, Breaking Bad, The Office
      expect(filtered.every(t => t.category === 'TV Series')).toBe(true);
    });

    it('should return all themes when category is "All"', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const filtered = themeBrowser.filterThemesByCategory(themes, 'All');

      expect(filtered.length).toBe(themes.length);
    });

    it('should combine search and category filters', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      // Filter to TV Series, then search for "office"
      const byCategory = themeBrowser.filterThemesByCategory(themes, 'TV Series');
      const byBoth = themeBrowser.filterThemesBySearch(byCategory, 'office');

      expect(byBoth.length).toBe(1);
      expect(byBoth[0].id).toBe('the-office');
    });

    it('should sort categories alphabetically', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const categories = themeBrowser.extractCategories(themes);

      const sorted = [...categories].sort();
      expect(categories).toEqual(sorted);
    });

  });

  // ===========================================================================
  // AC4: Each theme card shows name, description, category, tier
  // ===========================================================================
  describe('AC4: Each theme card shows name, description, category, tier', () => {

    it('should export createThemeCard function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.createThemeCard).toBeDefined();
      expect(typeof themeBrowser.createThemeCard).toBe('function');
    });

    it('should render theme name in card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata({ name: 'Test Theme' });

      const card = themeBrowser.createThemeCard(theme, document);

      const nameEl = card.querySelector('.theme-card-name');
      expect(nameEl).not.toBeNull();
      expect(nameEl?.textContent).toBe('Test Theme');
    });

    it('should render theme description in card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata({ description: 'A test description' });

      const card = themeBrowser.createThemeCard(theme, document);

      const descEl = card.querySelector('.theme-card-description');
      expect(descEl).not.toBeNull();
      expect(descEl?.textContent).toBe('A test description');
    });

    it('should render theme category in card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata({ category: 'Literature' });

      const card = themeBrowser.createThemeCard(theme, document);

      const categoryEl = card.querySelector('.theme-card-category');
      expect(categoryEl).not.toBeNull();
      expect(categoryEl?.textContent).toBe('Literature');
    });

    it('should render theme tier in card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata({ tier: 'S' });

      const card = themeBrowser.createThemeCard(theme, document);

      const tierEl = card.querySelector('.theme-card-tier');
      expect(tierEl).not.toBeNull();
      expect(tierEl?.textContent).toContain('S');
    });

    it('should add tier class to card for styling', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata({ tier: 'A' });

      const card = themeBrowser.createThemeCard(theme, document);

      expect(card.classList.contains('tier-a')).toBe(true);
    });

    it('should set data-theme-id attribute on card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata({ id: 'my-theme' });

      const card = themeBrowser.createThemeCard(theme, document);

      expect(card.dataset.themeId).toBe('my-theme');
    });

    it('should truncate long descriptions', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const longDesc = 'A'.repeat(200);
      const theme = createThemeMetadata({ description: longDesc });

      const card = themeBrowser.createThemeCard(theme, document);

      const descEl = card.querySelector('.theme-card-description');
      // Should be truncated (with ellipsis or clamp)
      expect(descEl?.textContent?.length).toBeLessThanOrEqual(120);
    });

    it('should export TIER_LABELS constant', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.TIER_LABELS).toBeDefined();
      expect(themeBrowser.TIER_LABELS.S).toBeDefined();
      expect(themeBrowser.TIER_LABELS.A).toBeDefined();
      expect(themeBrowser.TIER_LABELS.B).toBeDefined();
      expect(themeBrowser.TIER_LABELS.U).toBeDefined();
    });

  });

  // ===========================================================================
  // AC5: Clicking a theme selects it with visual highlight
  // ===========================================================================
  describe('AC5: Clicking a theme selects it with visual highlight', () => {

    it('should call onSelect callback when theme card is clicked', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const onSelect = vi.fn();
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect,
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const firstCard = container.querySelector('.theme-card') as HTMLElement;
      firstCard?.click();

      expect(onSelect).toHaveBeenCalledWith('alice-in-wonderland');
    });

    it('should add selected class to clicked theme card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState({ selectedThemeId: 'alice-in-wonderland' });

      themeBrowser.renderThemeGrid(container, state);

      const selectedCard = container.querySelector('[data-theme-id="alice-in-wonderland"]');
      expect(selectedCard?.classList.contains('selected')).toBe(true);
    });

    it('should remove selected class from previously selected card', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState({ selectedThemeId: 'star-trek-tng' });

      themeBrowser.renderThemeGrid(container, state);

      const aliceCard = container.querySelector('[data-theme-id="alice-in-wonderland"]');
      const trekCard = container.querySelector('[data-theme-id="star-trek-tng"]');

      expect(aliceCard?.classList.contains('selected')).toBe(false);
      expect(trekCard?.classList.contains('selected')).toBe(true);
    });

    it('should preserve selection when filtering', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      // Select a theme
      let state = createThemeBrowserState({
        themes,
        selectedThemeId: 'alice-in-wonderland',
      });

      // Apply filter that includes the selected theme
      state.filteredThemes = themeBrowser.filterThemesByCategory(themes, 'Literature');

      themeBrowser.renderThemeGrid(container, state);

      const aliceCard = container.querySelector('[data-theme-id="alice-in-wonderland"]');
      expect(aliceCard?.classList.contains('selected')).toBe(true);
    });

    it('should have focus outline style for accessibility', async () => {
      // This test verifies CSS exists - actual style check would need different approach
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.THEME_CARD_SELECTED_CLASS).toBe('selected');
    });

  });

  // ===========================================================================
  // AC6: Apply button saves selection and closes browser
  // ===========================================================================
  describe('AC6: Apply button saves selection and closes browser', () => {

    it('should render Apply button', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const applyButton = container.querySelector('.theme-browser-apply') as HTMLButtonElement;
      expect(applyButton).not.toBeNull();
      expect(applyButton?.textContent).toContain('Apply');
    });

    it('should render Cancel button', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const cancelButton = container.querySelector('.theme-browser-cancel') as HTMLButtonElement;
      expect(cancelButton).not.toBeNull();
    });

    it('should disable Apply button when no theme is selected', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState({ selectedThemeId: null });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const applyButton = container.querySelector('.theme-browser-apply') as HTMLButtonElement;
      expect(applyButton?.disabled).toBe(true);
    });

    it('should enable Apply button when a theme is selected', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState({ selectedThemeId: 'alice-in-wonderland' });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const applyButton = container.querySelector('.theme-browser-apply') as HTMLButtonElement;
      expect(applyButton?.disabled).toBe(false);
    });

    it('should call onApply with selected theme when Apply is clicked', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const onApply = vi.fn();
      const state = createThemeBrowserState({ selectedThemeId: 'alice-in-wonderland' });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply,
        onCancel: vi.fn(),
      });

      const applyButton = container.querySelector('.theme-browser-apply') as HTMLButtonElement;
      applyButton?.click();

      expect(onApply).toHaveBeenCalledWith('alice-in-wonderland');
    });

    it('should call onCancel when Cancel is clicked', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const onCancel = vi.fn();
      const state = createThemeBrowserState();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel,
      });

      const cancelButton = container.querySelector('.theme-browser-cancel') as HTMLButtonElement;
      cancelButton?.click();

      expect(onCancel).toHaveBeenCalled();
    });

    it('should have IPC channel to save theme selection', async () => {
      // This uses existing settings:save channel
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.SAVE).toBe('settings:save');
    });

  });

  // ===========================================================================
  // AC7: Browser integrates with persona area (moved from settings in 35-1)
  // ===========================================================================
  describe('AC7: Browser integrates with persona area', () => {

    // Story 35-1 moved theme selection from settings.html to persona area.
    // Theme browser is now accessed via ThemePicker component clicking persona.

    it('should have ThemeBrowser component available for import', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.ThemeBrowser).toBeDefined();
      expect(themeBrowser.createThemeBrowser).toBeDefined();
    });

    it('should have ThemePicker that opens ThemeBrowser', async () => {
      const themePicker = await import('../src/public/js/components/ThemePicker.js');
      expect(themePicker.init).toBeDefined();
      expect(themePicker.show).toBeDefined();
    });

    it('should NOT have theme browser in settings.html (moved to persona area)', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/settings.html');

      // Theme browser moved out of settings panel per 35-1
      expect(response.text).not.toContain('theme-browser-container');
      expect(response.text).not.toMatch(/<select[^>]*id="theme-select"/);
    });

    it('should have persona container in index.html for theme picker', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/');

      // Persona area exists and can host theme picker
      expect(response.text).toContain('persona');
    });

    it('should export filterThemesBySearch for QuickThemeSwitcher', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.filterThemesBySearch).toBeDefined();
      expect(typeof themeBrowser.filterThemesBySearch).toBe('function');
    });

  });

  // ===========================================================================
  // AC8: Keyboard navigation works (arrow keys, Enter to select)
  // ===========================================================================
  describe('AC8: Keyboard navigation works (arrow keys, Enter to select)', () => {

    it('should export handleKeyboardNavigation function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.handleKeyboardNavigation).toBeDefined();
      expect(typeof themeBrowser.handleKeyboardNavigation).toBe('function');
    });

    it('should move focus to next card on ArrowRight', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();
      const themes = state.filteredThemes;

      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'ArrowRight', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        0 // current index
      );

      expect(result.focusIndex).toBe(1);
    });

    it('should move focus to previous card on ArrowLeft', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();
      const themes = state.filteredThemes;

      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        2 // current index
      );

      expect(result.focusIndex).toBe(1);
    });

    it('should move focus to next row on ArrowDown', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();
      const themes = state.filteredThemes;

      // Assuming 3 columns per row
      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        0, // current index
        3  // columns per row
      );

      expect(result.focusIndex).toBe(3);
    });

    it('should move focus to previous row on ArrowUp', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();
      const themes = state.filteredThemes;

      // Assuming 3 columns per row
      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        3, // current index
        3  // columns per row
      );

      expect(result.focusIndex).toBe(0);
    });

    it('should select focused theme on Enter', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();
      const themes = state.filteredThemes;

      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        2 // current index
      );

      expect(result.selectedThemeId).toBe(themes[2].id);
    });

    it('should select focused theme on Space', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserState();
      const themes = state.filteredThemes;

      const result = themeBrowser.handleKeyboardNavigation(
        { key: ' ', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        1 // current index
      );

      expect(result.selectedThemeId).toBe(themes[1].id);
    });

    it('should wrap around at end of list', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();
      const lastIndex = themes.length - 1;

      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'ArrowRight', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        lastIndex
      );

      expect(result.focusIndex).toBe(0);
    });

    it('should wrap around at beginning of list', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemes();

      const result = themeBrowser.handleKeyboardNavigation(
        { key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as KeyboardEvent,
        themes,
        0
      );

      expect(result.focusIndex).toBe(themes.length - 1);
    });

    it('should have tabindex on theme cards', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const theme = createThemeMetadata();

      const card = themeBrowser.createThemeCard(theme, document);

      expect(card.getAttribute('tabindex')).toBe('0');
    });

    it('should focus first card when browser opens', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.focusFirstCard).toBeDefined();
      expect(typeof themeBrowser.focusFirstCard).toBe('function');
    });

  });

  // ===========================================================================
  // CSS Integration
  // ===========================================================================
  describe('CSS Integration', () => {

    it('should have theme-browser.css file', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.status).toBe(200);
    });

    it('should define .theme-grid styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.theme-grid');
    });

    it('should define .theme-card styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.theme-card');
    });

    it('should define .theme-card.selected styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toMatch(/\.theme-card\.selected|\.theme-card:is\(\.selected\)/);
    });

    it('should define tier color styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.tier-s');
    });

  });

  // ===========================================================================
  // Category Derivation
  // ===========================================================================
  describe('Category Derivation', () => {

    it('should export deriveCategory function', async () => {
      const main = await import('../src/main.js');
      expect(main.deriveCategory).toBeDefined();
      expect(typeof main.deriveCategory).toBe('function');
    });

    it('should derive "Literature" for book-based themes', async () => {
      const main = await import('../src/main.js');

      expect(main.deriveCategory('alice-in-wonderland', 'Alice\'s Adventures in Wonderland')).toBe('Literature');
      expect(main.deriveCategory('lord-of-the-rings', 'The Lord of the Rings by J.R.R. Tolkien')).toBe('Literature');
    });

    it('should derive "TV Series" for TV show themes', async () => {
      const main = await import('../src/main.js');

      expect(main.deriveCategory('star-trek-tng', 'Star Trek: The Next Generation TV series')).toBe('TV Series');
      expect(main.deriveCategory('breaking-bad', 'Breaking Bad AMC drama')).toBe('TV Series');
    });

    it('should derive "Mythology" for mythological themes', async () => {
      const main = await import('../src/main.js');

      expect(main.deriveCategory('greek-mythology', 'Greek mythology')).toBe('Mythology');
      expect(main.deriveCategory('norse-mythology', 'Norse mythology')).toBe('Mythology');
    });

    it('should return "Other" for unknown themes', async () => {
      const main = await import('../src/main.js');

      expect(main.deriveCategory('random-theme', 'Some random source')).toBe('Other');
    });

    it('should export CATEGORY_MAP constant', async () => {
      const main = await import('../src/main.js');
      expect(main.CATEGORY_MAP).toBeDefined();
      expect(typeof main.CATEGORY_MAP).toBe('object');
    });

  });

});
