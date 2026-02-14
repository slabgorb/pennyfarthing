/**
 * Tests for Story 98-12: Git hook chaining with .d/ dispatcher pattern
 *
 * These tests verify that git hooks use a .d/ dispatcher pattern allowing
 * multiple hook scripts to coexist without conflicts.
 *
 * Acceptance Criteria:
 * AC1: .d/ dispatcher architecture — hooks installed via dispatcher + .d/ directory
 * AC2: Hooks can be extended and composed without conflicts
 * AC3: Support pre-commit, pre-push, and post-merge hooks
 * AC4: Integrate with the framework's install/upgrade flow
 * AC5: Maintain backward compatibility with existing hooks
 *
 * Run with: cd packages/core && pnpm build && pnpm test
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
  chmodSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

import { installGitHooks } from './init.js';

// Marker string used by pennyfarthing to identify its own hooks
const PF_MARKER = 'pennyfarthing';

// Dispatcher marker to identify the dispatcher script
const DISPATCHER_MARKER = 'pennyfarthing-dispatcher';

describe('Story 98-12: Git hook chaining with .d/ dispatcher pattern', () => {
  let testDir: string;
  let gitDir: string;
  let gitHooksDir: string;
  let nodeModulesPath: string;
  let hooksSourceDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-hook-chaining-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    gitDir = join(testDir, '.git');
    gitHooksDir = join(gitDir, 'hooks');
    nodeModulesPath = join(testDir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');
    hooksSourceDir = join(nodeModulesPath, 'scripts/hooks');

    // Create directory structure
    mkdirSync(gitHooksDir, { recursive: true });
    mkdirSync(hooksSourceDir, { recursive: true });

    // Create dispatcher template (shared source of truth)
    writeFileSync(
      join(hooksSourceDir, 'dispatcher-template.sh'),
      '#!/bin/bash\n' +
      '# pennyfarthing-dispatcher: Git hook dispatcher for __HOOK_NAME__\n' +
      '# Runs all executable scripts in __HOOK_NAME__.d/ in sorted order.\n' +
      '# Installed by pennyfarthing — do not edit manually.\n' +
      '\n' +
      'set -uo pipefail\n' +
      '\n' +
      'HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"\n' +
      'HOOK_NAME="__HOOK_NAME__"\n' +
      'D_DIR="${HOOK_DIR}/${HOOK_NAME}.d"\n' +
      '\n' +
      '# If .d/ directory doesn\'t exist or is empty, exit successfully\n' +
      'if [[ ! -d "${D_DIR}" ]]; then\n' +
      '  exit 0\n' +
      'fi\n' +
      '\n' +
      '# Capture stdin for hooks that receive input (e.g., pre-push)\n' +
      'STDIN_DATA=""\n' +
      'if [[ ! -t 0 ]]; then\n' +
      '  STDIN_DATA="$(cat /dev/stdin)"\n' +
      'fi\n' +
      '\n' +
      '# Run each executable script in sorted order\n' +
      'for hook_script in $(ls "${D_DIR}/" 2>/dev/null | sort); do\n' +
      '  script_path="${D_DIR}/${hook_script}"\n' +
      '\n' +
      '  # Skip non-executable files\n' +
      '  if [[ ! -x "${script_path}" ]]; then\n' +
      '    continue\n' +
      '  fi\n' +
      '\n' +
      '  # Run the hook, forwarding arguments and stdin\n' +
      '  if [[ -n "${STDIN_DATA}" ]]; then\n' +
      '    echo "${STDIN_DATA}" | "${script_path}" "$@"\n' +
      '  else\n' +
      '    "${script_path}" "$@"\n' +
      '  fi\n' +
      '\n' +
      '  exit_code=$?\n' +
      '  if [[ ${exit_code} -ne 0 ]]; then\n' +
      '    exit ${exit_code}\n' +
      '  fi\n' +
      'done\n' +
      '\n' +
      'exit 0\n'
    );

    // Create source hook files (mimicking pennyfarthing-dist/scripts/hooks/)
    writeFileSync(
      join(hooksSourceDir, 'pre-commit.sh'),
      '#!/bin/bash\n# pennyfarthing pre-commit hook\necho "pre-commit check"\nexit 0\n'
    );
    writeFileSync(
      join(hooksSourceDir, 'pre-push.sh'),
      '#!/bin/bash\n# pennyfarthing pre-push hook\necho "pre-push check"\nexit 0\n'
    );
    writeFileSync(
      join(hooksSourceDir, 'post-merge.sh'),
      '#!/bin/bash\n# pennyfarthing post-merge hook\necho "post-merge check"\nexit 0\n'
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: .d/ dispatcher architecture ──────────────────────────────

  describe('AC1: Dispatcher architecture with .d/ directories', () => {
    it('should create .d/ directory for each hook type', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      assert.ok(
        existsSync(join(gitHooksDir, 'pre-commit.d')),
        'pre-commit.d/ directory should be created'
      );
      assert.ok(
        existsSync(join(gitHooksDir, 'pre-push.d')),
        'pre-push.d/ directory should be created'
      );
      assert.ok(
        existsSync(join(gitHooksDir, 'post-merge.d')),
        'post-merge.d/ directory should be created'
      );
    });

    it('should install dispatcher script at .git/hooks/{hook}', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherPath = join(gitHooksDir, 'pre-commit');
      assert.ok(
        existsSync(dispatcherPath),
        'Dispatcher should exist at .git/hooks/pre-commit'
      );

      const content = readFileSync(dispatcherPath, 'utf8');
      assert.ok(
        content.includes(DISPATCHER_MARKER),
        `Dispatcher should contain '${DISPATCHER_MARKER}' marker, got:\n${content.slice(0, 200)}`
      );
    });

    it('should install pennyfarthing hook into .d/ directory', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dDir = join(gitHooksDir, 'pre-commit.d');
      assert.ok(existsSync(dDir), 'pre-commit.d/ should exist');

      const files = readdirSync(dDir);
      const pfHook = files.find((f) => f.includes('pennyfarthing'));
      assert.ok(
        pfHook,
        `Should have a pennyfarthing hook in pre-commit.d/, found: [${files.join(', ')}]`
      );

      const hookContent = readFileSync(join(dDir, pfHook!), 'utf8');
      assert.ok(
        hookContent.includes(PF_MARKER),
        'Hook in .d/ should contain pennyfarthing marker'
      );
    });

    it('dispatcher should iterate and run all scripts in .d/ directory', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherContent = readFileSync(
        join(gitHooksDir, 'pre-commit'),
        'utf8'
      );

      // Dispatcher must reference the .d/ directory
      assert.ok(
        dispatcherContent.includes('pre-commit.d') || dispatcherContent.includes('.d/') || dispatcherContent.includes('${HOOK_NAME}.d'),
        'Dispatcher should reference the .d/ directory for script iteration'
      );

      // Dispatcher should have loop logic to run scripts
      assert.ok(
        dispatcherContent.includes('for ') || dispatcherContent.includes('find '),
        'Dispatcher should iterate over scripts in .d/ directory'
      );
    });

    it('dispatcher should be executable', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherPath = join(gitHooksDir, 'pre-commit');
      const stat = statSync(dispatcherPath);
      const isExecutable = (stat.mode & 0o111) !== 0;
      assert.ok(isExecutable, 'Dispatcher script should be executable');
    });
  });

  // ─── AC2: Hooks can be extended and composed without conflicts ─────

  describe('AC2: Extension and composition without conflicts', () => {
    it('should preserve user hooks already in .d/ directory', async () => {
      // Pre-create a user hook in .d/
      const dDir = join(gitHooksDir, 'pre-commit.d');
      mkdirSync(dDir, { recursive: true });
      const userHookContent = '#!/bin/bash\necho "user hook"\nexit 0\n';
      writeFileSync(join(dDir, '99-user-lint.sh'), userHookContent);

      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // User hook should still be there
      assert.ok(
        existsSync(join(dDir, '99-user-lint.sh')),
        'User hook in .d/ should be preserved'
      );
      assert.strictEqual(
        readFileSync(join(dDir, '99-user-lint.sh'), 'utf8'),
        userHookContent,
        'User hook content should be unchanged'
      );
    });

    it('should not duplicate pennyfarthing hook on re-install', async () => {
      // Install twice
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dDir = join(gitHooksDir, 'pre-commit.d');
      const files = readdirSync(dDir);
      const pfHooks = files.filter((f) => f.includes('pennyfarthing'));

      assert.strictEqual(
        pfHooks.length,
        1,
        `Should have exactly 1 pennyfarthing hook after re-install, found ${pfHooks.length}: [${pfHooks.join(', ')}]`
      );
    });

    it('should update stale pennyfarthing hook in .d/ directory', async () => {
      // First install
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // Update the source hook
      const updatedContent = '#!/bin/bash\n# pennyfarthing pre-commit hook v2\necho "updated"\nexit 0\n';
      writeFileSync(join(hooksSourceDir, 'pre-commit.sh'), updatedContent);

      // Re-install
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dDir = join(gitHooksDir, 'pre-commit.d');
      const files = readdirSync(dDir);
      const pfHook = files.find((f) => f.includes('pennyfarthing'));
      const installedContent = readFileSync(join(dDir, pfHook!), 'utf8');

      assert.strictEqual(
        installedContent,
        updatedContent,
        'Pennyfarthing hook in .d/ should be updated with new content'
      );
    });

    it('should allow multiple tools to add hooks to .d/', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // Simulate another tool adding a hook
      const dDir = join(gitHooksDir, 'pre-commit.d');
      writeFileSync(
        join(dDir, '50-husky-lint-staged.sh'),
        '#!/bin/bash\nnpx lint-staged\n'
      );

      // Re-install pennyfarthing — should not disturb other tool's hook
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      assert.ok(
        existsSync(join(dDir, '50-husky-lint-staged.sh')),
        'Third-party tool hook should survive pennyfarthing re-install'
      );

      const files = readdirSync(dDir);
      assert.ok(
        files.length >= 2,
        `Should have at least 2 hooks (pennyfarthing + husky), found: [${files.join(', ')}]`
      );
    });
  });

  // ─── AC3: Support all three hook types ─────────────────────────────

  describe('AC3: Support pre-commit, pre-push, and post-merge hooks', () => {
    it('should install dispatcher + .d/ for pre-commit', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      assert.ok(existsSync(join(gitHooksDir, 'pre-commit')), 'pre-commit dispatcher exists');
      assert.ok(existsSync(join(gitHooksDir, 'pre-commit.d')), 'pre-commit.d/ exists');

      const files = readdirSync(join(gitHooksDir, 'pre-commit.d'));
      assert.ok(files.length > 0, 'pre-commit.d/ should have at least one hook');
    });

    it('should install dispatcher + .d/ for pre-push', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      assert.ok(existsSync(join(gitHooksDir, 'pre-push')), 'pre-push dispatcher exists');
      assert.ok(existsSync(join(gitHooksDir, 'pre-push.d')), 'pre-push.d/ exists');

      const files = readdirSync(join(gitHooksDir, 'pre-push.d'));
      assert.ok(files.length > 0, 'pre-push.d/ should have at least one hook');
    });

    it('should install dispatcher + .d/ for post-merge', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      assert.ok(existsSync(join(gitHooksDir, 'post-merge')), 'post-merge dispatcher exists');
      assert.ok(existsSync(join(gitHooksDir, 'post-merge.d')), 'post-merge.d/ exists');

      const files = readdirSync(join(gitHooksDir, 'post-merge.d'));
      assert.ok(files.length > 0, 'post-merge.d/ should have at least one hook');
    });

    it('should pass arguments through to hooks in .d/', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherContent = readFileSync(
        join(gitHooksDir, 'pre-push'),
        'utf8'
      );

      // pre-push receives remote name and URL as args — dispatcher must forward them
      assert.ok(
        dispatcherContent.includes('"$@"') || dispatcherContent.includes('$@'),
        'Dispatcher should forward arguments to hook scripts'
      );
    });

    it('should pass stdin through to hooks in .d/ (for pre-push)', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherContent = readFileSync(
        join(gitHooksDir, 'pre-push'),
        'utf8'
      );

      // pre-push receives ref info on stdin — dispatcher should handle stdin
      assert.ok(
        dispatcherContent.includes('stdin') ||
        dispatcherContent.includes('tee') ||
        dispatcherContent.includes('/dev/stdin') ||
        dispatcherContent.includes('STDIN'),
        'Dispatcher should handle stdin forwarding for hooks like pre-push'
      );
    });
  });

  // ─── AC4: Integration with install/upgrade flow ────────────────────

  describe('AC4: Integration with install/upgrade flow', () => {
    it('should create dispatcher from a template or generate it', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // Dispatcher should exist and be a proper bash script
      const dispatcherPath = join(gitHooksDir, 'pre-commit');
      const content = readFileSync(dispatcherPath, 'utf8');

      assert.ok(
        content.startsWith('#!/bin/bash') || content.startsWith('#!/usr/bin/env bash'),
        'Dispatcher should start with bash shebang'
      );
    });

    it('dry-run should not create .d/ directories or dispatcher', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: true });

      assert.ok(
        !existsSync(join(gitHooksDir, 'pre-commit.d')),
        '.d/ directory should not be created in dry-run mode'
      );

      // If a dispatcher was placed, it should not exist in dry-run
      // (unless it was pre-existing — but our test starts clean)
      if (existsSync(join(gitHooksDir, 'pre-commit'))) {
        const content = readFileSync(join(gitHooksDir, 'pre-commit'), 'utf8');
        assert.ok(
          !content.includes(DISPATCHER_MARKER),
          'Dispatcher should not be installed in dry-run mode'
        );
      }
    });

    it('should handle missing source hooks gracefully', async () => {
      // Remove one source hook
      rmSync(join(hooksSourceDir, 'pre-push.sh'));

      // Should not throw
      await assert.doesNotReject(
        async () => installGitHooks(testDir, nodeModulesPath, { dryRun: false }),
        'Should handle missing source hooks without throwing'
      );

      // The other hooks should still be installed
      assert.ok(
        existsSync(join(gitHooksDir, 'pre-commit.d')),
        'pre-commit.d/ should still be created for available hooks'
      );
    });

    it('should handle non-git repos gracefully', async () => {
      // Remove .git directory
      rmSync(gitDir, { recursive: true, force: true });

      // Should not throw
      await assert.doesNotReject(
        async () => installGitHooks(testDir, nodeModulesPath, { dryRun: false }),
        'Should handle non-git repos without throwing'
      );
    });
  });

  // ─── AC5: Backward compatibility ───────────────────────────────────

  describe('AC5: Backward compatibility with existing hooks', () => {
    it('should migrate existing single-file pennyfarthing hook into .d/', async () => {
      // Pre-existing pennyfarthing hook at old location (single file)
      const oldHookContent = '#!/bin/bash\n# pennyfarthing pre-commit hook\necho "old hook"\nexit 0\n';
      writeFileSync(join(gitHooksDir, 'pre-commit'), oldHookContent, { mode: 0o755 });

      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // Old single-file hook should be replaced by dispatcher
      const dispatcherContent = readFileSync(join(gitHooksDir, 'pre-commit'), 'utf8');
      assert.ok(
        dispatcherContent.includes(DISPATCHER_MARKER),
        'Old pennyfarthing hook should be replaced by dispatcher'
      );

      // Pennyfarthing hook content should be in .d/ directory (updated from source)
      const dDir = join(gitHooksDir, 'pre-commit.d');
      assert.ok(existsSync(dDir), 'pre-commit.d/ should be created during migration');
      const files = readdirSync(dDir);
      const pfHook = files.find((f) => f.includes('pennyfarthing'));
      assert.ok(pfHook, 'Pennyfarthing hook should be in .d/ directory');
    });

    it('should migrate existing non-pennyfarthing hook into .d/', async () => {
      // Pre-existing user/third-party hook
      const userHookContent = '#!/bin/bash\n# my custom linter\neslint .\nexit 0\n';
      writeFileSync(join(gitHooksDir, 'pre-commit'), userHookContent, { mode: 0o755 });

      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // Dispatcher should be installed
      const dispatcherContent = readFileSync(join(gitHooksDir, 'pre-commit'), 'utf8');
      assert.ok(
        dispatcherContent.includes(DISPATCHER_MARKER),
        'Dispatcher should replace the user hook'
      );

      // User hook should be moved into .d/ directory
      const dDir = join(gitHooksDir, 'pre-commit.d');
      const files = readdirSync(dDir);

      // Should have both: user's original hook + pennyfarthing hook
      assert.ok(
        files.length >= 2,
        `Should have at least 2 hooks in .d/ (user + pennyfarthing), found: [${files.join(', ')}]`
      );

      // Find the migrated user hook
      const userHook = files.find(
        (f) => !f.includes('pennyfarthing') && !f.startsWith('.')
      );
      assert.ok(userHook, `User hook should be migrated to .d/, found: [${files.join(', ')}]`);

      const migratedContent = readFileSync(join(dDir, userHook!), 'utf8');
      assert.strictEqual(
        migratedContent,
        userHookContent,
        'Migrated user hook content should be preserved'
      );
    });

    it('should not migrate an existing dispatcher (idempotent upgrade)', async () => {
      // First install — creates dispatcher
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const firstDispatcher = readFileSync(join(gitHooksDir, 'pre-commit'), 'utf8');

      // Second install — should recognize dispatcher and not re-migrate
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const secondDispatcher = readFileSync(join(gitHooksDir, 'pre-commit'), 'utf8');
      assert.strictEqual(
        firstDispatcher,
        secondDispatcher,
        'Dispatcher should be stable across re-installs'
      );

      // No duplicates in .d/
      const files = readdirSync(join(gitHooksDir, 'pre-commit.d'));
      const pfHooks = files.filter((f) => f.includes('pennyfarthing'));
      assert.strictEqual(pfHooks.length, 1, 'Should not duplicate pennyfarthing hook on upgrade');
    });

    it('should handle existing .backup files gracefully', async () => {
      // Simulate a previous installation that left .backup files
      writeFileSync(
        join(gitHooksDir, 'pre-commit.backup'),
        '#!/bin/bash\necho "old backup"\n'
      );

      // Current non-pennyfarthing hook
      writeFileSync(
        join(gitHooksDir, 'pre-commit'),
        '#!/bin/bash\necho "current user hook"\nexit 0\n',
        { mode: 0o755 }
      );

      // Should not throw and should handle gracefully
      await assert.doesNotReject(
        async () => installGitHooks(testDir, nodeModulesPath, { dryRun: false }),
        'Should handle existing .backup files gracefully'
      );

      // Dispatcher should be installed
      assert.ok(
        existsSync(join(gitHooksDir, 'pre-commit')),
        'Dispatcher should be installed'
      );
    });
  });

  // ─── Dispatcher execution behavior ─────────────────────────────────

  describe('Dispatcher execution behavior', () => {
    it('dispatcher should propagate failure exit codes', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherContent = readFileSync(
        join(gitHooksDir, 'pre-commit'),
        'utf8'
      );

      // Dispatcher should check exit codes and fail fast
      assert.ok(
        dispatcherContent.includes('exit') &&
        (dispatcherContent.includes('$?') || dispatcherContent.includes('||')),
        'Dispatcher should propagate non-zero exit codes from hook scripts'
      );
    });

    it('dispatcher should skip non-executable files in .d/', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherContent = readFileSync(
        join(gitHooksDir, 'pre-commit'),
        'utf8'
      );

      // Dispatcher should check for executable permission
      assert.ok(
        dispatcherContent.includes('-x') || dispatcherContent.includes('executable'),
        'Dispatcher should only run executable files in .d/ directory'
      );
    });

    it('dispatcher should run hooks in sorted order', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dispatcherContent = readFileSync(
        join(gitHooksDir, 'pre-commit'),
        'utf8'
      );

      // Dispatcher should sort scripts (ls or sort)
      assert.ok(
        dispatcherContent.includes('sort') || dispatcherContent.includes('ls'),
        'Dispatcher should run hooks in sorted order for deterministic execution'
      );
    });

    it('dispatcher should handle empty .d/ directory gracefully', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      // Remove all hooks from .d/ to simulate empty directory
      const dDir = join(gitHooksDir, 'pre-commit.d');
      for (const f of readdirSync(dDir)) {
        rmSync(join(dDir, f));
      }

      // Running the dispatcher should not fail
      const dispatcherPath = join(gitHooksDir, 'pre-commit');
      try {
        execSync(`bash "${dispatcherPath}"`, {
          cwd: testDir,
          timeout: 5000,
          encoding: 'utf8',
        });
      } catch (err: unknown) {
        const execErr = err as { status?: number; stderr?: string };
        assert.fail(
          `Dispatcher should succeed with empty .d/ directory, but got exit code ${execErr.status}: ${execErr.stderr}`
        );
      }
    });
  });

  // ─── Pennyfarthing hook naming convention ──────────────────────────

  describe('Hook naming conventions in .d/', () => {
    it('pennyfarthing hook should use numeric prefix for ordering', async () => {
      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dDir = join(gitHooksDir, 'pre-commit.d');
      const files = readdirSync(dDir);
      const pfHook = files.find((f) => f.includes('pennyfarthing'));

      assert.ok(pfHook, 'Pennyfarthing hook should exist');

      // Should have numeric prefix like "10-pennyfarthing-pre-commit.sh"
      assert.match(
        pfHook!,
        /^\d+-/,
        `Pennyfarthing hook should have numeric prefix for ordering, got: ${pfHook}`
      );
    });

    it('migrated user hooks should have numeric prefix', async () => {
      // Pre-existing user hook
      writeFileSync(
        join(gitHooksDir, 'pre-commit'),
        '#!/bin/bash\necho "user hook"\nexit 0\n',
        { mode: 0o755 }
      );

      await installGitHooks(testDir, nodeModulesPath, { dryRun: false });

      const dDir = join(gitHooksDir, 'pre-commit.d');
      const files = readdirSync(dDir);
      const userHook = files.find(
        (f) => !f.includes('pennyfarthing') && !f.startsWith('.')
      );

      assert.ok(userHook, 'Migrated user hook should exist');
      assert.match(
        userHook!,
        /^\d+-/,
        `Migrated user hook should have numeric prefix, got: ${userHook}`
      );
    });
  });
});
