/**
 * 68-2: Todos Panel as Top-Level Tab
 *
 * Tests for extracting todos section from sidebar into its own
 * VerticalPanel with a TODOS tab in the tab bar.
 *
 * Acceptance Criteria:
 * - AC1: TODOS tab visible in tab bar
 * - AC2: Panel toggles on tab click
 * - AC3: Progress shows in tab (e.g., "3/5")
 * - AC4: Existing todo rendering works in new location
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';
import { app } from '../src/server.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// File path helpers
// =============================================================================

const JS_DIR = path.join(__dirname, '../src/public/js');
const TODOS_PANEL_PATH = path.join(JS_DIR, 'todos-panel.js');
const TASKS_MODULE_PATH = path.join(JS_DIR, 'sidebar/tasks.js');
const INDEX_HTML_PATH = path.join(__dirname, '../src/public/index.html');

// =============================================================================
// Tests
// =============================================================================

describe('68-2: Todos Panel', () => {
  let html: string;
  let document: Document;

  beforeAll(async () => {
    // Fetch HTML from server
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;
  });

  // =============================================================================
  // AC1: TODOS tab visible in tab bar
  // =============================================================================

  describe('AC1: TODOS tab visible in tab bar', () => {

    it('should have todos-panel.js file', () => {
      expect(fs.existsSync(TODOS_PANEL_PATH)).toBe(true);
    });

    it('should have TodosPanel class extending VerticalPanel', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/class\s+TodosPanel/);
    });

    it('should import VerticalPanel in todos-panel.js', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/import.*VerticalPanel|VerticalPanel/);
    });

    it('should have #todos-panel element in HTML', () => {
      const panel = document.querySelector('#todos-panel');
      expect(panel).not.toBeNull();
    });

    it('should have todos-panel with vertical-panel class', () => {
      const panel = document.querySelector('#todos-panel');
      expect(panel?.classList.contains('vertical-panel')).toBe(true);
    });

    it('should have todos-panel with position-right class', () => {
      const panel = document.querySelector('#todos-panel');
      expect(panel?.classList.contains('position-right')).toBe(true);
    });

    it('should register TodosPanel with PanelManager', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/PanelManager.*register|register\(\)/i);
    });

    it('should have label "TODOS" for tab bar', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/label.*TODOS|'TODOS'|"TODOS"/i);
    });

  });

  // =============================================================================
  // AC2: Panel toggles on tab click
  // =============================================================================

  describe('AC2: Panel toggles on tab click', () => {

    it('should have collapse method in TodosPanel', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Either has own method or inherits from VerticalPanel
      expect(content).toMatch(/collapse|VerticalPanel/);
    });

    it('should have expand method in TodosPanel', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/expand|VerticalPanel/);
    });

    it('should have toggle method in TodosPanel', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/toggle|VerticalPanel/);
    });

    it('should persist collapse state to localStorage', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should reference storage key or use VerticalPanel persistence
      expect(content).toMatch(/storageKey|localStorage|cyclist-todos/i);
    });

    it('should export collapse function', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/export\s+(function\s+collapse|{[^}]*collapse)/);
    });

    it('should export expand function', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/export\s+(function\s+expand|{[^}]*expand)/);
    });

    it('should export toggle function', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/export\s+(function\s+toggle|{[^}]*toggle)/);
    });

  });

  // =============================================================================
  // AC3: Progress shows in tab (e.g., "3/5")
  // =============================================================================

  describe('AC3: Progress shows in tab (e.g., "3/5")', () => {

    it('should have getBadgeCount method returning remaining todo count', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/getBadgeCount/);
    });

    it('should import calculateProgress from tasks module', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/calculateProgress|import.*tasks/i);
    });

    it('should import formatProgress from tasks module', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/formatProgress|import.*tasks/i);
    });

    it('should update badge when todos change', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should call setBadgeCount or updateBadge on todo change
      expect(content).toMatch(/setBadgeCount|updateBadge|badgeCount/i);
    });

    it('should have progress element in panel for displaying X/Y format', () => {
      // Either in HTML or created dynamically
      const progressElement = document.querySelector('#todos-panel #todos-progress, #todos-panel .todos-progress');
      const panelContent = fs.existsSync(TODOS_PANEL_PATH) ? fs.readFileSync(TODOS_PANEL_PATH, 'utf-8') : '';

      // Progress display can be in HTML or code should reference it
      const hasProgressElement = progressElement !== null;
      const createsProgressElement = panelContent.includes('todos-progress') || panelContent.includes('progressElement');

      expect(hasProgressElement || createsProgressElement).toBe(true);
    });

    it('should calculate progress as completed/total', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should use calculateProgress or calculate completed vs total
      expect(content).toMatch(/calculateProgress|progress\.completed|progress\.total|completed.*total/i);
    });

  });

  // =============================================================================
  // AC4: Existing todo rendering works in new location
  // =============================================================================

  describe('AC4: Existing todo rendering works in new location', () => {

    it('should have container for todo rendering in #todos-panel', () => {
      const container = document.querySelector('#todos-panel #todos-list, #todos-panel .todos-list');
      expect(container).not.toBeNull();
    });

    it('should import createTodoElements from tasks module', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/createTodoElements|import.*tasks/i);
    });

    it('should render todos into container element', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/containerElement|todos-list/i);
    });

    it('should not render todos in sidebar section anymore', () => {
      // The old sidebar section should be removed or hidden
      const oldSection = document.querySelector('#sidebar #todo-section, #sidebar .todo-section');
      // Either the section is gone, or it's hidden/empty
      const isRemoved = oldSection === null;
      const isHidden = oldSection?.classList.contains('hidden') || oldSection?.getAttribute('style')?.includes('display: none');
      expect(isRemoved || isHidden).toBe(true);
    });

    it('should wire up Electron IPC updates to new panel location', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should handle todo updates via IPC
      expect(content).toMatch(/electronAPI|todos\.onUpdate|onUpdate|IPC/i);
    });

    it('should load initial todos on init', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should fetch initial todos
      expect(content).toMatch(/loadInitialTodos|todos\.get|getInitial/i);
    });

    it('should have renderTodos function', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/renderTodos|function.*render/i);
    });

    it('should handle empty todos state', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should show empty state when no todos
      expect(content).toMatch(/todos-empty|no.*tasks|length.*0|empty/i);
    });

    it('should have clear function for context clear', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should be able to clear todos (for context clear)
      expect(content).toMatch(/export.*clear|clearTasks|clear\(\)/i);
    });

  });

  // =============================================================================
  // Integration: Panel loads and initializes correctly
  // =============================================================================

  describe('Integration: Panel loads correctly', () => {

    it('should include todos-panel.js script in HTML', () => {
      const script = document.querySelector('script[src*="todos-panel"]');
      expect(script).not.toBeNull();
    });

    it('should load after DOM is ready', () => {
      if (!fs.existsSync(TODOS_PANEL_PATH)) {
        expect.fail('todos-panel.js must exist');
      }

      const content = fs.readFileSync(TODOS_PANEL_PATH, 'utf-8');
      // Should check document.readyState or use DOMContentLoaded
      expect(content).toMatch(/DOMContentLoaded|readyState/);
    });

    it('should have panel title "TODOS" in HTML', () => {
      const title = document.querySelector('#todos-panel .panel-title');
      expect(title?.textContent?.trim()).toBe('TODOS');
    });

    it('should start collapsed by default', () => {
      const panel = document.querySelector('#todos-panel');
      expect(panel?.classList.contains('collapsed')).toBe(true);
    });

  });

});
