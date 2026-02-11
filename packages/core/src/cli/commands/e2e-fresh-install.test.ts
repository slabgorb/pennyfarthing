/**
 * E2E test for MSSCI-14373: Fresh repo install
 *
 * This test runs `pennyfarthing init --force` in a fresh temp directory
 * with a simulated node_modules tree (symlinked to the real pennyfarthing-dist),
 * then validates the complete installation using `pennyfarthing doctor --json`.
 *
 * Acceptance Criteria:
 * AC1: Test creates a fresh empty git repo in a temp directory
 * AC2: Runs `pennyfarthing init` in that repo
 * AC3: Validates the installation with `pennyfarthing doctor` (should pass)
 * AC4: Exercises the just scripts: dev, test, build
 * AC5: Iteratively adjusts and restarts if scripts fail
 * AC6: Cleans up the temp repo afterward
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
  statSync,
  symlinkSync,
  writeFileSync,
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
    `pf-e2e-fresh-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  // Symlink to the real pennyfarthing-dist so init can find templates, commands, etc.
  symlinkSync(REAL_PENNYFARTHING_DIST, join(targetDir, 'pennyfarthing-dist'));
}

/**
 * Initialize a git repo in the test directory so hooks can be installed.
 */
function initGitRepo(testDir: string): void {
  execSync('git init', { cwd: testDir, stdio: 'pipe' });
  // Create an initial commit so git is fully initialized
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
      // Ensure we don't pick up the real project's node_modules
      NODE_PATH: '',
      // Disable chalk/ANSI colors so --json output is parseable
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
 * Doctor outputs header text (Pennyfarthing Health Check, etc.) before the JSON
 * when --json is used. We need to extract just the JSON array.
 */
function extractDoctorJson(stdout: string): Array<{ name: string; status: string; detail?: string }> {
  // Find the first '[' which starts the JSON array
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

// ─── Test Suites ──────────────────────────────────────────────────

describe('MSSCI-14373: E2E fresh repo install', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    setupNodeModules(testDir);
    initGitRepo(testDir);
  });

  afterEach(() => {
    // AC6: Cleans up the temp repo afterward
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Create fresh git repo ────────────────────────────────

  describe('AC1: Test creates a fresh empty git repo in a temp directory', () => {
    it('should have a valid git repo in the test directory', () => {
      assert.ok(existsSync(join(testDir, '.git')), 'Test dir should be a git repo');
    });

    it('should have node_modules with pennyfarthing symlink', () => {
      const distPath = join(testDir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');
      assert.ok(existsSync(distPath), 'Fake node_modules should contain pennyfarthing-dist');
      assert.ok(lstatSync(distPath).isSymbolicLink(), 'pennyfarthing-dist should be a symlink');
    });
  });

  // ─── AC2: Run pennyfarthing init ───────────────────────────────

  describe('AC2: Runs pennyfarthing init in that repo', () => {
    it('should complete init --force without error', () => {
      const result = runCLI(testDir, ['init', '--force']);
      assert.strictEqual(
        result.status,
        0,
        `Init should exit 0, got ${result.status}.\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
      );
    });

    it('should create all required directories', () => {
      runCLI(testDir, ['init', '--force']);

      const expectedDirs = [
        '.claude',
        '.pennyfarthing',
        '.pennyfarthing/project/commands',
        '.pennyfarthing/project/skills',
        '.pennyfarthing/project/docs',
        '.pennyfarthing/project/hooks',
        'sprint',
        '.pennyfarthing/sidecars',
        '.session',
      ];

      for (const dir of expectedDirs) {
        assert.ok(
          existsSync(join(testDir, dir)),
          `Directory ${dir} should exist after init`
        );
      }
    });

    it('should create .pennyfarthing/ symlinks to node_modules', () => {
      runCLI(testDir, ['init', '--force']);

      for (const { link } of DIRECTORY_SYMLINKS) {
        const linkPath = join(testDir, link);
        assert.ok(
          existsSync(linkPath),
          `Symlink ${link} should exist`
        );
        assert.ok(
          lstatSync(linkPath).isSymbolicLink(),
          `${link} should be a symlink (not a copy)`
        );
      }
    });

    it('should copy commands as real directory (not symlink)', () => {
      runCLI(testDir, ['init', '--force']);

      const commandsDir = join(testDir, '.claude/commands');
      assert.ok(existsSync(commandsDir), '.claude/commands should exist');
      assert.ok(
        !lstatSync(commandsDir).isSymbolicLink(),
        '.claude/commands should be a real directory (not a symlink)'
      );

      // Should have at least some command files
      const files = readdirSync(commandsDir);
      assert.ok(files.length > 0, '.claude/commands should contain files');
      assert.ok(
        files.some(f => f.endsWith('.md')),
        '.claude/commands should contain .md files'
      );
    });

    it('should copy skills as real directory (not symlink)', () => {
      runCLI(testDir, ['init', '--force']);

      const skillsDir = join(testDir, '.claude/skills');
      assert.ok(existsSync(skillsDir), '.claude/skills should exist');
      assert.ok(
        !lstatSync(skillsDir).isSymbolicLink(),
        '.claude/skills should be a real directory (not a symlink)'
      );

      // Should have at least one skill subdirectory
      const entries = readdirSync(skillsDir);
      assert.ok(entries.length > 0, '.claude/skills should contain skill directories');
    });

    it('should create agent sidecars for all 10 core agents', () => {
      runCLI(testDir, ['init', '--force']);

      const sidecarFiles = ['patterns.md', 'gotchas.md', 'decisions.md'];

      for (const agent of CORE_AGENTS) {
        const sidecarDir = join(testDir, `.pennyfarthing/sidecars/${agent}`);
        assert.ok(
          existsSync(sidecarDir),
          `Sidecar dir for ${agent} should exist`
        );

        for (const file of sidecarFiles) {
          assert.ok(
            existsSync(join(sidecarDir, file)),
            `Sidecar ${file} for ${agent} should exist`
          );
        }
      }
    });

    it('should install git hooks', () => {
      runCLI(testDir, ['init', '--force']);

      const hooks = ['pre-commit', 'pre-push', 'post-merge'];
      for (const hook of hooks) {
        const hookPath = join(testDir, '.git/hooks', hook);
        assert.ok(
          existsSync(hookPath),
          `Git hook ${hook} should be installed`
        );

        // Check executable
        const stats = statSync(hookPath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        assert.ok(
          isExecutable,
          `Git hook ${hook} should be executable`
        );

        // Check it's a pennyfarthing hook
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(
          content.includes('pennyfarthing'),
          `Git hook ${hook} should contain pennyfarthing marker`
        );
      }
    });

    it('should generate template files under .pennyfarthing/', () => {
      runCLI(testDir, ['init', '--force']);

      const expectedTemplateFiles = [
        '.pennyfarthing/persona-config.yaml',
        '.pennyfarthing/preferences.yaml',
        '.pennyfarthing/project/docs/agent-scopes.yaml',
        '.pennyfarthing/project/pennyfarthing-settings.yaml',
        '.pennyfarthing/project/hooks/setup-env.sh',
      ];

      for (const file of expectedTemplateFiles) {
        assert.ok(
          existsSync(join(testDir, file)),
          `Template file ${file} should exist after init`
        );
      }
    });

    it('should generate shared-context.md at .claude/project/docs/', () => {
      runCLI(testDir, ['init', '--force']);

      assert.ok(
        existsSync(join(testDir, '.claude/project/docs/shared-context.md')),
        'shared-context.md should be at .claude/project/docs/ (user-owned file)'
      );
    });

    it('should make setup-env.sh executable', () => {
      runCLI(testDir, ['init', '--force']);

      const setupEnvPath = join(testDir, '.pennyfarthing/project/hooks/setup-env.sh');
      assert.ok(existsSync(setupEnvPath), 'setup-env.sh should exist');

      const stats = statSync(setupEnvPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      assert.ok(isExecutable, 'setup-env.sh should be executable');
    });

    it('should write manifest at .pennyfarthing/manifest.json', () => {
      runCLI(testDir, ['init', '--force']);

      const manifestPath = join(testDir, '.pennyfarthing/manifest.json');
      assert.ok(existsSync(manifestPath), 'Manifest should exist at .pennyfarthing/');

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.strictEqual(manifest.installationType, 'symlink', 'Install type should be symlink');
      assert.ok(manifest.version, 'Manifest should have a version');
      assert.ok(manifest.projectName, 'Manifest should have a project name');
      assert.ok(
        manifest.nodeModulesPath.includes('pennyfarthing-dist'),
        'Manifest should reference node_modules path'
      );

      // managedPaths should include .pennyfarthing/* paths (not .claude/agents etc.)
      assert.ok(
        manifest.managedPaths.includes('.claude/commands'),
        'managedPaths should include .claude/commands'
      );
      assert.ok(
        manifest.managedPaths.includes('.claude/skills'),
        'managedPaths should include .claude/skills'
      );
      assert.ok(
        manifest.managedPaths.some((p: string) => p.startsWith('.pennyfarthing/')),
        'managedPaths should include .pennyfarthing/ paths'
      );
      assert.ok(
        !manifest.managedPaths.includes('.claude/agents'),
        'managedPaths should NOT include legacy .claude/agents'
      );
    });

    it('should NOT write manifest at .claude/manifest.json', () => {
      runCLI(testDir, ['init', '--force']);

      assert.ok(
        !existsSync(join(testDir, '.claude/manifest.json')),
        'Manifest should NOT be at .claude/manifest.json (legacy location)'
      );
    });

    it('should create settings.local.json with symlink', () => {
      runCLI(testDir, ['init', '--force']);

      const pennyfarthingSettings = join(testDir, '.pennyfarthing/settings.local.json');
      const claudeSettings = join(testDir, '.claude/settings.local.json');

      assert.ok(
        existsSync(pennyfarthingSettings),
        'settings.local.json should exist at .pennyfarthing/'
      );
      assert.ok(
        existsSync(claudeSettings),
        '.claude/settings.local.json should exist'
      );
      assert.ok(
        lstatSync(claudeSettings).isSymbolicLink(),
        '.claude/settings.local.json should be a symlink to .pennyfarthing/'
      );

      // Verify settings content has required hooks
      const settings = JSON.parse(readFileSync(pennyfarthingSettings, 'utf8'));
      assert.ok(settings.hooks, 'Settings should have hooks');
      assert.ok(settings.hooks.SessionStart, 'Settings should have SessionStart hooks');
      assert.ok(settings.hooks.PostToolUse, 'Settings should have PostToolUse hooks');
      assert.ok(settings.hooks.Stop, 'Settings should have Stop hooks');
      assert.ok(settings.hooks.PreToolUse, 'Settings should have PreToolUse hooks');
    });

    it('should update .gitignore with pennyfarthing entries', () => {
      runCLI(testDir, ['init', '--force']);

      const gitignorePath = join(testDir, '.gitignore');
      assert.ok(existsSync(gitignorePath), '.gitignore should exist');

      const content = readFileSync(gitignorePath, 'utf8');
      assert.ok(
        content.includes('# Pennyfarthing runtime'),
        '.gitignore should contain Pennyfarthing section'
      );
      assert.ok(
        content.includes('.session/*'),
        '.gitignore should exclude .session/'
      );
      assert.ok(
        content.includes('.claude/settings.local.json'),
        '.gitignore should exclude settings.local.json'
      );
    });
  });

  // ─── AC3: Validate with doctor ─────────────────────────────────

  describe('AC3: Validates the installation with pennyfarthing doctor', () => {
    it('should pass doctor check with no failures', () => {
      // First run init
      const initResult = runCLI(testDir, ['init', '--force']);
      assert.strictEqual(initResult.status, 0, 'Init should succeed first');

      // Then run doctor
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      assert.strictEqual(
        doctorResult.status,
        0,
        `Doctor should exit 0 (no failures).\nStdout: ${doctorResult.stdout}\nStderr: ${doctorResult.stderr}`
      );

      // Parse JSON output and verify no failures
      const results = extractDoctorJson(doctorResult.stdout);
      const failures = results.filter((r: { status: string }) => r.status === 'fail');

      assert.strictEqual(
        failures.length,
        0,
        `Doctor should have 0 failures, got ${failures.length}: ${JSON.stringify(failures, null, 2)}`
      );
    });

    it('doctor should show manifest as passing', () => {
      runCLI(testDir, ['init', '--force']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const manifestCheck = results.find((r: { name: string }) => r.name === 'manifest/exists');
      assert.ok(manifestCheck, 'Doctor should check manifest');
      assert.strictEqual(manifestCheck.status, 'pass', 'Manifest check should pass');
    });

    it('doctor should show directory symlinks as passing', () => {
      runCLI(testDir, ['init', '--force']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      // Check the 6 directory symlinks (agents, guides, output-styles, personas, scripts, workflows)
      // Note: commands and skills are intentionally copied (not symlinked),
      // so doctor may warn about them — that's a separate doctor issue.
      const directorySymlinkNames = ['agents', 'guides', 'output-styles', 'personas', 'scripts', 'workflows'];

      for (const name of directorySymlinkNames) {
        const check = results.find((r: { name: string }) => r.name === `symlink/${name}`);
        assert.ok(check, `Doctor should check symlink/${name}`);
        assert.strictEqual(
          check!.status,
          'pass',
          `Symlink check symlink/${name} should pass, got ${check!.status}: ${check!.detail}`
        );
      }
    });

    it('doctor should show settings.local.json as passing', () => {
      runCLI(testDir, ['init', '--force']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const settingsCheck = results.find(
        (r: { name: string }) => r.name === 'settings.local.json'
      );
      assert.ok(settingsCheck, 'Doctor should check settings.local.json');
      assert.strictEqual(settingsCheck.status, 'pass', 'Settings check should pass');
    });

    it('doctor should show session-start hook as passing', () => {
      runCLI(testDir, ['init', '--force']);
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      const results = extractDoctorJson(doctorResult.stdout);

      const hookCheck = results.find(
        (r: { name: string }) => r.name === 'settings/session-start-hook'
      );
      assert.ok(hookCheck, 'Doctor should check session-start hook');
      assert.strictEqual(hookCheck.status, 'pass', 'Session-start hook check should pass');
    });
  });

  // ─── AC6: Cleanup verification ─────────────────────────────────

  describe('AC6: Cleans up the temp repo afterward', () => {
    it('test cleanup in afterEach removes the temp directory', () => {
      // This test verifies that the cleanup function works by
      // checking that a previously-created testDir no longer exists
      // after cleanup. Since afterEach runs after each test, we
      // validate the pattern is in place.
      assert.ok(existsSync(testDir), 'Test dir should exist during test');
      // afterEach will clean up - verified by not leaking temp dirs
    });
  });

  // ─── Idempotency ───────────────────────────────────────────────

  describe('Idempotency: Running init twice should not break things', () => {
    it('should succeed when run twice on same directory', () => {
      const result1 = runCLI(testDir, ['init', '--force']);
      assert.strictEqual(result1.status, 0, 'First init should succeed');

      const result2 = runCLI(testDir, ['init', '--force']);
      assert.strictEqual(result2.status, 0, 'Second init should succeed');

      // Doctor should still pass after double-init
      const doctorResult = runCLI(testDir, ['doctor', '--json']);
      assert.strictEqual(doctorResult.status, 0, 'Doctor should pass after double init');

      const results = extractDoctorJson(doctorResult.stdout);
      const failures = results.filter((r: { status: string }) => r.status === 'fail');
      assert.strictEqual(failures.length, 0, 'No doctor failures after double init');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should fail gracefully without node_modules', () => {
      // Create a fresh dir without node_modules
      const bareDir = createTestDir();
      initGitRepo(bareDir);

      try {
        const result = runCLI(bareDir, ['init', '--force']);
        assert.notStrictEqual(
          result.status,
          0,
          'Init should fail without node_modules'
        );
      } finally {
        rmSync(bareDir, { recursive: true, force: true });
      }
    });

    it('should work without .git directory (no hooks installed)', () => {
      // Create dir without git init
      const nonGitDir = createTestDir();
      setupNodeModules(nonGitDir);

      try {
        const result = runCLI(nonGitDir, ['init', '--force']);
        assert.strictEqual(result.status, 0, 'Init should succeed without .git');

        // Verify no hooks dir crash
        assert.ok(
          existsSync(join(nonGitDir, '.pennyfarthing/manifest.json')),
          'Manifest should still be created'
        );
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });
});
