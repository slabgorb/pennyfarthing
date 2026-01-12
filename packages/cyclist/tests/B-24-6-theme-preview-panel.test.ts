/**
 * B-24-6: Theme Preview Panel
 *
 * Tests for the preview panel that shows detailed theme information
 * including agent character mappings, quotes, and metadata.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Hovering/selecting a theme shows detailed preview panel
 * - AC2: Preview lists all agent character mappings (SM, TEA, Dev, Reviewer, etc.)
 * - AC3: Character quotes visible in preview
 * - AC4: Theme category and tier prominently displayed
 * - AC5: Preview updates instantly on selection change
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';

// =============================================================================
// Type Definitions (extended from B-24-5 for preview panel)
// =============================================================================

/**
 * Agent data within a theme - includes character info for preview panel
 */
export interface ThemeAgent {
  character: string;      // Character name (e.g., "Camina Drummer")
  quote?: string;         // Character quote (e.g., "To the gates, and through.")
  style?: string;         // Character style description
  role?: string;          // Role description
  ocean?: {               // OCEAN personality traits
    O: number;
    C: number;
    E: number;
    A: number;
    N: number;
  };
}

/**
 * Extended theme metadata including agent mappings for preview panel
 */
export interface ThemeMetadataWithAgents {
  id: string;
  name: string;
  description: string;
  source: string;
  tier: 'S' | 'A' | 'B' | 'U' | 'F';
  category: string;
  agentCount: number;
  agents: {
    sm?: ThemeAgent;
    tea?: ThemeAgent;
    dev?: ThemeAgent;
    reviewer?: ThemeAgent;
    architect?: ThemeAgent;
    pm?: ThemeAgent;
    orchestrator?: ThemeAgent;
    'tech-writer'?: ThemeAgent;
    'ux-designer'?: ThemeAgent;
    devops?: ThemeAgent;
  };
}

/**
 * Extended theme browser state with selected theme data for preview
 */
export interface ThemeBrowserStateWithPreview {
  themes: ThemeMetadataWithAgents[];
  filteredThemes: ThemeMetadataWithAgents[];
  searchQuery: string;
  selectedCategory: string;
  selectedThemeId: string | null;
  selectedThemeData: ThemeMetadataWithAgents | null;  // Full theme data for preview
  isLoading: boolean;
}

// =============================================================================
// Test Data Factory
// =============================================================================

const createThemeAgent = (overrides: Partial<ThemeAgent> = {}): ThemeAgent => ({
  character: 'Test Character',
  quote: 'Test quote here.',
  style: 'Test style description',
  role: 'Test role description',
  ocean: { O: 3, C: 3, E: 3, A: 3, N: 3 },
  ...overrides,
});

const createThemeMetadataWithAgents = (
  overrides: Partial<ThemeMetadataWithAgents> = {}
): ThemeMetadataWithAgents => ({
  id: 'the-expanse',
  name: 'The Expanse',
  description: 'Characters from The Expanse - gritty, competent, humanity at its best and worst',
  source: 'The Expanse by James S.A. Corey',
  tier: 'F',
  category: 'TV Series',
  agentCount: 10,
  agents: {
    sm: createThemeAgent({
      character: 'Camina Drummer',
      quote: 'To the gates, and through.',
      role: 'The captain who unites factions',
    }),
    tea: createThemeAgent({
      character: 'Amos Burton',
      quote: 'Only way to know if it works is to try to break it.',
      role: 'The mechanic who knows how hard to push',
    }),
    dev: createThemeAgent({
      character: 'Naomi Nagata',
      quote: 'Engineering is about finding solutions.',
      role: 'XO and engineer',
    }),
    reviewer: createThemeAgent({
      character: 'Chrisjen Avasarala',
      quote: 'Earth must come first.',
      role: 'The politician who sees everything',
    }),
    architect: createThemeAgent({
      character: 'Naomi Nagata',
      quote: 'The system has to work together.',
      role: 'System designer',
    }),
    pm: createThemeAgent({
      character: 'Chrisjen Avasarala',
      quote: 'We play the long game.',
      role: 'Strategic planning',
    }),
  },
  ...overrides,
});

