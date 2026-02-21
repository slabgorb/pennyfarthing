/**
 * Tests for MSSCI-12346: Legacy install cleanup
 *
 * Tests verify:
 * - checkLegacyFiles() detects legacy statusline scripts
 * - checkLegacyFiles() detects legacy persona-config.yaml
 * - checkLegacyStatuslinePath() validates settings.local.json
 * - Fix functions remove legacy files correctly
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import functions to test - these don't exist yet, tests should fail
import {
  checkLegacyFiles,
  checkLegacyStatuslinePath,
  type CheckResult
} from './doctor.js';

// Type helper for filtering results
type _ResultFilter = (r: CheckResult) => boolean;

describe('MSSCI-12346: Legacy Install Cleanup', () => {
  let testDir: string;
  let claudeDir: string;
  let pennyfarthingDir: string;

  beforeEach(() => {
    // Create temporary project directory
    testDir = join(tmpdir(), `pennyfarthing-legacy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    claudeDir = join(testDir, '.claude');
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(pennyfarthingDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('checkLegacyFiles()', () => {
    it('should detect legacy .claude/scripts/statusline.sh', () => {
      // AC: doctor --fix removes stale .claude/scripts/statusline.sh if pennyfarthing one exists
      // Setup: Create legacy statusline script
      const legacyScriptsDir = join(claudeDir, 'scripts');
      mkdirSync(legacyScriptsDir, { recursive: true });
      writeFileSync(join(legacyScriptsDir, 'statusline.sh'), '#!/bin/bash\necho "legacy"');

      // Create the proper pennyfarthing statusline
      const properScriptsDir = join(pennyfarthingDir, 'scripts/misc');
      mkdirSync(properScriptsDir, { recursive: true });
      writeFileSync(join(properScriptsDir, 'statusline.sh'), '#!/bin/bash\necho "proper"');

      const results = checkLegacyFiles(testDir);

      // Should detect the legacy file
      const legacyResult = results.find((r: CheckResult) => r.name === 'legacy/.claude/scripts/statusline.sh');
      assert.ok(legacyResult, 'Should detect legacy statusline.sh');
      assert.strictEqual(legacyResult.status, 'warn', 'Should warn about legacy file');
      assert.ok(legacyResult.fix, 'Should provide a fix function');
    });

    it('should not warn if no pennyfarthing statusline exists', () => {
      // If there's no proper statusline, the legacy one might be intentional
      const legacyScriptsDir = join(claudeDir, 'scripts');
      mkdirSync(legacyScriptsDir, { recursive: true });
      writeFileSync(join(legacyScriptsDir, 'statusline.sh'), '#!/bin/bash\necho "legacy"');

      // No proper statusline - user may have custom setup
      const results = checkLegacyFiles(testDir);

      const legacyResult = results.find((r: CheckResult) => r.name === 'legacy/.claude/scripts/statusline.sh');
      // Should pass or not be present - legacy is OK if proper doesn't exist
      if (legacyResult) {
        assert.strictEqual(legacyResult.status, 'pass', 'Should pass when no proper statusline exists');
      }
    });

    it('should detect legacy .claude/persona-config.yaml', () => {
      // AC: legacy persona-config conflicts with .pennyfarthing/config.local.yaml
      // Setup: Create legacy persona config
      writeFileSync(join(claudeDir, 'persona-config.yaml'), 'theme: star-wars');

      // Create the proper config
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: star-trek');

      const results = checkLegacyFiles(testDir);

      const legacyResult = results.find((r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml');
      assert.ok(legacyResult, 'Should detect legacy persona-config.yaml');
      assert.strictEqual(legacyResult.status, 'warn', 'Should warn about legacy config');
      assert.ok(legacyResult.fix, 'Should provide a fix function');
    });

    it('should return empty array when no legacy files exist', () => {
      // Clean slate - no legacy files
      const results = checkLegacyFiles(testDir);

      const legacyResults = results.filter((r: CheckResult) => r.name.startsWith('legacy/'));
      assert.strictEqual(legacyResults.length, 0, 'Should not detect any legacy files');
    });

    it('fix function should remove legacy statusline.sh', () => {
      // Setup legacy and proper files
      const legacyScriptsDir = join(claudeDir, 'scripts');
      mkdirSync(legacyScriptsDir, { recursive: true });
      const legacyPath = join(legacyScriptsDir, 'statusline.sh');
      writeFileSync(legacyPath, '#!/bin/bash\necho "legacy"');

      const properScriptsDir = join(pennyfarthingDir, 'scripts/misc');
      mkdirSync(properScriptsDir, { recursive: true });
      writeFileSync(join(properScriptsDir, 'statusline.sh'), '#!/bin/bash\necho "proper"');

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find((r: CheckResult) => r.name === 'legacy/.claude/scripts/statusline.sh');
      assert.ok(legacyResult?.fix, 'Should have fix function');

      // Execute the fix
      legacyResult.fix!();

      assert.strictEqual(existsSync(legacyPath), false, 'Legacy file should be removed');
    });

    it('fix function should remove legacy persona-config.yaml', () => {
      // Setup legacy and proper configs
      const legacyPath = join(claudeDir, 'persona-config.yaml');
      writeFileSync(legacyPath, 'theme: star-wars');
      writeFileSync(join(pennyfarthingDir, 'config.local.yaml'), 'theme: star-trek');

      const results = checkLegacyFiles(testDir);
      const legacyResult = results.find((r: CheckResult) => r.name === 'legacy/.claude/persona-config.yaml');
      assert.ok(legacyResult?.fix, 'Should have fix function');

      // Execute the fix
      legacyResult.fix!();

      assert.strictEqual(existsSync(legacyPath), false, 'Legacy config should be removed');
    });
  });

  describe('Bug 5: persona config preservation on YAML parse failure', () => {
    it('should NOT delete legacy persona-config.yaml if YAML parse fails', () => {
      const legacyConfig = join(claudeDir, 'persona-config.yaml');
      writeFileSync(legacyConfig, 'theme: minimalist\n  bad indent: [unclosed', 'utf8');

      const results = checkLegacyFiles(testDir);
      const personaResult = results.find(r => r.name.includes('persona'));

      assert.ok(personaResult, 'Should detect legacy persona config');

      if (personaResult?.fix) {
        personaResult.fix();
      }

      assert.ok(
        existsSync(legacyConfig),
        'Legacy persona config must NOT be deleted when YAML parse fails'
      );
    });

    it('should delete legacy persona-config.yaml after successful migration', () => {
      const legacyConfig = join(claudeDir, 'persona-config.yaml');
      writeFileSync(legacyConfig, 'theme: minimalist\n', 'utf8');
      mkdirSync(pennyfarthingDir, { recursive: true });

      const results = checkLegacyFiles(testDir);
      const personaResult = results.find(r => r.name.includes('persona'));

      if (personaResult?.fix) {
        personaResult.fix();
      }

      assert.ok(
        !existsSync(legacyConfig),
        'Legacy persona config should be deleted after successful migration'
      );
    });
  });

  describe('checkLegacyStatuslinePath()', () => {
    it('should detect wrong statusline path in settings.local.json', () => {
      // AC: doctor --fix updates settings.local.json statusline path if wrong
      // Setup: Create settings with legacy path (statusLine is top-level, not inside hooks)
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify({
          statusLine: {
            type: 'command',
            command: '"$CLAUDE_PROJECT_DIR"/.claude/scripts/statusline.sh'
          }
        }, null, 2)
      );

      // Create proper statusline
      const properScriptsDir = join(pennyfarthingDir, 'scripts/misc');
      mkdirSync(properScriptsDir, { recursive: true });
      writeFileSync(join(properScriptsDir, 'statusline.sh'), '#!/bin/bash\necho "proper"');

      const result = checkLegacyStatuslinePath(testDir);

      assert.strictEqual(result.status, 'warn', 'Should warn about wrong path');
      assert.ok(result.fix, 'Should provide a fix function');
    });

    it('should pass when statusline path is correct', () => {
      // Setup: Create settings with correct path
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify({
          statusLine: {
            type: 'command',
            command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/misc/statusline.sh'
          }
        }, null, 2)
      );

      const result = checkLegacyStatuslinePath(testDir);

      assert.strictEqual(result.status, 'pass', 'Should pass when path is correct');
    });

    it('should pass when no statusline configured', () => {
      // Setup: Create settings without statusline
      writeFileSync(
        join(claudeDir, 'settings.local.json'),
        JSON.stringify({
          otherSetting: true
        }, null, 2)
      );

      const result = checkLegacyStatuslinePath(testDir);

      assert.strictEqual(result.status, 'pass', 'Should pass when no statusline configured');
    });

    it('should pass when settings.local.json does not exist', () => {
      // No settings file at all
      const result = checkLegacyStatuslinePath(testDir);

      assert.strictEqual(result.status, 'pass', 'Should pass when no settings file');
    });

    it('fix function should update statusline path in settings', () => {
      // Setup: Create settings with legacy path
      const settingsPath = join(claudeDir, 'settings.local.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: 'command',
            command: '"$CLAUDE_PROJECT_DIR"/.claude/scripts/statusline.sh'
          },
          otherSetting: 'preserved'
        }, null, 2)
      );

      // Create proper statusline
      const properScriptsDir = join(pennyfarthingDir, 'scripts/misc');
      mkdirSync(properScriptsDir, { recursive: true });
      writeFileSync(join(properScriptsDir, 'statusline.sh'), '#!/bin/bash\necho "proper"');

      const result = checkLegacyStatuslinePath(testDir);
      assert.ok(result.fix, 'Should have fix function');

      // Execute the fix
      result.fix!();

      // Verify the path was updated (fix now writes pf.sh hooks statusline)
      const updatedSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(
        updatedSettings.statusLine.command.includes('pf.sh hooks statusline') ||
        updatedSettings.statusLine.command.includes('.pennyfarthing/scripts/misc/statusline.sh'),
        'Should update to proper path'
      );
      assert.strictEqual(
        updatedSettings.otherSetting,
        'preserved',
        'Should preserve other settings'
      );
    });

    it('should detect multiple legacy statusline paths', () => {
      // Test various legacy paths that should be detected
      const legacyPaths = [
        '.claude/core/statusline.sh',
        '.claude/statusline.sh',
        '.claude/pennyfarthing/statusline.sh',
        '.claude/pennyfarthing/scripts/statusline.sh',
        '.claude/scripts/statusline.sh',
        '.pennyfarthing/scripts/statusline.sh'  // before v7.0.3
      ];

      for (const legacyPath of legacyPaths) {
        // Recreate settings for each test using the statusLine top-level key
        writeFileSync(
          join(claudeDir, 'settings.local.json'),
          JSON.stringify({
            statusLine: {
              type: 'command',
              command: `"$CLAUDE_PROJECT_DIR"/${legacyPath}`
            }
          }, null, 2)
        );

        // Create proper statusline
        const properScriptsDir = join(pennyfarthingDir, 'scripts/misc');
        mkdirSync(properScriptsDir, { recursive: true });
        writeFileSync(join(properScriptsDir, 'statusline.sh'), '#!/bin/bash');

        const result = checkLegacyStatuslinePath(testDir);

        assert.strictEqual(
          result.status,
          'warn',
          `Should detect legacy path: ${legacyPath}`
        );
      }
    });
  });
});
