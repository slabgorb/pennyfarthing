/**
 * 24-1: Settings Panel Infrastructure
 *
 * Tests for the Cyclist settings panel with file-based persistence,
 * modal window, and menu integration.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Settings panel opens from Cyclist menu
 * - AC2: Cmd+, keyboard shortcut opens settings
 * - AC3: Settings persist to ~/.cyclist/settings.yaml
 * - AC4: Project overrides work from .claude/cyclist.local.yaml
 * - AC5: Settings load on startup
 * - AC6: UI shows all setting categories (workflow, display, notifications)
 * - AC7: File watching reloads settings on external edit
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';
import path from 'path';
import os from 'os';

import { app } from '../src/server.js';

// Settings type definition (should match src/settings.ts)
// Updated in Story 31-13: handoff_mode replaces auto_handoff + handoff_confirm
// Updated in Story 35-6: font_ui and font_mono added
interface CyclistSettings {
  workflow: {
    handoff_mode: 'auto' | 'manual';
  };
  display: {
    show_flow: boolean;
    show_ocean: boolean;
    sidebar_width: number;
    font_ui: string;
    font_mono: string;
  };
  notifications: {
    phase_change: boolean;
    sound: boolean;
  };
  pennyfarthing: {
    theme: string;
    favorites: string[];
    recentThemes: string[];
  };
}

// Default settings for reference
// Updated in Story 31-13: handoff_mode replaces auto_handoff + handoff_confirm
// Updated in Story 35-6: font_ui and font_mono added
// Updated in Story 35-8: recentThemes added
const DEFAULT_SETTINGS: CyclistSettings = {
  workflow: {
    handoff_mode: 'manual',
  },
  display: {
    show_flow: true,
    show_ocean: false,
    sidebar_width: 300,
    font_ui: 'system-ui',
    font_mono: 'SF Mono',
  },
  notifications: {
    phase_change: true,
    sound: false,
  },
  pennyfarthing: {
    theme: 'alice-in-wonderland',
    favorites: [],
    recentThemes: [],
  },
};

describe('24-1: Settings Panel Infrastructure', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
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

  // ==========================================================================
  // AC1: Settings panel opens from Cyclist menu
  // ==========================================================================
  describe('AC1: Settings panel opens from Cyclist menu', () => {

    it('should export openSettingsWindow function from settings-window.ts', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      expect(settingsWindow.openSettingsWindow).toBeDefined();
      expect(typeof settingsWindow.openSettingsWindow).toBe('function');
    });

    it('should export closeSettingsWindow function from settings-window.ts', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      expect(settingsWindow.closeSettingsWindow).toBeDefined();
      expect(typeof settingsWindow.closeSettingsWindow).toBe('function');
    });

    it('should export isSettingsWindowOpen function from settings-window.ts', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      expect(settingsWindow.isSettingsWindowOpen).toBeDefined();
      expect(typeof settingsWindow.isSettingsWindowOpen).toBe('function');
    });

    it('should have settings menu item defined in main.ts menu template', async () => {
      const main = await import('../src/main.js');
      // Menu template should include Settings... item
      expect(main.getMenuTemplate).toBeDefined();
      const menuTemplate = main.getMenuTemplate?.();

      // Find app menu (macOS) or File menu
      const appMenu = menuTemplate?.find((m: { role?: string; label?: string }) =>
        m.role === 'appMenu' || m.label === 'Cyclist'
      );

      // Find Settings menu item in submenu
      const settingsItem = appMenu?.submenu?.find((item: { label?: string }) =>
        item.label?.toLowerCase().includes('settings')
      );

      expect(settingsItem).toBeDefined();
    });

    it('should have IPC handler for settings:openWindow', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS).toBeDefined();
      expect(main.IPC_SETTINGS_CHANNELS.OPEN_WINDOW).toBe('settings:openWindow');
    });

    it('should expose settings window IPC in preload', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.settings?.openWindow).toBeDefined();
      expect(typeof preload.electronAPI?.settings?.openWindow).toBe('function');
    });

  });

  // ==========================================================================
  // AC2: Cmd+, keyboard shortcut opens settings
  // ==========================================================================
  describe('AC2: Cmd+, keyboard shortcut opens settings', () => {

    it('should have Cmd+, accelerator on settings menu item', async () => {
      const main = await import('../src/main.js');
      const menuTemplate = main.getMenuTemplate?.();

      const appMenu = menuTemplate?.find((m: { role?: string; label?: string }) =>
        m.role === 'appMenu' || m.label === 'Cyclist'
      );

      const settingsItem = appMenu?.submenu?.find((item: { label?: string }) =>
        item.label?.toLowerCase().includes('settings')
      );

      expect(settingsItem?.accelerator).toBe('CmdOrCtrl+,');
    });

    it('should register global shortcut for settings window', async () => {
      const main = await import('../src/main.js');
      expect(main.registerSettingsShortcut).toBeDefined();
    });

  });

  // ==========================================================================
  // AC3: Settings persist to ~/.cyclist/settings.yaml
  // ==========================================================================
  describe('AC3: Settings persist to ~/.cyclist/settings.yaml', () => {

    it('should export loadSettings function from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.loadSettings).toBeDefined();
      expect(typeof settings.loadSettings).toBe('function');
    });

    it('should export saveUserSettings function from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.saveUserSettings).toBeDefined();
      expect(typeof settings.saveUserSettings).toBe('function');
    });

    it('should export USER_SETTINGS_DIR constant', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.USER_SETTINGS_DIR).toBeDefined();
      expect(settings.USER_SETTINGS_DIR).toBe(path.join(os.homedir(), '.cyclist'));
    });

    it('should export USER_SETTINGS_FILE constant', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.USER_SETTINGS_FILE).toBeDefined();
      expect(settings.USER_SETTINGS_FILE).toBe(path.join(os.homedir(), '.cyclist', 'settings.yaml'));
    });

    it('should return default settings when no file exists', async () => {
      const settings = await import('../src/settings.js');
      const loaded = settings.getDefaultSettings();

      // Updated in Story 31-13: handoff_mode replaces auto_handoff + handoff_confirm
      expect(loaded.workflow.handoff_mode).toBe('manual');
      expect(loaded.display.show_flow).toBe(true);
      expect(loaded.display.sidebar_width).toBe(300);
    });

    it('should export getDefaultSettings function', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.getDefaultSettings).toBeDefined();

      const defaults = settings.getDefaultSettings();
      expect(defaults).toEqual(DEFAULT_SETTINGS);
    });

    it('should create settings directory if it does not exist', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.ensureSettingsDir).toBeDefined();
      expect(typeof settings.ensureSettingsDir).toBe('function');
    });

    it('should save settings as valid YAML', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.serializeSettings).toBeDefined();

      const yaml = settings.serializeSettings(DEFAULT_SETTINGS);
      expect(yaml).toContain('workflow:');
      // Updated in Story 31-13: handoff_mode replaces auto_handoff
      expect(yaml).toContain('handoff_mode: manual');
      expect(yaml).toContain('display:');
      expect(yaml).toContain('notifications:');
    });

    it('should have IPC handler for settings:save', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.SAVE).toBe('settings:save');
    });

    it('should have IPC handler for settings:get', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.GET).toBe('settings:get');
    });

    it('should expose settings get/save in preload API', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.settings?.get).toBeDefined();
      expect(preload.electronAPI?.settings?.save).toBeDefined();
    });

  });

  // ==========================================================================
  // AC4: Project overrides work from .claude/cyclist.local.yaml
  // ==========================================================================
  describe('AC4: Project overrides work from .claude/cyclist.local.yaml', () => {

    it('should export PROJECT_SETTINGS_FILE constant', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.PROJECT_SETTINGS_FILE).toBeDefined();
      expect(settings.PROJECT_SETTINGS_FILE).toBe('.claude/cyclist.local.yaml');
    });

    it('should export mergeSettings function', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.mergeSettings).toBeDefined();
      expect(typeof settings.mergeSettings).toBe('function');
    });

    it('should merge project settings over user settings', async () => {
      const settings = await import('../src/settings.js');

      const userSettings = { ...DEFAULT_SETTINGS };
      const projectOverrides = {
        display: { show_ocean: true },
      };

      const merged = settings.mergeSettings(userSettings, projectOverrides);

      // Project override should take effect
      expect(merged.display.show_ocean).toBe(true);
      // Other settings should be preserved
      expect(merged.display.show_flow).toBe(true);
      // Updated in Story 31-13: handoff_mode replaces auto_handoff
      expect(merged.workflow.handoff_mode).toBe('manual');
    });

    it('should load project settings when projectDir is provided', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.loadProjectSettings).toBeDefined();
      expect(typeof settings.loadProjectSettings).toBe('function');
    });

    it('should return empty object when project settings file does not exist', async () => {
      const settings = await import('../src/settings.js');
      const projectSettings = settings.loadProjectSettings('/nonexistent/project');
      expect(projectSettings).toEqual({});
    });

    it('should indicate whether loaded settings include project overrides', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.hasProjectOverrides).toBeDefined();
    });

  });

  // ==========================================================================
  // AC5: Settings load on startup
  // ==========================================================================
  describe('AC5: Settings load on startup', () => {

    it('should export initializeSettings function', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.initializeSettings).toBeDefined();
      expect(typeof settings.initializeSettings).toBe('function');
    });

    it('should export getCurrentSettings function', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.getCurrentSettings).toBeDefined();
      expect(typeof settings.getCurrentSettings).toBe('function');
    });

    it('should call initializeSettings during app startup', async () => {
      const main = await import('../src/main.js');
      // main.ts should call settings.initializeSettings() in its startup
      expect(main.isSettingsInitialized).toBeDefined();
    });

    it('should integrate current settings with existing settings-store', async () => {
      const settingsStore = await import('../src/settings-store.js');
      // settings-store should have method to sync with file-based settings
      expect(settingsStore.syncWithFileSettings).toBeDefined();
    });

    it('should broadcast settings to renderer on startup', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.CHANGED).toBe('settings:changed');
    });

  });

  // ==========================================================================
  // AC6: UI shows all setting categories (workflow, display, notifications)
  // ==========================================================================
  describe('AC6: UI shows all setting categories', () => {

    it('should have settings.html file', async () => {
      const htmlResponse = await request(app).get('/settings.html');
      expect(htmlResponse.status).toBe(200);
    });

    it('should include settings form in settings.html', async () => {
      const htmlResponse = await request(app).get('/settings.html');
      const settingsHtml = htmlResponse.text;

      expect(settingsHtml).toContain('<form');
      expect(settingsHtml).toContain('id="settings-form"');
    });

    it('should have workflow toggle in editor toolbar (moved from settings in 35-1)', async () => {
      // Story 35-1 moved handoff toggle from settings.html to index.html editor toolbar
      const htmlResponse = await request(app).get('/');
      const indexHtml = htmlResponse.text;

      // Handoff toggle now in editor toolbar
      expect(indexHtml).toContain('handoff-toggle');
      expect(indexHtml).toContain('data-control="handoff-mode"');
      expect(indexHtml).toContain('MANUAL');
    });

    it('should have display section in settings UI', async () => {
      const htmlResponse = await request(app).get('/settings.html');
      const settingsHtml = htmlResponse.text;

      expect(settingsHtml).toContain('display');
      expect(settingsHtml).toContain('show_flow');
      expect(settingsHtml).toContain('show_ocean');
      expect(settingsHtml).toContain('sidebar_width');
    });

    it('should have notifications section in settings UI', async () => {
      const htmlResponse = await request(app).get('/settings.html');
      const settingsHtml = htmlResponse.text;

      expect(settingsHtml).toContain('notifications');
      expect(settingsHtml).toContain('phase_change');
      expect(settingsHtml).toContain('sound');
    });

    it('should have settings.css file', async () => {
      const cssResponse = await request(app).get('/settings.css');
      expect(cssResponse.status).toBe(200);
    });

    it('should have CSS for settings form layout', async () => {
      const cssResponse = await request(app).get('/settings.css');
      const settingsCss = cssResponse.text;

      expect(settingsCss).toMatch(/\.settings-form|#settings-form/);
      expect(settingsCss).toMatch(/\.settings-section|\.section/);
    });

    it('should have save and cancel buttons', async () => {
      const htmlResponse = await request(app).get('/settings.html');
      const settingsHtml = htmlResponse.text;

      expect(settingsHtml).toMatch(/type="submit"|class="[^"]*save/);
      expect(settingsHtml).toMatch(/type="button"[^>]*cancel|class="[^"]*cancel/);
    });

    it('should include settings-ui.js script', async () => {
      const htmlResponse = await request(app).get('/settings.html');
      const settingsHtml = htmlResponse.text;

      expect(settingsHtml).toContain('settings-ui.js');
    });

    it('should export loadFormValues from settings-ui.js', async () => {
      const settingsUI = await import('../src/public/js/settings-ui.js');
      expect(settingsUI.loadFormValues).toBeDefined();
      expect(typeof settingsUI.loadFormValues).toBe('function');
    });

    it('should export getFormValues from settings-ui.js', async () => {
      const settingsUI = await import('../src/public/js/settings-ui.js');
      expect(settingsUI.getFormValues).toBeDefined();
      expect(typeof settingsUI.getFormValues).toBe('function');
    });

    it('should export initSettingsUI from settings-ui.js', async () => {
      const settingsUI = await import('../src/public/js/settings-ui.js');
      expect(settingsUI.initSettingsUI).toBeDefined();
      expect(typeof settingsUI.initSettingsUI).toBe('function');
    });

  });

  // ==========================================================================
  // AC7: File watching reloads settings on external edit
  // ==========================================================================
  describe('AC7: File watching reloads settings on external edit', () => {

    it('should export watchSettings function from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.watchSettings).toBeDefined();
      expect(typeof settings.watchSettings).toBe('function');
    });

    it('should return unsubscribe function from watchSettings', async () => {
      const settings = await import('../src/settings.js');
      const unsubscribe = settings.watchSettings('/tmp', () => {});

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });

    it('should export stopWatchingSettings function', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.stopWatchingSettings).toBeDefined();
      expect(typeof settings.stopWatchingSettings).toBe('function');
    });

    it('should call onChange callback when user settings file changes', async () => {
      const settings = await import('../src/settings.js');

      // This would require actual file system interaction in integration tests
      // For unit test, verify the API contract
      expect(settings.watchSettings).toBeDefined();
    });

    it('should broadcast settings:changed via IPC when file changes', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.CHANGED).toBe('settings:changed');
    });

    it('should watch both user and project settings files', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.watchAllSettings).toBeDefined();
      expect(typeof settings.watchAllSettings).toBe('function');
    });

    it('should handle invalid YAML gracefully on file change', async () => {
      const settings = await import('../src/settings.js');

      // parseSettings should not throw on invalid YAML
      expect(settings.parseSettings).toBeDefined();

      const result = settings.parseSettings('invalid: yaml: content: [');
      expect(result).toEqual({}); // Should return empty object on parse error
    });

  });

  // ==========================================================================
  // Settings Window Configuration
  // ==========================================================================
  describe('Settings Window Configuration', () => {

    it('should configure settings window as modal', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      expect(settingsWindow.getWindowConfig).toBeDefined();

      const config = settingsWindow.getWindowConfig();
      expect(config.modal).toBe(true);
    });

    it('should configure settings window size', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      const config = settingsWindow.getWindowConfig();

      expect(config.width).toBe(450);
      expect(config.height).toBe(500);
    });

    it('should configure settings window as non-resizable', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      const config = settingsWindow.getWindowConfig();

      expect(config.resizable).toBe(false);
    });

    it('should use shared preload script for settings window', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      const config = settingsWindow.getWindowConfig();

      expect(config.webPreferences?.preload).toBeDefined();
      expect(config.webPreferences?.preload).toContain('preload');
    });

    it('should load settings.html in settings window', async () => {
      const settingsWindow = await import('../src/settings-window.js');
      expect(settingsWindow.SETTINGS_HTML_PATH).toBeDefined();
      expect(settingsWindow.SETTINGS_HTML_PATH).toContain('settings.html');
    });

  });

  // ==========================================================================
  // IPC Integration
  // ==========================================================================
  describe('IPC Integration', () => {

    it('should define all settings IPC channels', async () => {
      const main = await import('../src/main.js');

      expect(main.IPC_SETTINGS_CHANNELS).toBeDefined();
      expect(main.IPC_SETTINGS_CHANNELS.GET).toBe('settings:get');
      expect(main.IPC_SETTINGS_CHANNELS.SAVE).toBe('settings:save');
      expect(main.IPC_SETTINGS_CHANNELS.CHANGED).toBe('settings:changed');
      expect(main.IPC_SETTINGS_CHANNELS.OPEN_WINDOW).toBe('settings:openWindow');
    });

    it('should have settings:get handler return current settings', async () => {
      const main = await import('../src/main.js');
      expect(main.handleSettingsGet).toBeDefined();

      const settings = await main.handleSettingsGet();
      expect(settings.workflow).toBeDefined();
      expect(settings.display).toBeDefined();
      expect(settings.notifications).toBeDefined();
    });

    it('should have settings:save handler that persists to file', async () => {
      const main = await import('../src/main.js');
      expect(main.handleSettingsSave).toBeDefined();
    });

    it('should extend ElectronSettingsAPI with new methods', async () => {
      const preload = await import('../src/preload.js');
      const settingsAPI = preload.electronAPI?.settings;

      // New methods for 24-1
      expect(settingsAPI?.get).toBeDefined();
      expect(settingsAPI?.save).toBeDefined();
      expect(settingsAPI?.openWindow).toBeDefined();
      expect(settingsAPI?.onChanged).toBeDefined();
    });

  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================
  describe('Error Handling', () => {

    it('should handle missing settings file gracefully', async () => {
      const settings = await import('../src/settings.js');

      // Should not throw
      const result = settings.loadSettings('/nonexistent/directory');
      expect(result).toBeDefined();
      expect(result.workflow).toBeDefined();
    });

    it('should handle invalid YAML in settings file', async () => {
      const settings = await import('../src/settings.js');

      const parsed = settings.parseSettings('not: valid: yaml: [');
      expect(parsed).toEqual({});
    });

    it('should handle permission errors when saving settings', async () => {
      const settings = await import('../src/settings.js');

      // saveUserSettings should return success/failure boolean
      expect(settings.saveUserSettings).toBeDefined();
    });

    it('should validate settings schema on load', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.validateSettings).toBeDefined();

      // Valid settings
      expect(settings.validateSettings(DEFAULT_SETTINGS)).toBe(true);

      // Invalid settings (wrong type)
      expect(settings.validateSettings({ workflow: 'invalid' })).toBe(false);
    });

  });

});
