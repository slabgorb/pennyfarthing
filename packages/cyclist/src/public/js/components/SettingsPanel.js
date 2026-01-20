/**
 * Settings Panel - Theme Picker (Story 35-8)
 *
 * Simplified settings panel that focuses on theme selection.
 * Shows themes as clickable cards with name and tier badge.
 * Theme selection is instant (no save/cancel flow).
 */

/** Theme metadata cache */
let themes = [];

/** Current theme ID */
let currentTheme = null;

/** Filtered themes for search */
let filteredThemes = [];

/** Loading state */
let isLoading = false;

/**
 * Tier badge colors and labels
 */
const TIER_CONFIG = {
  S: { label: 'S', class: 'tier-s', title: 'Elite - Top performing theme' },
  A: { label: 'A', class: 'tier-a', title: 'Excellent - High performing theme' },
  B: { label: 'B', class: 'tier-b', title: 'Strong - Above average theme' },
  C: { label: 'C', class: 'tier-c', title: 'Good - Average performing theme' },
  D: { label: 'D', class: 'tier-d', title: 'Below Average' },
  U: { label: '?', class: 'tier-u', title: 'Unbenchmarked - No performance data' },
};

/**
 * Initialize the settings panel
 */
export function init() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  // Wire up search input
  const searchInput = document.getElementById('theme-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterThemes(e.target.value);
    });
  }

  // Wire up retry button
  const retryBtn = panel.querySelector('.settings-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => load());
  }

  console.log('[SettingsPanel] Initialized');
}

/**
 * Load themes from API
 */
export async function load() {
  showLoading();

  try {
    // Try IPC first, then HTTP fallback
    if (window.electronAPI?.settings?.getThemeMetadata) {
      themes = await window.electronAPI.settings.getThemeMetadata();
    } else {
      const response = await fetch('/api/settings/themes');
      if (response.ok) {
        themes = await response.json();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    }

    // Get current theme from settings
    if (window.electronAPI?.settings?.get) {
      const settings = await window.electronAPI.settings.get();
      currentTheme = settings?.pennyfarthing?.theme || 'alice-in-wonderland';
    } else {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings = await response.json();
        currentTheme = settings?.pennyfarthing?.theme || 'alice-in-wonderland';
      }
    }

    // Sort themes: current first, then by tier (S, A, B, C, D, U), then alphabetically
    themes = sortThemes(themes);
    filteredThemes = themes;

    hideLoading();
    render();
  } catch (err) {
    console.error('[SettingsPanel] Failed to load themes:', err);
    showError('Failed to load themes');
  }
}

/**
 * Sort themes: current first, then by tier, then alphabetically
 * @param {Array} themeList - List of themes to sort
 * @returns {Array} Sorted theme list
 */
function sortThemes(themeList) {
  const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4, U: 5 };

  return [...themeList].sort((a, b) => {
    // Current theme always first
    if (a.id === currentTheme) return -1;
    if (b.id === currentTheme) return 1;

    // Then by tier
    const tierA = tierOrder[a.tier] ?? 5;
    const tierB = tierOrder[b.tier] ?? 5;
    if (tierA !== tierB) return tierA - tierB;

    // Then alphabetically
    return a.name.localeCompare(b.name);
  });
}

/**
 * Sort themes with recent themes at top (Story 35-8)
 * Order: current theme, recent themes, then by tier
 *
 * @param {Array} themeList - List of theme objects { id, name, tier }
 * @param {Array} recentThemes - List of recently used theme IDs
 * @param {string} currentThemeId - Currently active theme ID
 * @returns {Array} Sorted theme list
 */
export function sortThemesWithRecent(themeList, recentThemes = [], currentThemeId = null) {
  const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4, U: 5 };
  const recentSet = new Set(recentThemes);

  return [...themeList].sort((a, b) => {
    // Current theme always first
    if (a.id === currentThemeId) return -1;
    if (b.id === currentThemeId) return 1;

    // Recent themes come next (in order of recency)
    const aIsRecent = recentSet.has(a.id);
    const bIsRecent = recentSet.has(b.id);

    if (aIsRecent && !bIsRecent) return -1;
    if (!aIsRecent && bIsRecent) return 1;

    // If both are recent, sort by recency order
    if (aIsRecent && bIsRecent) {
      return recentThemes.indexOf(a.id) - recentThemes.indexOf(b.id);
    }

    // Then by tier
    const tierA = tierOrder[a.tier] ?? 5;
    const tierB = tierOrder[b.tier] ?? 5;
    if (tierA !== tierB) return tierA - tierB;

    // Then alphabetically
    return a.name.localeCompare(b.name);
  });
}

/**
 * Filter themes by search query
 */
function filterThemes(query) {
  const q = query.toLowerCase().trim();

  if (!q) {
    filteredThemes = themes;
  } else {
    filteredThemes = themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.source && t.source.toLowerCase().includes(q))
    );
  }

  render();
}

/**
 * Render the theme list (exported for tests - Story 35-8)
 */
export function renderThemeList() {
  return render();
}

/**
 * Render the theme list
 */
