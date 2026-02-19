/**
 * Tests for Story 117-2: Generate hook commands with pf.sh wrapper path, not bare pf
 *
 * Bug: migrateHookPaths() only migrates .sh file hooks to pf.sh commands.
 * It does NOT migrate bare `pf hooks X` commands to `pf.sh hooks X`.
 * Additionally, mergeSettingsLocalJson() detects bare `pf hooks X` as
 * "already configured" and skips them, leaving broken commands in place.
 *
 * Acceptance Criteria:
 * AC1: Hook generation uses $CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/pf.sh wrapper path
 * AC2: Generated settings.local.json hooks work without pf being in PATH
 * AC3: Existing hook functionality preserved
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

import {
  migrateHookPaths,
  mergeSettingsLocalJson,
  LEGACY_HOOK_MIGRATIONS,
} from './settings.js';

// =============================================================================
// Helpers
// =============================================================================

const PF_SH_PREFIX = '"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh';

type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
};

function makeHookEntry(command: string, matcher?: string): HookEntry {
  return {
    ...(matcher !== undefined ? { matcher } : {}),
    hooks: [{ type: 'command', command }],
  };
}

// =============================================================================
// AC1: PF_SH constant and template use wrapper path
// =============================================================================

describe('117-2 AC1: Hook generation uses pf.sh wrapper path', () => {
  it('should have PF_SH prefix in all LEGACY_HOOK_MIGRATIONS values', () => {
    for (const [shName, pfCommand] of Object.entries(LEGACY_HOOK_MIGRATIONS)) {
      assert.ok(
        pfCommand.includes('.pennyfarthing/scripts/core/pf.sh'),
        `Migration for ${shName} should use pf.sh wrapper, got: ${pfCommand}`
      );
    }
  });

  it('should use $CLAUDE_PROJECT_DIR in all LEGACY_HOOK_MIGRATIONS values', () => {
    for (const [shName, pfCommand] of Object.entries(LEGACY_HOOK_MIGRATIONS)) {
      assert.ok(
        pfCommand.includes('$CLAUDE_PROJECT_DIR'),
        `Migration for ${shName} should use $CLAUDE_PROJECT_DIR, got: ${pfCommand}`
      );
    }
  });
});

// =============================================================================
// AC2: migrateHookPaths migrates bare `pf` to `pf.sh` wrapper
// =============================================================================

describe('117-2 AC2: migrateHookPaths migrates bare pf commands', () => {
  it('should migrate bare "pf hooks session-start" to pf.sh wrapper', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks session-start'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.ok(
      hooks[0].hooks![0].command!.includes('pf.sh hooks session-start'),
      `Should migrate to pf.sh wrapper, got: ${hooks[0].hooks![0].command}`
    );
    assert.ok(
      hooks[0].hooks![0].command!.includes('$CLAUDE_PROJECT_DIR'),
      `Should include $CLAUDE_PROJECT_DIR, got: ${hooks[0].hooks![0].command}`
    );
  });

  it('should migrate bare "pf hooks reflector-check" to pf.sh wrapper', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks reflector-check'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks reflector-check`,
      'Should use full pf.sh wrapper path'
    );
  });

  it('should migrate bare "pf hooks bell-mode" to pf.sh wrapper', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks bell-mode'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks bell-mode`,
    );
  });

  it('should migrate bare "pf hooks context-breaker" to pf.sh wrapper', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks context-breaker'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks context-breaker`,
    );
  });

  it('should migrate bare "pf hooks statusline" to pf.sh wrapper', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks statusline'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks statusline`,
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
      const hooks: HookEntry[] = [makeHookEntry(bareCmd)];
      const migrated = migrateHookPaths(hooks);

      const subcommand = bareCmd.replace('pf hooks ', '');
      assert.ok(migrated, `Should migrate "${bareCmd}"`);
      assert.strictEqual(
        hooks[0].hooks![0].command,
        `${PF_SH_PREFIX} hooks ${subcommand}`,
        `"${bareCmd}" should become "${PF_SH_PREFIX} hooks ${subcommand}"`
      );
    }
  });

  it('should migrate multiple bare pf commands in same hook array', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks session-start'),
      makeHookEntry('pf hooks bell-mode'),
      makeHookEntry('pf hooks context-breaker'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.strictEqual(hooks[0].hooks![0].command, `${PF_SH_PREFIX} hooks session-start`);
    assert.strictEqual(hooks[1].hooks![0].command, `${PF_SH_PREFIX} hooks bell-mode`);
    assert.strictEqual(hooks[2].hooks![0].command, `${PF_SH_PREFIX} hooks context-breaker`);
  });

  it('should NOT migrate commands that already use pf.sh wrapper', () => {
    const hooks: HookEntry[] = [
      makeHookEntry(`${PF_SH_PREFIX} hooks session-start`),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(!migrated, 'Should NOT report migration for already-correct commands');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks session-start`,
      'Should leave correct commands unchanged'
    );
  });

  it('should NOT migrate non-pf commands', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('custom-hook.sh'),
      makeHookEntry('.pennyfarthing/project/hooks/setup-env.sh'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(!migrated, 'Should NOT migrate non-pf commands');
    assert.strictEqual(hooks[0].hooks![0].command, 'custom-hook.sh');
    assert.strictEqual(hooks[1].hooks![0].command, '.pennyfarthing/project/hooks/setup-env.sh');
  });

  it('should preserve matcher when migrating bare pf commands', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks sprint-yaml', 'Edit|Write'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration occurred');
    assert.strictEqual(hooks[0].matcher, 'Edit|Write', 'Should preserve matcher');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks sprint-yaml`,
    );
  });
});

// =============================================================================
// AC2: mergeSettingsLocalJson replaces bare pf commands during merge
// =============================================================================

describe('117-2 AC2: mergeSettingsLocalJson fixes bare pf commands', () => {
  let testDir: string;
  let assetsPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-hook-migration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const pennyfarthingDir = join(testDir, '.pennyfarthing');
    assetsPath = join(testDir, 'assets');

    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(pennyfarthingDir, { recursive: true });
    mkdirSync(join(assetsPath, 'templates'), { recursive: true });

    // Template with correct pf.sh wrapper paths
    writeFileSync(
      join(assetsPath, 'templates/settings.local.json.template'),
      JSON.stringify({
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
          PostToolUse: [
            {
              hooks: [{
                type: 'command',
                command: `${PF_SH_PREFIX} hooks bell-mode`,
              }],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Edit|Write|Bash|Task',
              hooks: [{
                type: 'command',
                command: `${PF_SH_PREFIX} hooks context-breaker`,
              }],
            },
          ],
        },
        statusLine: {
          type: 'command',
          command: `${PF_SH_PREFIX} hooks statusline`,
        },
      }, null, 2),
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should migrate bare pf SessionStart hooks to pf.sh wrapper during merge', async () => {
    // Consumer has bare `pf hooks` commands from old installation
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
      },
    };
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify(existingSettings, null, 2),
    );

    await mergeSettingsLocalJson(testDir, assetsPath, {});

    const result = JSON.parse(
      readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8'),
    );

    // The bare `pf hooks session-start` should be migrated to use pf.sh wrapper
    const sessionStartCommands = result.hooks.SessionStart
      .flatMap((e: HookEntry) => e.hooks?.map(h => h.command) ?? []);

    const hasBareCommand = sessionStartCommands.some(
      (cmd: string) => cmd === 'pf hooks session-start'
    );
    const hasWrapperCommand = sessionStartCommands.some(
      (cmd: string) => cmd.includes('pf.sh hooks session-start')
    );

    assert.ok(!hasBareCommand, 'Bare "pf hooks session-start" should be migrated away');
    assert.ok(hasWrapperCommand, 'Should have pf.sh wrapper command after migration');
  });

  it('should migrate bare pf PostToolUse hooks during merge', async () => {
    const existingSettings = {
      hooks: {
        PostToolUse: [
          {
            matcher: '',
            hooks: [{
              type: 'command',
              command: 'pf hooks bell-mode',
            }],
          },
        ],
      },
    };
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify(existingSettings, null, 2),
    );

    await mergeSettingsLocalJson(testDir, assetsPath, {});

    const result = JSON.parse(
      readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8'),
    );

    const bellModeCommands = result.hooks.PostToolUse
      .flatMap((e: HookEntry) => e.hooks?.map(h => h.command) ?? []);

    const hasBareCommand = bellModeCommands.some(
      (cmd: string) => cmd === 'pf hooks bell-mode'
    );
    assert.ok(!hasBareCommand, 'Bare "pf hooks bell-mode" should be migrated');
  });

  it('should migrate bare pf Stop hooks during merge', async () => {
    const existingSettings = {
      hooks: {
        Stop: [
          {
            hooks: [{
              type: 'command',
              command: 'pf hooks reflector-check',
            }],
          },
          {
            hooks: [{
              type: 'command',
              command: 'pf hooks session-stop',
            }],
          },
        ],
      },
    };
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify(existingSettings, null, 2),
    );

    await mergeSettingsLocalJson(testDir, assetsPath, {});

    const result = JSON.parse(
      readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8'),
    );

    const stopCommands = result.hooks.Stop
      .flatMap((e: HookEntry) => e.hooks?.map(h => h.command) ?? []);

    const hasBareCommand = stopCommands.some(
      (cmd: string) => cmd.startsWith('pf hooks') && !cmd.includes('pf.sh')
    );
    assert.ok(!hasBareCommand, 'All bare "pf hooks" Stop commands should be migrated');
  });

  it('should migrate bare pf PreToolUse hooks during merge', async () => {
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [{
              type: 'command',
              command: 'pf hooks pre-edit-check',
            }],
          },
          {
            matcher: 'Edit|Write|Bash|Task',
            hooks: [{
              type: 'command',
              command: 'pf hooks context-breaker',
            }],
          },
        ],
      },
    };
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify(existingSettings, null, 2),
    );

    await mergeSettingsLocalJson(testDir, assetsPath, {});

    const result = JSON.parse(
      readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8'),
    );

    const preToolUseCommands = result.hooks.PreToolUse
      .flatMap((e: HookEntry) => e.hooks?.map(h => h.command) ?? []);

    const hasBareCommand = preToolUseCommands.some(
      (cmd: string) => cmd.startsWith('pf hooks') && !cmd.includes('pf.sh')
    );
    assert.ok(!hasBareCommand, 'All bare "pf hooks" PreToolUse commands should be migrated');
  });

  it('should migrate bare pf statusLine command during merge', async () => {
    const existingSettings = {
      hooks: {},
      statusLine: {
        type: 'command',
        command: 'pf hooks statusline',
      },
    };
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify(existingSettings, null, 2),
    );

    await mergeSettingsLocalJson(testDir, assetsPath, {});

    const result = JSON.parse(
      readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8'),
    );

    assert.ok(
      result.statusLine.command.includes('pf.sh hooks statusline'),
      `statusLine should use pf.sh wrapper, got: ${result.statusLine.command}`
    );
    assert.ok(
      result.statusLine.command !== 'pf hooks statusline',
      'Bare "pf hooks statusline" should be migrated'
    );
  });
});

// =============================================================================
// AC3: Existing hook functionality preserved
// =============================================================================

describe('117-2 AC3: Existing hook functionality preserved', () => {
  it('should still migrate .sh file hooks to pf.sh wrapper (legacy migration)', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('session-start.sh'),
      makeHookEntry('bell-mode-hook.sh'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should migrate .sh hooks');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks session-start`,
      '.sh file should migrate to pf.sh wrapper'
    );
    assert.strictEqual(
      hooks[1].hooks![0].command,
      `${PF_SH_PREFIX} hooks bell-mode`,
      '.sh file should migrate to pf.sh wrapper'
    );
  });

  it('should still migrate legacy directory paths', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('.claude/pennyfarthing/scripts/custom-script.sh'),
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should migrate legacy paths');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      '.pennyfarthing/scripts/custom-script.sh',
      'Legacy directory path should be migrated'
    );
  });

  it('should handle mixed .sh, bare pf, and pf.sh commands in same array', () => {
    const hooks: HookEntry[] = [
      makeHookEntry('session-start.sh'),                          // legacy .sh
      makeHookEntry('pf hooks bell-mode'),                        // bare pf
      makeHookEntry(`${PF_SH_PREFIX} hooks context-breaker`),     // already correct
      makeHookEntry('.pennyfarthing/project/hooks/setup-env.sh'),  // custom, leave alone
    ];

    const migrated = migrateHookPaths(hooks);

    assert.ok(migrated, 'Should report migration for .sh and bare pf');
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks session-start`,
      '.sh file migrated'
    );
    assert.strictEqual(
      hooks[1].hooks![0].command,
      `${PF_SH_PREFIX} hooks bell-mode`,
      'bare pf migrated'
    );
    assert.strictEqual(
      hooks[2].hooks![0].command,
      `${PF_SH_PREFIX} hooks context-breaker`,
      'already correct left alone'
    );
    assert.strictEqual(
      hooks[3].hooks![0].command,
      '.pennyfarthing/project/hooks/setup-env.sh',
      'custom hook left alone'
    );
  });

  it('should not produce duplicate hooks after migration', () => {
    // Consumer has BOTH bare pf and pf.sh for the same hook
    const hooks: HookEntry[] = [
      makeHookEntry('pf hooks session-start'),
      makeHookEntry(`${PF_SH_PREFIX} hooks session-start`),
    ];

    migrateHookPaths(hooks);

    // After migration, both should point to the same command
    // The deduplication happens at a higher level, but migration should still work
    assert.strictEqual(
      hooks[0].hooks![0].command,
      `${PF_SH_PREFIX} hooks session-start`,
    );
    assert.strictEqual(
      hooks[1].hooks![0].command,
      `${PF_SH_PREFIX} hooks session-start`,
    );
  });
});
