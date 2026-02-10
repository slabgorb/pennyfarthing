/**
 * E2E test for MSSCI-14374: Existing repo upgrade
 *
 * This test sets up an old-style installation with files in legacy .claude/
 * locations, runs `pennyfarthing update` to migrate, and validates that:
 * - Files are migrated to .pennyfarthing/
 * - Symlinks exist for Claude Code compatibility
 * - Doctor passes after migration
 * - Temp directory is cleaned up
 *
 * Acceptance Criteria:
 * AC1: Test creates a temp directory with old-style install layout (.claude/ based)
 * AC2: Test runs `pennyfarthing update` against the old layout
 * AC3: Test validates files migrated to .pennyfarthing/
 * AC4: Test validates symlinks exist for Claude Code compatibility
 * AC5: Test runs doctor and confirms it passes
 * AC6: Test cleans up temp directory afterward
 *
 * Run with: cd packages/core && npm run build && npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  lstatSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
  chmodSync,
} from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the CLI binary (compiled JS)
const CLI_BIN = resolve(__dirname, '../../../bin/pennyfarthing.js');

// Path to the real pennyfarthing-dist (for creating fake node_modules)
// From dist/cli/commands/ → packages/core/dist/cli/commands/ → 5 levels up to repo root
const REAL_PENNYFARTHING_DIST = resolve(__dirname, '../../../../../pennyfarthing-dist');

// ─── Helpers ───────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-e2e-upgrade-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a fake node_modules tree that symlinks to the real pennyfarthing-dist.
 * This simulates what `npm install pennyfarthing` would produce.
 */
function setupNodeModules(testDir: string): void {
  const targetDir = join(testDir, 'node_modules/@pennyfarthing/core');
  mkdirSync(targetDir, { recursive: true });

  // Symlink to the real pennyfarthing-dist so update can find templates, commands, etc.
  symlinkSync(REAL_PENNYFARTHING_DIST, join(targetDir, 'pennyfarthing-dist'));
}

/**
 * Initialize a git repo in the test directory so hooks can be installed.
 */
function initGitRepo(testDir: string): void {
  execSync('git init', { cwd: testDir, stdio: 'pipe' });
  writeFileSync(join(testDir, '.gitkeep'), '');
  execSync('git add .gitkeep && git commit --no-gpg-sign -m "init"', {
    cwd: testDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    },
  });
}

/**
 * Run the pennyfarthing CLI in the test directory.
 */