const createMockThemesWithAgents = (): ThemeMetadataWithAgents[] => [
  createThemeMetadataWithAgents({
    id: 'the-expanse',
    name: 'The Expanse',
    category: 'TV Series',
    tier: 'F',
  }),
  createThemeMetadataWithAgents({
    id: 'alice-in-wonderland',
    name: 'Alice in Wonderland',
    description: 'Characters from Lewis Carroll\'s classic tale',
    category: 'Literature',
    tier: 'S',
    agents: {
      sm: createThemeAgent({
        character: 'The Mad Hatter',
        quote: 'We\'re all mad here.',
        role: 'Tea party coordinator',
      }),
      tea: createThemeAgent({
        character: 'The Caterpillar',
        quote: 'Who are you?',
        role: 'Philosophical tester',
      }),
      dev: createThemeAgent({
        character: 'The White Rabbit',
        quote: 'I\'m late! I\'m late!',
        role: 'Time-pressured developer',
      }),
      reviewer: createThemeAgent({
        character: 'The Queen of Hearts',
        quote: 'Off with their heads!',
        role: 'Strict code reviewer',
      }),
    },
  }),
  createThemeMetadataWithAgents({
    id: 'star-trek-tng',
    name: 'Star Trek TNG',
    description: 'The Next Generation crew',
    category: 'TV Series',
    tier: 'A',
    agents: {
      sm: createThemeAgent({
        character: 'Jean-Luc Picard',
        quote: 'Make it so.',
        role: 'The Captain',
      }),
      tea: createThemeAgent({
        character: 'Geordi La Forge',
        quote: 'I\'ll run a level 3 diagnostic.',
        role: 'Chief Engineer',
      }),
      dev: createThemeAgent({
        character: 'Data',
        quote: 'Fascinating.',
        role: 'Operations Officer',
      }),
      reviewer: createThemeAgent({
        character: 'William Riker',
        quote: 'Red alert!',
        role: 'First Officer',
      }),
    },
  }),
];

