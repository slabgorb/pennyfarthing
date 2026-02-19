/**
 * Tests for Story 117-1: Ship pyproject.toml in npm package for consumer Python hooks
 *
 * The npm package bundles pennyfarthing_scripts/ Python source but no pyproject.toml.
 * All hooks delegate to `uv run --project` which requires pyproject.toml.
 * Consumer projects must manually create one. This story ships a template
 * pyproject.toml and auto-generates it during init.
 *
 * Acceptance Criteria:
 * AC1: pyproject.toml template included in npm package (pennyfarthing-dist/)
 * AC2: Init generates pyproject.toml in consumer's .pennyfarthing/ directory
 * AC3: run-pf.sh resolves .pennyfarthing/pyproject.toml for consumer projects
 * AC4: Existing manual pyproject.toml files are not overwritten
 * AC5: Tests verify pyproject.toml generation and hook execution
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
  writeFileSync,
  symlinkSync,
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
const REAL_PENNYFARTHING_DIST = resolve(__dirname, '../../../../../pennyfarthing-dist');

// Path to the repo root (pennyfarthing/)
const REPO_ROOT = resolve(__dirname, '../../../../..');

// ─── Helpers ───────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-pyproject-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupNodeModules(testDir: string): void {
  const targetDir = join(testDir, 'node_modules/@pennyfarthing/core');
  mkdirSync(targetDir, { recursive: true });
  symlinkSync(REAL_PENNYFARTHING_DIST, join(targetDir, 'pennyfarthing-dist'));
}

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

// ─── Test Suites ──────────────────────────────────────────────────

describe('117-1: Ship pyproject.toml in npm package', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    setupNodeModules(testDir);
    initGitRepo(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Template included in pennyfarthing-dist ───────────────

  describe('AC1: pyproject.toml template included in npm package', () => {
    it('should have a pyproject.toml template in pennyfarthing-dist/templates/', () => {
      const templatePath = join(REAL_PENNYFARTHING_DIST, 'templates/pyproject.toml');
      assert.ok(
        existsSync(templatePath),
        `Template pyproject.toml should exist at pennyfarthing-dist/templates/pyproject.toml`
      );
    });

    it('template should declare pennyfarthing-scripts package', () => {
      const templatePath = join(REAL_PENNYFARTHING_DIST, 'templates/pyproject.toml');
      const content = readFileSync(templatePath, 'utf8');
      assert.ok(
        content.includes('pennyfarthing-scripts'),
        'Template should declare pennyfarthing-scripts as the package name'
      );
    });

    it('template should have required Python dependencies', () => {
      const templatePath = join(REAL_PENNYFARTHING_DIST, 'templates/pyproject.toml');
      const content = readFileSync(templatePath, 'utf8');

      const requiredDeps = ['pyyaml', 'click', 'httpx', 'ruamel.yaml'];
      for (const dep of requiredDeps) {
        assert.ok(
          content.toLowerCase().includes(dep.toLowerCase()),
          `Template should include dependency: ${dep}`
        );
      }
    });

    it('template should declare pf CLI entry point', () => {
      const templatePath = join(REAL_PENNYFARTHING_DIST, 'templates/pyproject.toml');
      const content = readFileSync(templatePath, 'utf8');
      assert.ok(
        content.includes('[project.scripts]'),
        'Template should have [project.scripts] section'
      );
      assert.ok(
        content.includes('pennyfarthing_scripts.cli:main'),
        'Template should declare pf entry point'
      );
    });

    it('template should be listed in package.json files array', () => {
      const pkgJsonPath = join(REPO_ROOT, 'package.json');
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      const files: string[] = pkgJson.files || [];

      const hasTemplateEntry = files.some(
        (f: string) => f.includes('templates') && !f.includes('!')
      );
      assert.ok(
        hasTemplateEntry,
        `package.json "files" should include templates directory. Got: ${JSON.stringify(files)}`
      );
    });
  });

  // ─── AC2: Init generates pyproject.toml ─────────────────────────

  describe('AC2: Init generates pyproject.toml in .pennyfarthing/', () => {
    it('should create pyproject.toml in .pennyfarthing/ after init', () => {
      const initResult = runCLI(testDir, ['init', '--force']);
      assert.strictEqual(initResult.status, 0, `Init should succeed. stderr: ${initResult.stderr}`);

      const pyprojectPath = join(testDir, '.pennyfarthing/pyproject.toml');
      assert.ok(
        existsSync(pyprojectPath),
        'Init should generate .pennyfarthing/pyproject.toml for consumer projects'
      );
    });

    it('generated pyproject.toml should have correct package name', () => {
      runCLI(testDir, ['init', '--force']);

      const pyprojectPath = join(testDir, '.pennyfarthing/pyproject.toml');
      const content = readFileSync(pyprojectPath, 'utf8');
      assert.ok(
        content.includes('pennyfarthing-scripts'),
        'Generated pyproject.toml should declare pennyfarthing-scripts'
      );
    });

    it('generated pyproject.toml should point pennyfarthing_scripts to node_modules', () => {
      runCLI(testDir, ['init', '--force']);

      const pyprojectPath = join(testDir, '.pennyfarthing/pyproject.toml');
      const content = readFileSync(pyprojectPath, 'utf8');
      // The generated file should reference the pennyfarthing_scripts package
      // from node_modules (where the npm package ships it)
      assert.ok(
        content.includes('pennyfarthing_scripts'),
        'Generated pyproject.toml should reference pennyfarthing_scripts package'
      );
    });

    it('update command should also generate pyproject.toml if missing', () => {
      // First init (won't create pyproject.toml with current code)
      runCLI(testDir, ['init', '--force']);

      // Remove pyproject.toml if it was created, to test update path
      const pyprojectPath = join(testDir, '.pennyfarthing/pyproject.toml');
      if (existsSync(pyprojectPath)) {
        rmSync(pyprojectPath);
      }

      // Run update
      const updateResult = runCLI(testDir, ['update']);
      assert.strictEqual(updateResult.status, 0, `Update should succeed. stderr: ${updateResult.stderr}`);

      assert.ok(
        existsSync(pyprojectPath),
        'Update should regenerate .pennyfarthing/pyproject.toml if missing'
      );
    });
  });

  // ─── AC3: run-pf.sh resolves .pennyfarthing/pyproject.toml ──────

  describe('AC3: run-pf.sh resolves consumer pyproject.toml', () => {
    it('run-pf.sh should check .pennyfarthing/pyproject.toml as resolution path', () => {
      const runPfPath = join(REAL_PENNYFARTHING_DIST, 'scripts/lib/run-pf.sh');
      const content = readFileSync(runPfPath, 'utf8');

      assert.ok(
        content.includes('.pennyfarthing/pyproject.toml'),
        'run-pf.sh should have a resolution path for .pennyfarthing/pyproject.toml'
      );
    });

    it('run-pf.sh should resolve .pennyfarthing/pyproject.toml after dogfooding and project root', () => {
      const runPfPath = join(REAL_PENNYFARTHING_DIST, 'scripts/lib/run-pf.sh');
      const content = readFileSync(runPfPath, 'utf8');

      // The resolution order should be:
      // 1. $PROJECT_ROOT/pennyfarthing/pyproject.toml (dogfooding)
      // 2. $PROJECT_ROOT/pyproject.toml (consumer with own pyproject)
      // 3. $PROJECT_ROOT/.pennyfarthing/pyproject.toml (consumer via npm install)
      const dogfoodIdx = content.indexOf('pennyfarthing/pyproject.toml');
      const projectRootIdx = content.indexOf('"$PROJECT_ROOT/pyproject.toml"');
      const pennyfarthingIdx = content.indexOf('.pennyfarthing/pyproject.toml');

      assert.ok(
        pennyfarthingIdx > projectRootIdx,
        '.pennyfarthing/pyproject.toml should be checked after $PROJECT_ROOT/pyproject.toml'
      );
      assert.ok(
        pennyfarthingIdx > dogfoodIdx,
        '.pennyfarthing/pyproject.toml should be checked after dogfooding path'
      );
    });

    it('run-pf.sh should resolve pyproject.toml after init in consumer project', () => {
      runCLI(testDir, ['init', '--force']);

      // Simulate what run-pf.sh does: check resolution
      const runPfPath = join(testDir, '.pennyfarthing/scripts/lib/run-pf.sh');
      assert.ok(existsSync(runPfPath), 'run-pf.sh should exist in installed project');

      // Run the resolution logic via bash
      const result = spawnSync('bash', ['-c', `
        export PROJECT_ROOT="${testDir}"
        source "${runPfPath}"
        echo "$_pf_project"
      `], {
        stdio: 'pipe',
        timeout: 10000,
      });

      const resolvedPath = result.stdout?.toString().trim() || '';
      assert.ok(
        resolvedPath.length > 0,
        `run-pf.sh should resolve a pyproject.toml path. stderr: ${result.stderr?.toString()}`
      );
      assert.ok(
        !resolvedPath.includes('Error'),
        `run-pf.sh should not error. Got: ${resolvedPath}`
      );
    });
  });

  // ─── AC4: Existing pyproject.toml not overwritten ───────────────

  describe('AC4: Existing pyproject.toml files are not overwritten', () => {
    it('should not overwrite existing .pennyfarthing/pyproject.toml', () => {
      // Pre-create .pennyfarthing/ dir and a custom pyproject.toml
      const pfDir = join(testDir, '.pennyfarthing');
      mkdirSync(pfDir, { recursive: true });
      const customContent = `[project]\nname = "my-custom-project"\nversion = "1.0.0"\n`;
      writeFileSync(join(pfDir, 'pyproject.toml'), customContent);

      // Run init
      runCLI(testDir, ['init', '--force']);

      // Verify custom content is preserved
      const content = readFileSync(join(pfDir, 'pyproject.toml'), 'utf8');
      assert.ok(
        content.includes('my-custom-project'),
        'Init should NOT overwrite existing .pennyfarthing/pyproject.toml'
      );
    });

    it('should not generate if project root already has pennyfarthing-scripts pyproject.toml', () => {
      // Create a project-level pyproject.toml with pennyfarthing-scripts
      writeFileSync(
        join(testDir, 'pyproject.toml'),
        `[project]\nname = "my-project"\n\n[project.optional-dependencies]\ndev = ["pennyfarthing-scripts"]\n`
      );

      // Run init
      runCLI(testDir, ['init', '--force']);

      // .pennyfarthing/pyproject.toml should NOT be generated since
      // run-pf.sh would already resolve via $PROJECT_ROOT/pyproject.toml
      const pfPyproject = join(testDir, '.pennyfarthing/pyproject.toml');
      assert.ok(
        !existsSync(pfPyproject),
        'Should not generate .pennyfarthing/pyproject.toml when project root already has one with pennyfarthing-scripts'
      );
    });

    it('should preserve custom pyproject.toml across updates', () => {
      // Init first
      runCLI(testDir, ['init', '--force']);

      // Write a custom pyproject.toml after init
      const pfPyproject = join(testDir, '.pennyfarthing/pyproject.toml');
      const customContent = `[project]\nname = "pennyfarthing-scripts"\nversion = "99.0.0"\n# user customization\n`;
      writeFileSync(pfPyproject, customContent);

      // Run update
      runCLI(testDir, ['update']);

      // Verify custom content preserved
      const content = readFileSync(pfPyproject, 'utf8');
      assert.ok(
        content.includes('99.0.0'),
        'Update should not overwrite user-customized pyproject.toml'
      );
    });
  });

  // ─── AC5: findLocalPyproject supports .pennyfarthing/ path ──────

  describe('AC5: findLocalPyproject resolves .pennyfarthing/ path', () => {
    it('findLocalPyproject should find pyproject.toml in .pennyfarthing/', async () => {
      // Dynamically import the function
      const { findLocalPyproject } = await import('../utils/python.js');

      // Create a fake consumer layout
      const consumerDir = createTestDir();
      try {
        const pfDir = join(consumerDir, '.pennyfarthing');
        mkdirSync(pfDir, { recursive: true });
        writeFileSync(
          join(pfDir, 'pyproject.toml'),
          `[project]\nname = "pennyfarthing-scripts"\n`
        );

        // nodeModulesPath would be something like:
        // /path/to/project/node_modules/@pennyfarthing/core/pennyfarthing-dist
        const fakeNmPath = join(consumerDir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');
        mkdirSync(fakeNmPath, { recursive: true });

        const result = findLocalPyproject(fakeNmPath);
        assert.ok(
          result !== null,
          'findLocalPyproject should find .pennyfarthing/pyproject.toml'
        );
        assert.ok(
          result!.includes('.pennyfarthing'),
          `Should resolve to .pennyfarthing/ path, got: ${result}`
        );
      } finally {
        rmSync(consumerDir, { recursive: true, force: true });
      }
    });
  });
});
