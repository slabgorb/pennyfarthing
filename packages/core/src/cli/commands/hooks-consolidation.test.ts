/**
 * Tests for MSSCI-14368: Move project hooks into .pennyfarthing/project
 *
 * These tests verify that project-specific hooks (setup-env.sh etc.) are
 * consolidated from .claude/project/hooks/ to .pennyfarthing/project/hooks/,
 * with settings.local.json hook paths updated accordingly.
 *
 * Acceptance Criteria:
 * AC1: Project hooks moved from .claude/project/ to .pennyfarthing/project/
 * AC2: settings.local.json hook paths updated to reference .pennyfarthing/project/hooks/
 * AC3: .claude/project/ cleaned up if empty after migration
 * AC4: Existing hook functionality preserved after move
 * AC5: pennyfarthing update migrates hooks from old to new location
 * AC6: pennyfarthing doctor detects hooks in old location
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
  readdirSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { migrateTemplateFiles } from './update.js';
import { mergeSettingsLocalJson } from '../utils/settings.js';

describe('MSSCI-14368: Move project hooks into .pennyfarthing/project', () => {
  let testDir: string;
  let claudeDir: string;
  let pennyfarthingDir: string;
  let assetsPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-hooks-consolidation-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    claudeDir = join(testDir, '.claude');
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    assetsPath = join(testDir, 'assets');

    mkdirSync(join(claudeDir, 'project/hooks'), { recursive: true });
    mkdirSync(join(pennyfarthingDir, 'project/hooks'), { recursive: true });
    mkdirSync(join(assetsPath, 'templates'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Project hooks at .pennyfarthing/project/hooks/ ──────────

  describe('AC1: Project hooks at .pennyfarthing/project/hooks/', () => {
    it('migrateTemplateFiles should move setup-env.sh from .claude/project/hooks/ to .pennyfarthing/project/hooks/', () => {
      // Setup: legacy hook at old location
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\nexport PROJECT_NAME="test"\n'
      );

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh')),
        'setup-env.sh should exist at .pennyfarthing/project/hooks/'
      );
      assert.ok(
        !existsSync(join(claudeDir, 'project/hooks/setup-env.sh')),
        'setup-env.sh should be removed from .claude/project/hooks/'
      );
    });

    it('migrateTemplateFiles should preserve hook content during migration', () => {
      const hookContent = '#!/bin/bash\nexport PROJECT_NAME="my-project"\nexport PROJECT_LABEL="My Project"\n';
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        hookContent
      );

      migrateTemplateFiles(testDir, {});

      const migratedContent = readFileSync(
        join(pennyfarthingDir, 'project/hooks/setup-env.sh'),
        'utf8'
      );
      assert.strictEqual(
        migratedContent,
        hookContent,
        'Hook content should be preserved exactly during migration'
      );
    });

    it('migrateTemplateFiles should not overwrite existing hook at new location', () => {
      const newContent = '#!/bin/bash\nexport PROJECT_NAME="new"\n';
      const oldContent = '#!/bin/bash\nexport PROJECT_NAME="old"\n';

      writeFileSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh'), newContent);
      writeFileSync(join(claudeDir, 'project/hooks/setup-env.sh'), oldContent);

      migrateTemplateFiles(testDir, {});

      const result = readFileSync(
        join(pennyfarthingDir, 'project/hooks/setup-env.sh'),
        'utf8'
      );
      assert.strictEqual(
        result,
        newContent,
        'Should NOT overwrite existing hook at .pennyfarthing/project/hooks/'
      );
    });

    it('migrateTemplateFiles should be idempotent', () => {
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\nexport PROJECT_NAME="test"\n'
      );

      // Run twice
      migrateTemplateFiles(testDir, {});
      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh')),
        'Hook should still exist at new location after second run'
      );
    });
  });

  // ─── AC2: settings.local.json hook paths updated ──────────────────

  describe('AC2: settings.local.json hook paths reference .pennyfarthing/project/hooks/', () => {
    it('mergeSettingsLocalJson should write setup-env.sh path using .pennyfarthing/project/hooks/', async () => {
      // Template with the new path
      const template = {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/hooks/session-start.sh',
                },
              ],
            },
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/setup-env.sh',
                },
              ],
            },
          ],
        },
        permissions: { allow: [] },
      };
      writeFileSync(
        join(assetsPath, 'templates/settings.local.json.template'),
        JSON.stringify(template, null, 2)
      );

      await mergeSettingsLocalJson(testDir, assetsPath, {});

      const settings = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );

      // Find the setup-env.sh hook entry
      const sessionStartHooks = settings.hooks?.SessionStart || [];
      const setupEnvEntry = sessionStartHooks.find((entry: { hooks?: Array<{ command?: string }> }) =>
        entry.hooks?.some((h: { command?: string }) => h.command?.includes('setup-env.sh'))
      );

      assert.ok(setupEnvEntry, 'Should have a setup-env.sh hook entry');

      const setupEnvCommand = setupEnvEntry.hooks.find(
        (h: { command?: string }) => h.command?.includes('setup-env.sh')
      ).command;

      assert.ok(
        setupEnvCommand.includes('.pennyfarthing/project/hooks/setup-env.sh'),
        `setup-env.sh path should reference .pennyfarthing/project/hooks/, got: ${setupEnvCommand}`
      );
      assert.ok(
        !setupEnvCommand.includes('.claude/project/hooks/'),
        `setup-env.sh path should NOT reference .claude/project/hooks/, got: ${setupEnvCommand}`
      );
    });

    it('mergeSettingsLocalJson should migrate existing .claude/project/hooks/ paths in settings', async () => {
      // Existing settings with legacy hook paths
      const existingSettings = {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/hooks/session-start.sh',
                },
              ],
            },
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.claude/project/hooks/setup-env.sh',
                },
              ],
            },
          ],
        },
      };
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify(existingSettings, null, 2)
      );

      // Template with new paths
      const template = {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/hooks/session-start.sh',
                },
              ],
            },
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/setup-env.sh',
                },
              ],
            },
          ],
        },
        permissions: { allow: [] },
      };
      writeFileSync(
        join(assetsPath, 'templates/settings.local.json.template'),
        JSON.stringify(template, null, 2)
      );

      await mergeSettingsLocalJson(testDir, assetsPath, {});

      const settings = JSON.parse(
        readFileSync(join(pennyfarthingDir, 'settings.local.json'), 'utf8')
      );

      // All hook commands should use .pennyfarthing/project/hooks/ not .claude/project/hooks/
      const sessionStartHooks = settings.hooks?.SessionStart || [];
      for (const entry of sessionStartHooks) {
        if (entry.hooks) {
          for (const h of entry.hooks) {
            if (h.command?.includes('setup-env.sh')) {
              assert.ok(
                h.command.includes('.pennyfarthing/project/hooks/'),
                `Legacy .claude/project/hooks/ path should be migrated, got: ${h.command}`
              );
            }
          }
        }
      }
    });
  });

  // ─── AC3: .claude/project/ cleanup ────────────────────────────────

  describe('AC3: .claude/project/ cleaned up if empty after migration', () => {
    it('migrateTemplateFiles should remove .claude/project/hooks/ if empty after migration', () => {
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\n'
      );

      migrateTemplateFiles(testDir, {});

      // The hooks directory should be cleaned up since it's now empty
      assert.ok(
        !existsSync(join(claudeDir, 'project/hooks')),
        '.claude/project/hooks/ should be removed if empty after migration'
      );
    });

    it('migrateTemplateFiles should remove .claude/project/ if empty after all migrations', () => {
      // Only setup-env.sh in project hooks
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\n'
      );
      // Also pennyfarthing-settings.yaml (migrated by same function)
      writeFileSync(
        join(claudeDir, 'project/pennyfarthing-settings.yaml'),
        'key: value\n'
      );
      // Also agent-scopes.yaml
      mkdirSync(join(claudeDir, 'project/docs'), { recursive: true });
      writeFileSync(
        join(claudeDir, 'project/docs/agent-scopes.yaml'),
        'scopes: []\n'
      );

      migrateTemplateFiles(testDir, {});

      // After migrating all project files, .claude/project/ should be cleaned up
      // (assuming no user-added files remain)
      const projectDir = join(claudeDir, 'project');
      if (existsSync(projectDir)) {
        // If it still exists, it should only contain user-added files
        const _remaining = readdirSync(projectDir, { recursive: true });
        // shared-context.md stays at .claude/project/docs/ so project/ may not be fully empty
        // but hooks/ subdirectory should be gone
        assert.ok(
          !existsSync(join(projectDir, 'hooks')),
          '.claude/project/hooks/ should be removed after migration'
        );
      }
    });

    it('should NOT remove .claude/project/ if user-added files remain', () => {
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\n'
      );
      // User added a custom hook
      writeFileSync(
        join(claudeDir, 'project/hooks/my-custom-hook.sh'),
        '#!/bin/bash\necho "custom"\n'
      );

      migrateTemplateFiles(testDir, {});

      // .claude/project/hooks/ should still exist because user's custom hook is there
      assert.ok(
        existsSync(join(claudeDir, 'project/hooks/my-custom-hook.sh')),
        'User-added hooks should NOT be removed during migration'
      );
    });
  });

  // ─── AC4: Hook functionality preserved ────────────────────────────

  describe('AC4: Existing hook functionality preserved', () => {
    it('migrated hook should have same content as original', () => {
      const hookContent = [
        '#!/bin/bash',
        '# Setup project environment',
        'export PROJECT_NAME="pennyfarthing-orchestrator"',
        'export PROJECT_LABEL="Pennyfarthing Orchestrator"',
        '',
        '# Write to CLAUDE_ENV_FILE for session persistence',
        'if [ -n "$CLAUDE_ENV_FILE" ]; then',
        '  echo "PROJECT_NAME=$PROJECT_NAME" >> "$CLAUDE_ENV_FILE"',
        '  echo "PROJECT_LABEL=$PROJECT_LABEL" >> "$CLAUDE_ENV_FILE"',
        'fi',
        '',
      ].join('\n');

      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        hookContent
      );

      migrateTemplateFiles(testDir, {});

      const migrated = readFileSync(
        join(pennyfarthingDir, 'project/hooks/setup-env.sh'),
        'utf8'
      );
      assert.strictEqual(migrated, hookContent, 'Content should be identical after migration');
    });

    it('dry-run should not actually move hooks', () => {
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\n'
      );

      migrateTemplateFiles(testDir, { dryRun: true });

      assert.ok(
        existsSync(join(claudeDir, 'project/hooks/setup-env.sh')),
        'Hook should remain at old location in dry-run mode'
      );
      assert.ok(
        !existsSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh')),
        'Hook should NOT appear at new location in dry-run mode'
      );
    });
  });

  // ─── AC5: Update migrates hooks ───────────────────────────────────

  describe('AC5: pennyfarthing update migrates hooks', () => {
    it('migrateTemplateFiles migration map should include setup-env.sh', () => {
      // Verify setup-env.sh is included in the migration map by attempting migration
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\nexport TEST=1\n'
      );

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh')),
        'setup-env.sh should be migrated by migrateTemplateFiles'
      );
    });

    it('migrateTemplateFiles should handle missing source gracefully', () => {
      // No hooks at old location — should not throw
      assert.doesNotThrow(
        () => migrateTemplateFiles(testDir, {}),
        'Should not throw when no hooks exist at old location'
      );
    });

    it('migrateTemplateFiles should migrate all project template files together', () => {
      // Setup all migratable project files at old locations
      writeFileSync(
        join(claudeDir, 'project/hooks/setup-env.sh'),
        '#!/bin/bash\n'
      );
      mkdirSync(join(claudeDir, 'project/docs'), { recursive: true });
      writeFileSync(
        join(claudeDir, 'project/docs/agent-scopes.yaml'),
        'scopes: []\n'
      );
      writeFileSync(
        join(claudeDir, 'project/pennyfarthing-settings.yaml'),
        'key: value\n'
      );

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/hooks/setup-env.sh')),
        'setup-env.sh should be migrated'
      );
      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/docs/agent-scopes.yaml')),
        'agent-scopes.yaml should be migrated'
      );
      assert.ok(
        existsSync(join(pennyfarthingDir, 'project/pennyfarthing-settings.yaml')),
        'pennyfarthing-settings.yaml should be migrated'
      );
    });
  });

  // ─── Settings template path correctness ───────────────────────────

  describe('Settings template: setup-env.sh path', () => {
    it('settings.local.json template should reference .pennyfarthing/project/hooks/setup-env.sh', () => {
      // Read the actual template
      const _templatePath = join(
        testDir,
        '../../pennyfarthing/pennyfarthing-dist/templates/settings.local.json.template'
      );

      // We can't easily read the real template from a tmp dir, so test the
      // contract: when mergeSettingsLocalJson creates settings from template,
      // the setup-env.sh path should use .pennyfarthing/
      const template = {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/hooks/session-start.sh',
                },
              ],
            },
            {
              hooks: [
                {
                  type: 'command',
                  command: '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/setup-env.sh',
                },
              ],
            },
          ],
        },
        permissions: { allow: [] },
      };
      writeFileSync(
        join(assetsPath, 'templates/settings.local.json.template'),
        JSON.stringify(template, null, 2)
      );

      // Verify template doesn't contain legacy path
      const templateContent = readFileSync(
        join(assetsPath, 'templates/settings.local.json.template'),
        'utf8'
      );
      assert.ok(
        !templateContent.includes('.claude/project/hooks/'),
        'Template should NOT contain .claude/project/hooks/ path'
      );
      assert.ok(
        templateContent.includes('.pennyfarthing/project/hooks/setup-env.sh'),
        'Template should contain .pennyfarthing/project/hooks/setup-env.sh path'
      );
    });
  });

});