const createThemeBrowserStateWithPreview = (
  overrides: Partial<ThemeBrowserStateWithPreview> = {}
): ThemeBrowserStateWithPreview => ({
  themes: createMockThemesWithAgents(),
  filteredThemes: createMockThemesWithAgents(),
  searchQuery: '',
  selectedCategory: 'All',
  selectedThemeId: null,
  selectedThemeData: null,
  isLoading: false,
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('B-24-6: Theme Preview Panel', () => {
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
  // AC1: Hovering/selecting a theme shows detailed preview panel
  // ===========================================================================
  describe('AC1: Selecting a theme shows detailed preview panel', () => {

    it('should export renderPreviewPanel function', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      expect(themeBrowser.renderPreviewPanel).toBeDefined();
      expect(typeof themeBrowser.renderPreviewPanel).toBe('function');
    });

    it('should render preview panel container in browser layout', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserStateWithPreview();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const previewPanel = container.querySelector('.theme-preview-panel');
      expect(previewPanel).not.toBeNull();
    });

    it('should show empty state when no theme is selected', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserStateWithPreview({ selectedThemeData: null });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const emptyState = container.querySelector('.theme-preview-empty');
      expect(emptyState).not.toBeNull();
      expect(emptyState?.textContent).toContain('Select a theme');
    });

    it('should show preview content when a theme is selected', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const previewContent = container.querySelector('.theme-preview-content');
      expect(previewContent).not.toBeNull();
    });

    it('should render preview panel to the right of the grid', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const state = createThemeBrowserStateWithPreview();

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const content = container.querySelector('.theme-browser-content');
      expect(content).not.toBeNull();
      // Content should use flexbox layout with grid and preview side by side
      const grid = content?.querySelector('.theme-grid');
      const preview = content?.querySelector('.theme-preview-panel');
      expect(grid).not.toBeNull();
      expect(preview).not.toBeNull();
    });

    it('should update selectedThemeData when onSelect is called', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemesWithAgents();
      let capturedState: ThemeBrowserStateWithPreview | null = null;

      const onSelect = (themeId: string) => {
        const theme = themes.find(t => t.id === themeId);
        capturedState = createThemeBrowserStateWithPreview({
          selectedThemeId: themeId,
          selectedThemeData: theme || null,
        });
      };

      const state = createThemeBrowserStateWithPreview({ themes });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect,
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      // Simulate clicking a theme card
      const firstCard = container.querySelector('.theme-card') as HTMLElement;
      firstCard?.click();

      expect(capturedState?.selectedThemeData).not.toBeNull();
      expect(capturedState?.selectedThemeData?.id).toBe('the-expanse');
    });

  });

  // ===========================================================================
  // AC2: Preview lists all agent character mappings
  // ===========================================================================
  describe('AC2: Preview lists agent character mappings', () => {

    it('should render agents section in preview panel', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentsSection = container.querySelector('.preview-agents');
      expect(agentsSection).not.toBeNull();
    });

    it('should render SM agent with character name', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('SM');
      expect(agentsList?.textContent).toContain('Camina Drummer');
    });

    it('should render TEA agent with character name', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('TEA');
      expect(agentsList?.textContent).toContain('Amos Burton');
    });

    it('should render Dev agent with character name', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('Dev');
      expect(agentsList?.textContent).toContain('Naomi Nagata');
    });

    it('should render Reviewer agent with character name', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('Reviewer');
      expect(agentsList?.textContent).toContain('Chrisjen Avasarala');
    });

    it('should render each agent as a distinct element', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentItems = container.querySelectorAll('.preview-agent');
      // Should have at least 4 core agents (SM, TEA, Dev, Reviewer)
      expect(agentItems.length).toBeGreaterThanOrEqual(4);
    });

    it('should show agent role label (SM, TEA, Dev, etc.)', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const agentRoles = container.querySelectorAll('.preview-agent-role');
      const roleTexts = Array.from(agentRoles).map(el => el.textContent);
      expect(roleTexts).toContain('SM');
      expect(roleTexts).toContain('TEA');
      expect(roleTexts).toContain('Dev');
    });

    it('should handle themes with missing agents gracefully', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({
        agents: {
          sm: createThemeAgent({ character: 'Only SM' }),
          // Other agents missing
        },
      });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      // Should not throw
      expect(() => {
        themeBrowser.renderThemeBrowser(container, state, {
          onSelect: vi.fn(),
          onApply: vi.fn(),
          onCancel: vi.fn(),
        });
      }).not.toThrow();

      // Should show available agent
      const agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('Only SM');
    });

  });

  // ===========================================================================
  // AC3: Character quotes visible in preview
  // ===========================================================================
  describe('AC3: Character quotes visible in preview', () => {

    it('should render quote section in preview panel', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const quoteSection = container.querySelector('.preview-quote');
      expect(quoteSection).not.toBeNull();
    });

    it('should display SM character quote', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const quoteEl = container.querySelector('.preview-quote');
      expect(quoteEl?.textContent).toContain('To the gates, and through.');
    });

    it('should wrap quote in blockquote or similar semantic element', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const quoteEl = container.querySelector('.preview-quote');
      // Should be a blockquote or have quote-like styling
      expect(
        quoteEl?.tagName.toLowerCase() === 'blockquote' ||
        quoteEl?.classList.contains('preview-quote')
      ).toBe(true);
    });

    it('should handle missing quote gracefully', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({
        agents: {
          sm: createThemeAgent({ character: 'No Quote Guy', quote: undefined }),
        },
      });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      // Should not throw
      expect(() => {
        themeBrowser.renderThemeBrowser(container, state, {
          onSelect: vi.fn(),
          onApply: vi.fn(),
          onCancel: vi.fn(),
        });
      }).not.toThrow();
    });

    it('should show quote with quotation marks', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents();
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const quoteEl = container.querySelector('.preview-quote');
      const quoteText = quoteEl?.textContent || '';
      // Quote should have quotation marks or be styled as a quote
      expect(
        quoteText.includes('"') ||
        quoteText.includes('"') ||
        quoteText.includes("'")
      ).toBe(true);
    });

  });

  // ===========================================================================
  // AC4: Theme category and tier prominently displayed
  // ===========================================================================
  describe('AC4: Theme category and tier prominently displayed', () => {

    it('should render theme name in preview header', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({ name: 'The Expanse' });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const titleEl = container.querySelector('.preview-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent).toBe('The Expanse');
    });

    it('should render theme category in preview metadata', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({ category: 'TV Series' });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const metaEl = container.querySelector('.preview-meta');
      expect(metaEl?.textContent).toContain('TV Series');
    });

    it('should render theme tier in preview metadata', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({ tier: 'S' });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const metaEl = container.querySelector('.preview-meta');
      expect(metaEl?.textContent).toContain('S');
    });

    it('should display category and tier together (e.g., "TV Series • Tier F")', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({
        category: 'Literature',
        tier: 'A',
      });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const metaEl = container.querySelector('.preview-meta');
      const metaText = metaEl?.textContent || '';
      expect(metaText).toContain('Literature');
      expect(metaText).toContain('A');
    });

    it('should render full description in preview', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const longDesc = 'This is a very long description that would normally be truncated on the card but should be fully visible in the preview panel.';
      const selectedTheme = createThemeMetadataWithAgents({ description: longDesc });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const descEl = container.querySelector('.preview-description');
      expect(descEl?.textContent).toBe(longDesc);
    });

    it('should apply tier-specific styling to preview panel', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const selectedTheme = createThemeMetadataWithAgents({ tier: 'S' });
      const state = createThemeBrowserStateWithPreview({
        selectedThemeId: selectedTheme.id,
        selectedThemeData: selectedTheme,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const previewPanel = container.querySelector('.theme-preview-panel');
      // Panel should have tier class for styling (gold border for S-tier, etc.)
      expect(
        previewPanel?.classList.contains('tier-s') ||
        previewPanel?.querySelector('.tier-s') !== null ||
        previewPanel?.querySelector('.preview-tier-s') !== null
      ).toBe(true);
    });

  });

  // ===========================================================================
  // AC5: Preview updates instantly on selection change
  // ===========================================================================
  describe('AC5: Preview updates instantly on selection change', () => {

    it('should update preview when different theme is selected', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemesWithAgents();

      // First render with Expanse selected
      let state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'the-expanse',
        selectedThemeData: themes[0],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      let titleEl = container.querySelector('.preview-title');
      expect(titleEl?.textContent).toBe('The Expanse');

      // Re-render with Alice selected
      state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'alice-in-wonderland',
        selectedThemeData: themes[1],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      titleEl = container.querySelector('.preview-title');
      expect(titleEl?.textContent).toBe('Alice in Wonderland');
    });

    it('should update agent list when theme changes', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemesWithAgents();

      // First render with Expanse
      let state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'the-expanse',
        selectedThemeData: themes[0],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      let agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('Camina Drummer');

      // Re-render with Alice
      state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'alice-in-wonderland',
        selectedThemeData: themes[1],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      agentsList = container.querySelector('.preview-agents');
      expect(agentsList?.textContent).toContain('The Mad Hatter');
      expect(agentsList?.textContent).not.toContain('Camina Drummer');
    });

    it('should update quote when theme changes', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemesWithAgents();

      // First render with Expanse
      let state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'the-expanse',
        selectedThemeData: themes[0],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      let quoteEl = container.querySelector('.preview-quote');
      expect(quoteEl?.textContent).toContain('To the gates');

      // Re-render with Alice
      state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'alice-in-wonderland',
        selectedThemeData: themes[1],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      quoteEl = container.querySelector('.preview-quote');
      expect(quoteEl?.textContent).toContain('mad here');
    });

    it('should clear preview when selection is cleared', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemesWithAgents();

      // First render with theme selected
      let state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: 'the-expanse',
        selectedThemeData: themes[0],
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      let previewContent = container.querySelector('.preview-title');
      expect(previewContent).not.toBeNull();

      // Re-render with no selection
      state = createThemeBrowserStateWithPreview({
        themes,
        selectedThemeId: null,
        selectedThemeData: null,
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      const emptyState = container.querySelector('.theme-preview-empty');
      expect(emptyState).not.toBeNull();
    });

    it('should maintain preview during search filtering if selected theme still visible', async () => {
      const themeBrowser = await import('../src/public/js/components/ThemeBrowser.js');
      const themes = createMockThemesWithAgents();

      // Select Expanse and filter to TV Series (includes Expanse)
      const filteredThemes = themes.filter(t => t.category === 'TV Series');
      const state = createThemeBrowserStateWithPreview({
        themes,
        filteredThemes,
        selectedThemeId: 'the-expanse',
        selectedThemeData: themes[0],
        searchQuery: 'expanse',
      });

      themeBrowser.renderThemeBrowser(container, state, {
        onSelect: vi.fn(),
        onApply: vi.fn(),
        onCancel: vi.fn(),
      });

      // Preview should still show Expanse
      const titleEl = container.querySelector('.preview-title');
      expect(titleEl?.textContent).toBe('The Expanse');
    });

  });

  // ===========================================================================
  // CSS Integration for Preview Panel
  // ===========================================================================
  describe('CSS Integration for Preview Panel', () => {

    it('should have .theme-preview-panel styles in theme-browser.css', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.theme-preview-panel');
    });

    it('should have .preview-agents styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.preview-agents');
    });

    it('should have .preview-quote styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.preview-quote');
    });

    it('should have .preview-empty styles', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      expect(response.text).toContain('.theme-preview-empty');
    });

    it('should have flexbox layout for content area', async () => {
      const request = (await import('supertest')).default;
      const { app } = await import('../src/server.js');

      const response = await request(app).get('/css/theme-browser.css');
      // Content area should use flex for grid + preview side by side
      expect(response.text).toMatch(/\.theme-browser-content[^{]*\{[^}]*display:\s*flex/);
    });

  });

  // ===========================================================================
  // IPC Integration for Agent Data
  // ===========================================================================
  describe('IPC Integration for Agent Data', () => {

    it('should include agents in theme metadata from IPC', async () => {
      const main = await import('../src/main.js');
      expect(main.loadThemeMetadataWithAgents).toBeDefined();
      expect(typeof main.loadThemeMetadataWithAgents).toBe('function');
    });

    it('should return agents object in metadata', async () => {
      const main = await import('../src/main.js');

      const metadata = await main.loadThemeMetadataWithAgents();

      if (metadata && metadata.length > 0) {
        const firstTheme = metadata[0];
        expect(firstTheme.agents).toBeDefined();
        expect(typeof firstTheme.agents).toBe('object');
      }
    });

    it('should include core agent roles in agents object', async () => {
      const main = await import('../src/main.js');

      const metadata = await main.loadThemeMetadataWithAgents();

      if (metadata && metadata.length > 0) {
        const themeWithAgents = metadata.find((t: ThemeMetadataWithAgents) => t.agents?.sm);
        if (themeWithAgents) {
          expect(themeWithAgents.agents.sm).toBeDefined();
          expect(themeWithAgents.agents.sm?.character).toBeDefined();
        }
      }
    });

  });

});
