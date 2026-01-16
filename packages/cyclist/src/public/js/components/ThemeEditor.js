/**
 * Theme Editor Component
 *
 * Visual UI for creating and editing color themes with color pickers,
 * organized sections, and live preview capabilities.
 *
 * Story 35-7: Custom Styling Themes
 */

import { applyThemePreview, revertThemePreview } from '../theme-manager.js';

// =============================================================================
// Constants
// =============================================================================

export const PREVIEW_DEBOUNCE_MS = 50;

export const THEME_SECTIONS = ['ui', 'panels', 'status', 'terminal', 'syntax'];

// =============================================================================
// Color Picker Component
// =============================================================================

/**
 * Color picker configuration
 * @typedef {object} ColorPickerConfig
 * @property {string} label - Display label
 * @property {string} value - Current color value
 * @property {function} onChange - Callback when color changes
 */

/**
 * ColorPicker class for creating color picker elements
 */
export class ColorPicker {
  constructor(config, doc) {
    this.config = config;
    this.doc = doc || document;
  }

  render() {
    return createColorPicker(this.config, this.doc);
  }
}

/**
 * Create a color picker element
 * @param {ColorPickerConfig} config - Configuration
 * @param {Document} doc - Document to create elements in
 * @returns {HTMLElement} Color picker element
 */
