/**
 * Tests for Story 117-2: Generate hook commands with pf.sh wrapper path, not bare pf
 *
 * The pf CLI is only available via `uv run` or the pf.sh wrapper script.
 * Consumer installs don't have `pf` on PATH. All generated hook commands
 * must use the wrapper: "$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh
 *
 * Acceptance Criteria:
 * AC1: Hook generation uses pf.sh wrapper path instead of bare `pf`
 * AC2: Existing bare `pf` hooks in settings.local.json are migrated to wrapper path
 * AC3: Tests validate the correct path is generated
 *
 * Run with: cd packages/core && pnpm build && node --test dist/cli/utils/settings-pf-wrapper.test.js
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

import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  mergeSettingsLocalJson,
  migrateHookPaths,
  LEGACY_HOOK_MIGRATIONS,
} from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** The canonical wrapper path prefix that all hook commands must use */
const PF_SH_PREFIX = '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh';

describe('Story 117-2: Hook commands use pf.sh wrapper path', () => {
  let testDir: string;
  let pennyfarthingDir: string;
  let assetsPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-wrapper-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    pennyfarthingDir = join(testDir, '.pennyfarthing');
    assetsPath = join(testDir, 'assets');

    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(pennyfarthingDir, { recursive: true });
    mkdirSync(join(assetsPath, 'templates'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Generated hooks use pf.sh wrapper path ──────────────────

  describe('AC1: LEGACY_HOOK_MIGRATIONS values use pf.sh wrapper', () => {
    it('every migration target should start with the pf.sh wrapper prefix', () => {
      for (const [legacyName, pfCommand] of Object.entries(LEGACY_HOOK_MIGRATIONS)) {
        assert.ok(
          pfCommand.startsWith(PF_SH_PREFIX),
          `Migration for '${legacyName}' should use pf.sh wrapper, got: ${pfCommand}`
        );
      }
    });

    it('no migration target should use bare "pf hooks" without wrapper', () => {
      for (const [legacyName, pfCommand] of Object.entries(LEGACY_HOOK_MIGRATIONS)) {
        // Bare pf would look like: 'pf hooks ...' at the start of the command
        const isBare = pfCommand.match(/^pf\s+hooks\s/);
        assert.ok(
          !isBare,
          `Migration for '${legacyName}' uses bare 'pf hooks' — must use pf.sh wrapper: ${pfCommand}`
        );
      }
    });
  });

  describe('AC1: Template uses pf.sh wrapper path', () => {
    it('settings template should not contain bare "pf hooks" commands', () => {
      // Use the actual template from pennyfarthing-dist
      const realTemplatePath = join(
        __dirname,
        '../../../../pennyfarthing-dist/templates/settings.local.json.template'
      );

      // Skip if running from dist/ where relative path may not resolve
      if (!existsSync(realTemplatePath)) {
        return;
      }

      const templateContent = readFileSync(realTemplatePath, 'utf8');
      const template = JSON.parse(templateContent);

      // Walk all hook entries and check commands
      for (const [hookType, hookArray] of Object.entries(template.hooks || {})) {
        if (!Array.isArray(hookArray)) continue;
        for (const entry of hookArray) {
          const hookEntry = entry as { hooks?: Array<{ command?: string }> };
          if (!hookEntry.hooks) continue;
          for (const h of hookEntry.hooks) {
            if (h.command && h.command.includes('pf hooks') && !h.command.includes('pf.sh hooks')) {
              assert.fail(
                `Template ${hookType} hook uses bare 'pf hooks': ${h.command} — must use pf.sh wrapper`
              );
            }
          }
        }
      }

      // Check statusLine too
      if (template.statusLine?.command) {
        const cmd = template.statusLine.command;
        if (cmd.includes('pf hooks') && !cmd.includes('pf.sh hooks')) {
          assert.fail(
            `Template statusLine uses bare 'pf hooks': ${cmd} — must use pf.sh wrapper`
          );
        }
      }
    });

    it('mergeSettingsLocalJson should generate hooks with pf.sh wrapper on fresh install', async () => {
      // Template using pf.sh wrapper (correct)
      const template = {
        hooks: {
          SessionStart: [
            {
              hooks: [{
                type: 'command',
                command: `${PF_SH_PREFIX} hooks session-start`,
              }],
            },
          ],
          Stop: [
            {
              hooks: [{
                type: 'command',
                command: `${PF_SH_PREFIX} hooks reflector-check`,
              }],
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

      // Every hook command should use the wrapper
      for (const [hookType, hookArray] of Object.entries(settings.hooks || {})) {
        if (!Array.isArray(hookArray)) continue;
        for (const entry of hookArray as Array<{ hooks?: Array<{ command?: string }> }>) {
          if (!entry.hooks) continue;
          for (const h of entry.hooks) {
            if (h.command?.includes('pf hooks') || h.command?.includes('pf ')) {
              assert.ok(
                h.command.includes('pf.sh'),
                `Generated ${hookType} hook should use pf.sh wrapper, got: ${h.command}`
              );
            }
          }
        }
      }
    });
  });

  // ─── AC2: Bare `pf` commands are migrated to wrapper path ─────────

  describe('AC2: migrateHookPaths converts bare "pf hooks" to pf.sh wrapper', () => {
    it('should migrate bare "pf hooks session-start" to pf.sh wrapper', () => {
      const hookArray = [
        {
          hooks: [{
            type: 'command',
            command: 'pf hooks session-start',
          }],
        },
      ];

      const migrated = migrateHookPaths(hookArray);

      assert.ok(migrated, 'Should report migration occurred');
      assert.ok(
        hookArray[0].hooks[0].command.includes('pf.sh'),
        `Should use pf.sh wrapper, got: ${hookArray[0].hooks[0].command}`
      );
      assert.strictEqual(
        hookArray[0].hooks[0].command,
        `${PF_SH_PREFIX} hooks session-start`,
        'Should use the canonical pf.sh wrapper path'
      );
    });

    it('should migrate bare "pf hooks bell-mode" to pf.sh wrapper', () => {
      const hookArray = [
        {
          hooks: [{
            type: 'command',
            command: 'pf hooks bell-mode',
          }],
        },
      ];

      migrateHookPaths(hookArray);

      assert.strictEqual(
        hookArray[0].hooks[0].command,
        `${PF_SH_PREFIX} hooks bell-mode`,
        'Should migrate bare pf hooks bell-mode to wrapper path'
      );
    });

    it('should migrate bare "pf hooks statusline" to pf.sh wrapper', () => {
      const hookArray = [
        {
          hooks: [{
            type: 'command',
            command: 'pf hooks statusline',
          }],
        },
      ];

      migrateHookPaths(hookArray);

      assert.strictEqual(
        hookArray[0].hooks[0].command,
        `${PF_SH_PREFIX} hooks statusline`,
        'Should migrate bare pf hooks statusline to wrapper path'
      );
    });

    it('should migrate all known bare pf hook commands', () => {
      const bareCommands = [
        'pf hooks session-start',
        'pf hooks session-stop',
        'pf hooks reflector-check',
        'pf hooks pre-edit-check',
        'pf hooks context-warning',
        'pf hooks context-breaker',
        'pf hooks cyclist-pretooluse',
        'pf hooks schema-validation',
        'pf hooks bell-mode',
        'pf hooks sprint-yaml',
        'pf hooks statusline',
      ];

      for (const bareCmd of bareCommands) {
        const hookArray = [
          { hooks: [{ type: 'command', command: bareCmd }] },
        ];

        const migrated = migrateHookPaths(hookArray);

        assert.ok(migrated, `Should migrate '${bareCmd}'`);
        assert.ok(
          hookArray[0].hooks[0].command.startsWith(PF_SH_PREFIX),
          `'${bareCmd}' should be migrated to wrapper path, got: ${hookArray[0].hooks[0].command}`
        );
        assert.ok(
          !hookArray[0].hooks[0].command.match(/^pf\s/),
          `'${bareCmd}' should not start with bare 'pf' after migration`
        );
      }
    });

    it('should NOT modify commands that already use pf.sh wrapper', () => {
      const wrapperCommand = `${PF_SH_PREFIX} hooks session-start`;
      const hookArray = [
        { hooks: [{ type: 'command', command: wrapperCommand }] },
      ];

      const migrated = migrateHookPaths(hookArray);

      assert.ok(!migrated, 'Should not report migration for already-correct commands');
      assert.strictEqual(
        hookArray[0].hooks[0].command,
        wrapperCommand,
        'Command should remain unchanged'
      );
    });

    it('should NOT modify non-pf hook commands', () => {
      const customCommand = '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/project/hooks/setup-env.sh';
      const hookArray = [
        { hooks: [{ type: 'command', command: customCommand }] },
      ];

      migrateHookPaths(hookArray);

      assert.strictEqual(
        hookArray[0].hooks[0].command,
        customCommand,
        'Non-pf commands should not be modified'
      );
    });
  });

  describe('AC2: mergeSettingsLocalJson migrates existing bare pf commands', () => {
    it('should migrate bare "pf hooks" in existing settings during merge', async () => {
      // Existing settings with bare pf commands
      const existingSettings = {
        hooks: {
          SessionStart: [
            {
              hooks: [{
                type: 'command',
                command: 'pf hooks session-start',
              }],
            },
          ],
          PostToolUse: [
            {
              hooks: [{
                type: 'command',
                command: 'pf hooks bell-mode',
              }],
            },
          ],
        },
      };
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify(existingSettings, null, 2)
      );

      // Template with correct wrapper paths
      const template = {
        hooks: {
          SessionStart: [
            {
              hooks: [{
                type: 'command',
                command: `${PF_SH_PREFIX} hooks session-start`,
              }],
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

      // Check all hook commands use wrapper path
      for (const [hookType, hookArray] of Object.entries(settings.hooks || {})) {
        if (!Array.isArray(hookArray)) continue;
        for (const entry of hookArray as Array<{ hooks?: Array<{ command?: string }> }>) {
          if (!entry.hooks) continue;
          for (const h of entry.hooks) {
            if (h.command?.includes('pf hooks')) {
              assert.ok(
                h.command.includes('pf.sh hooks'),
                `${hookType} hook should use pf.sh wrapper after merge, got: ${h.command}`
              );
            }
          }
        }
      }
    });
  });

  // ─── AC3: Validate the correct path is generated ──────────────────

  describe('AC3: No bare "pf" commands leak through any code path', () => {
    it('fresh install from template should have zero bare pf commands', async () => {
      const template = {
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks session-start` }] },
          ],
          Stop: [
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks reflector-check` }] },
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks session-stop` }] },
          ],
          PostToolUse: [
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks bell-mode` }] },
          ],
          PreToolUse: [
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks pre-edit-check` }] },
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks context-breaker` }] },
          ],
        },
        statusLine: {
          type: 'command',
          command: `${PF_SH_PREFIX} hooks statusline`,
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

      // Walk every command in every hook type
      const barePfCommands: string[] = [];
      for (const hookArray of Object.values(settings.hooks || {})) {
        if (!Array.isArray(hookArray)) continue;
        for (const entry of hookArray as Array<{ hooks?: Array<{ command?: string }> }>) {
          if (!entry.hooks) continue;
          for (const h of entry.hooks) {
            if (h.command && /^pf\s/.test(h.command)) {
              barePfCommands.push(h.command);
            }
          }
        }
      }

      // Check statusLine
      if (settings.statusLine?.command && /^pf\s/.test(settings.statusLine.command)) {
        barePfCommands.push(settings.statusLine.command);
      }

      assert.strictEqual(
        barePfCommands.length,
        0,
        `Found bare 'pf' commands that should use pf.sh wrapper: ${barePfCommands.join(', ')}`
      );
    });

    it('merge on settings with mixed bare and wrapper commands should fix all', async () => {
      // Settings with a mix of bare and wrapper commands
      const existingSettings = {
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks session-start` }] },
          ],
          Stop: [
            { hooks: [{ type: 'command', command: 'pf hooks reflector-check' }] },
          ],
          PostToolUse: [
            { hooks: [{ type: 'command', command: 'pf hooks bell-mode' }] },
          ],
        },
        statusLine: {
          type: 'command',
          command: 'pf hooks statusline',
        },
      };
      writeFileSync(
        join(pennyfarthingDir, 'settings.local.json'),
        JSON.stringify(existingSettings, null, 2)
      );

      const template = {
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: `${PF_SH_PREFIX} hooks session-start` }] },
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

      // Every pf hook command should now use the wrapper
      const barePfCommands: string[] = [];
      for (const hookArray of Object.values(settings.hooks || {})) {
        if (!Array.isArray(hookArray)) continue;
        for (const entry of hookArray as Array<{ hooks?: Array<{ command?: string }> }>) {
          if (!entry.hooks) continue;
          for (const h of entry.hooks) {
            if (h.command && /^pf\s/.test(h.command)) {
              barePfCommands.push(h.command);
            }
          }
        }
      }

      // statusLine should also be migrated
      if (settings.statusLine?.command && /^pf\s/.test(settings.statusLine.command)) {
        barePfCommands.push(settings.statusLine.command);
      }

      assert.strictEqual(
        barePfCommands.length,
        0,
        `After merge, all bare 'pf' commands should be migrated: ${barePfCommands.join(', ')}`
      );
    });
  });
});
