/**
 * VerticalPanel - Base class for collapsible, resizable vertical panels
 *
 * 35-5: Unified panel pattern for Cyclist UI
 *
 * Features:
 * - Collapse/expand with smooth CSS transitions
 * - Drag-to-resize width
 * - State persistence via settings-sync (cross-tab sync)
 * - PanelManager integration
 * - Badge count support for tab bar
 * - Safety mechanism to prevent all panels collapsed
 *
 * Usage:
 *   import { VerticalPanel } from '/js/vertical-panel.js';
 *
 *   const panel = new VerticalPanel({
 *     id: 'my-panel',
 *     element: document.getElementById('my-panel'),
 *     storageKey: 'cyclist-my-panel',
 *     defaultWidth: 280,
 *     minWidth: 150,
 *     position: 'left',  // 'left' | 'right' | 'center'
 *     resizable: true,
 *     collapsible: true,
 *     label: 'My Panel',
 *     shortcut: '1',
 *     order: 1,
 *   });
 */

import { settingsSync } from './settings-sync.js';

const COLLAPSE_THRESHOLD = 50;

/**
 * VerticalPanel base class
 */
export class VerticalPanel {
  /**
   * @param {Object} config - Panel configuration
   * @param {string} config.id - Unique panel identifier
   * @param {HTMLElement} config.element - Panel DOM element
   * @param {string} [config.storageKey] - localStorage key for persistence
   * @param {number} [config.defaultWidth=280] - Default panel width
   * @param {number} [config.minWidth=150] - Minimum panel width
   * @param {number} [config.collapseThreshold=50] - Width threshold to auto-collapse
   * @param {'left'|'right'|'center'} [config.position='left'] - Panel position
   * @param {boolean} [config.resizable=true] - Whether panel can be resized
   * @param {boolean} [config.collapsible=true] - Whether panel can be collapsed
   * @param {string} [config.label] - Display label for tab bar
   * @param {string} [config.shortcut] - Keyboard shortcut number
   * @param {number} [config.order] - Tab order
   */
  constructor(config) {
    this.id = config.id;
    this.element = config.element;
    this.storageKey = config.storageKey || `cyclist-${config.id}`;
    this.defaultWidth = config.defaultWidth ?? 280;
    this.minWidth = config.minWidth ?? 150;
    this.collapseThreshold = config.collapseThreshold ?? COLLAPSE_THRESHOLD;
    this.position = config.position || 'left';
    this.resizable = config.resizable ?? true;
    this.collapsible = config.collapsible ?? true;
    this.label = config.label || config.id;
    this.shortcut = config.shortcut || null;
    this.order = config.order ?? 999;

    // Internal state
    this._collapsed = false;
    this._width = this.defaultWidth;
    this._badgeCount = 0;
    this._isDragging = false;
    this._startX = 0;
    this._startWidth = 0;
    this._resizeHandle = null;

    // Bind methods
    this._onResizeStart = this._onResizeStart.bind(this);
    this._onResizeMove = this._onResizeMove.bind(this);
    this._onResizeEnd = this._onResizeEnd.bind(this);
  }

  /**
   * Initialize the panel
   */
  init() {
    if (!this.element) {
      console.warn(`[VerticalPanel:${this.id}] Element not found`);
      return;
    }

    // Add position class
    this.element.classList.add('vertical-panel');
    this.element.classList.add(`position-${this.position}`);

    // Load saved state
    const state = this.loadState();
    this._width = state.width || this.defaultWidth;
    this._collapsed = state.collapsed ?? false;

    // Apply initial state
    if (this._collapsed) {
      this.element.classList.add('collapsed');
    } else {
      this.element.style.width = `${this._width}px`;
    }

    // Set up resize handle if resizable
    if (this.resizable) {
      this._setupResizeHandle();
    }

    // Set up collapse button
    this._setupCollapseButton();

    console.log(`[VerticalPanel:${this.id}] Initialized, collapsed:`, this._collapsed, 'width:', this._width);
  }

  /**
   * Load panel state from settings-sync
   * @returns {{width: number, collapsed: boolean}}
   */
  loadState() {
    const saved = settingsSync.get(this.storageKey);
    if (saved && typeof saved === 'object') {
      return saved;
    }
    return { width: this.defaultWidth, collapsed: false };
  }

  /**
   * Save panel state to settings-sync (with cross-tab broadcast)
   */
  saveState() {
    settingsSync.set(this.storageKey, {
      width: this._width,
      collapsed: this._collapsed,
    });
  }

  /**
   * Collapse the panel
   */
  collapse() {
    if (!this.collapsible || this._collapsed) return;

    this._collapsed = true;
    this.element.classList.add('collapsed');
    this.saveState();

    // Call hook
    this.onCollapse();

    console.log(`[VerticalPanel:${this.id}] Collapsed`);
  }

  /**
   * Expand the panel
   */
  expand() {
    if (!this._collapsed) return;

    this._collapsed = false;
    this.element.style.width = `${this._width}px`;
    this.element.classList.remove('collapsed');
    this.saveState();

    // Call hook
    this.onExpand();

    console.log(`[VerticalPanel:${this.id}] Expanded to`, this._width);
  }

