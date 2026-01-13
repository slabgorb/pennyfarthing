/**
 * QuickThemeSwitcher Component (Story 24-9)
 *
 * A fast keyboard-driven theme switcher overlay, similar to VS Code's
 * command palette but filtered to themes only.
 *
 * Features:
 * - Cmd+K keyboard shortcut to open
 * - Fuzzy search themes by typing
 * - Favorites shown first
 * - Arrow keys to navigate, Enter to select
 * - Escape to close
 * - Shows current theme highlighted
 *
 * @module QuickThemeSwitcher
 */

import { filterThemesBySearch } from './ThemeBrowser.js';

// =============================================================================
// Constants
// =============================================================================

const SEARCH_DEBOUNCE_MS = 100;

// =============================================================================
// State
// =============================================================================

let isVisible = false;
let themes = [];
let filteredThemes = [];
let favorites = [];
let currentThemeId = null;
let selectedIndex = 0;
let searchQuery = '';

// DOM references
let overlayEl = null;
let searchInputEl = null;
let listEl = null;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the quick theme switcher
 * Creates DOM elements and sets up event listeners
 */
export function init() {
  if (overlayEl) return; // Already initialized

  createOverlay();
  setupKeyboardShortcut();
  setupIPCListeners();
}

/**
 * Create the overlay DOM structure
 */
