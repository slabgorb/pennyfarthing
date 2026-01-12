/**
 * ThemeBrowser Component (Story 24-5)
 *
 * A searchable, filterable grid browser for selecting themes.
 * Replaces the simple dropdown with a rich browsing experience.
 *
 * @module ThemeBrowser
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Debounce delay for search input (ms)
 */
export const SEARCH_DEBOUNCE_MS = 150;

/**
 * CSS class for selected theme card
 */
export const THEME_CARD_SELECTED_CLASS = 'selected';

/**
 * Human-readable labels for tier codes
 */
export const TIER_LABELS = {
  S: 'S-Tier',
  A: 'A-Tier',
  B: 'B-Tier',
  U: 'Unrated',
};

/**
 * Maximum description length before truncation
 */
const MAX_DESCRIPTION_LENGTH = 100;

// =============================================================================
// ThemeBrowser Class
// =============================================================================

/**
 * ThemeBrowser class for managing theme browser state and rendering
 */
export class ThemeBrowser {
  /**
   * Create a ThemeBrowser instance
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration options
   */
  constructor(container, config = {}) {
    this.container = container;
    this.config = config;
    this.state = {
      themes: [],
      filteredThemes: [],
      searchQuery: '',
      selectedCategory: 'All',
      selectedThemeId: config.initialThemeId || null,
      isLoading: true,
      focusIndex: 0,
    };
  }

  /**
   * Initialize the browser
   */
  async init() {
    this.render();
    await this.loadThemes();
  }

  /**
   * Load themes from IPC
   */
  async loadThemes() {
    if (window.electronAPI?.settings?.getThemeMetadata) {
      try {
        const themes = await window.electronAPI.settings.getThemeMetadata();
        this.state.themes = themes;
        this.state.filteredThemes = themes;
        this.state.isLoading = false;
        this.render();
      } catch (err) {
        console.error('Failed to load theme metadata:', err);
        this.state.isLoading = false;
        this.render();
      }
    }
  }

  /**
   * Render the browser
   */
  render() {
    renderThemeBrowser(this.container, this.state, {
      onSelect: (themeId) => {
        this.state.selectedThemeId = themeId;
        this.config.onSelect?.(themeId);
        this.render();
      },
      onApply: (themeId) => {
        this.config.onApply?.(themeId);
      },
      onCancel: () => {
        this.config.onCancel?.();
      },
    });
  }
}

/**
 * Factory function to create a ThemeBrowser
 * @param {HTMLElement} container - Container element
 * @param {Object} config - Configuration options
 * @returns {ThemeBrowser} ThemeBrowser instance
 */
export function createThemeBrowser(container, config = {}) {
  const browser = new ThemeBrowser(container, config);
  browser.init();
  return browser;
}

// =============================================================================
// Filter Functions
// =============================================================================

/**
 * Filter themes by search query (fuzzy matching)
 * @param {Array} themes - Array of theme metadata
 * @param {string} query - Search query
 * @returns {Array} Filtered themes
 */
export function filterThemesBySearch(themes, query) {
  if (!query || query.trim() === '') {
    return themes;
  }

  const terms = query.toLowerCase().trim().split(/\s+/);

  return themes.filter(theme => {
    const searchText = `${theme.name} ${theme.description || ''}`.toLowerCase();
    // All terms must match (AND logic)
    return terms.every(term => searchText.includes(term));
  });
}

/**
 * Filter themes by category
 * @param {Array} themes - Array of theme metadata
 * @param {string} category - Category to filter by
 * @returns {Array} Filtered themes
 */
export function filterThemesByCategory(themes, category) {
  if (!category || category === 'All') {
    return themes;
  }
  return themes.filter(theme => theme.category === category);
}

/**
 * Extract unique categories from themes, sorted alphabetically
 * @param {Array} themes - Array of theme metadata
 * @returns {Array<string>} Sorted unique categories
 */
export function extractCategories(themes) {
  const categories = new Set(themes.map(t => t.category).filter(Boolean));
  return [...categories].sort();
}

// =============================================================================
// Card Rendering
// =============================================================================

