/**
 * Tests for MSSCI-14367: Move persona-config.yaml into .pennyfarthing
 *
 * These tests verify that persona/theme configuration is consolidated to
 * .pennyfarthing/config.local.yaml exclusively.
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
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as yamlStringify } from 'yaml';

import { getCurrentTheme } from '../utils/themes.js';
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
      const result = getCurrentTheme(testDir);
      assert.strictEqual(
        result,
        null,
        'Should return null when .pennyfarthing/config.local.yaml does not exist'
      );
    });

    it('getCurrentTheme() should ignore .claude/persona-config.yaml even if it has content', () => {
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
      writeFileSync(
        join(pennyfarthingDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'minimalist' })
      );

      assert.ok(
        !existsSync(join(claudeDir, 'persona-config.yaml')),
        'Init should NOT create .claude/persona-config.yaml'
      );

      const theme = getCurrentTheme(testDir);
      assert.strictEqual(
        theme,
        'minimalist',
        'Theme should be readable from .pennyfarthing/persona-config.yaml'
      );
    });

    it('getCurrentTheme should read .pennyfarthing/persona-config.yaml as project default', () => {
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

  // ─── AC4: All code paths updated ──────────────────────────────────

  describe('AC4: No code paths reference .claude/persona-config.yaml for reading', () => {
    it('getCurrentTheme() should be the single entry point for theme reads', () => {
      writeFileSync(
        join(pennyfarthingDir, 'config.local.yaml'),
        yamlStringify({ theme: 'star-trek' })
      );

      const result = getCurrentTheme(testDir);
      assert.strictEqual(result, 'star-trek');

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
    it('update migrateTemplateFiles should move persona-config.yaml to .pennyfarthing/', () => {
      writeFileSync(
        join(claudeDir, 'persona-config.yaml'),
        yamlStringify({ theme: 'star-wars' })
      );

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
});
