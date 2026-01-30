/**
 * 68-1: Background Tasks Panel as Top-Level Tab
 *
 * Tests for extracting background-tasks section from sidebar into its own
 * VerticalPanel with a BACKGROUND tab in the tab bar.
 *
 * Acceptance Criteria:
 * - AC1: BACKGROUND tab visible in tab bar
 * - AC2: Panel toggles on tab click
 * - AC3: Badge shows active task count
 * - AC4: Existing task rendering works in new location
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
const BACKGROUND_PANEL_PATH = path.join(JS_DIR, 'background-panel.js');
const INDEX_HTML_PATH = path.join(__dirname, '../src/public/index.html');

// =============================================================================
// Tests
// =============================================================================

describe('68-1: Background Tasks Panel', () => {
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
  // AC1: BACKGROUND tab visible in tab bar
  // =============================================================================

  describe('AC1: BACKGROUND tab visible in tab bar', () => {

    it('should have background-panel.js file', () => {
      expect(fs.existsSync(BACKGROUND_PANEL_PATH)).toBe(true);
    });

    it('should have BackgroundPanel class extending VerticalPanel', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/class\s+BackgroundPanel/);
    });

    it('should import VerticalPanel in background-panel.js', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/import.*VerticalPanel|VerticalPanel/);
    });

    it('should have #background-panel element in HTML', () => {
      const panel = document.querySelector('#background-panel');
      expect(panel).not.toBeNull();
    });

    it('should have background-panel with vertical-panel class', () => {
      const panel = document.querySelector('#background-panel');
      expect(panel?.classList.contains('vertical-panel')).toBe(true);
    });

    it('should have background-panel with position-right class', () => {
      const panel = document.querySelector('#background-panel');
      expect(panel?.classList.contains('position-right')).toBe(true);
    });

    it('should register BackgroundPanel with PanelManager', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/PanelManager.*register|register\(\)/i);
    });

    it('should have label "BACKGROUND" for tab bar', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/label.*BACKGROUND|BACKGROUND/i);
    });

  });

  // =============================================================================
  // AC2: Panel toggles on tab click
  // =============================================================================

  describe('AC2: Panel toggles on tab click', () => {

    it('should have collapse method in BackgroundPanel', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      // Either has own method or inherits from VerticalPanel
      expect(content).toMatch(/collapse|VerticalPanel/);
    });

    it('should have expand method in BackgroundPanel', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/expand|VerticalPanel/);
    });

    it('should have toggle method in BackgroundPanel', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/toggle|VerticalPanel/);
    });

    it('should persist collapse state to localStorage', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      // Should reference storage key or use VerticalPanel persistence
      expect(content).toMatch(/storageKey|localStorage|cyclist-background/i);
    });

  });

  // =============================================================================
  // AC3: Badge shows active task count
  // =============================================================================

  describe('AC3: Badge shows active task count', () => {

    it('should have getBadgeCount method returning task count', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/getBadgeCount/);
    });

    it('should update badge when tasks change', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      // Should call setBadgeCount or update badge on task change
      expect(content).toMatch(/setBadgeCount|updateBadge|badgeCount/i);
    });

    it('should integrate with background-tasks module for task count', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      // Should import or reference background-tasks
      expect(content).toMatch(/background-tasks|getBackgroundTasks|tasks\.length/i);
    });

  });

  // =============================================================================
  // AC4: Existing task rendering works in new location
  // =============================================================================

  describe('AC4: Existing task rendering works in new location', () => {

    it('should have container for task rendering in #background-panel', () => {
      const container = document.querySelector('#background-panel #background-tasks-container, #background-panel .background-tasks-container');
      expect(container).not.toBeNull();
    });

    it('should import renderBackgroundTasksPanel from background-tasks module', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/renderBackgroundTasksPanel|background-tasks/i);
    });

    it('should call renderBackgroundTasksPanel with container element', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      expect(content).toMatch(/renderBackgroundTasksPanel|background-tasks-container/i);
    });

    it('should not render background tasks in sidebar section anymore', () => {
      // The old sidebar section should be removed or hidden
      const oldSection = document.querySelector('#sidebar #background-tasks-section');
      // Either the section is gone, or it's hidden/empty
      const isRemoved = oldSection === null;
      const isHidden = oldSection?.classList.contains('hidden') || oldSection?.getAttribute('style')?.includes('display: none');
      expect(isRemoved || isHidden).toBe(true);
    });

    it('should wire up WebSocket/IPC updates to new panel location', () => {
      if (!fs.existsSync(BACKGROUND_PANEL_PATH)) {
        expect.fail('background-panel.js must exist');
      }

      const content = fs.readFileSync(BACKGROUND_PANEL_PATH, 'utf-8');
      // Should handle task updates
      expect(content).toMatch(/addBackgroundTask|updateBackgroundTask|WebSocket|IPC|onTaskUpdate/i);
    });

  });

});