export function createColorPicker(config, doc) {
  const { label, value, onChange } = config;
  const d = doc || document;

  const container = d.createElement('div');
  container.className = 'color-picker';

  // Label
  const labelEl = d.createElement('label');
  labelEl.className = 'color-picker-label';
  labelEl.textContent = label;
  container.appendChild(labelEl);

  // Input container
  const inputContainer = d.createElement('div');
  inputContainer.className = 'color-picker-inputs';

  // Visual color input
  const colorInput = d.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-picker-visual';
  colorInput.value = value.startsWith('#') ? value : '#000000';
  colorInput.addEventListener('input', (e) => {
    hexInput.value = e.target.value;
    if (onChange) onChange(e.target.value);
  });
  inputContainer.appendChild(colorInput);

  // Hex text input
  const hexInput = d.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'color-picker-hex';
  hexInput.value = value;
  hexInput.placeholder = '#000000';
  hexInput.addEventListener('change', (e) => {
    const newValue = e.target.value;
    if (newValue.match(/^#[0-9a-fA-F]{6}$/)) {
      colorInput.value = newValue;
    }
    if (onChange) onChange(newValue);
  });
  inputContainer.appendChild(hexInput);

  container.appendChild(inputContainer);

  return container;
}

// =============================================================================
// Theme Editor Class
// =============================================================================

/**
 * ThemeEditor class for managing the theme editor UI
 */
export class ThemeEditor {
  constructor(container, theme, doc, options = {}) {
    this.container = container;
    this.theme = JSON.parse(JSON.stringify(theme));
    this.doc = doc || document;
    this.options = options;
    this.isDirty = options.isDirty || false;
    this.activeSection = options.activeSection || 'ui';
    this.previewEnabled = options.previewEnabled !== false;
    this.onSave = options.onSave;
    this.onCancel = options.onCancel;
    this.onExport = options.onExport;

    this.render();
  }

  render() {
    renderThemeEditor(this.container, this.theme, this.doc, {
      isDirty: this.isDirty,
      activeSection: this.activeSection,
      previewEnabled: this.previewEnabled,
      onSave: this.onSave,
      onCancel: this.onCancel,
      onExport: this.onExport,
      onColorChange: (section, key, value) => this.handleColorChange(section, key, value),
      onMetadataChange: (key, value) => this.handleMetadataChange(key, value),
      onSectionChange: (section) => this.handleSectionChange(section),
      onPreviewToggle: (enabled) => this.handlePreviewToggle(enabled),
    });
  }

  handleColorChange(section, key, value) {
    this.theme[section][key] = value;
    this.isDirty = true;

    if (this.previewEnabled) {
      this.schedulePreview();
    }

    this.updateSaveButton();
  }

  handleMetadataChange(key, value) {
    this.theme[key] = value;
    this.isDirty = true;
    this.updateSaveButton();
  }

  handleSectionChange(section) {
    this.activeSection = section;
    this.render();
  }

  handlePreviewToggle(enabled) {
    this.previewEnabled = enabled;
    if (!enabled) {
      revertThemePreview();
    } else {
      applyThemePreview(this.theme);
    }
  }

  schedulePreview() {
    if (this._previewTimeout) {
      clearTimeout(this._previewTimeout);
    }
    this._previewTimeout = setTimeout(() => {
      applyThemePreview(this.theme);
    }, PREVIEW_DEBOUNCE_MS);
  }

  updateSaveButton() {
    const saveBtn = this.container.querySelector('.theme-editor-save');
    if (saveBtn) {
      saveBtn.disabled = !this.isDirty;
    }
  }

  getTheme() {
    return this.theme;
  }
}

/**
 * Factory function to create a ThemeEditor
 * @param {HTMLElement} container - Container element
 * @param {object} theme - Theme to edit
 * @param {Document} doc - Document
 * @param {object} options - Options
 * @returns {ThemeEditor} ThemeEditor instance
 */
export function createThemeEditor(container, theme, doc, options = {}) {
  return new ThemeEditor(container, theme, doc, options);
}

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Render the theme editor
 * @param {HTMLElement} container - Container element
 * @param {object} theme - Theme to edit
 * @param {Document} doc - Document
 * @param {object} options - Render options
 */
export function renderThemeEditor(container, theme, doc, options = {}) {
  const d = doc || document;
  container.innerHTML = '';

  const editor = d.createElement('div');
  editor.className = 'theme-editor';

  // Header with metadata
  const header = renderMetadataSection(theme, d, options);
  editor.appendChild(header);

  // Section content (placed before tabs for DOM query order)
  const content = d.createElement('div');
  content.className = 'theme-editor-content';

  // Render active section
  const activeSection = options.activeSection || 'ui';
  const sectionEl = renderColorSection(activeSection, theme, d, options);
  sectionEl.setAttribute('data-section', activeSection);
  content.appendChild(sectionEl);

  editor.appendChild(content);

  // Section tabs (after content in DOM for query order, but CSS will position visually above)
  const tabs = renderSectionTabs(options.activeSection || 'ui', d, options, container, theme);
  editor.appendChild(tabs);

  // Always add syntax preview as a general code preview section
  const preview = renderSyntaxPreview(theme, d);
  editor.appendChild(preview);

  // Preview toggle
  const previewToggle = d.createElement('div');
  previewToggle.className = 'theme-editor-preview-toggle';
  const previewCheckbox = d.createElement('input');
  previewCheckbox.type = 'checkbox';
  previewCheckbox.id = 'preview-toggle';
  previewCheckbox.checked = options.previewEnabled !== false;
  previewCheckbox.addEventListener('change', (e) => {
    if (options.onPreviewToggle) options.onPreviewToggle(e.target.checked);
  });
  const previewLabel = d.createElement('label');
  previewLabel.htmlFor = 'preview-toggle';
  previewLabel.textContent = 'Live Preview';
  previewToggle.appendChild(previewCheckbox);
  previewToggle.appendChild(previewLabel);
  editor.appendChild(previewToggle);

  // Action buttons
  const actions = d.createElement('div');
  actions.className = 'theme-editor-actions';

  const cancelBtn = d.createElement('button');
  cancelBtn.className = 'theme-editor-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    if (options.onCancel) options.onCancel();
  });
  actions.appendChild(cancelBtn);

  const exportBtn = d.createElement('button');
  exportBtn.className = 'theme-editor-export';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', () => {
    if (options.onExport) options.onExport(theme);
  });
  actions.appendChild(exportBtn);

  const saveBtn = d.createElement('button');
  saveBtn.className = 'theme-editor-save';
  saveBtn.textContent = 'Save';
  saveBtn.disabled = !options.isDirty;
  saveBtn.addEventListener('click', () => {
    if (options.onSave) options.onSave(theme);
  });
  actions.appendChild(saveBtn);

  editor.appendChild(actions);

  container.appendChild(editor);
}

/**
 * Render metadata section (name, description, author)
 */
