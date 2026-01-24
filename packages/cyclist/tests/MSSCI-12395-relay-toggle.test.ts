/**
 * MSSCI-12395: Refactor turbo mode into independent relay toggle
 *
 * Tests for splitting 'turbo' mode into:
 * - Gearshift modes (mutually exclusive): plan, manual, accept
 * - Relay mode (independent toggle): on/off
 *
 * TDD Phase: RED
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';
import {
  PermissionMode,
  WorkflowSettings,
  CyclistSettings,
  validateSettings,
  migrateSettings,
  mergeSettings,
  getDefaultSettings,
  loadSettings,
  saveProjectSettings,
  parseSettings,
} from '../src/settings.js';

// =============================================================================
// Type System Tests
// =============================================================================

describe('MSSCI-12395: Type System - PermissionMode', () => {
  it('should NOT include "turbo" as a valid PermissionMode', () => {
    // This is a compile-time check, but we can verify runtime behavior
    const validModes: PermissionMode[] = ['plan', 'manual', 'accept'];

    // TypeScript should error if we try to include 'turbo'
    // At runtime, we verify the validation logic rejects it
    const result = validateSettings({
      workflow: { permission_mode: 'turbo' }
    });

    expect(result).toBe(false);
  });

  it('should accept "plan" as valid PermissionMode', () => {
    const result = validateSettings({
      workflow: { permission_mode: 'plan' }
    });
    expect(result).toBe(true);
  });

  it('should accept "manual" as valid PermissionMode', () => {
    const result = validateSettings({
      workflow: { permission_mode: 'manual' }
    });
    expect(result).toBe(true);
  });

  it('should accept "accept" as valid PermissionMode', () => {
    const result = validateSettings({
      workflow: { permission_mode: 'accept' }
    });
    expect(result).toBe(true);
  });
});

describe('MSSCI-12395: Type System - WorkflowSettings.relay_mode', () => {
  it('should accept relay_mode: true in WorkflowSettings', () => {
    const result = validateSettings({
      workflow: {
        permission_mode: 'accept',
        relay_mode: true
      }
    });
    expect(result).toBe(true);
  });

  it('should accept relay_mode: false in WorkflowSettings', () => {
    const result = validateSettings({
      workflow: {
        permission_mode: 'manual',
        relay_mode: false
      }
    });
    expect(result).toBe(true);
  });

  it('should default relay_mode to false when not specified', () => {
    const defaults = getDefaultSettings();
    expect(defaults.workflow.relay_mode).toBe(false);
  });
});

// =============================================================================
// Migration Tests
// =============================================================================

describe('MSSCI-12395: Migration - turbo to accept + relay', () => {
  it('should migrate permission_mode: "turbo" to accept + relay_mode: true', () => {
    const legacy = {
      workflow: { permission_mode: 'turbo' }
    };

    const migrated = migrateSettings(legacy);

    expect(migrated.workflow.permission_mode).toBe('accept');
    expect(migrated.workflow.relay_mode).toBe(true);
  });

  it('should preserve accept mode without adding relay_mode', () => {
    const settings = {
      workflow: { permission_mode: 'accept' }
    };

    const migrated = migrateSettings(settings);

    expect(migrated.workflow.permission_mode).toBe('accept');
    expect(migrated.workflow.relay_mode).toBe(false);
  });

  it('should preserve manual mode without adding relay_mode', () => {
    const settings = {
      workflow: { permission_mode: 'manual' }
    };

    const migrated = migrateSettings(settings);

    expect(migrated.workflow.permission_mode).toBe('manual');
    expect(migrated.workflow.relay_mode).toBe(false);
  });

  it('should preserve plan mode without adding relay_mode', () => {
    const settings = {
      workflow: { permission_mode: 'plan' }
    };

    const migrated = migrateSettings(settings);

    expect(migrated.workflow.permission_mode).toBe('plan');
    expect(migrated.workflow.relay_mode).toBe(false);
  });

  it('should migrate legacy handoff_mode: "auto" to relay_mode: true', () => {
    const legacy = {
      workflow: { handoff_mode: 'auto' }
    };

    const migrated = migrateSettings(legacy);

    expect(migrated.workflow.relay_mode).toBe(true);
  });

  it('should migrate legacy handoff_mode: "manual" to relay_mode: false', () => {
    const legacy = {
      workflow: { handoff_mode: 'manual' }
    };

    const migrated = migrateSettings(legacy);

    expect(migrated.workflow.relay_mode).toBe(false);
  });

  it('should migrate combined permission_mode + handoff_mode: auto (reviewer fix)', () => {
    // Bug found during review: users could have manual permission + auto handoff
    // The migration should preserve both settings
    const legacy = {
      workflow: {
        permission_mode: 'manual',
        handoff_mode: 'auto'
      }
    };

    const migrated = migrateSettings(legacy);

    expect(migrated.workflow.permission_mode).toBe('manual');
    expect(migrated.workflow.relay_mode).toBe(true);
  });

  it('should migrate combined permission_mode + handoff_mode: manual', () => {
    const legacy = {
      workflow: {
        permission_mode: 'accept',
        handoff_mode: 'manual'
      }
    };

    const migrated = migrateSettings(legacy);

    expect(migrated.workflow.permission_mode).toBe('accept');
    expect(migrated.workflow.relay_mode).toBe(false);
  });

  it('should handle explicit relay_mode in config (no migration needed)', () => {
    const settings = {
      workflow: {
        permission_mode: 'manual',
        relay_mode: true
      }
    };

    const migrated = migrateSettings(settings);

    expect(migrated.workflow.permission_mode).toBe('manual');
    expect(migrated.workflow.relay_mode).toBe(true);
  });
});

// =============================================================================
// Settings Merge Tests
// =============================================================================

describe('MSSCI-12395: Settings Merge - relay_mode', () => {
  it('should merge relay_mode override into base settings', () => {
    const base = getDefaultSettings();
    const override = {
      workflow: { relay_mode: true }
    };

    const merged = mergeSettings(base, override);

    expect(merged.workflow.relay_mode).toBe(true);
  });

  it('should NOT allow turbo in merge override', () => {
    const base = getDefaultSettings();
    const override = {
      workflow: { permission_mode: 'turbo' as PermissionMode }
    };

    const merged = mergeSettings(base, override);

    // Should reject turbo and keep base value
    expect(merged.workflow.permission_mode).toBe('manual');
  });

  it('should preserve relay_mode: false when merging unrelated changes', () => {
    const base: CyclistSettings = {
      workflow: {
        permission_mode: 'accept',
        relay_mode: false
      }
    };
    const override = {
      accounts: { default: { billing_rollover_day: 'monday' as const } }
    };

    const merged = mergeSettings(base, override);

    expect(merged.workflow.relay_mode).toBe(false);
  });
});

// =============================================================================
// Settings API Tests
// =============================================================================

describe('MSSCI-12395: Settings API', () => {
  it('should accept relay_mode in PATCH /api/settings', async () => {
    const response = await request(app)
      .patch('/api/settings')
      .send({
        workflow: {
          permission_mode: 'accept',
          relay_mode: true
        }
      });

    expect(response.status).toBeLessThan(400);
  });

  it('should reject turbo in PATCH /api/settings', async () => {
    const response = await request(app)
      .patch('/api/settings')
      .send({
        workflow: {
          permission_mode: 'turbo'
        }
      });

    // Should return 400 Bad Request
    expect(response.status).toBe(400);
  });

  it('should return relay_mode in GET /api/settings', async () => {
    // First set relay_mode
    await request(app)
      .patch('/api/settings')
      .send({
        workflow: {
          permission_mode: 'manual',
          relay_mode: true
        }
      });

    const response = await request(app).get('/api/settings');

    expect(response.status).toBe(200);
    expect(response.body.workflow.relay_mode).toBe(true);
  });
});

// =============================================================================
// UI Tests - Gearshift Control
// =============================================================================

describe('MSSCI-12395: UI - Gearshift Control', () => {
  let indexHtml: string;
  let indexDocument: Document;

  beforeEach(async () => {
    const response = await request(app).get('/');
    indexHtml = response.text;

    const window = new Window();
    window.document.write(indexHtml);
    indexDocument = window.document;
  });

  it('should have mode switch with THREE segments (not four)', () => {
    const modeSwitch = indexDocument.querySelector('[data-control="mode-switch"]');
    expect(modeSwitch).not.toBeNull();

    const segments = modeSwitch!.querySelectorAll('.mode-switch-segment');
    expect(segments.length).toBe(3);
  });

  it('should NOT have TURBO segment', () => {
    const turboSegment = indexDocument.querySelector('[data-mode="turbo"]');
    expect(turboSegment).toBeNull();
  });

  it('should have PLAN segment', () => {
    const planSegment = indexDocument.querySelector('[data-mode="plan"]');
    expect(planSegment).not.toBeNull();
  });

  it('should have MANUAL segment', () => {
    const manualSegment = indexDocument.querySelector('[data-mode="manual"]');
    expect(manualSegment).not.toBeNull();
  });

  it('should have ACCEPT segment', () => {
    const acceptSegment = indexDocument.querySelector('[data-mode="accept"]');
    expect(acceptSegment).not.toBeNull();
  });

  it('should have separate relay toggle control', () => {
    const relayToggle = indexDocument.querySelector('[data-control="relay-toggle"]');
    expect(relayToggle).not.toBeNull();
  });

  it('should have relay toggle with on/off states', () => {
    const relayToggle = indexDocument.querySelector('[data-control="relay-toggle"]');
    expect(relayToggle).not.toBeNull();

    // Should have aria-pressed for toggle state (consistent with bell toggle)
    const ariaPressed = relayToggle!.getAttribute('aria-pressed');
    expect(['true', 'false']).toContain(ariaPressed);
  });
});

// =============================================================================
// Backward Compatibility Tests
// =============================================================================

describe('MSSCI-12395: Backward Compatibility', () => {
  it('should still have isTurboModeEnabled for legacy code', async () => {
    // Import should succeed (function exists for compatibility)
    const settings = await import('../src/settings.js');
    expect(typeof settings.isTurboModeEnabled).toBe('function');
  });

  it('should map accept + relay_mode: true to isTurboModeEnabled() returning true', async () => {
    const { isTurboModeEnabled } = await import('../src/settings.js');

    const settings: CyclistSettings = {
      workflow: {
        permission_mode: 'accept',
        relay_mode: true
      }
    };

    // Legacy function should consider this equivalent to "turbo"
    expect(isTurboModeEnabled(settings)).toBe(true);
  });

  it('should map accept + relay_mode: false to isTurboModeEnabled() returning false', async () => {
    const { isTurboModeEnabled } = await import('../src/settings.js');

    const settings: CyclistSettings = {
      workflow: {
        permission_mode: 'accept',
        relay_mode: false
      }
    };

    expect(isTurboModeEnabled(settings)).toBe(false);
  });
});

// =============================================================================
// YAML Parsing Tests
// =============================================================================

describe('MSSCI-12395: YAML Config Parsing', () => {
  it('should parse relay_mode: true from YAML', () => {
    const yaml = `
workflow:
  permission_mode: accept
  relay_mode: true
`;
    const parsed = parseSettings(yaml);
    expect(parsed.workflow?.relay_mode).toBe(true);
  });

  it('should parse relay_mode: false from YAML', () => {
    const yaml = `
workflow:
  permission_mode: manual
  relay_mode: false
`;
    const parsed = parseSettings(yaml);
    expect(parsed.workflow?.relay_mode).toBe(false);
  });

  it('should handle missing relay_mode gracefully', () => {
    const yaml = `
workflow:
  permission_mode: accept
`;
    const parsed = parseSettings(yaml);
    // Should parse without error, relay_mode undefined
    expect(parsed.workflow?.permission_mode).toBe('accept');
  });
});
