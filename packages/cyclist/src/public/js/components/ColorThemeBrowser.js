/**
 * Color Theme Browser Component
 *
 * Displays available color themes (built-in and custom) with previews
 * and allows selecting, importing, and exporting themes.
 *
 * Story 35-7: Custom Styling Themes
 */

import {
  BUILT_IN_THEMES,
  getCustomThemes,
  applyTheme,
  downloadThemeAsFile,
} from '../theme-manager.js';

// =============================================================================
// Color Theme Browser Class
// =============================================================================

/**
 * ColorThemeBrowser class for browsing and selecting themes
 */
export class ColorThemeBrowser {
  constructor(container, doc, options = {}) {
    this.container = container;
    this.doc = doc || document;
    this.options = options;
    this.activeThemeId = options.activeThemeId || 'dark';
    this.onSelect = options.onSelect;
    this.onImport = options.onImport;

    this.render();
  }

  render() {
    renderColorThemeBrowser(this.container, this.doc, {
      activeThemeId: this.activeThemeId,
      onSelect: (themeId, theme) => this.handleSelect(themeId, theme),
      onImport: this.onImport,
    });
  }

  handleSelect(themeId, theme) {
    this.activeThemeId = themeId;
    applyTheme(theme);

    // Update active state in UI
    const cards = this.container.querySelectorAll('.color-theme-card');
    cards.forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-theme-id') === themeId);
    });

    if (this.onSelect) {
      this.onSelect(themeId, theme);
    }
  }
}

/**
 * Factory function to create ColorThemeBrowser
 * @param {HTMLElement} container - Container element
 * @param {Document} doc - Document
 * @param {object} options - Options
 * @returns {ColorThemeBrowser} ColorThemeBrowser instance
 */
export function createColorThemeBrowser(container, doc, options = {}) {
  return new ColorThemeBrowser(container, doc, options);
}

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Render the color theme browser
 * @param {HTMLElement} container - Container element
 * @param {Document} doc - Document
 * @param {object} options - Render options
 */
export function renderColorThemeBrowser(container, doc, options = {}) {
  const d = doc || document;
  container.innerHTML = '';

  const browser = d.createElement('div');
  browser.className = 'color-theme-browser';

  // Header with import button
  const header = d.createElement('div');
  header.className = 'color-theme-browser-header';

  const title = d.createElement('h3');
  title.textContent = 'Color Themes';
  header.appendChild(title);

  const importBtn = d.createElement('button');
  importBtn.className = 'theme-import-btn';
  importBtn.textContent = 'Import Theme';
  importBtn.addEventListener('click', () => {
    if (options.onImport) {
      options.onImport();
    } else {
      showImportDialog(d);
    }
  });
  header.appendChild(importBtn);

  browser.appendChild(header);

  // Built-in themes section
  const builtInSection = d.createElement('div');
  builtInSection.className = 'built-in-themes-section';

  const builtInTitle = d.createElement('h4');
  builtInTitle.textContent = 'Built-in Themes';
  builtInSection.appendChild(builtInTitle);

  const builtInGrid = d.createElement('div');
  builtInGrid.className = 'color-theme-grid';

  for (const [id, theme] of Object.entries(BUILT_IN_THEMES)) {
    const card = createThemePreviewCard(theme, d, {
      isActive: id === options.activeThemeId,
      onSelect: () => {
        if (options.onSelect) options.onSelect(id, theme);
      },
    });
    builtInGrid.appendChild(card);
  }

  builtInSection.appendChild(builtInGrid);
  browser.appendChild(builtInSection);

  // Custom themes section (if any exist)
  const customThemes = getCustomThemes();
  if (customThemes.length > 0) {
    const customSection = d.createElement('div');
    customSection.className = 'custom-themes-section';

    const customTitle = d.createElement('h4');
    customTitle.textContent = 'Custom Themes';
    customSection.appendChild(customTitle);

    const customGrid = d.createElement('div');
    customGrid.className = 'color-theme-grid';

    for (const theme of customThemes) {
      const card = createThemePreviewCard(theme, d, {
        isActive: theme.id === options.activeThemeId,
        onSelect: () => {
          if (options.onSelect) options.onSelect(theme.id, theme);
        },
      });
      customGrid.appendChild(card);
    }

    customSection.appendChild(customGrid);
    browser.appendChild(customSection);
  }

  container.appendChild(browser);
}

/**
 * Create a theme preview card
 * @param {object} theme - Theme to preview
 * @param {Document} doc - Document
 * @param {object} options - Options
 * @returns {HTMLElement} Theme card element
 */
export function createThemePreviewCard(theme, doc, options = {}) {
  const d = doc || document;

  const card = d.createElement('div');
  card.className = 'color-theme-card';
  card.setAttribute('data-theme-id', theme.id);

  if (options.isActive) {
    card.classList.add('active');
  }

  // Click handler
  card.addEventListener('click', () => {
    if (options.onSelect) options.onSelect();
  });

  // Theme name
  const name = d.createElement('div');
  name.className = 'color-theme-name';
  name.textContent = theme.name;
  card.appendChild(name);

  // Color swatches
  const swatches = d.createElement('div');
  swatches.className = 'color-swatches';

  // Show primary colors
  const colors = [
    theme.ui.bgPrimary,
    theme.ui.bgSecondary,
    theme.ui.textPrimary,
    theme.ui.accent,
    theme.status.success,
    theme.status.error,
  ];

  for (const color of colors) {
    const swatch = d.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatches.appendChild(swatch);
  }

  card.appendChild(swatches);

  // Description (if exists)
  if (theme.description) {
    const desc = d.createElement('div');
    desc.className = 'color-theme-description';
    desc.textContent = theme.description;
    card.appendChild(desc);
  }

  // Export button
  const exportBtn = d.createElement('button');
  exportBtn.className = 'theme-export-btn';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadThemeAsFile(theme);
  });
  card.appendChild(exportBtn);

  return card;
}

// =============================================================================
// Import Dialog
// =============================================================================

/**
 * Show import dialog for themes
 * @param {Document} doc - Document
 */
export function showImportDialog(doc) {
  const d = doc || document;

  // Create modal overlay
  const overlay = d.createElement('div');
  overlay.className = 'theme-import-overlay';

  const dialog = d.createElement('div');
  dialog.className = 'theme-import-dialog';

  const title = d.createElement('h3');
  title.textContent = 'Import Theme';
  dialog.appendChild(title);

  // File input
  const fileGroup = d.createElement('div');
  fileGroup.className = 'form-group';
  const fileLabel = d.createElement('label');
  fileLabel.textContent = 'From File:';
  const fileInput = d.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileGroup.appendChild(fileLabel);
  fileGroup.appendChild(fileInput);
  dialog.appendChild(fileGroup);

  // URL input
  const urlGroup = d.createElement('div');
  urlGroup.className = 'form-group';
  const urlLabel = d.createElement('label');
  urlLabel.textContent = 'From URL:';
  const urlInput = d.createElement('input');
  urlInput.type = 'url';
  urlInput.placeholder = 'https://example.com/theme.json';
  urlGroup.appendChild(urlLabel);
  urlGroup.appendChild(urlInput);
  dialog.appendChild(urlGroup);

  // Buttons
  const buttons = d.createElement('div');
  buttons.className = 'dialog-buttons';

  const cancelBtn = d.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });
  buttons.appendChild(cancelBtn);

  const importBtn = d.createElement('button');
  importBtn.textContent = 'Import';
  importBtn.className = 'primary';
  buttons.appendChild(importBtn);

  dialog.appendChild(buttons);
  overlay.appendChild(dialog);
  d.body.appendChild(overlay);
}