function createOverlay() {
  overlayEl = document.createElement('div');
  overlayEl.id = 'quick-theme-switcher';
  overlayEl.className = 'quick-theme-switcher hidden';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-label', 'Quick Theme Switcher');

  overlayEl.innerHTML = `
    <div class="quick-theme-backdrop"></div>
    <div class="quick-theme-panel">
      <div class="quick-theme-search">
        <input type="text"
               class="quick-theme-input"
               placeholder="Search themes..."
               autocomplete="off"
               spellcheck="false">
      </div>
      <div class="quick-theme-list" role="listbox" aria-label="Themes"></div>
      <div class="quick-theme-footer">
        <span class="quick-theme-hint">↑↓ Navigate</span>
        <span class="quick-theme-hint">↵ Select</span>
        <span class="quick-theme-hint">Esc Close</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Cache DOM references
  searchInputEl = overlayEl.querySelector('.quick-theme-input');
  listEl = overlayEl.querySelector('.quick-theme-list');

  // Event listeners
  overlayEl.querySelector('.quick-theme-backdrop').addEventListener('click', hide);
  searchInputEl.addEventListener('input', handleSearchInput);
  searchInputEl.addEventListener('keydown', handleKeydown);
  listEl.addEventListener('click', handleListClick);
}

/**
 * Set up global keyboard shortcut (Cmd+K / Ctrl+K)
 */
function setupKeyboardShortcut() {
  document.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K to open
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isVisible) {
        hide();
      } else {
        show();
      }
    }
  });
}

/**
 * Set up IPC listeners for theme switcher events from menu
 */
function setupIPCListeners() {
  // Listen for menu trigger (Cmd+K from Electron menu)
  if (window.electronAPI?.theme?.onShowQuickSwitcher) {
    window.electronAPI.theme.onShowQuickSwitcher(() => {
      if (isVisible) {
        hide();
      } else {
        show();
      }
    });
  }
}

// =============================================================================
// Show/Hide
// =============================================================================

/**
 * Show the quick theme switcher
 */
export async function show() {
  if (isVisible) return;

  isVisible = true;
  overlayEl.classList.remove('hidden');

  // Load current settings and theme data
  await loadData();

  // Reset state
  searchQuery = '';
  searchInputEl.value = '';
  selectedIndex = 0;

  // Filter and render
  applyFilter();
  renderList();

  // Focus search input
  searchInputEl.focus();
}

/**
 * Hide the quick theme switcher
 */
export function hide() {
  if (!isVisible) return;

  isVisible = false;
  overlayEl.classList.add('hidden');
  searchQuery = '';
  searchInputEl.value = '';
}

/**
 * Load theme data from IPC
 */
async function loadData() {
  try {
    // Get theme metadata
    if (window.electronAPI?.settings?.getThemeMetadata) {
      themes = await window.electronAPI.settings.getThemeMetadata();
    }

    // Get current settings (for current theme and favorites)
    if (window.electronAPI?.settings?.get) {
      const settings = await window.electronAPI.settings.get();
      currentThemeId = settings?.pennyfarthing?.theme || null;
      favorites = settings?.pennyfarthing?.favorites || [];
    }
  } catch (err) {
    console.error('QuickThemeSwitcher: Failed to load data:', err);
    themes = [];
    favorites = [];
  }
}

// =============================================================================
// Search and Filter
// =============================================================================

let debounceTimer = null;

/**
 * Handle search input changes
 */
function handleSearchInput(e) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchQuery = e.target.value;
    selectedIndex = 0;
    applyFilter();
    renderList();
  }, SEARCH_DEBOUNCE_MS);
}

/**
 * Apply search filter and sort (favorites first)
 */
function applyFilter() {
  // Apply fuzzy search
  let results = filterThemesBySearch(themes, searchQuery);

  // Sort: favorites first, then alphabetical
  const favoriteSet = new Set(favorites);
  results = results.sort((a, b) => {
    const aFav = favoriteSet.has(a.id);
    const bFav = favoriteSet.has(b.id);

    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;

    // Within same group, sort alphabetically
    return a.name.localeCompare(b.name);
  });

  filteredThemes = results;
}

// =============================================================================
// Rendering
// =============================================================================

/**
 * Render the theme list
 */
function renderList() {
  listEl.innerHTML = '';

  if (filteredThemes.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'quick-theme-empty';
    emptyEl.textContent = searchQuery ? 'No themes match your search' : 'No themes available';
    listEl.appendChild(emptyEl);
    return;
  }

  const favoriteSet = new Set(favorites);
  let lastWasFavorite = null;

  filteredThemes.forEach((theme, index) => {
    const isFavorite = favoriteSet.has(theme.id);
    const isCurrent = theme.id === currentThemeId;
    const isSelected = index === selectedIndex;

    // Add section header if transitioning from favorites to non-favorites
    if (lastWasFavorite === true && !isFavorite) {
      const divider = document.createElement('div');
      divider.className = 'quick-theme-divider';
      divider.textContent = 'All Themes';
      listEl.appendChild(divider);
    } else if (lastWasFavorite === null && isFavorite && favorites.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'quick-theme-divider';
      divider.textContent = 'Favorites';
      listEl.appendChild(divider);
    }
    lastWasFavorite = isFavorite;

    const itemEl = document.createElement('div');
    itemEl.className = 'quick-theme-item';
    itemEl.dataset.themeId = theme.id;
    itemEl.dataset.index = index;
    itemEl.setAttribute('role', 'option');

    if (isSelected) {
      itemEl.classList.add('selected');
      itemEl.setAttribute('aria-selected', 'true');
    }

    if (isCurrent) {
      itemEl.classList.add('current');
    }

    // Build item content
    const indicatorEl = document.createElement('span');
    indicatorEl.className = 'quick-theme-indicator';
    if (isCurrent) {
      indicatorEl.textContent = '●';
      indicatorEl.title = 'Current theme';
    } else if (isFavorite) {
      indicatorEl.textContent = '★';
      indicatorEl.title = 'Favorite';
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'quick-theme-name';
    nameEl.textContent = theme.name;

    const categoryEl = document.createElement('span');
    categoryEl.className = 'quick-theme-category';
    categoryEl.textContent = theme.category || '';

    const tierEl = document.createElement('span');
    tierEl.className = `quick-theme-tier tier-${theme.tier?.toLowerCase() || 'u'}`;
    tierEl.textContent = theme.tier || '';

    itemEl.appendChild(indicatorEl);
    itemEl.appendChild(nameEl);
    itemEl.appendChild(categoryEl);
    itemEl.appendChild(tierEl);

    listEl.appendChild(itemEl);
  });

  // Ensure selected item is visible
  scrollSelectedIntoView();
}

/**
 * Scroll the selected item into view
 */
function scrollSelectedIntoView() {
  const selectedEl = listEl.querySelector('.quick-theme-item.selected');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// =============================================================================
// Keyboard Navigation
// =============================================================================

/**
 * Handle keyboard events in search input
 */
function handleKeydown(e) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveSelection(1);
      break;

    case 'ArrowUp':
      e.preventDefault();
      moveSelection(-1);
      break;

    case 'Enter':
      e.preventDefault();
      selectCurrentTheme();
      break;

    case 'Escape':
      e.preventDefault();
      hide();
      break;

    case 'Tab':
      // Trap focus within the switcher
      e.preventDefault();
      break;
  }
}

/**
 * Move selection by delta
 */
function moveSelection(delta) {
  if (filteredThemes.length === 0) return;

  selectedIndex = (selectedIndex + delta + filteredThemes.length) % filteredThemes.length;
  renderList();
}

/**
 * Select and apply the currently highlighted theme
 */
async function selectCurrentTheme() {
  if (filteredThemes.length === 0) return;

  const theme = filteredThemes[selectedIndex];
  if (!theme) return;

  try {
    // Get current settings
    const settings = await window.electronAPI?.settings?.get?.() || {};

    // Update theme in settings
    if (!settings.pennyfarthing) {
      settings.pennyfarthing = {};
    }
    settings.pennyfarthing.theme = theme.id;

    // Save settings
    await window.electronAPI?.settings?.save?.(settings);

    // Update local state
    currentThemeId = theme.id;

    // Hide the switcher
    hide();
  } catch (err) {
    console.error('QuickThemeSwitcher: Failed to apply theme:', err);
  }
}

// =============================================================================
// List Click Handler
// =============================================================================

/**
 * Handle clicks on theme items
 */
function handleListClick(e) {
  const itemEl = e.target.closest('.quick-theme-item');
  if (!itemEl) return;

  const index = parseInt(itemEl.dataset.index, 10);
  if (!isNaN(index)) {
    selectedIndex = index;
    selectCurrentTheme();
  }
}

// =============================================================================
// Public API
// =============================================================================

export { isVisible };
