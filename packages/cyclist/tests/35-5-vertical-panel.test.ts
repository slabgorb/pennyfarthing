/**
 * 35-5: Vertical Panel Tests
 *
 * Tests for the unified VerticalPanel base class and panel standardization.
 *
 * Acceptance Criteria:
 * - AC1: VerticalPanel base class created with collapse/expand/resize
 * - AC2: File, Diff, Tool panels refactored to use base class
 * - AC3: Sidebar converted to collapsible vertical panel
 * - AC4: Message view wrapped in collapsible vertical panel
 * - AC5: All panels register with PanelManager
 * - AC6: Tab bar shows all panels
 * - AC7: Keyboard shortcuts work (Cmd+1-5, Cmd+B, Escape)
 * - AC8: Collapse state persisted in localStorage
 * - AC9: Width persisted for resizable panels
 * - AC10: Smooth CSS transitions on collapse/expand
 * - AC11: Safety: At least one panel visible (or restore button)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';
import { app } from '../src/server.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Type Definitions (will be implemented in vertical-panel.js)
// =============================================================================

/**
 * Panel configuration for VerticalPanel constructor
 */
export interface PanelConfig {
  id: string;
  element: HTMLElement;
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  collapseThreshold?: number;
  position?: 'left' | 'right' | 'center';
  resizable?: boolean;
  collapsible?: boolean;
  label?: string;
  shortcut?: string;
  order?: number;
}

/**
 * Panel state persisted to localStorage
 */
export interface PanelState {
  width: number;
  collapsed: boolean;
}

/**
 * VerticalPanel class interface
 */
export interface IVerticalPanel {
  id: string;
  element: HTMLElement;
  position: 'left' | 'right' | 'center';

  // State management
  loadState(): PanelState;
  saveState(): void;

  // Collapse/expand
  collapse(): void;
  expand(): void;
  toggle(): void;
  isCollapsed(): boolean;

  // Resize
  setWidth(width: number): void;
  getCurrentWidth(): number;

  // Hooks (override in subclasses)
  onCollapse(): void;
  onExpand(): void;
  onResize(width: number): void;

  // Badge support
  getBadgeCount(): number;
  setBadgeCount(count: number): void;

  // PanelManager integration
  register(): void;
  unregister(): void;
}

// =============================================================================
// Test Data Factories
// =============================================================================

