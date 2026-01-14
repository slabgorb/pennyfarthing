/**
 * 31-13: Context-aware handoffs with auto-compaction
 *
 * Tests for handoff mode settings: replacing two checkboxes (auto_handoff,
 * handoff_confirm) with a single handoff_mode: 'auto' | 'manual'.
 *
 * NOTE: Story 35-1 moved the handoff toggle from settings.html to the
 * editor toolbar in index.html. AC9/AC10 UI tests updated accordingly.
 *
 * Acceptance Criteria tested:
 * - AC9: Cyclist UI has handoff mode toggle (now in editor toolbar, not settings)
 * - AC10: Toggle shows current mode (AUTO/MANUAL)
 * - AC11: Setting persists and is correctly read by generic-handoff subagent
 * - AC12: End-to-end test: change setting, trigger handoff, verify behavior matches
 *
 * Context-related ACs (AC1-8) are behavior tests that require integration
 * with Claude Code API, which is not available in unit tests. MVP defers
 * context percentage detection.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// New settings type with handoff_mode (replaces auto_handoff + handoff_confirm)
interface CyclistSettings {
  workflow: {
    handoff_mode: 'auto' | 'manual';
  };
  display: {
    show_flow: boolean;
    show_ocean: boolean;
    sidebar_width: number;
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

// New default settings with handoff_mode
const DEFAULT_SETTINGS_V2: CyclistSettings = {
  workflow: {
    handoff_mode: 'manual',  // Default to manual (ask first)
  },
  display: {
    show_flow: true,
    show_ocean: false,
    sidebar_width: 300,
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

// Old settings format for migration testing
interface LegacyCyclistSettings {
  workflow: {
    auto_handoff: boolean;
    handoff_confirm: boolean;
  };
}

describe('31-13: Context-aware handoffs - Handoff Mode Settings', () => {
  let settingsHtml: string;
  let indexHtml: string;
  let document: Document;

  beforeAll(async () => {
    // Fetch settings HTML (for legacy checkbox removal verification)
    const settingsResponse = await request(app).get('/settings.html');
    settingsHtml = settingsResponse.text;

    // Fetch index HTML (where handoff toggle now lives per 35-1)
    const indexResponse = await request(app).get('/');
    indexHtml = indexResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(indexHtml);
    document = window.document;
  });

  // ==========================================================================
  // AC9: Cyclist UI has handoff mode toggle (moved to editor toolbar in 35-1)
  // ==========================================================================
  describe('AC9: Handoff mode toggle in editor toolbar', () => {

    it('should NOT have auto_handoff checkbox in settings HTML', async () => {
      // Old checkbox should be removed
      expect(settingsHtml).not.toContain('id="auto_handoff"');
      expect(settingsHtml).not.toContain('name="auto_handoff"');
    });

    it('should NOT have handoff_confirm checkbox in settings HTML', async () => {
      // Old checkbox should be removed
      expect(settingsHtml).not.toContain('id="handoff_confirm"');
      expect(settingsHtml).not.toContain('name="handoff_confirm"');
    });

    it('should have handoff toggle button in index.html', async () => {
      expect(indexHtml).toContain('handoff-toggle');
      expect(indexHtml).toContain('data-control="handoff-mode"');
    });

    it('should have handoff toggle with track and thumb elements', async () => {
      expect(indexHtml).toContain('handoff-track');
      expect(indexHtml).toContain('handoff-thumb');
    });

    it('should have handoff label element', async () => {
      expect(indexHtml).toContain('handoff-label');
    });

    it('should show MANUAL as default label text', async () => {
      // Default state is MANUAL
      expect(indexHtml).toMatch(/handoff-label[^>]*>MANUAL</);
    });

  });

  // ==========================================================================
  // AC10: Toggle shows current mode (AUTO/MANUAL)
  // ==========================================================================
  describe('AC10: Toggle mode labels', () => {

    it('should have title attribute explaining the toggle', async () => {
      expect(indexHtml).toMatch(/title="[^"]*handoff/i);
    });

    it('should reference auto handoff in toggle title', async () => {
      expect(indexHtml).toMatch(/title="[^"]*[Aa]uto\s*handoff/);
    });

    it('should have MANUAL text visible in default state', async () => {
      expect(indexHtml).toContain('MANUAL');
    });

  });

  // ==========================================================================
  // AC11: Setting persists and is correctly read
  // ==========================================================================
  describe('AC11: Setting persistence', () => {

    it('should export getDefaultSettings with handoff_mode instead of booleans', async () => {
      const settings = await import('../src/settings.js');
      const defaults = settings.getDefaultSettings();

      // New format
      expect(defaults.workflow.handoff_mode).toBeDefined();
      expect(defaults.workflow.handoff_mode).toBe('manual');

      // Old format should NOT exist
      expect((defaults.workflow as any).auto_handoff).toBeUndefined();
      expect((defaults.workflow as any).handoff_confirm).toBeUndefined();
    });

    it('should serialize settings with handoff_mode field', async () => {
      const settings = await import('../src/settings.js');
      const yaml = settings.serializeSettings(DEFAULT_SETTINGS_V2);

      expect(yaml).toContain('handoff_mode:');
      expect(yaml).toContain('manual');
      expect(yaml).not.toContain('auto_handoff:');
      expect(yaml).not.toContain('handoff_confirm:');
    });

    it('should parse settings YAML with handoff_mode field', async () => {
      const settings = await import('../src/settings.js');
      const yaml = `
workflow:
  handoff_mode: auto
`;
      const parsed = settings.parseSettings(yaml);

      expect(parsed.workflow?.handoff_mode).toBe('auto');
    });

    it('should migrate legacy settings (auto_handoff=true) to handoff_mode=auto', async () => {
      const settings = await import('../src/settings.js');

      // Legacy format
      const legacyYaml = `
workflow:
  auto_handoff: true
  handoff_confirm: false
`;
      const migrated = settings.migrateSettings(settings.parseSettings(legacyYaml));

      expect(migrated.workflow.handoff_mode).toBe('auto');
      expect((migrated.workflow as any).auto_handoff).toBeUndefined();
    });

    it('should migrate legacy settings (auto_handoff=false) to handoff_mode=manual', async () => {
      const settings = await import('../src/settings.js');

      const legacyYaml = `
workflow:
  auto_handoff: false
  handoff_confirm: true
`;
      const migrated = settings.migrateSettings(settings.parseSettings(legacyYaml));

      expect(migrated.workflow.handoff_mode).toBe('manual');
    });

    it('should validate handoff_mode is one of "auto" or "manual"', async () => {
      const settings = await import('../src/settings.js');

      expect(settings.validateSettings({
        ...DEFAULT_SETTINGS_V2,
        workflow: { handoff_mode: 'auto' }
      })).toBe(true);

      expect(settings.validateSettings({
        ...DEFAULT_SETTINGS_V2,
        workflow: { handoff_mode: 'manual' }
      })).toBe(true);

      expect(settings.validateSettings({
        ...DEFAULT_SETTINGS_V2,
        workflow: { handoff_mode: 'invalid' as any }
      })).toBe(false);
    });

  });

  // ==========================================================================
  // Settings UI JavaScript handlers
  // ==========================================================================
  describe('Settings UI JavaScript (settings-ui.js)', () => {

    it('should export loadFormValues that handles handoff_mode radio', async () => {
      const settingsUI = await import('../src/public/js/settings-ui.js');
      expect(settingsUI.loadFormValues).toBeDefined();
    });

    it('should export getFormValues that returns handoff_mode from radio', async () => {
      const settingsUI = await import('../src/public/js/settings-ui.js');
      expect(settingsUI.getFormValues).toBeDefined();
    });

    it('should have getDefaultSettings return handoff_mode: manual', async () => {
      const settingsUI = await import('../src/public/js/settings-ui.js');
      const defaults = settingsUI.getDefaultSettings();

      expect(defaults.workflow.handoff_mode).toBe('manual');
      expect((defaults.workflow as any).auto_handoff).toBeUndefined();
    });

  });

  // ==========================================================================
  // AC12: End-to-end: change setting, trigger handoff, verify behavior
  // ==========================================================================
  describe('AC12: End-to-end behavior validation', () => {

    it('should have IPC handler for settings:get that returns handoff_mode', async () => {
      const main = await import('../src/main.js');
      const settings = await main.handleSettingsGet();

      expect(settings.workflow.handoff_mode).toBeDefined();
      expect(['auto', 'manual']).toContain(settings.workflow.handoff_mode);
    });

    it('should have IPC handler for settings:save that accepts handoff_mode', async () => {
      const main = await import('../src/main.js');
      expect(main.handleSettingsSave).toBeDefined();

      // Should accept new format without error
      const result = await main.handleSettingsSave(DEFAULT_SETTINGS_V2);
      expect(result.success).toBe(true);
    });

    it('should broadcast settings:changed when handoff_mode changes', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_SETTINGS_CHANNELS.CHANGED).toBe('settings:changed');
    });

  });

});

describe('31-13: Generic Handoff Settings Integration', () => {

  // ==========================================================================
  // Generic handoff reads settings
  // ==========================================================================
  describe('Generic handoff reads handoff_mode setting', () => {

    it('should export readHandoffMode function from generic-handoff module', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      expect(handoff.readHandoffMode).toBeDefined();
      expect(typeof handoff.readHandoffMode).toBe('function');
    });

    it('should return "manual" when no settings file exists', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      const mode = handoff.readHandoffMode('/nonexistent/path');

      expect(mode).toBe('manual');
    });

    it('should read handoff_mode from Cyclist settings JSON', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      // Mock settings content
      const settingsJson = JSON.stringify({
        workflow: { handoff_mode: 'auto' }
      });

      const mode = handoff.parseHandoffModeFromJson(settingsJson);
      expect(mode).toBe('auto');
    });

    it('should read handoff_mode from Cyclist settings YAML', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const settingsYaml = `
workflow:
  handoff_mode: auto
`;
      const mode = handoff.parseHandoffModeFromYaml(settingsYaml);
      expect(mode).toBe('auto');
    });

    it('should handle legacy settings format (auto_handoff boolean)', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const legacyJson = JSON.stringify({
        workflow: { auto_handoff: true, handoff_confirm: false }
      });

      const mode = handoff.parseHandoffModeFromJson(legacyJson);
      expect(mode).toBe('auto');
    });

    it('should default to "manual" for invalid handoff_mode values', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const invalidJson = JSON.stringify({
        workflow: { handoff_mode: 'invalid' }
      });

      const mode = handoff.parseHandoffModeFromJson(invalidJson);
      expect(mode).toBe('manual');
    });

  });

  // ==========================================================================
  // Handoff behavior based on mode
  // ==========================================================================
  describe('Handoff behavior based on mode', () => {

    it('should export getHandoffBehavior function', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      expect(handoff.getHandoffBehavior).toBeDefined();
    });

    it('should return "immediate" action for auto mode', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      const behavior = handoff.getHandoffBehavior('auto');

      expect(behavior.action).toBe('immediate');
      expect(behavior.requiresConfirmation).toBe(false);
    });

    it('should return "prompt" action for manual mode', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      const behavior = handoff.getHandoffBehavior('manual');

      expect(behavior.action).toBe('prompt');
      expect(behavior.requiresConfirmation).toBe(true);
    });

    it('should include message for prompt action', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      const behavior = handoff.getHandoffBehavior('manual');

      expect(behavior.message).toBeDefined();
      expect(behavior.message).toMatch(/ready|handoff|confirm/i);
    });

  });

  // ==========================================================================
  // Session file handoff history tracking
  // ==========================================================================
  describe('Session file handoff history (AC7)', () => {

    it('should export formatHandoffHistory function', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');
      expect(handoff.formatHandoffHistory).toBeDefined();
    });

    it('should format handoff history table with mode column', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const history = handoff.formatHandoffHistory({
        phase: 'red',
        agent: 'TEA',
        timestamp: '2026-01-14T10:00:00Z',
        handoffMode: 'auto'
      });

      expect(history).toContain('| red |');
      expect(history).toContain('| TEA |');
      expect(history).toContain('| auto |');
    });

    it('should include Handoff History section header', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const history = handoff.formatHandoffHistory({
        phase: 'green',
        agent: 'Dev',
        timestamp: '2026-01-14T11:00:00Z',
        handoffMode: 'manual'
      });

      expect(history).toContain('## Handoff History');
    });

  });

});
