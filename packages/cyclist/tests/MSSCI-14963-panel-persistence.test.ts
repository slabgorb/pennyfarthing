/**
 * MSSCI-14963: Panel persistence (extend ERB mechanism)
 *
 * Story 103-8, Epic 103: BikeRack TUI — Terminal-Native Dashboard
 *
 * Acceptance Criteria:
 * - AC1: getLastPanel() reads last_panel from config.local.yaml
 * - AC2: saveLastPanel() writes last_panel to config.local.yaml
 * - AC3: Preserves other config keys when saving
 * - AC4: Validates panel names against VALID_FOCUS_PANELS
 * - AC5: Handles missing/corrupt config gracefully
 *
 * Tests should FAIL until persistence is implemented in focus.ts.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';

import {
  getLastPanel,
  saveLastPanel,
  VALID_FOCUS_PANELS,
} from '../src/focus.js';

// =============================================================================
// AC1: getLastPanel reads last_panel from config.local.yaml
// =============================================================================

describe('AC1: getLastPanel — reads last_panel from config.local.yaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'panel-persist-test-'));
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return panel name when last_panel key exists', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nlast_panel: git\n',
    );
    const result = getLastPanel(tmpDir);
    expect(result).toBe('git');
  });

  it('should return null when last_panel key is not present', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\n',
    );
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should return null when last_panel is explicitly null', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nlast_panel: null\n',
    );
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should return null when config file does not exist', () => {
    // No config file created
    rmSync(join(tmpDir, '.pennyfarthing'), { recursive: true, force: true });
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should return null for invalid panel name', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'last_panel: nonexistent_panel\n',
    );
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should return each valid panel name correctly', () => {
    for (const panel of VALID_FOCUS_PANELS) {
      writeFileSync(
        join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
        `last_panel: ${panel}\n`,
      );
      const result = getLastPanel(tmpDir);
      expect(result).toBe(panel);
    }
  });
});

// =============================================================================
// AC2: saveLastPanel writes last_panel to config.local.yaml
// =============================================================================

describe('AC2: saveLastPanel — writes last_panel to config.local.yaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'panel-persist-test-'));
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write panel name to config', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\n',
    );

    const success = saveLastPanel(tmpDir, 'sprint');

    expect(success).toBe(true);

    const content = readFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'utf-8',
    );
    const config = parseYaml(content) as Record<string, unknown>;
    expect(config.last_panel).toBe('sprint');
  });

  it('should preserve other config keys', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nfocus: diffs\nbell_mode: true\n',
    );

    const success = saveLastPanel(tmpDir, 'git');

    expect(success).toBe(true);

    const content = readFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'utf-8',
    );
    const config = parseYaml(content) as Record<string, unknown>;
    expect(config.theme).toBe('fifth-element');
    expect(config.focus).toBe('diffs');
    expect(config.bell_mode).toBe(true);
    expect(config.last_panel).toBe('git');
  });

  it('should create config file if it does not exist', () => {
    // .pennyfarthing dir exists but no config.local.yaml
    const configPath = join(tmpDir, '.pennyfarthing', 'config.local.yaml');
    expect(existsSync(configPath)).toBe(false);

    const success = saveLastPanel(tmpDir, 'workflow');

    expect(success).toBe(true);
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content) as Record<string, unknown>;
    expect(config.last_panel).toBe('workflow');
  });

  it('should reject invalid panel names', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\n',
    );

    const success = saveLastPanel(tmpDir, 'nonexistent');

    expect(success).toBe(false);

    // Config should not be modified
    const content = readFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'utf-8',
    );
    const config = parseYaml(content) as Record<string, unknown>;
    expect(config.last_panel).toBeUndefined();
  });

  it('should overwrite existing last_panel value', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'last_panel: sprint\n',
    );

    const success = saveLastPanel(tmpDir, 'git');

    expect(success).toBe(true);

    const content = readFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'utf-8',
    );
    const config = parseYaml(content) as Record<string, unknown>;
    expect(config.last_panel).toBe('git');
  });
});

// =============================================================================
// AC5: Handles missing/corrupt config gracefully
// =============================================================================

describe('AC5: Edge cases — graceful handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'panel-persist-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should handle missing .pennyfarthing directory on read', () => {
    // No .pennyfarthing dir
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should handle empty config file on read', () => {
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      '',
    );
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should handle malformed YAML on read', () => {
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      '{{{{not valid yaml}}}}',
    );
    // Should not throw — return null gracefully
    const result = getLastPanel(tmpDir);
    expect(result).toBeNull();
  });

  it('should roundtrip correctly — read after write', () => {
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\n',
    );

    const saved = saveLastPanel(tmpDir, 'todo');
    expect(saved).toBe(true);

    const result = getLastPanel(tmpDir);
    expect(result).toBe('todo');
  });
});