/**
 * Truncate text to max length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create a theme card element
 * @param {Object} theme - Theme metadata
 * @param {Document} doc - Document object (for creating elements)
 * @param {boolean} isSelected - Whether this card is selected
 * @returns {HTMLElement} Theme card element
 */
export function createThemeCard(theme, doc, isSelected = false) {
  const card = doc.createElement('div');
  card.className = `theme-card tier-${theme.tier.toLowerCase()}`;
  card.dataset.themeId = theme.id;
  card.setAttribute('tabindex', '0');

  if (isSelected) {
    card.classList.add(THEME_CARD_SELECTED_CLASS);
  }

  // Name
  const nameEl = doc.createElement('div');
  nameEl.className = 'theme-card-name';
  nameEl.textContent = theme.name;
  card.appendChild(nameEl);

  // Description
  const descEl = doc.createElement('div');
  descEl.className = 'theme-card-description';
  descEl.textContent = truncateText(theme.description, MAX_DESCRIPTION_LENGTH);
  card.appendChild(descEl);

  // Footer with category and tier
  const footerEl = doc.createElement('div');
  footerEl.className = 'theme-card-footer';

  const categoryEl = doc.createElement('span');
  categoryEl.className = 'theme-card-category';
  categoryEl.textContent = theme.category || 'Other';
  footerEl.appendChild(categoryEl);

  const tierEl = doc.createElement('span');
  tierEl.className = 'theme-card-tier';
  tierEl.textContent = TIER_LABELS[theme.tier] || theme.tier;
  footerEl.appendChild(tierEl);

  card.appendChild(footerEl);

  return card;
}

// =============================================================================
// Grid Rendering
// =============================================================================

/**
 * Render the theme grid
 * @param {HTMLElement} container - Container element
 * @param {Object} state - Theme browser state
 */
export function renderThemeGrid(container, state) {
  container.innerHTML = '';

  // Loading state
  if (state.isLoading) {
    const loading = container.ownerDocument.createElement('div');
    loading.className = 'theme-browser-loading';
    loading.textContent = 'Loading themes...';
    container.appendChild(loading);
    return;
  }

  // Empty state
  if (!state.filteredThemes || state.filteredThemes.length === 0) {
    const empty = container.ownerDocument.createElement('div');
    empty.className = 'theme-browser-empty';
    empty.textContent = 'No themes found';
    container.appendChild(empty);
    return;
  }

  // Grid container
  const grid = container.ownerDocument.createElement('div');
  grid.className = 'theme-grid';

  // Render each theme card
  state.filteredThemes.forEach(theme => {
    const isSelected = theme.id === state.selectedThemeId;
    const card = createThemeCard(theme, container.ownerDocument, isSelected);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// =============================================================================
// Full Browser Rendering
// =============================================================================

/**
 * Render the complete theme browser with controls
 * @param {HTMLElement} container - Container element
 * @param {Object} state - Theme browser state
 * @param {Object} config - Event handlers (onSelect, onApply, onCancel)
 */
export function renderThemeBrowser(container, state, config) {
  container.innerHTML = '';
  const doc = container.ownerDocument;

  // Header with search and filter
  const header = doc.createElement('div');
  header.className = 'theme-browser-header';

  // Search input
  const searchInput = doc.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'theme-search-input';
  searchInput.placeholder = 'Search themes...';
  searchInput.value = state.searchQuery || '';

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.searchQuery = e.target.value;
      state.filteredThemes = filterThemesBySearch(
        filterThemesByCategory(state.themes, state.selectedCategory),
        state.searchQuery
      );
      renderThemeBrowser(container, state, config);
    }, SEARCH_DEBOUNCE_MS);
  });
  header.appendChild(searchInput);

  // Category filter
  const categorySelect = doc.createElement('select');
  categorySelect.className = 'theme-category-filter';

  // Add "All" option
  const allOption = doc.createElement('option');
  allOption.value = 'All';
  allOption.textContent = 'All Categories';
  if (state.selectedCategory === 'All') {
    allOption.selected = true;
  }
  categorySelect.appendChild(allOption);

  // Add category options
  const categories = extractCategories(state.themes);
  categories.forEach(category => {
    const option = doc.createElement('option');
    option.value = category;
    option.textContent = category;
    if (state.selectedCategory === category) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });

  categorySelect.addEventListener('change', (e) => {
    state.selectedCategory = e.target.value;
    state.filteredThemes = filterThemesBySearch(
      filterThemesByCategory(state.themes, state.selectedCategory),
      state.searchQuery
    );
    renderThemeBrowser(container, state, config);
  });
  header.appendChild(categorySelect);

  container.appendChild(header);

  // Grid content
  const gridContainer = doc.createElement('div');
  gridContainer.className = 'theme-browser-content';
  renderThemeGrid(gridContainer, state);

  // Add click handlers to cards
  gridContainer.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const themeId = card.dataset.themeId;
      config.onSelect?.(themeId);
    });

    // Keyboard support for cards
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const themeId = card.dataset.themeId;
        config.onSelect?.(themeId);
      }
    });
  });

  container.appendChild(gridContainer);

  // Footer with buttons
  const footer = doc.createElement('div');
  footer.className = 'theme-browser-footer';

  const cancelBtn = doc.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'theme-browser-cancel btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    config.onCancel?.();
  });
  footer.appendChild(cancelBtn);

  const applyBtn = doc.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'theme-browser-apply btn btn-primary';
  applyBtn.textContent = 'Apply';
  applyBtn.disabled = !state.selectedThemeId;
  applyBtn.addEventListener('click', () => {
    if (state.selectedThemeId) {
      config.onApply?.(state.selectedThemeId);
    }
  });
  footer.appendChild(applyBtn);

  container.appendChild(footer);

  // Add keyboard navigation to the grid
  gridContainer.addEventListener('keydown', (e) => {
    const cards = Array.from(gridContainer.querySelectorAll('.theme-card'));
    const currentIndex = cards.findIndex(c => c === doc.activeElement);

    if (currentIndex === -1) return;

    const result = handleKeyboardNavigation(e, state.filteredThemes, currentIndex, 3);

    if (result.focusIndex !== currentIndex) {
      cards[result.focusIndex]?.focus();
    }

    if (result.selectedThemeId) {
      config.onSelect?.(result.selectedThemeId);
    }
  });
}

