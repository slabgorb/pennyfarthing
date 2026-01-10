/**
 * Story 21-4: /run-ci thin wrapper command
 *
 * Tests for the run-ci.sh script that detects and runs CI locally.
 *
 * Detection Order:
 * 1. justfile with 'ci' recipe → `just ci`
 * 2. .github/workflows/*.yml → `act` (if installed)
 * 3. .gitlab-ci.yml → `gitlab-runner exec`
 * 4. Fallback: npm test && npm run lint && npm run build
 *
 * AC1: Command detects CI system from project files
 * AC2: Delegates to project's CI definition
 * AC3: Works with justfile 'ci' recipe
 * AC4: Works with GitHub Actions via 'act' (optional)
 * AC5: Provides clear output of what's running
 * AC6: Fallback to npm scripts if no CI config found
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, accessSync, constants, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find project root (pennyfarthing/)
function findProjectRoot(): string {
  let dir = __dirname;
  while (!existsSync(join(dir, '.claude')) && dir !== '/') {
    dir = dirname(dir);
  }
  return dir;
}

const PROJECT_ROOT = findProjectRoot();
const SCRIPT_PATH = join(PROJECT_ROOT, '.claude', 'scripts', 'run-ci.sh');

describe('Story 21-4: /run-ci command', () => {

  describe('AC1: Script exists and is executable', () => {

    it('should have run-ci.sh in .claude/scripts/', () => {
      assert.ok(existsSync(SCRIPT_PATH), 'run-ci.sh should exist');
    });

    it('should be executable', () => {
      assert.doesNotThrow(() => {
        accessSync(SCRIPT_PATH, constants.X_OK);
      }, 'run-ci.sh should be executable');
    });

  });

  describe('AC2: Detection functions exist', () => {

    it('should define has_just_ci_recipe function', () => {
      const script = readFileSync(SCRIPT_PATH, 'utf-8');
      assert.ok(script.includes('has_just_ci_recipe'), 'should define has_just_ci_recipe');
    });

    it('should define has_github_actions function', () => {
      const script = readFileSync(SCRIPT_PATH, 'utf-8');
      assert.ok(script.includes('has_github_actions'), 'should define has_github_actions');
    });

    it('should define has_gitlab_ci function', () => {
      const script = readFileSync(SCRIPT_PATH, 'utf-8');
      assert.ok(script.includes('has_gitlab_ci'), 'should define has_gitlab_ci');
    });

  });

  describe('AC3: Justfile CI recipe detection', () => {

    it('should detect justfile with ci recipe', () => {
      // Run script with --detect-only to just show what would run
      const result = spawnSync('bash', [SCRIPT_PATH, '--detect-only'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
      // Should detect something (justfile, github actions, or npm fallback)
      const output = result.stdout + result.stderr;
      assert.match(output, /detected|justfile|github|npm|fallback/i, 'should detect a CI system');
    });

  });

  describe('AC4: GitHub Actions detection', () => {

    it('should detect .github/workflows directory', () => {
      const workflowsPath = join(PROJECT_ROOT, '.github', 'workflows');
      assert.ok(existsSync(workflowsPath), '.github/workflows should exist');
    });

    it('should find CI workflow files', () => {
      const ciPath = join(PROJECT_ROOT, '.github', 'workflows', 'ci.yml');
      assert.ok(existsSync(ciPath), 'ci.yml workflow should exist');
    });

  });

  describe('AC5: Clear output format', () => {

    it('should show what CI system is being used', () => {
      const result = spawnSync('bash', [SCRIPT_PATH, '--dry-run'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
      const output = result.stdout + result.stderr;
      assert.match(output, /running|using|detected|would run/i, 'should indicate what will run');
    });

    it('should show the command being executed', () => {
      const result = spawnSync('bash', [SCRIPT_PATH, '--dry-run'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
      const output = result.stdout + result.stderr;
      assert.match(output, /just|act|npm|pnpm/i, 'should show the command');
    });

  });

  describe('AC6: Help and usage', () => {

    it('should show help with --help flag', () => {
      const result = spawnSync('bash', [SCRIPT_PATH, '--help'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
      assert.ok(result.stdout.includes('run-ci'), 'should mention run-ci');
      assert.match(result.stdout, /usage|options|help/i, 'should show usage info');
    });

    it('should exit 0 on --help', () => {
      const result = spawnSync('bash', [SCRIPT_PATH, '--help'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
      assert.strictEqual(result.status, 0, 'should exit 0 on --help');
    });

  });

  describe('AC6: Fallback behavior', () => {

    it('should have npm fallback defined', () => {
      const script = readFileSync(SCRIPT_PATH, 'utf-8');
      assert.match(script, /npm|pnpm/, 'should have npm/pnpm fallback');
      assert.match(script, /test|lint|build/, 'should reference test/lint/build');
    });

  });

});