function render() {
  const container = document.getElementById('theme-list');
  if (!container) return;

  container.innerHTML = '';

  if (filteredThemes.length === 0) {
    container.innerHTML = '<div class="theme-empty">No themes found</div>';
    return;
  }

  for (const theme of filteredThemes) {
    const card = createThemeCard(theme);
    container.appendChild(card);
  }
}

/**
 * Create a theme card element
 */
function createThemeCard(theme) {
  const card = document.createElement('button');
  card.className = 'theme-card' + (theme.id === currentTheme ? ' active' : '');
  card.setAttribute('role', 'option');
  card.setAttribute('aria-selected', theme.id === currentTheme ? 'true' : 'false');
  card.setAttribute('data-theme-id', theme.id);

  // Tier badge
  const tierConfig = TIER_CONFIG[theme.tier] || TIER_CONFIG.U;
  const tierBadge = document.createElement('span');
  tierBadge.className = `tier-badge ${tierConfig.class}`;
  tierBadge.textContent = tierConfig.label;
  tierBadge.title = tierConfig.title;

  // Theme name
  const name = document.createElement('span');
  name.className = 'theme-name';
  name.textContent = theme.name;

  // Assemble card
  const info = document.createElement('div');
  info.className = 'theme-info';
  info.appendChild(name);

  card.appendChild(tierBadge);
  card.appendChild(info);

  // Click handler
  card.addEventListener('click', () => selectTheme(theme.id));

  return card;
}

/**
 * Select a theme (exported for tests - Story 35-8)
 * @param {string} themeId - Theme ID to select
 */
export async function selectTheme(themeId) {
  if (themeId === currentTheme) return;

  const previousTheme = currentTheme;
  currentTheme = themeId;

  // Update UI immediately
  updateActiveCard();

  try {
    // Save to backend
    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save({ pennyfarthing: { theme: themeId } });
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pennyfarthing: { theme: themeId } }),
      });
    }

    // Trigger persona refresh
    if (window.refreshPersona) {
      window.refreshPersona();
    }

    // Dispatch event for other components
    document.dispatchEvent(
      new CustomEvent('theme:changed', { detail: { theme: themeId, previous: previousTheme } })
    );

    console.log('[SettingsPanel] Theme changed to:', themeId);
  } catch (err) {
    console.error('[SettingsPanel] Failed to save theme:', err);
    // Revert on error
    currentTheme = previousTheme;
    updateActiveCard();
    // 35-8: Send error message to message panel for user feedback
    sendErrorToMessagePanel(`Failed to save theme "${themeId}". ${err.message || 'Please try again.'}`);
  }
}

/**
 * Send an error message to the message panel (35-8)
 * @param {string} message - Error message to display
 */
function sendErrorToMessagePanel(message) {
  // Import and use MessageView's addMessage
  import('./MessageView.js').then(({ addMessage }) => {
    addMessage({
      type: 'system',
      subtype: 'error',
      message: message,
    });
  }).catch(() => {
    // Fallback: dispatch event for any listeners
    document.dispatchEvent(
      new CustomEvent('theme:error', { detail: { error: message } })
    );
  });
}

/**
 * Update which card shows as active
 */
function updateActiveCard() {
  const container = document.getElementById('theme-list');
  if (!container) return;

  container.querySelectorAll('.theme-card').forEach((card) => {
    const isActive = card.getAttribute('data-theme-id') === currentTheme;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

/**
 * Show loading state
 */
function showLoading() {
  isLoading = true;
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  const loading = panel.querySelector('.settings-loading');
  const error = panel.querySelector('.settings-error');
  const section = panel.querySelector('.theme-picker-section');

  if (loading) loading.classList.remove('hidden');
  if (error) error.classList.add('hidden');
  if (section) section.classList.add('hidden');

  panel.setAttribute('aria-busy', 'true');
}

/**
 * Hide loading state
 */
function hideLoading() {
  isLoading = false;
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  const loading = panel.querySelector('.settings-loading');
  const section = panel.querySelector('.theme-picker-section');

  if (loading) loading.classList.add('hidden');
  if (section) section.classList.remove('hidden');

  panel.setAttribute('aria-busy', 'false');
}

/**
 * Show error state (exported for tests - Story 35-8)
 * @param {string} message - Error message to display
 */
export function showError(message) {
  isLoading = false;
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  const loading = panel.querySelector('.settings-loading');
  const error = panel.querySelector('.settings-error');
  const errorText = panel.querySelector('.error-text');
  const section = panel.querySelector('.theme-picker-section');

  if (loading) loading.classList.add('hidden');
  if (error) error.classList.remove('hidden');
  if (errorText) errorText.textContent = message;
  if (section) section.classList.add('hidden');

  panel.setAttribute('aria-busy', 'false');
}

/**
 * Check if panel is loading
 */
export function isLoadingState() {
  return isLoading;
}

/**
 * No dirty state for theme picker (instant save)
 */
export function isDirty() {
  return false;
}

/**
 * Export for settings-panel.js wrapper
 */
export const SettingsPanel = {
  init,
  load,
  isDirty,
  isLoading: isLoadingState,
  selectTheme,
  showError,
  sortThemesWithRecent,
  renderThemeList,
};