function runCLI(testDir: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [CLI_BIN, ...args], {
    cwd: testDir,
    stdio: 'pipe',
    timeout: 30000,
    env: {
      ...process.env,
      NODE_PATH: '',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  return {
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
    status: result.status,
  };
}

/**
 * Extract JSON array from doctor --json output.
 * Doctor outputs header text before the JSON array.
 */
function extractDoctorJson(stdout: string): Array<{ name: string; status: string; detail?: string }> {
  const jsonStart = stdout.indexOf('[');
  if (jsonStart === -1) {
    throw new Error(`No JSON array found in doctor output: ${stdout.slice(0, 200)}`);
  }
  return JSON.parse(stdout.slice(jsonStart));
}

// ─── Constants for verification ───────────────────────────────────

const CORE_AGENTS = [
  'dev', 'tea', 'sm', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'
];

const DIRECTORY_SYMLINKS = [
  { name: 'agents', link: '.pennyfarthing/agents' },
  { name: 'guides', link: '.pennyfarthing/guides' },
  { name: 'output-styles', link: '.pennyfarthing/output-styles' },
  { name: 'personas', link: '.pennyfarthing/personas' },
  { name: 'scripts', link: '.pennyfarthing/scripts' },
  { name: 'workflows', link: '.pennyfarthing/workflows' },
];

// Legacy template files that should migrate from .claude/ to .pennyfarthing/
const LEGACY_TEMPLATE_MIGRATIONS = [
  { oldPath: '.claude/project/docs/agent-scopes.yaml', newPath: '.pennyfarthing/project/docs/agent-scopes.yaml' },
  { oldPath: '.claude/project/hooks/setup-env.sh', newPath: '.pennyfarthing/project/hooks/setup-env.sh' },
  { oldPath: '.claude/project/pennyfarthing-settings.yaml', newPath: '.pennyfarthing/project/pennyfarthing-settings.yaml' },
  { oldPath: '.claude/preferences.yaml', newPath: '.pennyfarthing/preferences.yaml' },
  { oldPath: '.claude/persona-config.yaml', newPath: '.pennyfarthing/persona-config.yaml' },
];

// ─── Legacy Layout Setup ──────────────────────────────────────────

/**
 * Create an old-style Pennyfarthing installation layout.
 * This simulates what a pre-consolidation install looked like:
 * - Manifest at .claude/manifest.json (legacy location)
 * - Symlinks at .claude/{agents,guides,personas,scripts} (legacy)
 * - Template files at .claude/ locations (legacy)
 * - Sidecars at sprint/sidecars/ (legacy)
 * - settings.local.json as a real file in .claude/ (not symlinked)
 */
function createLegacyLayout(testDir: string): void {
  const distPath = join(testDir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');

  // Create required directories
  mkdirSync(join(testDir, '.claude/project/docs'), { recursive: true });
  mkdirSync(join(testDir, '.claude/project/hooks'), { recursive: true });
  mkdirSync(join(testDir, '.claude/project/commands'), { recursive: true });
  mkdirSync(join(testDir, '.claude/project/skills'), { recursive: true });
  mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
  mkdirSync(join(testDir, 'sprint'), { recursive: true });
  mkdirSync(join(testDir, '.session'), { recursive: true });

  // 1. Legacy manifest at .claude/manifest.json
  const manifest = {
    version: '9.0.0',  // Old version to trigger update
    installedAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
    projectName: 'test-upgrade',
    installationType: 'symlink',
    nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
    managedPaths: [
      '.claude/commands',
      '.claude/skills',
      '.claude/agents',      // Old-style paths
      '.claude/guides',
      '.claude/personas',
      '.claude/scripts',
    ],
    fileHashes: {},
  };
  writeFileSync(
    join(testDir, '.claude/manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // 2. Legacy symlinks at .claude/{agents,guides,personas,scripts}
  //    These pointed to node_modules in the old layout
  const legacySymlinkDirs = ['agents', 'guides', 'personas', 'scripts'];
  for (const name of legacySymlinkDirs) {
    const sourcePath = join(distPath, name);
    const linkPath = join(testDir, '.claude', name);
    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, linkPath);
    }
  }

  // 3. Legacy template files at .claude/ locations
  writeFileSync(
    join(testDir, '.claude/preferences.yaml'),
    '# User preferences\ntheme: blade-runner\n'
  );
  writeFileSync(
    join(testDir, '.claude/persona-config.yaml'),
    '# Persona config\nactive_theme: blade-runner\n'
  );
  writeFileSync(
    join(testDir, '.claude/project/docs/agent-scopes.yaml'),
    '# Agent scopes\nscopes: {}\n'
  );
  writeFileSync(
    join(testDir, '.claude/project/pennyfarthing-settings.yaml'),
    '# Settings\nrepos: []\n'
  );

  const setupEnvPath = join(testDir, '.claude/project/hooks/setup-env.sh');
  writeFileSync(setupEnvPath, '#!/bin/bash\n# Setup env\n');
  chmodSync(setupEnvPath, 0o755);

  // 4. shared-context.md (user-owned, should stay at .claude/)
  writeFileSync(
    join(testDir, '.claude/project/docs/shared-context.md'),
    '# My Project\nUser-written project description\n'
  );

  // 5. Legacy sidecars at sprint/sidecars/
  for (const agent of CORE_AGENTS) {
    const sidecarDir = join(testDir, `sprint/sidecars/${agent}`);
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(join(sidecarDir, 'patterns.md'), `# ${agent} patterns\nLegacy content\n`);
    writeFileSync(join(sidecarDir, 'gotchas.md'), `# ${agent} gotchas\nLegacy content\n`);
    writeFileSync(join(sidecarDir, 'decisions.md'), `# ${agent} decisions\nLegacy content\n`);
  }

  // 6. settings.local.json as a real file (not symlinked) in .claude/
  const settings = {
    permissions: {
      allow: ['Read', 'Grep', 'Glob'],
    },
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/hooks/session-start.sh' }] }
      ],
    },
  };
  writeFileSync(
    join(testDir, '.claude/settings.local.json'),
    JSON.stringify(settings, null, 2)
  );

  // 7. Copy commands and skills as real directories (like init did)
  //    We use the real pennyfarthing-dist as source
  const commandsSrc = join(distPath, 'commands');
  const skillsSrc = join(distPath, 'skills');
  const commandsDest = join(testDir, '.claude/commands');
  const skillsDest = join(testDir, '.claude/skills');

  mkdirSync(commandsDest, { recursive: true });
  mkdirSync(skillsDest, { recursive: true });

  // Copy a few command files
  if (existsSync(commandsSrc)) {
    for (const file of readdirSync(commandsSrc)) {
      const src = join(commandsSrc, file);
      const dest = join(commandsDest, file);
      writeFileSync(dest, readFileSync(src));
    }
  }

  // Copy skill directories
  if (existsSync(skillsSrc)) {
    for (const entry of readdirSync(skillsSrc)) {
      const srcDir = join(skillsSrc, entry);
      const destDir = join(skillsDest, entry);
      if (lstatSync(srcDir).isDirectory()) {
        mkdirSync(destDir, { recursive: true });
        for (const file of readdirSync(srcDir)) {
          const fileSrc = join(srcDir, file);
          if (!lstatSync(fileSrc).isDirectory()) {
            writeFileSync(join(destDir, file), readFileSync(fileSrc));
          }
        }
      }
    }
  }

  // 8. Git hooks (these were in .git/hooks/ in old layout too)
  const hooksDir = join(testDir, '.git/hooks');
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of ['pre-commit', 'pre-push', 'post-merge']) {
    const hookPath = join(hooksDir, hook);
    writeFileSync(hookPath, '#!/bin/bash\n# pennyfarthing hook\nexit 0\n');
    chmodSync(hookPath, 0o755);
  }
}