const createPanelElement = (id: string = 'test-panel'): HTMLElement => {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'vertical-panel';
  el.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">Test Panel</span>
      <button class="panel-collapse-btn">◀</button>
    </div>
    <div class="panel-content"></div>
  `;
  return el;
};

const createPanelConfig = (overrides: Partial<PanelConfig> = {}): PanelConfig => ({
  id: 'test-panel',
  element: createPanelElement('test-panel'),
  storageKey: 'cyclist-test-panel',
  defaultWidth: 280,
  minWidth: 150,
  collapseThreshold: 50,
  position: 'left',
  resizable: true,
  collapsible: true,
  label: 'Test',
  shortcut: '1',
  order: 1,
  ...overrides,
});

// =============================================================================
// File path helpers
// =============================================================================

const JS_DIR = path.join(__dirname, '../src/public/js');
const VERTICAL_PANEL_PATH = path.join(JS_DIR, 'vertical-panel.js');
const SIDEBAR_PANEL_PATH = path.join(JS_DIR, 'sidebar-panel.js');
const MESSAGE_PANEL_PATH = path.join(JS_DIR, 'message-panel.js');
const INDEX_HTML_PATH = path.join(__dirname, '../src/public/index.html');
const STYLES_CSS_PATH = path.join(__dirname, '../src/public/styles.css');

// =============================================================================
// Tests
// =============================================================================

describe('35-5: Vertical Panel', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML from server
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  // =============================================================================
  // AC1: VerticalPanel base class with collapse/expand/resize
  // =============================================================================

  describe('AC1: VerticalPanel base class', () => {

    it('should have vertical-panel.js file', () => {
      expect(fs.existsSync(VERTICAL_PANEL_PATH)).toBe(true);
    });

    it('should export VerticalPanel class or factory', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false); // File must exist
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      // Should have class definition or factory function
      expect(content).toMatch(/class\s+VerticalPanel|function.*VerticalPanel|export.*VerticalPanel/);
    });

    it('should have collapse method', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('collapse');
    });

    it('should have expand method', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('expand');
    });

    it('should have toggle method', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('toggle');
    });

    it('should have setWidth method', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('setWidth');
    });

    it('should have getCurrentWidth method', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('getCurrentWidth');
    });

    it('should have isCollapsed method', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('isCollapsed');
    });

    it('should have loadState method for persistence', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('loadState');
    });

    it('should have saveState method for persistence', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('saveState');
    });

    it('should use localStorage for state persistence', () => {
      if (!fs.existsSync(VERTICAL_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(VERTICAL_PANEL_PATH, 'utf-8');
      expect(content).toContain('localStorage');
    });

  });

  // =============================================================================
  // AC2: Existing panels use VerticalPanel base class
  // =============================================================================

  describe('AC2: Existing panels use VerticalPanel base', () => {

    it('should have file-panel.js importing VerticalPanel', () => {
      const filePanelPath = path.join(JS_DIR, 'file-panel.js');
      const content = fs.readFileSync(filePanelPath, 'utf-8');

      // Should import or reference VerticalPanel
      expect(content).toMatch(/import.*VerticalPanel|VerticalPanel|extends\s+VerticalPanel/);
    });

    it('should have diff-panel.js importing VerticalPanel', () => {
      const diffPanelPath = path.join(JS_DIR, 'diff-panel.js');
      const content = fs.readFileSync(diffPanelPath, 'utf-8');

      expect(content).toMatch(/import.*VerticalPanel|VerticalPanel|extends\s+VerticalPanel/);
    });

  });

  // =============================================================================
  // AC3: Sidebar converted to collapsible vertical panel
  // 68-6: Sidebar removed entirely - content moved to dedicated tab panels
  // =============================================================================

  describe.skip('AC3: Sidebar as collapsible vertical panel (68-6: REMOVED)', () => {
    // 68-6: These tests are skipped because the sidebar was removed.
    // Sidebar content has been migrated to dedicated panels:
    // - Background tasks → background-panel.js
    // - Todos → progress-panel.js (renamed from todos-panel)
    // - Sprint → sprint-panel.js
    // - Git → git-panel.js
    // - Persona → message panel header

    it.skip('should have sidebar-panel.js file', () => {
      expect(fs.existsSync(SIDEBAR_PANEL_PATH)).toBe(true);
    });

    it.skip('should have sidebar-panel.js with collapse method', () => {
      const content = fs.readFileSync(SIDEBAR_PANEL_PATH, 'utf-8');
      expect(content).toContain('collapse');
    });

    it.skip('should have sidebar-panel.js with expand method', () => {
      const content = fs.readFileSync(SIDEBAR_PANEL_PATH, 'utf-8');
      expect(content).toContain('expand');
    });

    it.skip('should have sidebar element with vertical-panel class in HTML', () => {
      const sidebar = document.querySelector('#sidebar');
      expect(sidebar).not.toBeNull();
    });

    it.skip('should have sidebar with position-right class', () => {
      const sidebar = document.querySelector('#sidebar');
      expect(sidebar?.classList.contains('position-right')).toBe(true);
    });

    it.skip('should have sidebar collapsible via tab bar', () => {
      const sidebar = document.querySelector('#sidebar.vertical-panel');
      expect(sidebar).not.toBeNull();
    });

  });

  // =============================================================================
  // AC4: Message view wrapped in collapsible vertical panel
  // =============================================================================

  describe('AC4: Message view as collapsible vertical panel', () => {

    it('should have message-panel.js file', () => {
      expect(fs.existsSync(MESSAGE_PANEL_PATH)).toBe(true);
    });

    it('should have message-panel.js with collapse method', () => {
      if (!fs.existsSync(MESSAGE_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(MESSAGE_PANEL_PATH, 'utf-8');
      expect(content).toContain('collapse');
    });

    it('should have message-panel element wrapping message-view in HTML', () => {
      const messagePanel = document.querySelector('#message-panel');
      expect(messagePanel).not.toBeNull();
      expect(messagePanel?.classList.contains('vertical-panel')).toBe(true);
    });

    it('should have message panel with position-center class', () => {
      const messagePanel = document.querySelector('#message-panel');
      expect(messagePanel?.classList.contains('position-center')).toBe(true);
    });

    it('should have message-view inside message-panel', () => {
      const messageView = document.querySelector('#message-panel #message-view, #message-panel .message-view');
      expect(messageView).not.toBeNull();
    });

  });

  // =============================================================================
  // AC5: All panels register with PanelManager
  // =============================================================================

  describe('AC5: All panels register with PanelManager', () => {

    // 68-6: Sidebar removed - skip this test
    it.skip('should have sidebar-panel.js registering with PanelManager (68-6: REMOVED)', () => {
      const content = fs.readFileSync(SIDEBAR_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/PanelManager.*register|register.*panel/i);
    });

    it('should have message-panel.js registering with PanelManager', () => {
      if (!fs.existsSync(MESSAGE_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(MESSAGE_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/PanelManager.*register|register.*panel/i);
    });

  });

  // =============================================================================
  // AC6: Tab bar shows all panels
  // =============================================================================

  describe('AC6: Tab bar shows all panels', () => {

    it('should have tab-bar element', () => {
      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar).not.toBeNull();
    });

    // 68-6: Sidebar removed - skip this test
    it.skip('should have tab for sidebar in tab bar (68-6: REMOVED)', () => {
      const content = fs.readFileSync(SIDEBAR_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/label.*sidebar|Sidebar/i);
    });

    it('should have tab for message panel in tab bar', () => {
      if (!fs.existsSync(MESSAGE_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(MESSAGE_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/label.*message|Message/i);
    });

  });

  // =============================================================================
  // AC7: Keyboard shortcuts
  // =============================================================================

  describe('AC7: Keyboard shortcuts', () => {

    // 68-6: Sidebar removed - skip this test
    it.skip('should have sidebar-panel with keyboard shortcut defined (68-6: REMOVED)', () => {
      const content = fs.readFileSync(SIDEBAR_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/shortcut.*['"]?[bB5]['"]?|keyboard/i);
    });

    it('should have message-panel with keyboard shortcut defined', () => {
      if (!fs.existsSync(MESSAGE_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(MESSAGE_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/shortcut.*['"]?[4]?['"]?|keyboard/i);
    });

  });

  // =============================================================================
  // AC8 & AC9: State persistence
  // =============================================================================

  describe('AC8 & AC9: State persistence', () => {

    // 68-6: Sidebar removed - skip this test
    it.skip('should have sidebar-panel persisting state to localStorage (68-6: REMOVED)', () => {
      const content = fs.readFileSync(SIDEBAR_PANEL_PATH, 'utf-8');
      expect(content).toContain('localStorage');
    });

    it('should have message-panel persisting state to localStorage', () => {
      if (!fs.existsSync(MESSAGE_PANEL_PATH)) {
        expect(true).toBe(false);
        return;
      }

      const content = fs.readFileSync(MESSAGE_PANEL_PATH, 'utf-8');
      expect(content).toContain('localStorage');
    });

  });

  // =============================================================================
  // AC10: CSS transitions
  // =============================================================================

  describe('AC10: CSS transitions', () => {

    it('should have transition styles for vertical-panel class', () => {
      expect(css).toMatch(/\.vertical-panel[^}]*transition/);
    });

    it('should have collapsed styles for vertical-panel', () => {
      expect(css).toMatch(/\.vertical-panel\.collapsed|\.collapsed/);
    });

    it('should have position-left styles', () => {
      expect(css).toMatch(/\.position-left|position-left/);
    });

    it('should have position-right styles', () => {
      expect(css).toMatch(/\.position-right|position-right/);
    });

    it('should have position-center styles', () => {
      expect(css).toMatch(/\.position-center|position-center/);
    });

  });

  // =============================================================================
  // AC11: Safety - restore mechanism (REMOVED per user request)
  // =============================================================================

  describe('AC11: Panel behavior', () => {

    it('should allow all panels to be collapsed independently', () => {
      // 35-5: No safety mechanism - user can collapse all panels if they want
      // Panels are restored via tab bar clicks
      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar).not.toBeNull();
    });

  });

  // =============================================================================
  // Integration: All components work together
  // =============================================================================

  describe('Integration: Panel system works together', () => {

    // 68-6: Updated to exclude sidebar-panel.js (removed)
    it('should have all required new files', () => {
      const requiredFiles = [
        VERTICAL_PANEL_PATH,
        MESSAGE_PANEL_PATH,
        // 68-6: SIDEBAR_PANEL_PATH removed
      ];

      const missingFiles = requiredFiles.filter(f => !fs.existsSync(f));

      expect(missingFiles).toHaveLength(0);
    });

    // 68-6: Updated to not expect sidebar
    it('should have index.html updated with new panel structure', () => {
      const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');

      expect(htmlContent).toContain('message-panel');
      // 68-6: Sidebar removed, verify it's NOT present
      expect(htmlContent).not.toMatch(/id=["']sidebar["']/);
    });

    // 68-6: Updated to not expect sidebar-panel.js
    it('should have required panel JS files loaded in index.html', () => {
      const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');

      // Check for script imports (sidebar-panel.js removed in 68-6)
      expect(htmlContent).toMatch(/vertical-panel\.js|vertical-panel/);
      expect(htmlContent).toMatch(/message-panel\.js|message-panel/);
      // 68-6: Verify sidebar-panel script tag is NOT present (comments OK)
      expect(htmlContent).not.toMatch(/src=["'][^"']*sidebar-panel\.js["']/);
    });

  });

});