function renderMetadataSection(theme, doc, options) {
  const section = doc.createElement('div');
  section.className = 'theme-editor-metadata';

  // Name input
  const nameGroup = doc.createElement('div');
  nameGroup.className = 'form-group';
  const nameLabel = doc.createElement('label');
  nameLabel.textContent = 'Theme Name';
  const nameInput = doc.createElement('input');
  nameInput.type = 'text';
  nameInput.name = 'theme-name';
  nameInput.value = theme.name || '';
  nameInput.addEventListener('change', (e) => {
    if (options.onMetadataChange) options.onMetadataChange('name', e.target.value);
  });
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  section.appendChild(nameGroup);

  // Description textarea
  const descGroup = doc.createElement('div');
  descGroup.className = 'form-group';
  const descLabel = doc.createElement('label');
  descLabel.textContent = 'Description';
  const descInput = doc.createElement('textarea');
  descInput.name = 'theme-description';
  descInput.value = theme.description || '';
  descInput.addEventListener('change', (e) => {
    if (options.onMetadataChange) options.onMetadataChange('description', e.target.value);
  });
  descGroup.appendChild(descLabel);
  descGroup.appendChild(descInput);
  section.appendChild(descGroup);

  // Author input
  const authorGroup = doc.createElement('div');
  authorGroup.className = 'form-group';
  const authorLabel = doc.createElement('label');
  authorLabel.textContent = 'Author';
  const authorInput = doc.createElement('input');
  authorInput.type = 'text';
  authorInput.name = 'theme-author';
  authorInput.value = theme.author || '';
  authorInput.addEventListener('change', (e) => {
    if (options.onMetadataChange) options.onMetadataChange('author', e.target.value);
  });
  authorGroup.appendChild(authorLabel);
  authorGroup.appendChild(authorInput);
  section.appendChild(authorGroup);

  return section;
}

/**
 * Render section tabs
 */
function renderSectionTabs(activeSection, doc, options, container, theme) {
  const tabs = doc.createElement('div');
  tabs.className = 'theme-editor-tabs';

  const sectionLabels = {
    ui: 'UI Colors',
    panels: 'Panels',
    status: 'Status',
    terminal: 'Terminal',
    syntax: 'Syntax',
  };

  for (const section of THEME_SECTIONS) {
    const tab = doc.createElement('button');
    tab.className = 'theme-editor-tab';
    tab.setAttribute('data-tab', section);
    tab.setAttribute('data-section', section);
    if (section === activeSection) {
      tab.classList.add('active');
    }
    tab.textContent = sectionLabels[section];
    tab.addEventListener('click', () => {
      if (options.onSectionChange) {
        options.onSectionChange(section);
      } else if (container) {
        // Re-render with new active section when no handler provided
        renderThemeEditor(container, theme, doc, { ...options, activeSection: section });
      }
    });
    tabs.appendChild(tab);
  }

  return tabs;
}

/**
 * Render a color section with color pickers
 */
function renderColorSection(section, theme, doc, options) {
  const container = doc.createElement('div');
  container.className = 'theme-editor-section color-section';
  container.setAttribute('data-section', section);

  const colors = theme[section];
  if (!colors) return container;

  for (const [key, value] of Object.entries(colors)) {
    const picker = createColorPicker({
      label: formatLabel(key),
      value,
      onChange: (newValue) => {
        if (options.onColorChange) options.onColorChange(section, key, newValue);
      },
    }, doc);
    container.appendChild(picker);
  }

  return container;
}

/**
 * Render syntax highlighting preview
 */
function renderSyntaxPreview(theme, doc) {
  const preview = doc.createElement('div');
  preview.className = 'syntax-preview';

  const code = doc.createElement('pre');
  code.innerHTML = `
<span style="color: ${theme.syntax.keyword}">function</span> <span style="color: ${theme.syntax.function}">example</span>(<span style="color: ${theme.syntax.variable}">param</span>) {
  <span style="color: ${theme.syntax.comment}">// This is a comment</span>
  <span style="color: ${theme.syntax.keyword}">const</span> <span style="color: ${theme.syntax.variable}">str</span> = <span style="color: ${theme.syntax.string}">"hello world"</span>;
  <span style="color: ${theme.syntax.keyword}">const</span> <span style="color: ${theme.syntax.variable}">num</span> = <span style="color: ${theme.syntax.number}">42</span>;
  <span style="color: ${theme.syntax.keyword}">return</span> <span style="color: ${theme.syntax.variable}">str</span> <span style="color: ${theme.syntax.operator}">+</span> <span style="color: ${theme.syntax.variable}">num</span>;
}
  `.trim();

  preview.appendChild(code);
  return preview;
}

/**
 * Format a camelCase key as a readable label
 */
function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
