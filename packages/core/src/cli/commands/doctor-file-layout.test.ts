/**
 * Tests for MSSCI-14372: Doctor file layout validation
 *
 * Tests verify:
 * - checkFileLayout() detects files at correct .pennyfarthing/ locations
 * - New "layout/" check category is used for result names
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
      const results = checkFileLayout(testDir);
      const manifestResult = results.find((r: CheckResult) => r.name === 'layout/manifest');

      assert.ok(manifestResult, 'Should have a manifest check result');
      assert.strictEqual(manifestResult.status, 'fail', 'Should fail when manifest missing');
    });
  });

  describe('Config validation', () => {
    it('should pass when config exists at .pennyfarthing/config.local.yaml', () => {
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: west-wing');

      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have a config check result');
      assert.strictEqual(configResult.status, 'pass', 'Should pass when config exists');
    });

    it('should warn when config is missing from .pennyfarthing/', () => {
      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have a config check result');
      assert.strictEqual(configResult.status, 'warn', 'Should warn when config missing');
    });
  });

  describe('Settings.local.json validation', () => {
    it('should pass when settings.local.json exists', () => {
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
      const results = checkFileLayout(testDir);
      const settingsResult = results.find((r: CheckResult) => r.name === 'layout/settings');

      assert.ok(settingsResult, 'Should have a settings check result');
      assert.strictEqual(settingsResult.status, 'fail', 'Should fail when settings missing');
    });
  });

  describe('Sidecars directory validation', () => {
    it('should pass when sidecars exist at .pennyfarthing/sidecars/', () => {
      mkdirSync(join(pennyfarthingDir, 'sidecars/sm'), { recursive: true });
      writeFileSync(join(pennyfarthingDir, 'sidecars/sm/patterns.md'), '# patterns');

      const results = checkFileLayout(testDir);
      const sidecarsResult = results.find((r: CheckResult) => r.name === 'layout/sidecars');

      assert.ok(sidecarsResult, 'Should have a sidecars check result');
      assert.strictEqual(sidecarsResult.status, 'pass', 'Should pass when sidecars at correct location');
    });
  });

  describe('Project hooks validation', () => {
    it('should pass when project hooks at .pennyfarthing/project/hooks/', () => {
      mkdirSync(join(pennyfarthingDir, 'project/hooks'), { recursive: true });
      writeFileSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh'), '#!/bin/bash');
      chmodSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh'), 0o755);

      const results = checkFileLayout(testDir);
      const hooksResult = results.find((r: CheckResult) => r.name === 'layout/project-hooks');

      assert.ok(hooksResult, 'Should have a project hooks check result');
      assert.strictEqual(hooksResult.status, 'pass', 'Should pass when hooks at correct location');
    });

    it('should warn when hook scripts are not executable', () => {
      mkdirSync(join(pennyfarthingDir, 'project/hooks'), { recursive: true });
      writeFileSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh'), '#!/bin/bash');
      chmodSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh'), 0o644);

      const results = checkFileLayout(testDir);
      const hookFileResult = results.find((r: CheckResult) => r.name === 'layout/project-hooks/setup-env.sh');

      assert.ok(hookFileResult, 'Should have a per-file hook check result');
      assert.strictEqual(hookFileResult.status, 'warn', 'Should warn when not executable');
      assert.ok(hookFileResult.fix, 'Should provide a fix function');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty project directory gracefully', () => {
      const emptyDir = join(tmpdir(), `pf-empty-test-${Date.now()}`);
      mkdirSync(emptyDir, { recursive: true });

      try {
        const results = checkFileLayout(emptyDir);
        assert.ok(Array.isArray(results), 'Should return an array even for empty dir');
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('should not interfere with existing doctor check categories', () => {
      const results = checkFileLayout(testDir);
      const prefixes = results.map((r: CheckResult) => r.name.split('/')[0]);
      const uniquePrefixes = [...new Set(prefixes)];

      assert.deepStrictEqual(uniquePrefixes, ['layout'], 'All results should use layout/ prefix only');
    });
  });
});