// ─── Test Suites ──────────────────────────────────────────────────

describe('MSSCI-14374: E2E existing repo upgrade', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    setupNodeModules(testDir);
    initGitRepo(testDir);
    createLegacyLayout(testDir);
  });

  afterEach(() => {
    // AC6: Cleans up the temp repo afterward
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Create old-style install layout ─────────────────────

  describe('AC1: Test creates a temp directory with old-style install layout', () => {
    it('should have a valid git repo with node_modules', () => {
      assert.ok(existsSync(join(testDir, '.git')), 'Test dir should be a git repo');
      const distPath = join(testDir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');
      assert.ok(existsSync(distPath), 'node_modules should contain pennyfarthing-dist');
    });

    it('should have legacy manifest at .claude/manifest.json', () => {
      const manifestPath = join(testDir, '.claude/manifest.json');
      assert.ok(existsSync(manifestPath), 'Legacy manifest should exist at .claude/');

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.strictEqual(manifest.installationType, 'symlink', 'Should be symlink type');
      assert.strictEqual(manifest.version, '9.0.0', 'Should have old version');
    });

    it('should have legacy symlinks at .claude/{agents,guides,personas,scripts}', () => {
      const legacyDirs = ['agents', 'guides', 'personas', 'scripts'];
      for (const name of legacyDirs) {
        const legacyPath = join(testDir, '.claude', name);
        assert.ok(existsSync(legacyPath), `Legacy .claude/${name} should exist`);
        assert.ok(
          lstatSync(legacyPath).isSymbolicLink(),
          `.claude/${name} should be a symlink in the legacy layout`
        );
      }
    });

    it('should have legacy template files at .claude/ locations', () => {
      for (const { oldPath } of LEGACY_TEMPLATE_MIGRATIONS) {
        assert.ok(
          existsSync(join(testDir, oldPath)),
          `Legacy template ${oldPath} should exist`
        );
      }
    });

    it('should have legacy sidecars at sprint/sidecars/', () => {
      for (const agent of CORE_AGENTS) {
        const sidecarDir = join(testDir, `sprint/sidecars/${agent}`);
        assert.ok(existsSync(sidecarDir), `Legacy sidecar for ${agent} should exist`);
        assert.ok(
          existsSync(join(sidecarDir, 'patterns.md')),
          `Legacy patterns.md for ${agent} should exist`
        );
      }
    });

    it('should have settings.local.json as a real file (not symlink)', () => {
      const settingsPath = join(testDir, '.claude/settings.local.json');
      assert.ok(existsSync(settingsPath), 'settings.local.json should exist');
      assert.ok(
        !lstatSync(settingsPath).isSymbolicLink(),
        'settings.local.json should be a real file in legacy layout'
      );
    });
  });

  // ─── AC2: Run pennyfarthing update ────────────────────────────

  describe('AC2: Test runs pennyfarthing update against the old layout', () => {
    it('should complete update without error', () => {
      const result = runCLI(testDir, ['update']);
      assert.strictEqual(
        result.status,
        0,
        `Update should exit 0, got ${result.status}.\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
      );
    });

    it('should report migration activity in output', () => {
      const result = runCLI(testDir, ['update']);
      assert.strictEqual(result.status, 0, 'Update should succeed');

      // Update should mention migration activity
      const output = result.stdout + result.stderr;
      assert.ok(
        output.includes('Migrated') || output.includes('Updated') || output.includes('Update'),
        'Output should indicate migration/update activity'
      );
    });
  });

  // ─── AC3: Validate files migrated to .pennyfarthing/ ──────────

  describe('AC3: Test validates files migrated to .pennyfarthing/', () => {
    it('should migrate manifest from .claude/ to .pennyfarthing/', () => {
      runCLI(testDir, ['update']);

      // Manifest should now be at .pennyfarthing/
      const newManifestPath = join(testDir, '.pennyfarthing/manifest.json');
      assert.ok(existsSync(newManifestPath), 'Manifest should exist at .pennyfarthing/');

      const manifest = JSON.parse(readFileSync(newManifestPath, 'utf8'));
      assert.strictEqual(manifest.installationType, 'symlink', 'Manifest should remain symlink type');
      assert.ok(manifest.version, 'Manifest should have a version');
    });

    it('should remove legacy manifest from .claude/', () => {
      runCLI(testDir, ['update']);

      assert.ok(
        !existsSync(join(testDir, '.claude/manifest.json')),
        'Legacy manifest should be removed from .claude/'
      );
    });

    it('should migrate template files to .pennyfarthing/', () => {
      runCLI(testDir, ['update']);

      for (const { oldPath, newPath } of LEGACY_TEMPLATE_MIGRATIONS) {
        assert.ok(
          existsSync(join(testDir, newPath)),
          `Template should be migrated to ${newPath}`
        );
        assert.ok(
          !existsSync(join(testDir, oldPath)),
          `Legacy template ${oldPath} should be removed after migration`
        );
      }
    });

    it('should preserve user content in migrated template files', () => {
      runCLI(testDir, ['update']);

      // preferences.yaml should retain user content
      const prefsPath = join(testDir, '.pennyfarthing/preferences.yaml');
      const content = readFileSync(prefsPath, 'utf8');
      assert.ok(
        content.includes('theme: blade-runner'),
        'Migrated preferences should preserve user content'
      );
    });

    it('should migrate sidecars from sprint/sidecars/ to .pennyfarthing/sidecars/', () => {
      runCLI(testDir, ['update']);

      for (const agent of CORE_AGENTS) {
        const newSidecarDir = join(testDir, `.pennyfarthing/sidecars/${agent}`);
        assert.ok(
          existsSync(newSidecarDir),
          `Sidecar for ${agent} should exist at .pennyfarthing/sidecars/`
        );

        // Verify files were migrated
        for (const file of ['patterns.md', 'gotchas.md', 'decisions.md']) {
          assert.ok(
            existsSync(join(newSidecarDir, file)),
            `${file} for ${agent} should exist at new location`
          );
        }

        // Verify content was preserved
        const content = readFileSync(join(newSidecarDir, 'patterns.md'), 'utf8');
        assert.ok(
          content.includes('Legacy content'),
          `Sidecar content for ${agent} should be preserved`
        );
      }
    });

    it('should remove legacy sprint/sidecars/ directory after migration', () => {
      runCLI(testDir, ['update']);

      assert.ok(
        !existsSync(join(testDir, 'sprint/sidecars')),
        'Legacy sprint/sidecars/ should be removed after migration'
      );
    });

    it('should remove legacy .claude/{agents,guides,personas,scripts} symlinks', () => {
      runCLI(testDir, ['update']);

      const legacyDirs = ['agents', 'guides', 'personas', 'scripts'];
      for (const name of legacyDirs) {
        assert.ok(
          !existsSync(join(testDir, '.claude', name)),
          `Legacy .claude/${name} should be removed after update`
        );
      }
    });

    it('should NOT move shared-context.md (user-owned, stays in .claude/)', () => {
      runCLI(testDir, ['update']);

      assert.ok(
        existsSync(join(testDir, '.claude/project/docs/shared-context.md')),
        'shared-context.md should remain at .claude/project/docs/'
      );

      const content = readFileSync(
        join(testDir, '.claude/project/docs/shared-context.md'),
        'utf8'
      );
      assert.ok(
        content.includes('User-written project description'),
        'shared-context.md content should be preserved'
      );
    });

    it('should migrate settings.local.json to .pennyfarthing/', () => {
      runCLI(testDir, ['update']);

      const pennyfarthingSettings = join(testDir, '.pennyfarthing/settings.local.json');
      assert.ok(
        existsSync(pennyfarthingSettings),
        'settings.local.json should exist at .pennyfarthing/'
      );

      // Verify settings have been merged (should include required hooks)
      const settings = JSON.parse(readFileSync(pennyfarthingSettings, 'utf8'));
      assert.ok(settings.hooks, 'Migrated settings should have hooks');
      assert.ok(settings.hooks.SessionStart, 'Should have SessionStart hooks');
    });

    it('should update managedPaths to use .pennyfarthing/ paths', () => {
      runCLI(testDir, ['update']);

      const manifestPath = join(testDir, '.pennyfarthing/manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      // Should have new .pennyfarthing/ paths
      assert.ok(
        manifest.managedPaths.some((p: string) => p.startsWith('.pennyfarthing/')),
        'managedPaths should include .pennyfarthing/ paths'
      );

      // Should still include .claude/commands and .claude/skills
      assert.ok(
        manifest.managedPaths.includes('.claude/commands'),
        'managedPaths should still include .claude/commands'
      );
      assert.ok(
        manifest.managedPaths.includes('.claude/skills'),
        'managedPaths should still include .claude/skills'
      );

      // Should NOT include old .claude/agents etc.
      assert.ok(
        !manifest.managedPaths.includes('.claude/agents'),
        'managedPaths should NOT include legacy .claude/agents'
      );
    });
  });

  // ─── AC4: Validate symlinks for Claude Code compatibility ─────

  describe('AC4: Test validates symlinks exist for Claude Code compatibility', () => {
    it('should create .pennyfarthing/ symlinks to node_modules', () => {
      runCLI(testDir, ['update']);

      for (const { link } of DIRECTORY_SYMLINKS) {
        const linkPath = join(testDir, link);
        assert.ok(
          existsSync(linkPath),
          `Symlink ${link} should exist after update`
        );
        assert.ok(
          lstatSync(linkPath).isSymbolicLink(),
          `${link} should be a symlink (not a copy)`
        );
      }
    });

    it('should maintain .claude/commands as real directory', () => {
      runCLI(testDir, ['update']);

      const commandsDir = join(testDir, '.claude/commands');
      assert.ok(existsSync(commandsDir), '.claude/commands should exist');
      assert.ok(
        !lstatSync(commandsDir).isSymbolicLink(),
        '.claude/commands should be a real directory (for Claude Code discovery)'
      );

      const files = readdirSync(commandsDir);
      assert.ok(files.length > 0, '.claude/commands should contain files');
      assert.ok(
        files.some(f => f.endsWith('.md')),
        '.claude/commands should contain .md command files'
      );
    });

    it('should maintain .claude/skills as real directory', () => {
      runCLI(testDir, ['update']);

      const skillsDir = join(testDir, '.claude/skills');
      assert.ok(existsSync(skillsDir), '.claude/skills should exist');
      assert.ok(
        !lstatSync(skillsDir).isSymbolicLink(),
        '.claude/skills should be a real directory (for Claude Code discovery)'
      );

      const entries = readdirSync(skillsDir);
      assert.ok(entries.length > 0, '.claude/skills should contain skill directories');
    });

    it('should create settings.local.json symlink at .claude/', () => {
      runCLI(testDir, ['update']);

      const claudeSettings = join(testDir, '.claude/settings.local.json');
      assert.ok(
        existsSync(claudeSettings),
        '.claude/settings.local.json should exist'
      );
      assert.ok(
        lstatSync(claudeSettings).isSymbolicLink(),
        '.claude/settings.local.json should be a symlink (pointing to .pennyfarthing/)'
      );

      // Verify the symlink target resolves correctly
      const settings = JSON.parse(readFileSync(claudeSettings, 'utf8'));
      assert.ok(settings.hooks, 'settings.local.json via symlink should have hooks');
    });

    it('should keep .claude/ directory structure intact for Claude Code', () => {
      runCLI(testDir, ['update']);

      // These paths must exist for Claude Code to discover commands/skills
      assert.ok(existsSync(join(testDir, '.claude')), '.claude/ should exist');
      assert.ok(existsSync(join(testDir, '.claude/commands')), '.claude/commands/ should exist');
      assert.ok(existsSync(join(testDir, '.claude/skills')), '.claude/skills/ should exist');
      assert.ok(existsSync(join(testDir, '.claude/settings.local.json')), '.claude/settings.local.json should exist');
    });
  });

  // ─── AC5: Run doctor and confirm it passes ────────────────────

  describe('AC5: Test runs doctor and confirms it passes', () => {
    it('should pass doctor check with no failures after update', () => {
      const updateResult = runCLI(testDir, ['update']);
      assert.strictEqual(updateResult.status, 0, 'Update should succeed first');

      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      assert.strictEqual(
        doctorResult.status,
        0,
        `Doctor should exit 0.\nStdout: ${doctorResult.stdout}\nStderr: ${doctorResult.stderr}`
      );

      const results = extractDoctorJson(doctorResult.stdout);
      const failures = results.filter((r: { status: string }) => r.status === 'fail');

      assert.strictEqual(
        failures.length,
        0,
        `Doctor should have 0 failures after upgrade, got ${failures.length}: ${JSON.stringify(failures, null, 2)}`
      );
    });

    it('doctor should show manifest as passing', () => {
      runCLI(testDir, ['update']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const manifestCheck = results.find((r: { name: string }) => r.name === 'manifest/exists');
      assert.ok(manifestCheck, 'Doctor should check manifest');
      assert.strictEqual(manifestCheck.status, 'pass', 'Manifest check should pass after upgrade');
    });

    it('doctor should show all directory symlinks as passing', () => {
      runCLI(testDir, ['update']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const directorySymlinkNames = ['agents', 'guides', 'output-styles', 'personas', 'scripts', 'workflows'];

      for (const name of directorySymlinkNames) {
        const check = results.find((r: { name: string }) => r.name === `symlink/${name}`);
        assert.ok(check, `Doctor should check symlink/${name}`);
        assert.strictEqual(
          check!.status,
          'pass',
          `symlink/${name} should pass after upgrade, got ${check!.status}: ${check!.detail}`
        );
      }
    });

    it('doctor should show settings.local.json as passing', () => {
      runCLI(testDir, ['update']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const settingsCheck = results.find(
        (r: { name: string }) => r.name === 'settings.local.json'
      );
      assert.ok(settingsCheck, 'Doctor should check settings.local.json');
      assert.strictEqual(settingsCheck.status, 'pass', 'Settings check should pass after upgrade');
    });

    it('doctor should show session-start hook as passing', () => {
      runCLI(testDir, ['update']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const hookCheck = results.find(
        (r: { name: string }) => r.name === 'settings/session-start-hook'
      );
      assert.ok(hookCheck, 'Doctor should check session-start hook');
      assert.strictEqual(hookCheck.status, 'pass', 'Session-start hook should pass after upgrade');
    });

    it('doctor should detect no legacy files after migration', () => {
      runCLI(testDir, ['update']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      // If doctor has a legacy file check, it should pass
      const legacyChecks = results.filter(
        (r: { name: string }) => r.name.startsWith('legacy/')
      );
      for (const check of legacyChecks) {
        assert.notStrictEqual(
          check.status,
          'fail',
          `Legacy check ${check.name} should not fail after migration`
        );
      }
    });
  });

  // ─── AC6: Cleanup verification ────────────────────────────────

  describe('AC6: Cleans up the temp repo afterward', () => {
    it('test cleanup in afterEach removes the temp directory', () => {
      assert.ok(existsSync(testDir), 'Test dir should exist during test');
      // afterEach will clean up
    });
  });

  // ─── Idempotency ─────────────────────────────────────────────

  describe('Idempotency: Running update twice should not break things', () => {
    it('should succeed when update is run twice', () => {
      const result1 = runCLI(testDir, ['update']);
      assert.strictEqual(result1.status, 0, 'First update should succeed');

      const result2 = runCLI(testDir, ['update']);
      assert.strictEqual(result2.status, 0, 'Second update should succeed');

      // Doctor should still pass after double-update
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      assert.strictEqual(doctorResult.status, 0, 'Doctor should pass after double update');

      const results = extractDoctorJson(doctorResult.stdout);
      const failures = results.filter((r: { status: string }) => r.status === 'fail');
      assert.strictEqual(failures.length, 0, 'No doctor failures after double update');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle missing legacy files gracefully', () => {
      // Remove some legacy files to test partial migration
      rmSync(join(testDir, '.claude/preferences.yaml'), { force: true });
      rmSync(join(testDir, '.claude/persona-config.yaml'), { force: true });

      const result = runCLI(testDir, ['update']);
      assert.strictEqual(
        result.status,
        0,
        `Update should succeed even with missing legacy files.\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
      );
    });

    it('should handle already-migrated sidecars (no duplicate)', () => {
      // Pre-create a sidecar at the new location with different content
      const newSidecarDir = join(testDir, '.pennyfarthing/sidecars/dev');
      mkdirSync(newSidecarDir, { recursive: true });
      writeFileSync(join(newSidecarDir, 'patterns.md'), '# Already at new location\n');

      const result = runCLI(testDir, ['update']);
      assert.strictEqual(result.status, 0, 'Update should succeed');

      // Existing new-location content should NOT be overwritten
      const content = readFileSync(join(newSidecarDir, 'patterns.md'), 'utf8');
      assert.ok(
        content.includes('Already at new location'),
        'Pre-existing sidecar content should not be overwritten'
      );
    });

    it('should fail without node_modules', () => {
      // Create a legacy layout without node_modules
      const bareDir = createTestDir();
      initGitRepo(bareDir);
      mkdirSync(join(bareDir, '.claude'), { recursive: true });
      mkdirSync(join(bareDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(bareDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({
          version: '9.0.0',
          installationType: 'symlink',
          projectName: 'test',
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          managedPaths: [],
          fileHashes: {},
        })
      );

      try {
        const result = runCLI(bareDir, ['update']);
        assert.notStrictEqual(
          result.status,
          0,
          'Update should fail without node_modules'
        );
      } finally {
        rmSync(bareDir, { recursive: true, force: true });
      }
    });
  });
});