// =============================================================================
// Keyboard Navigation
// =============================================================================

/**
 * Handle keyboard navigation in the theme grid
 * @param {KeyboardEvent} event - Keyboard event
 * @param {Array} themes - Array of themes
 * @param {number} currentIndex - Current focus index
 * @param {number} columnsPerRow - Number of columns per row (default 3)
 * @returns {Object} New state { focusIndex, selectedThemeId }
 */
export function handleKeyboardNavigation(event, themes, currentIndex, columnsPerRow = 3) {
  const count = themes.length;
  if (count === 0) {
    return { focusIndex: 0, selectedThemeId: null };
  }

  let newIndex = currentIndex;
  let selectedThemeId = null;

  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault();
      newIndex = (currentIndex + 1) % count;
      break;

    case 'ArrowLeft':
      event.preventDefault();
      newIndex = (currentIndex - 1 + count) % count;
      break;

    case 'ArrowDown':
      event.preventDefault();
      newIndex = currentIndex + columnsPerRow;
      if (newIndex >= count) {
        newIndex = currentIndex % columnsPerRow; // Wrap to top of same column
      }
      break;

    case 'ArrowUp':
      event.preventDefault();
      newIndex = currentIndex - columnsPerRow;
      if (newIndex < 0) {
        // Wrap to bottom of same column
        const col = currentIndex % columnsPerRow;
        const lastRowStart = Math.floor((count - 1) / columnsPerRow) * columnsPerRow;
        newIndex = lastRowStart + col;
        if (newIndex >= count) {
          newIndex = count - 1;
        }
      }
      break;

    case 'Enter':
    case ' ':
      event.preventDefault();
      selectedThemeId = themes[currentIndex]?.id;
      break;

    default:
      // No action for other keys
      break;
  }

  return {
    focusIndex: newIndex,
    selectedThemeId,
  };
}

/**
 * Focus the first card in the theme grid
 * @param {HTMLElement} container - Container element
 */
export function focusFirstCard(container) {
  const firstCard = container.querySelector('.theme-card');
  if (firstCard) {
    firstCard.focus();
  }
}
