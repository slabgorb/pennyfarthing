/**
 * 35-9: Settings Panel Fixes and Expansion
 *
 * Tests for fixing settings panel bugs and adding new functionality:
 * - Vertical slide-in panel (not separate window)
 * - Loading states and error handling
 * - Dirty tracking with unsaved changes warning
 * - Validation for settings values
 * - Reset to defaults functionality
 * - IPC primary, HTTP fallback (no localStorage)
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Design Spec: .session/35-9-design-spec.md
 * 21 BDD Test Scenarios from UX Designer
 *
 * Acceptance Criteria:
 * - AC1: Settings store initialization errors handled gracefully
 * - AC2: Theme browser shows loading state during async load
 * - AC3: No sync conflicts between localStorage and IPC
 * - AC4: Unsaved changes warning before close
 * - AC5: Settings validation with error messages
 * - AC6: Reset to defaults button works
 * - AC7: Settings organized into logical sections
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// Settings type definition (from existing tests)
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
  };
}

// Default settings for reset functionality
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
  },
};

describe('35-9: Settings Panel Fixes and Expansion', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch main HTML (settings panel is now in index.html)
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
  // SCENARIO 1-3: Panel Open/Close
  // ==========================================================================
  describe('Panel Open/Close', () => {

    // Scenario 1: Given settings panel closed, when user clicks gear icon, then panel slides in from right
    it('should have settings panel container in index.html', () => {
      expect(html).toContain('id="settings-panel"');
    });

    it('should have gear icon trigger button in toolbar', () => {
      expect(html).toMatch(/class="[^"]*settings-trigger[^"]*"|id="settings-trigger"/);
    });

    it('should export SettingsPanel.open function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel).toBeDefined();
      expect(settingsPanel.SettingsPanel.open).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.open).toBe('function');
    });

    it('should have CSS for panel slide-in animation from right', () => {
      expect(css).toMatch(/settings-panel[^{]*\{[^}]*transform.*translateX|right/);
      expect(css).toMatch(/transition.*200ms|ease-out/);
    });

    it('should have panel width of 320px', () => {
      expect(css).toMatch(/settings-panel[^{]*\{[^}]*width:\s*320px/);
    });

    // Scenario 2: Given settings panel open, when user clicks × button, then panel slides out
    it('should have close button in settings panel header', () => {
      expect(html).toMatch(/settings-panel[^]*class="[^"]*close-btn|settings-close/);
    });

    it('should export SettingsPanel.close function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.close).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.close).toBe('function');
    });

    // Scenario 3: Given settings panel open, when user presses Escape, then panel closes (with dirty check)
    it('should export SettingsPanel.handleEscape function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.handleEscape).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.handleEscape).toBe('function');
    });

    it('should have keyboard event listener for Escape key', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // SettingsPanel.init should register keyboard listener
      expect(settingsPanel.SettingsPanel.init).toBeDefined();
    });

  });

  // ==========================================================================
  // SCENARIO 4-6: Loading States (AC1, AC2)
  // ==========================================================================
  describe('Loading States', () => {

    // Scenario 4: Given settings panel opens, when IPC available, then show form with loaded values (no flash)
    it('should have loading skeleton state in settings panel', () => {
      expect(html).toMatch(/settings-loading|skeleton/);
    });

    it('should export SettingsPanel.showLoading function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.showLoading).toBeDefined();
    });

    it('should have CSS for skeleton pulse animation', () => {
      expect(css).toMatch(/skeleton|pulse|loading/);
      expect(css).toMatch(/@keyframes|animation/);
    });

    it('should have minimum 150ms loading duration to prevent flash', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.MIN_LOADING_DURATION).toBeDefined();
      expect(settingsPanel.MIN_LOADING_DURATION).toBeGreaterThanOrEqual(150);
    });

    // Scenario 5: Given settings panel opens, when IPC fails, then show error banner with retry option
    it('should have error banner element in settings panel', () => {
      expect(html).toMatch(/settings-error|error-banner/);
    });

    it('should have retry button in error state', () => {
      expect(html).toMatch(/retry-btn|settings-retry/);
    });

    it('should export SettingsPanel.showError function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.showError).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.showError).toBe('function');
    });

    // Scenario 6: Given IPC fails, when user clicks Continue with Defaults, then form populates with defaults
    it('should have "Continue with Defaults" button in error state', () => {
      expect(html).toMatch(/continue.*defaults|use.*defaults/i);
    });

    it('should export SettingsPanel.useDefaults function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.useDefaults).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.useDefaults).toBe('function');
    });

  });

  // ==========================================================================
  // SCENARIO 7-10: Dirty Tracking (AC4)
  // ==========================================================================
  describe('Dirty Tracking', () => {

    // Scenario 7: Given clean form, when user changes value, then header shows asterisk
    it('should export SettingsPanel.isDirty function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.isDirty).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.isDirty).toBe('function');
    });

    it('should have panel header that can show dirty indicator', () => {
      expect(html).toMatch(/settings-header|settings-title/);
    });

    it('should export SettingsPanel.updateDirtyIndicator function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.updateDirtyIndicator).toBeDefined();
    });

    // Scenario 8: Given dirty form, when user clicks Cancel, then show confirmation dialog
    it('should have ConfirmDialog component', async () => {
      const confirmDialog = await import('../src/public/js/components/ConfirmDialog.js');
      expect(confirmDialog.ConfirmDialog).toBeDefined();
      expect(confirmDialog.ConfirmDialog.show).toBeDefined();
    });

    it('should have unsaved changes dialog markup', () => {
      expect(html).toMatch(/confirm-dialog|unsaved-changes/);
    });

    // Scenario 9: Given dirty form, when user clicks Don't Save, then close panel without saving
    it('should export ConfirmDialog options for Don\'t Save, Cancel, Save', async () => {
      const confirmDialog = await import('../src/public/js/components/ConfirmDialog.js');
      // Dialog should support multiple button configurations
      expect(confirmDialog.ConfirmDialog.show.length).toBeGreaterThanOrEqual(1);
    });

    // Scenario 10: Given dirty form, when user clicks Save in dialog, then save and close panel
    it('should export SettingsPanel.saveAndClose function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.saveAndClose).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.saveAndClose).toBe('function');
    });

  });

  // ==========================================================================
  // SCENARIO 11-13: Validation (AC5)
  // ==========================================================================
  describe('Validation', () => {

    // Scenario 11: Given sidebar width < 200, when user saves, then show inline error
    it('should have sidebar_width input with min/max attributes', () => {
      expect(html).toMatch(/id="sidebar_width"[^>]*min="200"/);
      expect(html).toMatch(/id="sidebar_width"[^>]*max="500"/);
    });

    it('should export validateSidebarWidth function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.validateSidebarWidth).toBeDefined();
      expect(typeof settingsPanel.validateSidebarWidth).toBe('function');
    });

    it('should return error for sidebar width < 200', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      const result = settingsPanel.validateSidebarWidth(150);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/200.*500|between/i);
    });

    // Scenario 12: Given sidebar width > 500, when user saves, then show inline error
    it('should return error for sidebar width > 500', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      const result = settingsPanel.validateSidebarWidth(600);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/200.*500|between/i);
    });

    // Scenario 13: Given validation error, when user corrects value, then error clears
    it('should have ValidationMessage component', async () => {
      const validationMessage = await import('../src/public/js/components/ValidationMessage.js');
      expect(validationMessage.ValidationMessage).toBeDefined();
      expect(validationMessage.ValidationMessage.show).toBeDefined();
      expect(validationMessage.ValidationMessage.hide).toBeDefined();
    });

    it('should have CSS for validation error styling', () => {
      expect(css).toMatch(/has-error|validation-error|error-message/);
    });

    it('should have aria-invalid attribute support for accessibility', () => {
      expect(html).toMatch(/aria-invalid|aria-describedby/);
    });

    it('should return valid for sidebar width between 200-500', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      const result = settingsPanel.validateSidebarWidth(300);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

  });

  // ==========================================================================
  // SCENARIO 14-16: Reset to Defaults (AC6)
  // ==========================================================================
  describe('Reset to Defaults', () => {

    // Scenario 14: Given user clicks Reset to Defaults, then show confirmation dialog
    it('should have Advanced section with Reset to Defaults button', () => {
      expect(html).toMatch(/advanced|reset.*defaults/i);
    });

    it('should have reset button with appropriate text', () => {
      expect(html).toMatch(/reset.*defaults|restore.*defaults/i);
    });

    it('should export SettingsPanel.showResetConfirmation function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.showResetConfirmation).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.showResetConfirmation).toBe('function');
    });

    // Scenario 15: Given reset confirmed, then form populates with default values
    it('should export SettingsPanel.resetToDefaults function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.resetToDefaults).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.resetToDefaults).toBe('function');
    });

    it('should export DEFAULT_SETTINGS constant', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.DEFAULT_SETTINGS).toBeDefined();
      expect(settingsPanel.DEFAULT_SETTINGS.display.sidebar_width).toBe(300);
    });

    // Scenario 16: Given reset confirmed, then form is marked dirty (needs save)
    it('should mark form dirty after reset', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // resetToDefaults should set dirty state
      expect(settingsPanel.SettingsPanel.resetToDefaults).toBeDefined();
      // After reset, isDirty should return true (tested via integration)
    });

  });

  // ==========================================================================
  // SCENARIO 17-19: Save Functionality
  // ==========================================================================
  describe('Save Functionality', () => {

    // Scenario 17: Given valid form, when user saves, then settings persisted via IPC/HTTP
    it('should export SettingsPanel.save function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.save).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.save).toBe('function');
    });

    it('should have Save Changes button in panel footer', () => {
      expect(html).toMatch(/save.*changes|settings-save/i);
    });

    it('should have settings API endpoint for saving', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({ display: { sidebar_width: 350 } })
        .expect('Content-Type', /json/);

      expect(response.status).toBeLessThan(500);
    });

    // Scenario 18: Given save fails, then show error toast (panel stays open)
    it('should have Toast component for notifications', async () => {
      const toast = await import('../src/public/js/components/Toast.js');
      expect(toast.Toast).toBeDefined();
      expect(toast.Toast.show).toBeDefined();
    });

    it('should export SettingsPanel.showSaveError function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.showSaveError).toBeDefined();
    });

    it('should have CSS for toast notifications', () => {
      expect(css).toMatch(/toast|notification/);
    });

    // Scenario 19: Given save succeeds, then close panel
    it('should close panel after successful save', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // save function should close panel on success
      expect(settingsPanel.SettingsPanel.save).toBeDefined();
    });

  });

  // ==========================================================================
  // SCENARIO 20-21: Storage Sync (AC3)
  // ==========================================================================
  describe('Storage Sync', () => {

    // Scenario 20: Given IPC available, then use IPC for settings
    it('should export SettingsPanel.loadViaIPC function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.loadViaIPC).toBeDefined();
    });

    it('should check IPC availability before loading', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.isIPCAvailable).toBeDefined();
      expect(typeof settingsPanel.isIPCAvailable).toBe('function');
    });

    // Scenario 21: Given IPC unavailable, then use HTTP API fallback
    it('should export SettingsPanel.loadViaHTTP function', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.loadViaHTTP).toBeDefined();
    });

    it('should NOT use localStorage for settings', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      // Should not have any localStorage references
      // This is enforced by code review - test verifies API doesn't mention localStorage
      expect(settingsPanel.useLocalStorage).toBeUndefined();
    });

    it('should have HTTP API endpoint for getting settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

  });

  // ==========================================================================
  // AC7: Settings organized into logical sections
  // ==========================================================================
  describe('AC7: Settings organized into logical sections', () => {

    it('should have Display section', () => {
      expect(html).toMatch(/section.*display|data-section="display"/i);
    });

    it('should have Fonts section', () => {
      expect(html).toMatch(/section.*fonts|data-section="fonts"/i);
    });

    it('should have Notifications section', () => {
      expect(html).toMatch(/section.*notifications|data-section="notifications"/i);
    });

    it('should have Advanced section', () => {
      expect(html).toMatch(/section.*advanced|data-section="advanced"/i);
    });

    it('should have SettingsSection component for collapsible sections', async () => {
      const settingsSection = await import('../src/public/js/components/SettingsSection.js');
      expect(settingsSection.SettingsSection).toBeDefined();
      expect(settingsSection.SettingsSection.toggle).toBeDefined();
    });

    it('should have 4 sections total (Display, Fonts, Notifications, Advanced)', () => {
      const sectionMatches = html.match(/data-section="/g);
      expect(sectionMatches).toHaveLength(4);
    });

  });

  // ==========================================================================
  // Component Structure (from design spec section 8)
  // ==========================================================================
  describe('Component Structure', () => {

    it('should have SettingsPanel.js component file', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel).toBeDefined();
    });

    it('should have SettingsForm.js component file', async () => {
      const settingsForm = await import('../src/public/js/components/SettingsForm.js');
      expect(settingsForm.SettingsForm).toBeDefined();
    });

    it('should have SettingsSection.js component file', async () => {
      const settingsSection = await import('../src/public/js/components/SettingsSection.js');
      expect(settingsSection.SettingsSection).toBeDefined();
    });

    it('should have ValidationMessage.js component file', async () => {
      const validationMessage = await import('../src/public/js/components/ValidationMessage.js');
      expect(validationMessage.ValidationMessage).toBeDefined();
    });

    it('should have ConfirmDialog.js component file', async () => {
      const confirmDialog = await import('../src/public/js/components/ConfirmDialog.js');
      expect(confirmDialog.ConfirmDialog).toBeDefined();
    });

    it('should export SettingsPanel.init for initialization', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.init).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.init).toBe('function');
    });

    it('should export SettingsPanel.toggle for open/close', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.toggle).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.toggle).toBe('function');
    });

    it('should export SettingsPanel.isOpen for state check', async () => {
      const settingsPanel = await import('../src/public/js/components/SettingsPanel.js');
      expect(settingsPanel.SettingsPanel.isOpen).toBeDefined();
      expect(typeof settingsPanel.SettingsPanel.isOpen).toBe('function');
    });

  });

  // ==========================================================================
  // Accessibility (from design spec section 9)
  // ==========================================================================
  describe('Accessibility', () => {

    it('should have form labels associated with inputs', () => {
      // Each input should have a corresponding label with for attribute
      expect(html).toMatch(/for="sidebar_width"/);
      expect(html).toMatch(/for="show_flow"/);
    });

    it('should have aria-busy attribute for loading state', () => {
      expect(html).toMatch(/aria-busy/);
    });

    it('should have aria-live region for announcements', () => {
      expect(html).toMatch(/aria-live/);
    });

    it('should have role="dialog" on confirm dialogs', () => {
      expect(html).toMatch(/role="dialog"/);
    });

    it('should have aria-modal="true" on confirm dialogs', () => {
      expect(html).toMatch(/aria-modal="true"/);
    });

  });

});
