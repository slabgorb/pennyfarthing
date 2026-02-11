/**
 * Tests for MSSCI-14372: Update doctor to validate new file layout
 *
 * Tests verify:
 * - checkFileLayout() detects files at correct .pennyfarthing/ locations
 * - checkFileLayout() flags files at old .claude/ locations with migration instructions
 * - Fix functions migrate files automatically
 * - New "layout/" check category is used for result names
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import the new function - does NOT exist yet, tests will fail (RED)
import {
  checkFileLayout,
  type CheckResult
} from './doctor.js';

describe('MSSCI-14372: Doctor file layout validation', () => {
  let testDir: string;
  let claudeDir: string;
  let pennyfarthingDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pf-layout-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  describe('Result naming convention', () => {
    it('should use layout/ prefix for all results', () => {
      // AC5: New check category "File Layout"
      // Setup: valid layout so we get pass results
      mkdirSync(join(pennyfarthingDir, 'scripts/misc'), { recursive: true });
      writeFileSync(join(pennyfarthingDir, 'manifest.json'), JSON.stringify({ version: '10.0.0' }));
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: west-wing');

      const results = checkFileLayout(testDir);

      assert.ok(results.length > 0, 'Should return at least one result');
      for (const result of results) {
        assert.ok(
          result.name.startsWith('layout/'),
          `Result name "${result.name}" should start with "layout/"`
        );
      }
    });
  });

  describe('Manifest validation', () => {
    it('should pass when manifest exists at .pennyfarthing/manifest.json', () => {
      // AC1: Doctor checks files are in correct .pennyfarthing/ locations
      writeFileSync(
        join(pennyfarthingDir, 'manifest.json'),
        JSON.stringify({ version: '10.0.0', installationType: 'symlink' })
      );

      const results = checkFileLayout(testDir);
      const manifestResult = results.find((r: CheckResult) => r.name === 'layout/manifest');

      assert.ok(manifestResult, 'Should have a manifest check result');
      assert.strictEqual(manifestResult.status, 'pass', 'Should pass when manifest exists');
    });

    it('should fail when manifest is missing from .pennyfarthing/', () => {
      // AC1: Doctor checks files are in correct .pennyfarthing/ locations
      const results = checkFileLayout(testDir);
      const manifestResult = results.find((r: CheckResult) => r.name === 'layout/manifest');

      assert.ok(manifestResult, 'Should have a manifest check result');
      assert.strictEqual(manifestResult.status, 'fail', 'Should fail when manifest missing');
    });
  });

  describe('Config validation', () => {
    it('should pass when config exists at .pennyfarthing/config.local.yaml', () => {
      // AC1: correct location
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: west-wing');

      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have a config check result');
      assert.strictEqual(configResult.status, 'pass', 'Should pass when config exists');
    });

    it('should warn when config is missing from .pennyfarthing/', () => {
      // AC1: flag missing files
      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have a config check result');
      assert.strictEqual(configResult.status, 'warn', 'Should warn when config missing');
    });

    it('should flag config at old .claude/persona-config.yaml with migration instructions', () => {
      // AC2: flags old .claude/ locations with migration instructions
      writeFileSync(join(claudeDir, 'persona-config.yaml'), 'theme: star-wars');

      const results = checkFileLayout(testDir);
      const oldConfigResult = results.find((r: CheckResult) => r.name === 'layout/config-old-location');

      assert.ok(oldConfigResult, 'Should detect config at old location');
      assert.strictEqual(oldConfigResult.status, 'warn', 'Should warn about old location');
      assert.ok(
        oldConfigResult.detail?.includes('.pennyfarthing/config.local.yaml'),
        'Detail should include migration instruction with correct path'
      );
    });

    it('fix should migrate config from .claude/ to .pennyfarthing/', () => {
      // AC3: --fix migrates automatically
      writeFileSync(join(claudeDir, 'persona-config.yaml'), 'theme: west-wing');

      const results = checkFileLayout(testDir);
      const oldConfigResult = results.find((r: CheckResult) => r.name === 'layout/config-old-location');

      assert.ok(oldConfigResult?.fix, 'Should have fix function');
      oldConfigResult.fix!();

      assert.ok(
        existsSync(join(pennyfarthingDir, 'config.local.yaml')),
        'Config should exist at new location after fix'
      );
    });
  });

  describe('Settings.local.json symlink validation', () => {
    it('should pass when settings.local.json exists', () => {
      // AC1: correct location
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify({ hooks: {} }, null, 2)
      );

      const results = checkFileLayout(testDir);
      const settingsResult = results.find((r: CheckResult) => r.name === 'layout/settings');

      assert.ok(settingsResult, 'Should have a settings check result');
      assert.strictEqual(settingsResult.status, 'pass', 'Should pass when settings exists');
    });

    it('should fail when settings.local.json is missing', () => {
      // AC1: check critical files
      const results = checkFileLayout(testDir);
      const settingsResult = results.find((r: CheckResult) => r.name === 'layout/settings');

      assert.ok(settingsResult, 'Should have a settings check result');
      assert.strictEqual(settingsResult.status, 'fail', 'Should fail when settings missing');
    });
  });

  describe('Sidecars directory validation', () => {
    it('should pass when sidecars exist at .pennyfarthing/sidecars/', () => {
      // AC1: correct location
      mkdirSync(join(pennyfarthingDir, 'sidecars/sm'), { recursive: true });
      writeFileSync(join(pennyfarthingDir, 'sidecars/sm/patterns.md'), '# patterns');

      const results = checkFileLayout(testDir);
      const sidecarsResult = results.find((r: CheckResult) => r.name === 'layout/sidecars');

      assert.ok(sidecarsResult, 'Should have a sidecars check result');
      assert.strictEqual(sidecarsResult.status, 'pass', 'Should pass when sidecars at correct location');
    });

    it('should warn when sidecars exist at old .claude/project/agents/ location', () => {
      // AC2: flags old .claude/ locations
      const legacyDir = join(claudeDir, 'project/agents/sm-sidecar');
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'patterns.md'), '# old patterns');

      const results = checkFileLayout(testDir);
      const oldSidecarsResult = results.find((r: CheckResult) => r.name === 'layout/sidecars-old-location');

      assert.ok(oldSidecarsResult, 'Should detect sidecars at old location');
      assert.strictEqual(oldSidecarsResult.status, 'warn', 'Should warn about old location');
      assert.ok(
        oldSidecarsResult.detail?.includes('.pennyfarthing/sidecars/'),
        'Detail should include migration path'
      );
    });

    it('fix should migrate sidecars from old location', () => {
      // AC3: --fix migrates
      const legacyDir = join(claudeDir, 'project/agents/sm-sidecar');
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'patterns.md'), '# old patterns');

      const results = checkFileLayout(testDir);
      const oldSidecarsResult = results.find((r: CheckResult) => r.name === 'layout/sidecars-old-location');

      assert.ok(oldSidecarsResult?.fix, 'Should have fix function');
      oldSidecarsResult.fix!();

      assert.ok(
        existsSync(join(pennyfarthingDir, 'sidecars/sm/patterns.md')),
        'Sidecar files should exist at new location after fix'
      );
    });
  });

  describe('Project hooks validation', () => {
    it('should pass when project hooks at .pennyfarthing/project/hooks/', () => {
      // AC1: correct location
      mkdirSync(join(pennyfarthingDir, 'project/hooks'), { recursive: true });
      writeFileSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh'), '#!/bin/bash');

      const results = checkFileLayout(testDir);
      const hooksResult = results.find((r: CheckResult) => r.name === 'layout/project-hooks');

      assert.ok(hooksResult, 'Should have a project hooks check result');
      assert.strictEqual(hooksResult.status, 'pass', 'Should pass when hooks at correct location');
    });

    it('should flag project hooks at old .claude/project/hooks/ location', () => {
      // AC2: flags old locations
      mkdirSync(join(claudeDir, 'project/hooks'), { recursive: true });
      writeFileSync(join(claudeDir, 'project/hooks/setup-env.sh'), '#!/bin/bash\nold hook');

      const results = checkFileLayout(testDir);
      const oldHooksResult = results.find((r: CheckResult) => r.name === 'layout/project-hooks-old-location');

      assert.ok(oldHooksResult, 'Should detect hooks at old location');
      assert.strictEqual(oldHooksResult.status, 'warn', 'Should warn about old location');
      assert.ok(
        oldHooksResult.detail?.includes('.pennyfarthing/project/hooks/'),
        'Detail should include migration path'
      );
    });

    it('fix should migrate project hooks from old location', () => {
      // AC3: --fix migrates
      mkdirSync(join(claudeDir, 'project/hooks'), { recursive: true });
      writeFileSync(join(claudeDir, 'project/hooks/setup-env.sh'), '#!/bin/bash\nold hook');

      const results = checkFileLayout(testDir);
      const oldHooksResult = results.find((r: CheckResult) => r.name === 'layout/project-hooks-old-location');

      assert.ok(oldHooksResult?.fix, 'Should have fix function');
      oldHooksResult.fix!();

      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh')),
        'Hook should exist at new location after fix'
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty project directory gracefully', () => {
      // No .claude or .pennyfarthing contents at all
      const emptyDir = join(tmpdir(), `pf-empty-test-${Date.now()}`);
      mkdirSync(emptyDir, { recursive: true });

      try {
        const results = checkFileLayout(emptyDir);
        assert.ok(Array.isArray(results), 'Should return an array even for empty dir');
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('should not flag files when both old and new locations exist and new is valid', () => {
      // AC4: preserve existing checks — don't double-warn
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: west-wing');
      writeFileSync(join(claudeDir, 'persona-config.yaml'), 'theme: star-wars');

      const results = checkFileLayout(testDir);

      // Config at new location should pass
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');
      assert.ok(configResult, 'Should still have config check');
      assert.strictEqual(configResult.status, 'pass', 'New location check should pass');

      // Old location should still warn
      const oldConfigResult = results.find((r: CheckResult) => r.name === 'layout/config-old-location');
      assert.ok(oldConfigResult, 'Should still flag old location');
      assert.strictEqual(oldConfigResult.status, 'warn', 'Should warn about old location');
    });

    it('should not interfere with existing doctor check categories', () => {
      // AC4: existing checks preserved
      // The layout/ prefix should not collide with existing prefixes
      const results = checkFileLayout(testDir);
      const prefixes = results.map((r: CheckResult) => r.name.split('/')[0]);
      const uniquePrefixes = [...new Set(prefixes)];

      // All results should be in layout/ category
      assert.deepStrictEqual(uniquePrefixes, ['layout'], 'All results should use layout/ prefix only');
    });

    it('fix should not overwrite existing files at new location', () => {
      // AC3: safe migration — don't clobber existing
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: west-wing');
      writeFileSync(join(claudeDir, 'persona-config.yaml'), 'theme: star-wars');

      const results = checkFileLayout(testDir);
      const oldConfigResult = results.find((r: CheckResult) => r.name === 'layout/config-old-location');

      assert.ok(oldConfigResult?.fix, 'Should have fix function');
      oldConfigResult.fix!();

      // The existing new-location config should NOT be overwritten
      const configContent = readFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'utf8');
      assert.strictEqual(configContent, 'theme: west-wing', 'Should not overwrite existing config');

      // Old file should still be removed (it's a shadow)
      assert.strictEqual(
        existsSync(join(claudeDir, 'persona-config.yaml')),
        false,
        'Old config should be removed even when new exists'
      );
    });
  });
});
