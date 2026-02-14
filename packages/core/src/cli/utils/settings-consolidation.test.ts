/**
 * Tests for MSSCI-14366: Move settings.local.json into .pennyfarthing
 *
 * Acceptance Criteria:
 * AC1: mergeSettingsLocalJson() writes to .pennyfarthing/settings.local.json
 * AC2: Symlink created at .claude/settings.local.json → ../.pennyfarthing/settings.local.json
 * AC3: Migration: existing real file at .claude/settings.local.json moved on update
 * AC4: Tests for symlink creation and migration
 *
 * Run with: cd packages/core && npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import functions to test
// mergeSettingsLocalJson already exists but needs to write to new location
// ensureSettingsSymlink and migrateSettingsFile need to be created — tests should fail (RED)
import {
  mergeSettingsLocalJson,
  ensureSettingsSymlink,
  migrateSettingsFile,
} from './settings.js';

describe('MSSCI-14366: Move settings.local.json into .pennyfarthing', () => {
  let testDir: string;
  let claudeDir: string;
  let pennyfarthingDir: string;
  let assetsPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    claudeDir = join(testDir, '.claude');
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    assetsPath = join(testDir, 'assets');

    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(pennyfarthingDir, { recursive: true });
    mkdirSync(join(assetsPath, 'templates'), { recursive: true });

    // Create a minimal settings template for mergeSettingsLocalJson
    writeFileSync(
      join(assetsPath, 'templates/settings.local.json.template'),
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                matcher: '',
                hooks: [
                  {
                    type: 'command',
                    command: '.pennyfarthing/scripts/hooks/session-start.sh',
                  },
                ],
              },
            ],
          },
          permissions: { allow: [] },
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: mergeSettingsLocalJson writes to .pennyfarthing/ ─────────

  describe('AC1: mergeSettingsLocalJson writes to .pennyfarthing/', () => {
    it('should write settings to .pennyfarthing/settings.local.json on fresh install', async () => {
      // No existing settings anywhere
      await mergeSettingsLocalJson(testDir, assetsPath, {});

      // Settings should be written to .pennyfarthing/ (new canonical location)
      const newPath = join(pennyfarthingDir, 'settings.local.json');
      assert.ok(existsSync(newPath), 'settings.local.json should exist at .pennyfarthing/');

      const content = JSON.parse(readFileSync(newPath, 'utf8'));
      assert.ok(content.hooks, 'Should contain hooks from template');
      assert.ok(
        content.hooks.SessionStart,
        'Should contain SessionStart hooks'
      );
    });

    it('should NOT write settings directly to .claude/settings.local.json', async () => {
      // No existing settings anywhere
      await mergeSettingsLocalJson(testDir, assetsPath, {});

      const oldPath = join(claudeDir, 'settings.local.json');
      // .claude/settings.local.json should NOT be a regular file
      // (it may exist as a symlink, but not as a directly-written file)
      if (existsSync(oldPath)) {
        const stats = lstatSync(oldPath);
        assert.ok(
          stats.isSymbolicLink(),
          '.claude/settings.local.json should be a symlink, not a regular file'
        );
      }
    });

    it('should read existing settings from .pennyfarthing/ when merging', async () => {
      // Pre-existing settings at new location
      const existingSettings = {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'custom-hook.sh' }],
            },
          ],
        },
        customKey: 'preserved',
      };
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify(existingSettings, null, 2)
      );

      await mergeSettingsLocalJson(testDir, assetsPath, {});

      const content = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );
      assert.strictEqual(
        content.customKey,
        'preserved',
        'Should preserve existing custom keys'
      );
    });
  });

  // ─── AC2: Symlink creation ────────────────────────────────────────

  describe('AC2: Symlink at .claude/settings.local.json', () => {
    it('should create symlink from .claude/ to .pennyfarthing/', () => {
      // Create the canonical file first
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify({ hooks: {} }, null, 2)
      );

      ensureSettingsSymlink(testDir);

      const symlinkPath = join(claudeDir, 'settings.local.json');
      assert.ok(existsSync(symlinkPath), 'Symlink should exist at .claude/');

      const stats = lstatSync(symlinkPath);
      assert.ok(stats.isSymbolicLink(), 'Should be a symlink, not a regular file');

      const target = readlinkSync(symlinkPath);
      assert.strictEqual(
        target,
        '../.pennyfarthing/settings.local.json',
        'Should point to ../.pennyfarthing/settings.local.json (relative)'
      );
    });

    it('should be idempotent — no error if symlink already exists', () => {
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify({ hooks: {} }, null, 2)
      );

      // Create symlink twice — should not throw
      ensureSettingsSymlink(testDir);
      ensureSettingsSymlink(testDir);

      const stats = lstatSync(join(claudeDir, 'settings.local.json'));
      assert.ok(stats.isSymbolicLink(), 'Should still be a symlink after second call');
    });

    it('should resolve correctly — reading symlink returns canonical content', () => {
      const expected = { hooks: { custom: true }, myKey: 42 };
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify(expected, null, 2)
      );

      ensureSettingsSymlink(testDir);

      const content = JSON.parse(
        readFileSync(join(claudeDir, 'settings.local.json'), 'utf8')
      );
      assert.deepStrictEqual(
        content,
        expected,
        'Reading through symlink should return canonical content'
      );
    });

    it('should not crash when real file exists at symlink path (EEXIST fix)', () => {
      // Setup: real file at .claude/settings.local.json (legacy state)
      const legacySettings = { hooks: {}, legacy: true };
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify(legacySettings, null, 2)
      );

      // ensureSettingsSymlink should NOT throw EEXIST
      assert.doesNotThrow(() => ensureSettingsSymlink(testDir));

      // Should have migrated the real file and created a symlink
      const stats = lstatSync(join(claudeDir, 'settings.local.json'));
      assert.ok(stats.isSymbolicLink(), 'Should be a symlink after migration');

      // Content should be preserved at .pennyfarthing/
      const content = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );
      assert.strictEqual(content.legacy, true, 'Legacy content should be preserved');
    });

    it('should not crash when real file exists and .pennyfarthing/ already has settings', () => {
      // Setup: both locations have files (conflict scenario)
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify({ source: 'old' }, null, 2)
      );
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify({ source: 'new' }, null, 2)
      );

      // Should NOT throw
      assert.doesNotThrow(() => ensureSettingsSymlink(testDir));

      // .pennyfarthing/ version should win
      const content = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );
      assert.strictEqual(content.source, 'new', '.pennyfarthing/ content takes precedence');

      // .claude/ should be a symlink now
      const stats = lstatSync(join(claudeDir, 'settings.local.json'));
      assert.ok(stats.isSymbolicLink(), 'Should be a symlink');
    });

    it('should create .claude/ directory if it does not exist', () => {
      // Remove .claude dir
      rmSync(claudeDir, { recursive: true, force: true });

      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify({ hooks: {} }, null, 2)
      );

      ensureSettingsSymlink(testDir);

      assert.ok(existsSync(join(claudeDir, 'settings.local.json')), 'Should create .claude/ and symlink');
    });
  });

  // ─── AC3: Migration from old location ─────────────────────────────

  describe('AC3: Migration of existing real file', () => {
    it('should move real file from .claude/ to .pennyfarthing/', () => {
      // Setup: real file at old location with user customizations
      const userSettings = {
        hooks: {
          SessionStart: [
            { matcher: '', hooks: [{ type: 'command', command: 'user-hook.sh' }] },
          ],
        },
        customPermissions: ['Bash(*)'],
      };
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify(userSettings, null, 2)
      );

      migrateSettingsFile(testDir);

      // File should now be at new location
      const newPath = join(pennyfarthingDir, 'settings.local.json');
      assert.ok(existsSync(newPath), 'File should exist at .pennyfarthing/');

      // Content should be preserved
      const content = JSON.parse(readFileSync(newPath, 'utf8'));
      assert.deepStrictEqual(
        content.customPermissions,
        ['Bash(*)'],
        'User customizations should be preserved'
      );
    });

    it('should replace old file with symlink after migration', () => {
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify({ hooks: {} }, null, 2)
      );

      migrateSettingsFile(testDir);

      const oldPath = join(claudeDir, 'settings.local.json');
      assert.ok(existsSync(oldPath), 'Path should still exist (as symlink)');

      const stats = lstatSync(oldPath);
      assert.ok(
        stats.isSymbolicLink(),
        'Old path should now be a symlink, not a regular file'
      );

      const target = readlinkSync(oldPath);
      assert.strictEqual(
        target,
        '../.pennyfarthing/settings.local.json',
        'Should point to new location'
      );
    });

    it('should not overwrite existing .pennyfarthing/ file during migration', () => {
      // Both locations have files — .pennyfarthing/ takes precedence
      const newContent = { hooks: {}, source: 'new-location' };
      const oldContent = { hooks: {}, source: 'old-location' };

      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify(newContent, null, 2)
      );
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify(oldContent, null, 2)
      );

      migrateSettingsFile(testDir);

      const content = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );
      assert.strictEqual(
        content.source,
        'new-location',
        'Should NOT overwrite existing .pennyfarthing/ file'
      );
    });

    it('should be idempotent — no-op if .claude/ is already a symlink', () => {
      // Setup: already migrated state
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify({ hooks: {}, migrated: true }, null, 2)
      );

      // Manually create the symlink (simulating prior migration)
      symlinkSync(
        '../.pennyfarthing/settings.local.json',
        join(claudeDir, 'settings.local.json')
      );

      // Should not throw or change anything
      migrateSettingsFile(testDir);

      const stats = lstatSync(join(claudeDir, 'settings.local.json'));
      assert.ok(stats.isSymbolicLink(), 'Should remain a symlink');

      const content = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );
      assert.strictEqual(content.migrated, true, 'Content should be unchanged');
    });

    it('should handle case where neither location has a file', () => {
      // Nothing exists — should not throw
      migrateSettingsFile(testDir);

      assert.ok(
        !existsSync(join(pennyfarthingDir, 'settings.local.json')),
        'Should not create file from nothing'
      );
    });
  });

  // ─── Integration: mergeSettingsLocalJson + symlink ─────────────────

  describe('Integration: merge + symlink workflow', () => {
    it('should write to .pennyfarthing/ and be readable via .claude/ symlink', async () => {
      // Fresh install: merge writes to .pennyfarthing/, symlink makes it visible at .claude/
      await mergeSettingsLocalJson(testDir, assetsPath, {});
      ensureSettingsSymlink(testDir);

      // Read through the symlink
      const viaSymlink = JSON.parse(
        readFileSync(join(claudeDir, 'settings.local.json'), 'utf8')
      );
      const viaDirect = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );

      assert.deepStrictEqual(
        viaSymlink,
        viaDirect,
        'Content via symlink should match direct read'
      );
    });

    it('should handle migrate-then-merge workflow (update path)', async () => {
      // Scenario: existing install at old location, then update runs
      const oldSettings = {
        hooks: {
          SessionStart: [
            { matcher: '', hooks: [{ type: 'command', command: 'old-hook.sh' }] },
          ],
        },
        userCustom: 'keep-me',
      };
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify(oldSettings, null, 2)
      );

      // Step 1: migrate moves file and creates symlink
      migrateSettingsFile(testDir);

      // Step 2: merge adds any missing hooks
      await mergeSettingsLocalJson(testDir, assetsPath, {});

      // Verify: file is at .pennyfarthing/, user content preserved, hooks merged
      const content = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );
      assert.strictEqual(
        content.userCustom,
        'keep-me',
        'User customizations preserved through migrate + merge'
      );
      assert.ok(content.hooks.SessionStart, 'Hooks should be present');
    });
  });
});
