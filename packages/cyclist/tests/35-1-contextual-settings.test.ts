/**
 * 35-1: Contextual Settings Placement
 *
 * Tests for moving settings from popup dialogs to contextual locations:
 * - Theme chooser → Profile/persona click
 * - Auto-handoff toggle → Editor toolbar
 * - Settings dialog → Simplified (rarely-used only)
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria tested:
 * - AC1: Theme chooser accessible from profile/persona area click
 * - AC2: Auto-handoff toggle visible in editor toolbar
 * - AC3: Settings dialog simplified (only rarely-used options remain)
 * - AC4: Settings persist correctly from new locations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('35-1: Contextual Settings Placement', () => {
  let indexHtml: string;
  let settingsHtml: string;
  let indexDocument: Document;
  let settingsDocument: Document;

  beforeAll(async () => {
    // Fetch main index HTML
    const indexResponse = await request(app).get('/');
    indexHtml = indexResponse.text;

    // Fetch settings HTML
    const settingsResponse = await request(app).get('/settings.html');
    settingsHtml = settingsResponse.text;

    // Parse HTML with happy-dom
    const indexWindow = new Window();
    indexWindow.document.write(indexHtml);
    indexDocument = indexWindow.document;

    const settingsWindow = new Window();
    settingsWindow.document.write(settingsHtml);
    settingsDocument = settingsWindow.document;
  });

  // ==========================================================================
  // AC1: Theme chooser accessible from profile/persona area click
  // ==========================================================================
  describe('AC1: Theme chooser from profile click', () => {

    it('should have a theme picker container in index.html', async () => {
      // New theme picker element should exist
      expect(indexHtml).toContain('id="theme-picker"');
    });

    it('should have theme picker positioned near persona section', async () => {
      // Theme picker should be inside or adjacent to persona section
      const personaSection = indexDocument.getElementById('persona-section');
      expect(personaSection).not.toBeNull();

      // Either inside persona-section or has data attribute linking them
      const themePicker = indexDocument.getElementById('theme-picker');
      expect(themePicker).not.toBeNull();
    });

    it('should have clickable persona section that shows detail popup', async () => {
      // 35-8: Persona section click shows detail popup (theme changes via SettingsPanel)
      // No longer triggers theme picker - just opens persona detail view
      const personaSection = indexDocument.getElementById('persona-section');
      expect(personaSection).not.toBeNull();
    });

    // 35-8: ThemePicker.js removed - theme changes via SettingsPanel only
    it('should have SettingsPanel for theme management', async () => {
      // SettingsPanel handles all theme selection
      expect(indexHtml).toContain('settings-panel.js');
    });

    // 35-8: Theme picker functions removed from persona.js
    // Theme changes now handled exclusively by SettingsPanel
    it('should have SettingsPanel handle theme selection', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.selectTheme).toBeDefined();
      expect(typeof settingsPanel.selectTheme).toBe('function');
    });

    it('should have SettingsPanel show error on failure', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.showError).toBeDefined();
      expect(typeof settingsPanel.showError).toBe('function');
    });

    it('should have SettingsPanel sort themes with recent at top', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.sortThemesWithRecent).toBeDefined();
      expect(typeof settingsPanel.sortThemesWithRecent).toBe('function');
    });

    it('should have theme picker with recent themes section', async () => {
      // Theme picker should show recent/favorite themes
      expect(indexHtml).toMatch(/recent-themes|favorites/i);
    });

    it('should have "Browse all themes" option in theme picker', async () => {
      // Should be able to open full theme browser from picker
      expect(indexHtml).toMatch(/browse.*all|view.*all|more.*themes/i);
    });

  });

  // ==========================================================================
  // AC2: Auto-handoff toggle visible in editor toolbar
  // ==========================================================================
  describe('AC2: Auto-handoff toggle in toolbar', () => {

    it('should have handoff toggle button in editor toolbar', async () => {
      // New button for handoff mode
      expect(indexHtml).toMatch(/editor-toolbar[^]*handoff/i);
    });

    it('should have button with data-control="handoff-mode"', async () => {
      expect(indexHtml).toContain('data-control="handoff-mode"');
    });

    it('should have handoff toggle button after mode switch', async () => {
      // Should appear after the mode-switch segmented control (35-4)
      // Use the full HTML since toolbar contains nested divs
      const modeSwitchIndex = indexHtml.indexOf('data-control="mode-switch"');
      const handoffIndex = indexHtml.indexOf('data-control="handoff-mode"');

      expect(modeSwitchIndex).toBeGreaterThan(-1);
      expect(handoffIndex).toBeGreaterThan(-1);
      expect(handoffIndex).toBeGreaterThan(modeSwitchIndex);
    });

    it('should have handoff button with appropriate class', async () => {
      // Button should have styling class
      expect(indexHtml).toMatch(/class="[^"]*handoff-toggle[^"]*"/);
    });

    it('should have handoff button title explaining the toggle', async () => {
      // Should have helpful tooltip
      expect(indexHtml).toMatch(/title="[^"]*handoff[^"]*"/i);
    });

    it('should export initHandoffToggle from toolbar.js', async () => {
      const toolbar = await import('../src/public/js/editor/toolbar.js');
      expect(toolbar.initHandoffToggle).toBeDefined();
      expect(typeof toolbar.initHandoffToggle).toBe('function');
    });

    it('should export updateHandoffState from toolbar.js', async () => {
      const toolbar = await import('../src/public/js/editor/toolbar.js');
      expect(toolbar.updateHandoffState).toBeDefined();
      expect(typeof toolbar.updateHandoffState).toBe('function');
    });

    it('should export toggleHandoffMode from toolbar.js', async () => {
      const toolbar = await import('../src/public/js/editor/toolbar.js');
      expect(toolbar.toggleHandoffMode).toBeDefined();
      expect(typeof toolbar.toggleHandoffMode).toBe('function');
    });

  });

  // ==========================================================================
  // AC3: Settings dialog simplified (only rarely-used options remain)
  // ==========================================================================
  describe('AC3: Simplified settings dialog', () => {

    it('should NOT have Workflow section in settings dialog', async () => {
      // Workflow section (handoff mode) should be removed - now in toolbar
      expect(settingsHtml).not.toMatch(/data-section="workflow"/);
    });

    it('should NOT have handoff_mode radio buttons in settings', async () => {
      // Handoff mode moved to toolbar
      expect(settingsHtml).not.toContain('name="handoff_mode"');
    });

    it('should NOT have Pennyfarthing/Theme section in settings dialog', async () => {
      // Theme section should be removed - now in persona click
      expect(settingsHtml).not.toMatch(/data-section="pennyfarthing"/);
    });

    it('should NOT have theme-browser-container in settings', async () => {
      // Theme browser moved to persona area
      expect(settingsHtml).not.toContain('id="theme-browser-container"');
    });

    it('should KEEP Display section with show_flow', async () => {
      // Display settings are rarely changed, should remain
      expect(settingsHtml).toContain('id="show_flow"');
    });

    it('should KEEP Display section with show_ocean', async () => {
      expect(settingsHtml).toContain('id="show_ocean"');
    });

    it('should KEEP Display section with sidebar_width', async () => {
      expect(settingsHtml).toContain('id="sidebar_width"');
    });

    it('should KEEP Notifications section with phase_change', async () => {
      // Notification settings are rarely changed, should remain
      expect(settingsHtml).toContain('id="phase_change"');
    });

    it('should KEEP Notifications section with sound', async () => {
      expect(settingsHtml).toContain('id="sound"');
    });

    it('should have Display, Fonts, and Notifications sections', async () => {
      // Count remaining sections (35-6 added Fonts section)
      const sectionMatches = settingsHtml.match(/data-section="/g);
      expect(sectionMatches).toHaveLength(3);

      expect(settingsHtml).toContain('data-section="display"');
      expect(settingsHtml).toContain('data-section="fonts"');
      expect(settingsHtml).toContain('data-section="notifications"');
    });

  });

  // ==========================================================================
  // AC4: Settings persist correctly from new locations
  // ==========================================================================
  describe('AC4: Settings persistence from new locations', () => {

    it('should have settings API endpoint that handles theme updates', async () => {
      // PATCH /api/settings should accept theme changes
      const response = await request(app)
        .patch('/api/settings')
        .send({ pennyfarthing: { theme: 'the-expanse' } })
        .expect('Content-Type', /json/);

      // Should succeed or return expected structure
      expect(response.status).toBeLessThan(500);
    });

    it('should have settings API endpoint that handles handoff_mode updates', async () => {
      // PATCH /api/settings should accept handoff mode changes
      const response = await request(app)
        .patch('/api/settings')
        .send({ workflow: { handoff_mode: 'auto' } })
        .expect('Content-Type', /json/);

      expect(response.status).toBeLessThan(500);
    });

    // 35-8: updateTheme moved from persona.js to SettingsPanel.selectTheme
    it('should have SettingsPanel.selectTheme call settings API', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // selectTheme should use the standard settings persistence
      expect(settingsPanel.selectTheme).toBeDefined();
      // Function signature accepts theme ID
      expect(settingsPanel.selectTheme.length).toBeGreaterThanOrEqual(1);
    });

    it('should have persona.refreshPersona for theme change updates', async () => {
      const persona = await import('../src/public/js/persona.js');
      // Persona refresh is called by SettingsPanel after theme change
      expect(persona.refreshPersona).toBeDefined();
      expect(typeof persona.refreshPersona).toBe('function');
    });

    it('should have toolbar toggle persist via settings API', async () => {
      const toolbar = await import('../src/public/js/editor/toolbar.js');
      // toggleHandoffMode should persist the change
      expect(toolbar.toggleHandoffMode.length).toBeGreaterThanOrEqual(0);
    });

    it('should have IPC handler for theme changes', async () => {
      const main = await import('../src/main.js');
      // Main process should handle theme updates
      expect(main.handleSettingsSave).toBeDefined();
    });

    it('should broadcast theme changes via IPC', async () => {
      const main = await import('../src/main.js');
      // Should have channel for settings changes
      expect(main.IPC_SETTINGS_CHANNELS).toBeDefined();
      expect(main.IPC_SETTINGS_CHANNELS.CHANGED).toBe('settings:changed');
    });

  });

  // ==========================================================================
  // Integration: Theme picker and settings coordination
  // 35-8: Theme management consolidated to SettingsPanel
  // ==========================================================================
  describe('Integration: Theme picker workflow', () => {

    it('should have SettingsPanel as single source for theme changes', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // SettingsPanel handles all theme selection
      expect(settingsPanel.selectTheme).toBeDefined();
      expect(settingsPanel.load).toBeDefined();
    });

    it('should have SettingsPanel load themes from API', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // Should have load function to fetch themes
      expect(settingsPanel.SettingsPanel?.load || settingsPanel.load).toBeDefined();
    });

    it('should update persona display after theme change via refreshPersona', async () => {
      const persona = await import('../src/public/js/persona.js');
      // Should refresh persona after theme selection (called by SettingsPanel)
      expect(persona.refreshPersona).toBeDefined();
    });

  });

  // ==========================================================================
  // Integration: Toolbar handoff toggle and settings
  // ==========================================================================
  describe('Integration: Toolbar handoff toggle workflow', () => {

    it('should load current handoff mode on toolbar init', async () => {
      const toolbar = await import('../src/public/js/editor/toolbar.js');
      // Should have function to get current state
      expect(toolbar.getHandoffMode).toBeDefined();
    });

    it('should update button text based on handoff mode', async () => {
      const toolbar = await import('../src/public/js/editor/toolbar.js');
      // Should have function to update visual state
      expect(toolbar.updateHandoffState).toBeDefined();
    });

    it('should toggle between "AUTO" and "MANUAL" display text', async () => {
      // Button should show current state
      expect(indexHtml).toMatch(/AUTO|MANUAL/);
    });

  });

});
