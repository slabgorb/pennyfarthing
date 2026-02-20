/**
 * Tests for Story 117-10: Doctor persona-config check false negative
 * when config.local.yaml missing
 *
 * Bug: Doctor's persona-config check only looks for .pennyfarthing/config.local.yaml
 * existence. When only .pennyfarthing/persona-config.yaml exists (set by /pf-setup),
 * doctor falsely reports "No theme configured" even though getCurrentTheme()
 * correctly falls back to persona-config.yaml.
 *
 * Fix: Doctor should use getCurrentTheme() (or replicate its fallback) to determine
 * whether a theme is configured, not just check config.local.yaml existence.
 *
 * Acceptance Criteria:
 * AC1: Doctor persona-config check passes when theme set in persona-config.yaml only
 * AC2: Doctor persona-config check still passes when theme set in config.local.yaml
 * AC3: config.local.yaml overrides persona-config.yaml when both exist
 * AC4: Doctor correctly warns when NO theme is configured anywhere
 *
 * Run with: cd packages/core && pnpm run build && pnpm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as yamlStringify } from 'yaml';

import { checkUserFilesBasic, checkFileLayout, type CheckResult } from './doctor.js';
import { getCurrentTheme } from '../utils/themes.js';

describe('Story 117-10: Doctor persona-config false negative', () => {
  let testDir: string;
  let pennyfarthingDir: string;
  let claudeDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-doctor-persona-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    claudeDir = join(testDir, '.claude');
    mkdirSync(pennyfarthingDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: persona-config.yaml fallback ──────────────────────────────

  describe('AC1: Doctor passes when theme set in persona-config.yaml only', () => {
    it('checkUserFilesBasic persona-config should pass with only persona-config.yaml', () => {
      // This is the core false negative: persona-config.yaml has a valid theme
      // but config.local.yaml does not exist
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'firefly' })
      );

      // Sanity: getCurrentTheme already handles this correctly
      const theme = getCurrentTheme(testDir);
      assert.strictEqual(theme, 'firefly', 'getCurrentTheme should find theme in persona-config.yaml');

      // Bug: checkUserFilesBasic only checks config.local.yaml existence
      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(
        personaResult.status,
        'pass',
        'Should PASS when theme is set in persona-config.yaml (even without config.local.yaml)'
      );
    });

    it('checkFileLayout config check should pass with only persona-config.yaml', () => {
      // Same false negative in checkFileLayout
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'firefly' })
      );
      // Also need manifest for checkFileLayout
      writeFileSync(
        join(pennyfarthingDir, 'manifest.json'),
        JSON.stringify({ version: '11.0.0' })
      );

      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have layout/config check result');
      assert.strictEqual(
        configResult.status,
        'pass',
        'Should PASS when theme is set in persona-config.yaml (even without config.local.yaml)'
      );
    });
  });

  // ─── AC2: config.local.yaml still works ────────────────────────────

  describe('AC2: Doctor still passes when theme set in config.local.yaml', () => {
    it('checkUserFilesBasic should pass with config.local.yaml (existing behavior)', () => {
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'game-of-thrones' })
      );

      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(personaResult.status, 'pass', 'Should pass with config.local.yaml');
    });

    it('checkFileLayout should pass with config.local.yaml (existing behavior)', () => {
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'game-of-thrones' })
      );

      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have layout/config check result');
      assert.strictEqual(configResult.status, 'pass', 'Should pass with config.local.yaml');
    });
  });

  // ─── AC3: config.local.yaml overrides persona-config.yaml ──────────

  describe('AC3: config.local.yaml takes priority over persona-config.yaml', () => {
    it('getCurrentTheme prefers config.local.yaml when both exist', () => {
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'firefly' })
      );

      const theme = getCurrentTheme(testDir);
      assert.strictEqual(
        theme,
        'star-trek',
        'config.local.yaml should override persona-config.yaml'
      );
    });

    it('doctor should pass when both config files exist', () => {
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'firefly' })
      );

      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(personaResult.status, 'pass', 'Should pass when both configs exist');
    });
  });

  // ─── AC4: Correctly warns when NO theme configured ─────────────────

  describe('AC4: Doctor warns when no theme is configured anywhere', () => {
    it('checkUserFilesBasic should warn when neither config file has a theme', () => {
      // No config.local.yaml, no persona-config.yaml
      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(
        personaResult.status,
        'warn',
        'Should warn when no theme configured anywhere'
      );
      assert.ok(
        personaResult.detail?.includes('No theme configured'),
        'Detail should mention no theme configured'
      );
    });

    it('checkFileLayout should warn when neither config file has a theme', () => {
      const results = checkFileLayout(testDir);
      const configResult = results.find((r: CheckResult) => r.name === 'layout/config');

      assert.ok(configResult, 'Should have layout/config check result');
      assert.strictEqual(
        configResult.status,
        'warn',
        'Should warn when no theme configured anywhere'
      );
    });

    it('should warn when persona-config.yaml exists but has no theme field', () => {
      // persona-config.yaml exists but without a theme
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ output_style: 'terse' })
      );

      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(
        personaResult.status,
        'warn',
        'Should warn when persona-config.yaml exists but has no theme'
      );
    });

    it('should warn when config.local.yaml exists but has no theme field', () => {
      // config.local.yaml exists but without a theme
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ bell_mode: true })
      );

      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(
        personaResult.status,
        'warn',
        'Should warn when config.local.yaml exists but has no theme'
      );
    });
  });

  // ─── Consistency: Doctor agrees with getCurrentTheme ───────────────

  describe('Doctor and getCurrentTheme should agree', () => {
    it('doctor should pass whenever getCurrentTheme returns a non-null value', () => {
      // The repro scenario: /pf-setup sets theme in persona-config.yaml
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'firefly' })
      );

      const theme = getCurrentTheme(testDir);
      assert.ok(theme, 'getCurrentTheme should find the theme');

      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(
        personaResult.status,
        'pass',
        `Doctor says "${personaResult.status}" but getCurrentTheme returns "${theme}" — they disagree!`
      );
    });

    it('doctor should warn whenever getCurrentTheme returns null', () => {
      // No theme anywhere
      const theme = getCurrentTheme(testDir);
      assert.strictEqual(theme, null, 'getCurrentTheme should return null');

      const results = checkUserFilesBasic(testDir);
      const personaResult = results.find((r: CheckResult) => r.name === 'persona-config');

      assert.ok(personaResult, 'Should have persona-config check result');
      assert.strictEqual(
        personaResult.status,
        'warn',
        'Doctor should warn when getCurrentTheme returns null'
      );
    });
  });
});
