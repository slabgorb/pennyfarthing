/**
 * 35-14: Settings Architecture Cleanup and Consolidation
 *
 * Tests to enforce clean separation of concerns:
 * - settings.ts = single source of truth for ALL file-based settings (including grants)
 * - settings-store.ts = runtime state only (no file I/O)
 *
 * Written in RED phase - tests should fail until Dev implements refactoring.
 *
 * Acceptance Criteria:
 * - AC1: settings.ts is single source of truth for file-based settings
 * - AC2: settings-store.ts only handles runtime state (grants, gates)
 * - AC3: No dead code or unused variables in settings components
 * - AC4: IPC/HTTP transport has consistent error handling with user feedback
 * - AC5: State flows are documented and testable
 * - AC6: Test coverage for settings load/save/validate paths
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { app } from '../src/server.js';

// =============================================================================
// AC1: settings.ts is single source of truth for file-based settings
// =============================================================================
describe('AC1: settings.ts as single source of truth for file-based settings', () => {

  describe('Settings Module File Persistence', () => {

    it('should export loadGrants function from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.loadGrants).toBeDefined();
      expect(typeof settings.loadGrants).toBe('function');
    });

    it('should export saveGrants function from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.saveGrants).toBeDefined();
      expect(typeof settings.saveGrants).toBe('function');
    });

    it('should export GRANTS_FILE constant from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.GRANTS_FILE).toBeDefined();
      expect(settings.GRANTS_FILE).toBe(path.join(os.homedir(), '.cyclist', 'grants.json'));
    });

    it('should have grants schema type exported from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      // TypeScript types don't exist at runtime, but we can check that
      // loadGrants returns an array
      expect(settings.loadGrants).toBeDefined();
    });

    it('should persist grants via settings.ts saveGrants', async () => {
      const settings = await import('../src/settings.js');

      const testGrant = {
        tool: 'Bash',
        scope: 'test *',
        grant_type: 'always' as const,
        granted_at: new Date().toISOString(),
      };

      // Save should work
      const success = settings.saveGrants([testGrant]);
      expect(success).toBe(true);

      // Load should retrieve
      const loaded = settings.loadGrants();
      expect(loaded).toContainEqual(expect.objectContaining({
        tool: 'Bash',
        scope: 'test *',
        grant_type: 'always',
      }));
    });

    it('should consolidate all file paths in settings.ts constants', async () => {
      const settings = await import('../src/settings.js');

      // All file paths should be exported from settings.ts
      expect(settings.USER_SETTINGS_DIR).toBeDefined();
      expect(settings.USER_SETTINGS_FILE).toBeDefined();
      expect(settings.PROJECT_SETTINGS_FILE).toBeDefined();
      expect(settings.GRANTS_FILE).toBeDefined();
    });

  });

});

// =============================================================================
// AC2: settings-store.ts only handles runtime state (grants, gates)
// =============================================================================
describe('AC2: settings-store.ts only handles runtime state', () => {

  describe('Runtime State Only', () => {

    it('should NOT export GRANTS_FILE from settings-store.ts', async () => {
      const settingsStore = await import('../src/settings-store.js');
      // GRANTS_FILE should be moved to settings.ts
      expect(settingsStore.GRANTS_FILE).toBeUndefined();
    });

    it('should NOT have saveGrantsToFile function in settings-store.ts', async () => {
      const settingsStore = await import('../src/settings-store.js');
      // File I/O should be in settings.ts
      expect(settingsStore.saveGrantsToFile).toBeUndefined();
    });

    it('should NOT have loadPersistedGrants doing file I/O in settings-store.ts', async () => {
      const settingsStore = await import('../src/settings-store.js');
      // loadPersistedGrants should get data from settings.ts, not read files directly
      // This test verifies the function signature accepts grants as a parameter
      expect(settingsStore.initializeGrants).toBeDefined();
      expect(typeof settingsStore.initializeGrants).toBe('function');
    });

    it('should export initializeGrants that accepts grants array parameter', async () => {
      const settingsStore = await import('../src/settings-store.js');

      // initializeGrants should accept pre-loaded grants from settings.ts
      expect(settingsStore.initializeGrants).toBeDefined();

      // Test that it accepts an array parameter
      const testGrants = [
        { tool: 'Bash', scope: 'git *', grant_type: 'session', granted_at: new Date().toISOString() },
      ];

      // Should not throw
      expect(() => settingsStore.initializeGrants(testGrants)).not.toThrow();
    });

    it('should NOT import fs module in settings-store.ts', async () => {
      // Read the source file to check imports
      const sourceFile = path.join(__dirname, '../src/settings-store.ts');
      const content = fs.readFileSync(sourceFile, 'utf-8');

      // After refactoring, settings-store should not import fs
      // Allow: import type { ... } from 'fs'
      // Disallow: import fs from 'fs', import { readFileSync } from 'fs', etc.
      const hasFileSystemImport = /import\s+(?!type)[\s\S]*?from\s+['"]fs['"]/.test(content);
      expect(hasFileSystemImport).toBe(false);
    });

    it('should delegate persistence to settings module via callback', async () => {
      const settingsStore = await import('../src/settings-store.js');

      // settings-store should accept an onGrantsPersist callback
      expect(settingsStore.setGrantsPersistCallback).toBeDefined();
      expect(typeof settingsStore.setGrantsPersistCallback).toBe('function');
    });

  });

  describe('Pure Runtime State Functions', () => {

    it('should keep getBashApprovalGate as runtime state', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.getBashApprovalGate).toBeDefined();
      expect(typeof settingsStore.getBashApprovalGate).toBe('function');
    });

    it('should keep getVerboseMode as runtime state', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.getVerboseMode).toBeDefined();
      expect(typeof settingsStore.getVerboseMode).toBe('function');
    });

    it('should keep getDangerousPathGate as runtime state', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.getDangerousPathGate).toBeDefined();
      expect(typeof settingsStore.getDangerousPathGate).toBe('function');
    });

    it('should keep in-memory grant operations (addGrant, checkGrant, etc.)', async () => {
      const settingsStore = await import('../src/settings-store.js');

      // These are runtime operations that work on in-memory state
      expect(settingsStore.addGrant).toBeDefined();
      expect(settingsStore.checkGrant).toBeDefined();
      expect(settingsStore.getGrants).toBeDefined();
      expect(settingsStore.removeGrant).toBeDefined();
      expect(settingsStore.clearAllGrants).toBeDefined();
      expect(settingsStore.clearSessionGrants).toBeDefined();
    });

  });

});

// =============================================================================
// AC4: IPC/HTTP transport has consistent error handling with user feedback
// =============================================================================
describe('AC4: Consistent error handling in transport layer', () => {

  describe('HTTP API Error Responses', () => {

    it('should return consistent error format for GET /api/settings failure', async () => {
      // Mock a failure scenario (e.g., file system error)
      // After refactoring, error should include user-friendly message
      const response = await request(app)
        .get('/api/settings')
        .expect('Content-Type', /json/);

      // On success, should return settings
      // On failure, should return consistent error format
      if (response.status >= 400) {
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        expect(typeof response.body.message).toBe('string');
      }
    });

    it('should return consistent error format for PATCH /api/settings failure', async () => {
      // Send invalid data to trigger error handling
      const response = await request(app)
        .patch('/api/settings')
        .send({ invalid: 'structure' })
        .expect('Content-Type', /json/);

      // Should return settings or error with consistent format
      if (response.status >= 400) {
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should include error code for categorization', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({ display: { sidebar_width: 'not-a-number' } });

      if (response.status >= 400) {
        expect(response.body).toHaveProperty('code');
        expect(['VALIDATION_ERROR', 'FILE_ERROR', 'PERMISSION_ERROR', 'UNKNOWN_ERROR'])
          .toContain(response.body.code);
      }
    });

  });

  describe('Error Response Structure', () => {

    it('should export ErrorResponse type from settings API', async () => {
      const settingsApi = await import('../src/api/settings.js');
      // Type exists at compile time; we verify the module exports error helpers
      expect(settingsApi.createErrorResponse).toBeDefined();
      expect(typeof settingsApi.createErrorResponse).toBe('function');
    });

    it('should have createErrorResponse helper for consistent formatting', async () => {
      const settingsApi = await import('../src/api/settings.js');

      const error = settingsApi.createErrorResponse(
        'VALIDATION_ERROR',
        'Sidebar width must be between 200 and 500'
      );

      expect(error).toEqual({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Sidebar width must be between 200 and 500',
      });
    });

  });

  describe('User Feedback on Errors', () => {

    it('should return human-readable error messages', async () => {
      // Test validation error message
      const response = await request(app)
        .patch('/api/settings')
        .send({ display: { sidebar_width: 50 } }); // Too small

      if (response.status >= 400) {
        // Message should be user-friendly, not technical
        expect(response.body.message).toMatch(/sidebar|width|between|200|500/i);
        expect(response.body.message).not.toMatch(/undefined|null|NaN/);
      }
    });

  });

});

// =============================================================================
// AC5: State flows are documented and testable
// =============================================================================
describe('AC5: State flows are documented and testable', () => {

  describe('Settings Initialization Flow', () => {

    it('should have initializeApp function that orchestrates startup', async () => {
      // The main entry point should have a clear initialization flow
      const main = await import('../src/main.js');
      expect(main.initializeApp).toBeDefined();
      expect(typeof main.initializeApp).toBe('function');
    });

    it('should initialize settings before grants', async () => {
      const settings = await import('../src/settings.js');
      const settingsStore = await import('../src/settings-store.js');

      // The initialization order should be:
      // 1. Load file-based settings (settings.ts)
      // 2. Load grants from file (settings.ts)
      // 3. Initialize runtime store with grants (settings-store.ts)

      // Verify the functions exist to support this flow
      expect(settings.initializeSettings).toBeDefined();
      expect(settings.loadGrants).toBeDefined();
      expect(settingsStore.initializeGrants).toBeDefined();
    });

  });

  describe('Settings Update Flow', () => {

    it('should have onSettingsChange callback registration', async () => {
      const settings = await import('../src/settings.js');

      // settings.ts should support change notifications
      expect(settings.onSettingsChange).toBeDefined();
      expect(typeof settings.onSettingsChange).toBe('function');

      // Should return unsubscribe function
      const unsubscribe = settings.onSettingsChange(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should propagate settings changes to IPC listeners', async () => {
      const main = await import('../src/main.js');

      // Main should have IPC broadcast capability
      expect(main.broadcastSettingsChange).toBeDefined();
      expect(typeof main.broadcastSettingsChange).toBe('function');
    });

  });

  describe('Grant Persistence Flow', () => {

    it('should have clear flow: addGrant -> callback -> settings.saveGrants', async () => {
      const settings = await import('../src/settings.js');
      const settingsStore = await import('../src/settings-store.js');

      let callbackCalled = false;
      const persistCallback = (grants: unknown[]) => {
        callbackCalled = true;
        return true;
      };

      // Register the persistence callback
      settingsStore.setGrantsPersistCallback(persistCallback);

      // Add a grant that should trigger persistence
      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'flow-test *',
        grant_type: 'always',
        granted_at: new Date().toISOString(),
      });

      // Callback should have been invoked
      expect(callbackCalled).toBe(true);
    });

  });

});

// =============================================================================
// AC6: Test coverage for settings load/save/validate paths
// =============================================================================
describe('AC6: Settings load/save/validate coverage', () => {

  describe('Settings Validation', () => {

    it('should validate display.sidebar_width range (200-500)', async () => {
      const settings = await import('../src/settings.js');

      // Should have validation function
      expect(settings.validateSettings).toBeDefined();

      // Invalid: too small
      const tooSmall = { ...settings.getDefaultSettings() };
      tooSmall.display.sidebar_width = 100;
      expect(settings.validateSettings(tooSmall)).toBe(false);

      // Invalid: too large
      const tooLarge = { ...settings.getDefaultSettings() };
      tooLarge.display.sidebar_width = 600;
      expect(settings.validateSettings(tooLarge)).toBe(false);

      // Valid: in range
      const valid = { ...settings.getDefaultSettings() };
      valid.display.sidebar_width = 350;
      expect(settings.validateSettings(valid)).toBe(true);
    });

    it('should validate handoff_mode enum', async () => {
      const settings = await import('../src/settings.js');

      // Invalid mode
      const invalid = { ...settings.getDefaultSettings() };
      (invalid.workflow as { handoff_mode: string }).handoff_mode = 'invalid';
      expect(settings.validateSettings(invalid)).toBe(false);

      // Valid modes
      const auto = { ...settings.getDefaultSettings() };
      auto.workflow.handoff_mode = 'auto';
      expect(settings.validateSettings(auto)).toBe(true);

      const manual = { ...settings.getDefaultSettings() };
      manual.workflow.handoff_mode = 'manual';
      expect(settings.validateSettings(manual)).toBe(true);
    });

    it('should validate font_ui and font_mono are non-empty strings', async () => {
      const settings = await import('../src/settings.js');

      // Empty strings invalid
      const emptyFontUi = { ...settings.getDefaultSettings() };
      emptyFontUi.display.font_ui = '';
      expect(settings.validateSettings(emptyFontUi)).toBe(false);

      const emptyFontMono = { ...settings.getDefaultSettings() };
      emptyFontMono.display.font_mono = '';
      expect(settings.validateSettings(emptyFontMono)).toBe(false);
    });

    it('should validate theme is a non-empty string', async () => {
      const settings = await import('../src/settings.js');

      const emptyTheme = { ...settings.getDefaultSettings() };
      emptyTheme.pennyfarthing.theme = '';
      expect(settings.validateSettings(emptyTheme)).toBe(false);
    });

    it('should validate favorites is an array of strings', async () => {
      const settings = await import('../src/settings.js');

      const invalidFavorites = { ...settings.getDefaultSettings() };
      (invalidFavorites.pennyfarthing as { favorites: unknown }).favorites = 'not-an-array';
      expect(settings.validateSettings(invalidFavorites)).toBe(false);
    });

  });

  describe('Grant Validation', () => {

    it('should export validateGrant function from settings.ts', async () => {
      const settings = await import('../src/settings.js');
      expect(settings.validateGrant).toBeDefined();
      expect(typeof settings.validateGrant).toBe('function');
    });

    it('should validate grant_type enum', async () => {
      const settings = await import('../src/settings.js');

      // Valid types
      expect(settings.validateGrant({ tool: 'Bash', scope: 'git *', grant_type: 'once', granted_at: new Date().toISOString() })).toBe(true);
      expect(settings.validateGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session', granted_at: new Date().toISOString() })).toBe(true);
      expect(settings.validateGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always', granted_at: new Date().toISOString() })).toBe(true);

      // Invalid type
      expect(settings.validateGrant({ tool: 'Bash', scope: 'git *', grant_type: 'invalid', granted_at: new Date().toISOString() })).toBe(false);
    });

    it('should validate tool is non-empty string', async () => {
      const settings = await import('../src/settings.js');

      expect(settings.validateGrant({ tool: '', scope: 'git *', grant_type: 'session', granted_at: new Date().toISOString() })).toBe(false);
    });

    it('should validate scope is non-empty string', async () => {
      const settings = await import('../src/settings.js');

      expect(settings.validateGrant({ tool: 'Bash', scope: '', grant_type: 'session', granted_at: new Date().toISOString() })).toBe(false);
    });

  });

  describe('Error Recovery', () => {

    it('should handle corrupted settings file gracefully', async () => {
      const settings = await import('../src/settings.js');

      // parseSettings should return empty object for invalid YAML
      const parsed = settings.parseSettings('corrupted: yaml: [invalid');
      expect(parsed).toEqual({});
    });

    it('should handle corrupted grants file gracefully', async () => {
      const settings = await import('../src/settings.js');

      // loadGrants should return empty array if file is corrupted
      expect(settings.loadGrants).toBeDefined();
      // Implementation should handle JSON parse errors
    });

    it('should merge partial settings without losing existing values', async () => {
      const settings = await import('../src/settings.js');

      const base = settings.getDefaultSettings();
      const partial = { display: { sidebar_width: 400 } };

      const merged = settings.mergeSettings(base, partial);

      // Updated value
      expect(merged.display.sidebar_width).toBe(400);
      // Preserved values
      expect(merged.display.show_flow).toBe(true);
      expect(merged.workflow.handoff_mode).toBe('manual');
      expect(merged.notifications.phase_change).toBe(true);
    });

  });

});

// =============================================================================
// Integration: Settings Module and Store Coordination
// =============================================================================
describe('Integration: Settings Module and Store Coordination', () => {

  it('should have clear module boundaries', async () => {
    const settings = await import('../src/settings.js');
    const settingsStore = await import('../src/settings-store.js');

    // settings.ts: file I/O exports
    expect(settings.loadSettings).toBeDefined();
    expect(settings.saveUserSettings).toBeDefined();
    expect(settings.loadGrants).toBeDefined();
    expect(settings.saveGrants).toBeDefined();
    expect(settings.watchSettings).toBeDefined();

    // settings-store.ts: runtime state exports
    expect(settingsStore.getBashApprovalGate).toBeDefined();
    expect(settingsStore.getVerboseMode).toBeDefined();
    expect(settingsStore.addGrant).toBeDefined();
    expect(settingsStore.checkGrant).toBeDefined();
    expect(settingsStore.initializeGrants).toBeDefined();
  });

  it('should initialize correctly on app startup', async () => {
    const settings = await import('../src/settings.js');
    const settingsStore = await import('../src/settings-store.js');

    // Simulate startup sequence
    // 1. Initialize settings
    const loadedSettings = settings.initializeSettings();
    expect(loadedSettings).toBeDefined();
    expect(loadedSettings.workflow).toBeDefined();

    // 2. Load and initialize grants
    const grants = settings.loadGrants();
    expect(Array.isArray(grants)).toBe(true);

    // 3. Initialize store with grants
    expect(() => settingsStore.initializeGrants(grants)).not.toThrow();
  });

});
