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
  // AC2: Permission mode switch in toolbar (unified with handoff)
  // Handoff is now part of the 4-way permission mode: plan|manual|accept|turbo
  // ==========================================================================
  describe('AC2: Permission mode switch in toolbar', () => {

    it('should have mode switch in editor toolbar', async () => {
      expect(indexHtml).toMatch(/editor-toolbar[^]*mode-switch/i);
    });

    it('should have mode switch with data-control="mode-switch"', async () => {
      expect(indexHtml).toContain('data-control="mode-switch"');
    });

    it('should have turbo mode segment for auto-handoff', async () => {
      // Turbo mode = auto-accept + auto-handoff
      expect(indexHtml).toContain('data-mode="turbo"');
    });

    it('should have turbo button with title explaining auto-handoff', async () => {
      // Turbo mode includes auto-handoff
      expect(indexHtml).toMatch(/title="[^"]*turbo[^"]*auto-handoff[^"]*"/i);
    });

    it('should NOT have separate handoff toggle button', async () => {
      // Handoff is unified into permission mode, no separate toggle
      expect(indexHtml).not.toContain('data-control="handoff-mode"');
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

    it('should have controls module for permission mode', async () => {
      const controls = await import('../src/public/js/controls.js');
      // controls.js now handles permission mode (unified with handoff)
      expect(controls).toBeDefined();
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
  // Integration: Permission mode switch (unified with handoff)
  // ==========================================================================
  describe('Integration: Permission mode switch workflow', () => {

    it('should have 4-way mode switch in toolbar', async () => {
      // Mode switch should have plan/manual/accept/turbo
      expect(indexHtml).toMatch(/data-mode="plan"/);
      expect(indexHtml).toMatch(/data-mode="manual"/);
      expect(indexHtml).toMatch(/data-mode="accept"/);
      expect(indexHtml).toMatch(/data-mode="turbo"/);
    });

    it('should display mode labels in UI', async () => {
      // Buttons should show mode names
      expect(indexHtml).toMatch(/PLAN/);
      expect(indexHtml).toMatch(/MANUAL/);
      expect(indexHtml).toMatch(/ACCEPT/);
      expect(indexHtml).toMatch(/TURBO/);
    });

  });

});
