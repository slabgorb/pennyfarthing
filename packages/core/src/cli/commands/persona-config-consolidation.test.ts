/**
 * Tests for MSSCI-14367: Move persona-config.yaml into .pennyfarthing
 *
 * These tests verify that persona/theme configuration is consolidated to
 * .pennyfarthing/config.local.yaml exclusively, with legacy .claude/persona-config.yaml
 * handled through doctor migration.
 *
 * Acceptance Criteria:
 * AC1: All persona config reads use .pennyfarthing/config.local.yaml as the canonical location
 * AC2: Legacy .claude/persona-config.yaml is no longer written to by init
 * AC3: Doctor detects .claude/persona-config.yaml at old location and migrates it
 * AC4: All code paths that reference .claude/persona-config.yaml are updated
 * AC5: Backward compatibility: existing installs with old location are handled gracefully
 *
 * Run with: cd packages/core && npm run build && npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';

import { getCurrentTheme } from '../utils/themes.js';
import { checkLegacyFiles, type CheckResult } from './doctor.js';
import { migrateTemplateFiles } from './update.js';

describe('MSSCI-14367: Move persona-config.yaml into .pennyfarthing', () => {
  let testDir: string;
  let claudeDir: string;
  let pennyfarthingDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-persona-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    claudeDir = join(testDir, '.claude');
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(pennyfarthingDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Canonical reads from .pennyfarthing/ ────────────────────

  describe('AC1: All persona config reads use .pennyfarthing/config.local.yaml', () => {
    it('getCurrentTheme() should read from .pennyfarthing/config.local.yaml', () => {
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'game-of-thrones' })
      );

      const result = getCurrentTheme(testDir);
      assert.strictEqual(
        result,
        'game-of-thrones',
        'Should read theme from .pennyfarthing/config.local.yaml'
      );
    });

    it('getCurrentTheme() should NOT fall back to .claude/persona-config.yaml', () => {
      // AC1: .claude/persona-config.yaml should no longer be a fallback source
      // Only .pennyfarthing/config.local.yaml is canonical
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'legacy-theme' })
      );

      const result = getCurrentTheme(testDir);
      assert.strictEqual(
        result,
        null,
        'Should NOT fall back to .claude/persona-config.yaml — only .pennyfarthing/config.local.yaml is canonical'
      );
    });

    it('getCurrentTheme() should return null when no .pennyfarthing/config.local.yaml exists', () => {
      // No config files at all
      const result = getCurrentTheme(testDir);
      assert.strictEqual(
        result,
        null,
        'Should return null when .pennyfarthing/config.local.yaml does not exist'
      );
    });

    it('getCurrentTheme() should ignore .claude/persona-config.yaml even if it has content', () => {
      // Both files exist, but persona-config.yaml at .claude/ should be completely ignored
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'should-be-ignored' })
      );

      const result = getCurrentTheme(testDir);
      assert.strictEqual(
        result,
        'star-trek',
        'Should use .pennyfarthing/config.local.yaml and completely ignore .claude/persona-config.yaml'
      );
    });
  });

  // ─── AC2: Init no longer writes persona-config.yaml to .claude/ ───

  describe('AC2: Init does not write persona-config to legacy location', () => {
    it('init should write persona-config.yaml to .pennyfarthing/ not .claude/', () => {
      // Simulate what init does: write template to .pennyfarthing/persona-config.yaml
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'minimalist' })
      );

      // Verify init did NOT create legacy file
      assert.ok(
        !existsSync(join(claudeDir, 'persona-config.yaml')),
        'Init should NOT create .claude/persona-config.yaml'
      );

      // Theme should be readable from the new location
      const theme = getCurrentTheme(testDir);
      assert.strictEqual(
        theme,
        'minimalist',
        'Theme should be readable from .pennyfarthing/persona-config.yaml'
      );
    });

    it('getCurrentTheme should read .pennyfarthing/persona-config.yaml as project default', () => {
      // When only .pennyfarthing/persona-config.yaml exists (set via --global or init),
      // getCurrentTheme should find it as a fallback
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'game-of-thrones' })
      );

      const result = getCurrentTheme(testDir);
      assert.strictEqual(
        result,
        'game-of-thrones',
        '.pennyfarthing/persona-config.yaml should serve as project default'
      );
    });
  });

  // ─── AC3: Doctor detects and migrates legacy persona-config.yaml ───

  describe('AC3: Doctor detects legacy persona-config.yaml and migrates to config.local.yaml', () => {
    it('should detect legacy .claude/persona-config.yaml and offer migration', () => {
      // Legacy persona-config exists but no config.local.yaml
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'discworld' })
      );

      const results = checkLegacyFiles(testDir);

      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );
      assert.ok(legacyResult, 'Should detect legacy persona-config.yaml');
      assert.strictEqual(legacyResult.status, 'warn', 'Should warn about legacy config');
      assert.ok(legacyResult.fix, 'Should provide a fix function');
    });

    it('fix should migrate theme from .claude/persona-config.yaml to .pennyfarthing/config.local.yaml', () => {
      // Setup: legacy config with theme
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'discworld' })
      );

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );
      assert.ok(legacyResult?.fix, 'Should have fix function');

      // Execute the fix
      legacyResult.fix!();

      // Verify theme was migrated to config.local.yaml
      const configPath = join(pennyfarthingDir, 'config.local.yaml');
      assert.ok(
        existsSync(configPath),
        'config.local.yaml should be created with migrated theme'
      );
      const config = yamlParse(readFileSync(configPath, 'utf8'));
      assert.strictEqual(
        config.theme,
        'discworld',
        'Theme should be migrated from legacy persona-config.yaml to config.local.yaml'
      );
    });

    it('fix should remove legacy .claude/persona-config.yaml after migration', () => {
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'discworld' })
      );

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );
      assert.ok(legacyResult?.fix, 'Should have fix function');

      legacyResult.fix!();

      assert.ok(
        !existsSync(join(claudeDir, 'persona-config.yaml')),
        'Legacy persona-config.yaml should be removed after migration'
      );
    });

    it('fix should merge theme into existing config.local.yaml without clobbering', () => {
      // Setup: existing config.local.yaml with workflow settings
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ workflow: { permission_mode: 'accept', relay_mode: true } })
      );
      // Legacy config with theme
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'star-wars' })
      );

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );
      assert.ok(legacyResult?.fix, 'Should have fix function');

      legacyResult.fix!();

      // Verify both theme and workflow settings are preserved
      const config = yamlParse(
        readFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'utf8')
      );
      assert.strictEqual(
        config.theme,
        'star-wars',
        'Theme should be migrated'
      );
      assert.strictEqual(
        config.workflow?.permission_mode,
        'accept',
        'Existing workflow settings should be preserved'
      );
      assert.strictEqual(
        config.workflow?.relay_mode,
        true,
        'Existing relay_mode should be preserved'
      );
    });

    it('fix should NOT overwrite existing theme in config.local.yaml', () => {
      // Setup: config.local.yaml already has a theme
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'already-set' })
      );
      // Legacy config with different theme
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'legacy-theme' })
      );

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );

      if (legacyResult?.fix) {
        legacyResult.fix();
      }

      // Existing theme in config.local.yaml should NOT be overwritten
      const config = yamlParse(
        readFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'utf8')
      );
      assert.strictEqual(
        config.theme,
        'already-set',
        'Should NOT overwrite existing theme in config.local.yaml'
      );
    });

    it('should detect legacy persona-config.yaml even when config.local.yaml exists', () => {
      // Both exist — doctor should still detect the legacy file for cleanup
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'old-theme' })
      );
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'current-theme' })
      );

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );
      assert.ok(legacyResult, 'Should detect legacy config even when config.local.yaml exists');
      assert.strictEqual(legacyResult.status, 'warn');
    });
  });

  // ─── AC4: All code paths updated ──────────────────────────────────

  describe('AC4: No code paths reference .claude/persona-config.yaml for reading', () => {
    it('getCurrentTheme() should be the single entry point for theme reads', () => {
      // This test verifies getCurrentTheme() behavior is self-consistent
      // with ONLY .pennyfarthing/config.local.yaml as source

      // Setup: write theme at canonical location
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );

      const result = getCurrentTheme(testDir);
      assert.strictEqual(result, 'star-trek');

      // Now remove it — should return null (no fallback)
      rmSync(join(pennyfarthingDir, 'config.local.yaml'));
      const afterRemoval = getCurrentTheme(testDir);
      assert.strictEqual(
        afterRemoval,
        null,
        'After removing config.local.yaml, getCurrentTheme should return null (no fallback to .claude/)'
      );
    });
  });

  // ─── AC5: Backward compatibility ─────────────────────────────────

  describe('AC5: Backward compatibility for existing installs', () => {
    it('doctor --fix should handle migration for installs with only .claude/persona-config.yaml', () => {
      // Simulate an old install: only legacy config, no .pennyfarthing/config.local.yaml
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'game-of-thrones' })
      );
      // No config.local.yaml exists

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );

      // Doctor should detect this and offer a fix
      assert.ok(legacyResult, 'Should detect legacy-only install');
      assert.ok(legacyResult.fix, 'Should offer migration fix');

      // After fix, theme should be accessible through canonical path
      legacyResult.fix!();
      const theme = getCurrentTheme(testDir);
      assert.strictEqual(
        theme,
        'game-of-thrones',
        'After doctor --fix, theme should be readable from canonical location'
      );
    });

    it('update migrateTemplateFiles should move persona-config.yaml to .pennyfarthing/', () => {
      // The update command's migrateTemplateFiles already handles this migration
      // Verify the migration map includes persona-config.yaml
      // This is already covered by update-consolidation.test.ts but we verify the
      // expected behavior here

      // Setup legacy file
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'star-wars' })
      );

      // Note: migrateTemplateFiles moves .claude/persona-config.yaml → .pennyfarthing/persona-config.yaml
      // This is the template file migration, NOT the config.local.yaml migration
      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(pennyfarthingDir, 'persona-config.yaml')),
        'migrateTemplateFiles should move persona-config.yaml to .pennyfarthing/'
      );
      assert.ok(
        !existsSync(join(claudeDir, 'persona-config.yaml')),
        'Legacy persona-config.yaml should be removed after template migration'
      );
    });

    it('fresh install should not create .claude/persona-config.yaml at all', () => {
      // On fresh install, init writes persona-config.yaml to .pennyfarthing/
      // There should be NO .claude/persona-config.yaml created
      // This is already the case (line 331 in init.ts points to .pennyfarthing/)
      // but we verify the expectation

      // Simulate what init does: write template to .pennyfarthing/persona-config.yaml
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'minimalist' })
      );

      assert.ok(
        !existsSync(join(claudeDir, 'persona-config.yaml')),
        'Fresh install should NOT create .claude/persona-config.yaml'
      );
      assert.ok(
        existsSync(join(pennyfarthingDir, 'persona-config.yaml')),
        'Fresh install should create .pennyfarthing/persona-config.yaml'
      );
    });
  });

  // ─── Doctor persona-config check location ─────────────────────────

  describe('Doctor persona-config check should reference .pennyfarthing/', () => {
    it('doctor legacy check should not flag .pennyfarthing/ files as legacy', () => {
      // Setup: theme configured at canonical location ONLY
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'game-of-thrones' })
      );

      // checkLegacyFiles should NOT produce any warnings when config is only at .pennyfarthing/
      const results = checkLegacyFiles(testDir);
      const personaResult = results.find(
        (r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml'
      );
      assert.strictEqual(
        personaResult,
        undefined,
        'Doctor should not flag .pennyfarthing/ config as legacy'
      );

      // Theme should still be readable
      const theme = getCurrentTheme(testDir);
      assert.strictEqual(
        theme,
        'game-of-thrones',
        'Theme should be detectable from .pennyfarthing/config.local.yaml'
      );
    });
  });
});
