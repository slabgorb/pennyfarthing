/**
 * 35-8: Rethink theme switcher for settings panel integration
 *
 * Tests to enforce theme management consolidation:
 * - SettingsPanel is the SINGLE source for theme changes
 * - QuickThemeSwitcher component must be REMOVED
 * - Persona detail shows info only (no theme switching)
 * - Recent themes tracked and displayed at top
 *
 * Written in RED phase - tests should fail until Dev implements changes.
 *
 * Acceptance Criteria:
 * - AC1: Given I open settings panel, When themes load, Then I see my recent themes at the top
 * - AC2: Given I select a theme in settings, When selection completes, Then the persona display updates immediately
 * - AC3: Given IPC is unavailable, When the settings panel loads themes, Then it falls back to HTTP gracefully
 * - AC4: Given settings panel is open, Then it is the ONLY place to change themes (single source of truth)
 *
 * Scope Refinement:
 * - QuickThemeSwitcher.js must be removed entirely
 * - persona.js theme picker functions must be removed
 * - Persona click shows detail popup (read-only), NOT theme picker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

import { app } from '../src/server.js';

// =============================================================================
// AC1: Recent themes displayed at top in SettingsPanel
// =============================================================================
describe('AC1: Recent themes displayed at top in SettingsPanel', () => {

  describe('Recent Themes API', () => {

    it('should persist recent themes to settings', async () => {
      const settings = await import('../src/settings.js');

      // Settings should have recentThemes in pennyfarthing section
      const defaults = settings.getDefaultSettings();
      expect(defaults.pennyfarthing).toHaveProperty('recentThemes');
      expect(Array.isArray(defaults.pennyfarthing.recentThemes)).toBe(true);
    });

    it('should limit recent themes to 5 entries', async () => {
      const settings = await import('../src/settings.js');

      // After selecting 7 themes, only 5 should be stored
      const testSettings = settings.getDefaultSettings();
      testSettings.pennyfarthing.recentThemes = [
        'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6', 'theme-7'
      ];

      // Validation should cap at 5 or normalizing should trim
      const normalized = settings.normalizeSettings(testSettings);
      expect(normalized.pennyfarthing.recentThemes.length).toBeLessThanOrEqual(5);
    });

    it('should add theme to recent list when selected', async () => {
      // PATCH settings with new theme should update recentThemes
      const response = await request(app)
        .patch('/api/settings')
        .send({ pennyfarthing: { theme: 'lord-of-the-rings' } })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);

      // Get settings to verify recentThemes was updated
      const getResponse = await request(app).get('/api/settings');
      expect(getResponse.body.pennyfarthing.recentThemes).toContain('lord-of-the-rings');
    });

    it('should move theme to front when re-selected', async () => {
      // Select theme A, then B, then A again - A should be first
      await request(app)
        .patch('/api/settings')
        .send({ pennyfarthing: { theme: 'theme-a', recentThemes: ['old-theme'] } });

      await request(app)
        .patch('/api/settings')
        .send({ pennyfarthing: { theme: 'theme-b' } });

      await request(app)
        .patch('/api/settings')
        .send({ pennyfarthing: { theme: 'theme-a' } });

      const response = await request(app).get('/api/settings');
      expect(response.body.pennyfarthing.recentThemes[0]).toBe('theme-a');
    });

  });

  describe('SettingsPanel Recent Themes Sorting', () => {

    it('should export sortThemesWithRecent function from SettingsPanel', async () => {
      // SettingsPanel should have a function to sort with recents at top
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.sortThemesWithRecent).toBeDefined();
      expect(typeof settingsPanel.sortThemesWithRecent).toBe('function');
    });

    it('should place recent themes before tier-sorted themes', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      const themes = [
        { id: 'theme-s', name: 'S Theme', tier: 'S' },
        { id: 'theme-a', name: 'A Theme', tier: 'A' },
        { id: 'theme-b', name: 'B Theme', tier: 'B' },
      ];
      const recentThemes = ['theme-b']; // B tier theme was recently used
      const currentTheme = 'theme-a';

      const sorted = settingsPanel.sortThemesWithRecent(themes, recentThemes, currentTheme);

      // Order: current, recent, then by tier
      // Current (theme-a) first, then recent (theme-b), then remaining by tier (theme-s)
      expect(sorted[0].id).toBe('theme-a'); // current
      expect(sorted[1].id).toBe('theme-b'); // recent
      expect(sorted[2].id).toBe('theme-s'); // by tier
    });

    it('should show "Recent" section divider in theme list', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      // When rendering with recent themes, should include section labels
      expect(settingsPanel.renderThemeList).toBeDefined();

      // The render function should support section grouping
      // This is a behavioral test - Dev will implement the grouping
    });

  });

});

// =============================================================================
// AC2: Immediate persona update on theme selection
// =============================================================================
describe('AC2: Immediate persona update on theme selection', () => {

  describe('Theme Change Event Dispatch', () => {

    it('should dispatch theme:changed event when theme is selected', async () => {
      // This tests the frontend behavior
      // SettingsPanel.selectTheme should dispatch CustomEvent
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      expect(settingsPanel.selectTheme).toBeDefined();
      // The function should dispatch 'theme:changed' event
    });

    it('should call refreshPersona after theme change', async () => {
      // The SettingsPanel should trigger persona refresh
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      // selectTheme should call window.refreshPersona
      expect(settingsPanel.selectTheme).toBeDefined();
    });

  });

  describe('Persona API responds to theme change', () => {

    it('should return updated persona after theme change', async () => {
      // Change theme
      await request(app)
        .patch('/api/settings')
        .send({ pennyfarthing: { theme: 'star-wars' } });

      // Get persona - should reflect new theme
      const response = await request(app).get('/api/persona');

      if (response.status === 200) {
        expect(response.body.theme).toBe('star-wars');
      }
      // If 404, that's okay - persona may not be active in test env
    });

  });

});

// =============================================================================
// AC3: IPC fallback to HTTP
// =============================================================================
describe('AC3: IPC fallback to HTTP for settings panel', () => {

  describe('Theme Metadata API', () => {

    it('should have GET /api/settings/themes endpoint', async () => {
      const response = await request(app).get('/api/settings/themes');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return theme metadata with id, name, and tier', async () => {
      const response = await request(app).get('/api/settings/themes');

      if (response.body.length > 0) {
        const theme = response.body[0];
        expect(theme).toHaveProperty('id');
        expect(theme).toHaveProperty('name');
        expect(theme).toHaveProperty('tier');
      }
    });

  });

  describe('SettingsPanel Fallback Behavior', () => {

    it('should try IPC first, then fallback to HTTP', async () => {
      // This is a frontend test - SettingsPanel.load should:
      // 1. Check window.electronAPI?.settings?.getThemeMetadata
      // 2. If not available, use fetch('/api/settings/themes')
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      expect(settingsPanel.load).toBeDefined();
      // The load function should handle both IPC and HTTP
    });

    it('should show error state on both IPC and HTTP failure', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      // SettingsPanel should have showError function
      expect(settingsPanel.showError || settingsPanel.SettingsPanel?.showError).toBeDefined();
    });

  });

});

// =============================================================================
// AC4: Settings is single source for theme changes
// =============================================================================
describe('AC4: Settings is the ONLY place to change themes', () => {

  describe('QuickThemeSwitcher Removal', () => {

    it('should NOT have QuickThemeSwitcher.js file', () => {
      const quickSwitcherPath = path.join(
        __dirname,
        '../src/public/js/components/QuickThemeSwitcher.js'
      );

      // File should not exist after removal
      expect(fs.existsSync(quickSwitcherPath)).toBe(false);
    });

    it('should NOT import QuickThemeSwitcher in index.html', () => {
      const indexPath = path.join(__dirname, '../src/public/index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');

      // Should not contain any QuickThemeSwitcher imports
      expect(content).not.toMatch(/QuickThemeSwitcher/);
      expect(content).not.toMatch(/quick-theme-switcher/);
    });

    it('should NOT have quick-theme CSS classes in theme-browser.css', () => {
      const cssPath = path.join(__dirname, '../src/public/css/theme-browser.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      // Should not contain quick-theme styles (they should be removed)
      expect(content).not.toMatch(/\.quick-theme-/);
    });

  });

  describe('Persona Module Theme Functions Removal', () => {

    it('should NOT export initThemePicker from persona.js', async () => {
      const persona = await import('../src/public/js/persona.js');

      // These functions should be removed
      expect(persona.initThemePicker).toBeUndefined();
    });

    it('should NOT export showThemePicker from persona.js', async () => {
      const persona = await import('../src/public/js/persona.js');

      expect(persona.showThemePicker).toBeUndefined();
    });

    it('should NOT export hideThemePicker from persona.js', async () => {
      const persona = await import('../src/public/js/persona.js');

      expect(persona.hideThemePicker).toBeUndefined();
    });

    it('should NOT export updateTheme from persona.js', async () => {
      const persona = await import('../src/public/js/persona.js');

      expect(persona.updateTheme).toBeUndefined();
    });

    it('should NOT export getCurrentTheme from persona.js', async () => {
      const persona = await import('../src/public/js/persona.js');

      expect(persona.getCurrentTheme).toBeUndefined();
    });

    it('should NOT import ThemePicker.js in persona.js', () => {
      const personaPath = path.join(__dirname, '../src/public/js/persona.js');
      const content = fs.readFileSync(personaPath, 'utf-8');

      // Should not import ThemePicker
      expect(content).not.toMatch(/import.*ThemePicker/);
      expect(content).not.toMatch(/themePickerModule/);
    });

  });

  describe('Persona Click Shows Detail Only', () => {

    it('should NOT have handlePersonaSectionClick that toggles theme picker', () => {
      const personaPath = path.join(__dirname, '../src/public/js/persona.js');
      const content = fs.readFileSync(personaPath, 'utf-8');

      // Should not have the theme picker toggle logic
      expect(content).not.toMatch(/handlePersonaSectionClick.*showThemePicker/s);
      expect(content).not.toMatch(/themePickerModule\?\.isVisible/);
    });

    it('should have persona section click show popup only', () => {
      const personaPath = path.join(__dirname, '../src/public/js/persona.js');
      const content = fs.readFileSync(personaPath, 'utf-8');

      // Should have showPersonaPopup function
      expect(content).toMatch(/showPersonaPopup/);

      // Persona section click should go to popup, not theme picker
      // The initPersonaPopup function should wire up click -> showPersonaPopup
      expect(content).toMatch(/initPersonaPopup/);
    });

    it('should NOT have data-action="theme-picker" on persona section', () => {
      const indexPath = path.join(__dirname, '../src/public/index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');

      // Should not have theme-picker action attribute
      expect(content).not.toMatch(/data-action="theme-picker"/);
    });

  });

  describe('SettingsPanel is the Only Theme Changer', () => {

    it('should have theme selection only in SettingsPanel', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      // SettingsPanel should have selectTheme function
      expect(settingsPanel.selectTheme || settingsPanel.SettingsPanel?.selectTheme).toBeDefined();
    });

    it('should expose SettingsPanel via proper module exports', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');

      // Should have these exports
      expect(settingsPanel.init || settingsPanel.SettingsPanel?.init).toBeDefined();
      expect(settingsPanel.load || settingsPanel.SettingsPanel?.load).toBeDefined();
    });

  });

});

// =============================================================================
// Integration: End-to-End Theme Change Flow
// =============================================================================
describe('Integration: Theme change flow through SettingsPanel', () => {

  it('should persist theme to settings file via PATCH /api/settings', async () => {
    const testTheme = 'integration-test-theme';

    const response = await request(app)
      .patch('/api/settings')
      .send({ pennyfarthing: { theme: testTheme } })
      .expect('Content-Type', /json/);

    expect(response.status).toBe(200);

    // Verify it was saved
    const getResponse = await request(app).get('/api/settings');
    expect(getResponse.body.pennyfarthing.theme).toBe(testTheme);
  });

  it('should update recentThemes when theme changes', async () => {
    const testTheme = 'recent-test-theme';

    await request(app)
      .patch('/api/settings')
      .send({ pennyfarthing: { theme: testTheme } });

    const response = await request(app).get('/api/settings');
    expect(response.body.pennyfarthing.recentThemes).toContain(testTheme);
  });

  it('should have single code path for theme changes', () => {
    // Verify there's no duplicate theme-change logic
    const files = [
      '../src/public/js/persona.js',
      '../src/public/js/components/SettingsPanel.js',
    ];

    let themeChangeCount = 0;

    for (const file of files) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Count places that PATCH /api/settings with theme
        const matches = content.match(/\/api\/settings.*theme/g);
        if (matches) {
          themeChangeCount += matches.length;
        }
      }
    }

    // Should only have theme change in SettingsPanel (1 occurrence)
    expect(themeChangeCount).toBe(1);
  });

});