  /**
   * Toggle collapse state
   */
  toggle() {
    if (this._collapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Check if panel is collapsed
   * @returns {boolean}
   */
  isCollapsed() {
    return this._collapsed;
  }

  /**
   * Set panel width
   * @param {number} width
   */
  setWidth(width) {
    if (!this.element || !this.resizable) return;

    const clampedWidth = Math.max(this.minWidth, Math.min(width, window.innerWidth * 0.5));
    this._width = clampedWidth;
    this.element.style.width = `${clampedWidth}px`;
    this.saveState();

    // Call hook
    this.onResize(clampedWidth);
  }

  /**
   * Get current panel width
   * @returns {number}
   */
  getCurrentWidth() {
    return this._width;
  }

  /**
   * Get badge count for tab bar
   * @returns {number}
   */
  getBadgeCount() {
    return this._badgeCount;
  }

  /**
   * Set badge count for tab bar
   * @param {number} count
   */
  setBadgeCount(count) {
    this._badgeCount = count;
  }

  /**
   * Register with PanelManager
   */
  register() {
    if (typeof window !== 'undefined' && window.PanelManager) {
      window.PanelManager.register({
        id: this.id,
        label: this.label,
        shortcut: this.shortcut,
        order: this.order,
        element: this.element,
        onOpen: () => this.expand(),
        onClose: () => this.collapse(),
        getBadgeCount: () => this.getBadgeCount(),
      });
    }
  }

  /**
   * Unregister from PanelManager
   */
  unregister() {
    if (typeof window !== 'undefined' && window.PanelManager) {
      window.PanelManager.unregister(this.id);
    }
  }

  // ==========================================================================
  // Hooks - Override in subclasses
  // ==========================================================================

  /**
   * Called when panel collapses
   */
  onCollapse() {
    // Override in subclass
  }

  /**
   * Called when panel expands
   */
  onExpand() {
    // Override in subclass
  }

  /**
   * Called when panel is resized
   * @param {number} width - New width
   */
  onResize(width) {
    // Override in subclass
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  /**
   * Set up resize handle events
   */
  _setupResizeHandle() {
    // Look for resize handle next to this panel
    const handleId = `${this.id}-resize`;
    this._resizeHandle = document.getElementById(handleId);

    // Also try generic pattern
    if (!this._resizeHandle) {
      this._resizeHandle = this.element.nextElementSibling;
      if (this._resizeHandle && !this._resizeHandle.classList.contains('resize-handle')) {
        this._resizeHandle = null;
      }
    }

    if (this._resizeHandle) {
      this._resizeHandle.addEventListener('mousedown', this._onResizeStart);
    }
  }

  /**
   * Set up collapse button events
   */
  _setupCollapseButton() {
    const collapseBtn = this.element.querySelector('.panel-collapse-btn, [data-action="collapse"]');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
      });
    }

    // Also make header clickable if it exists
    const header = this.element.querySelector('.panel-header, [class*="-header"]');
    if (header) {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => this.collapse());
    }
  }

  /**
   * Handle resize start
   */
  _onResizeStart(e) {
    if (!this.element) return;

    this._isDragging = true;
    this._startX = e.clientX;
    this._startWidth = this.element.offsetWidth;

    if (this._resizeHandle) {
      this._resizeHandle.classList.add('dragging');
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', this._onResizeMove);
    document.addEventListener('mouseup', this._onResizeEnd);

    e.preventDefault();
  }

  /**
   * Handle resize move
   */
  _onResizeMove(e) {
    if (!this._isDragging || !this.element) return;

    // Calculate delta based on position
    let delta = e.clientX - this._startX;
    if (this.position === 'right') {
      delta = -delta; // Invert for right-side panels
    }

    const newWidth = this._startWidth + delta;

    // If dragged below threshold, prepare to collapse
    if (newWidth < this.collapseThreshold) {
      this.element.style.width = `${this.collapseThreshold}px`;
      this.element.style.opacity = '0.5';
    } else {
      this.element.style.opacity = '1';
      this.setWidth(newWidth);
    }
  }

  /**
   * Handle resize end
   */
  _onResizeEnd() {
    if (!this._isDragging) return;

    this._isDragging = false;
    if (this._resizeHandle) {
      this._resizeHandle.classList.remove('dragging');
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', this._onResizeMove);
    document.removeEventListener('mouseup', this._onResizeEnd);

    // Check if should collapse
    if (this.element && this.element.offsetWidth <= this.collapseThreshold) {
      this.element.style.opacity = '1';
      this.collapse();
    }
  }

}

/**
 * Factory function for creating panels
 * @param {Object} config - Panel configuration
 * @returns {VerticalPanel}
 */
export function createVerticalPanel(config) {
  const panel = new VerticalPanel(config);
  panel.init();
  return panel;
}

// Export for global access
if (typeof window !== 'undefined') {
  window.VerticalPanel = VerticalPanel;
  window.createVerticalPanel = createVerticalPanel;
}

export default VerticalPanel;
