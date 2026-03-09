/**
 * Story 11-2: pnpm Workspace Structure Tests
 *
 * These tests verify the monorepo workspace structure is correctly configured.
 * Tests are designed to FAIL until the workspace conversion is complete.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { findMonorepoRoot } from './utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use shared utility to find monorepo root
const rootResult = findMonorepoRoot(__dirname);
if (!rootResult.success) { throw new Error(rootResult.error); }
const PROJECT_ROOT = rootResult.data!;

describe('Story 11-2: pnpm Workspace Structure', () => {

  describe('AC1: packages/core/src/ contains former src/', () => {
    it('should have packages/core directory', () => {
      const coreDir = join(PROJECT_ROOT, 'packages', 'core');
      assert.ok(existsSync(coreDir), 'packages/core/ directory must exist');
    });

    it('should have packages/core/src directory', () => {
      const coreSrcDir = join(PROJECT_ROOT, 'packages', 'core', 'src');
      assert.ok(existsSync(coreSrcDir), 'packages/core/src/ directory must exist');
    });

    it('should have CLI commands in packages/core/src/cli', () => {
      const cliDir = join(PROJECT_ROOT, 'packages', 'core', 'src', 'cli');
      assert.ok(existsSync(cliDir), 'packages/core/src/cli/ directory must exist');
    });

    it('should have packages/core/package.json', () => {
      const packageJson = join(PROJECT_ROOT, 'packages', 'core', 'package.json');
      assert.ok(existsSync(packageJson), 'packages/core/package.json must exist');
    });

    it('should have @pennyfarthing/core as package name', () => {
      const packageJsonPath = join(PROJECT_ROOT, 'packages', 'core', 'package.json');
      if (!existsSync(packageJsonPath)) {
        assert.fail('packages/core/package.json must exist first');
      }
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      assert.strictEqual(pkg.name, '@pennyfarthing/core', 'Package name must be @pennyfarthing/core');
    });
  });

  describe('AC2: pnpm-workspace.yaml defines packages/*', () => {
    it('should have pnpm-workspace.yaml at project root', () => {
      const workspaceYaml = join(PROJECT_ROOT, 'pnpm-workspace.yaml');
      assert.ok(existsSync(workspaceYaml), 'pnpm-workspace.yaml must exist at project root');
    });

    it('should define packages/* in workspace', () => {
      const workspaceYamlPath = join(PROJECT_ROOT, 'pnpm-workspace.yaml');
      if (!existsSync(workspaceYamlPath)) {
        assert.fail('pnpm-workspace.yaml must exist first');
      }
      const content = readFileSync(workspaceYamlPath, 'utf-8');
      const workspace = parseYaml(content) as { packages?: string[] };
      assert.ok(workspace.packages, 'workspace.packages must be defined');
      assert.ok(
        workspace.packages.some((p: string) => p.includes('packages')),
        'workspace.packages must include packages/* or similar'
      );
    });
  });

  describe('AC3: pnpm install works from root', () => {
    it('should have pnpm-lock.yaml after install', () => {
      // This test assumes pnpm install has been run
      // The presence of pnpm-lock.yaml indicates pnpm is the package manager
      const lockFile = join(PROJECT_ROOT, 'pnpm-lock.yaml');
      assert.ok(
        existsSync(lockFile),
        'pnpm-lock.yaml must exist (run pnpm install first)'
      );
    });
  });

  describe('AC4: pnpm build compiles all packages', () => {
    it('should have tsconfig.base.json for shared config', () => {
      const tsconfigBase = join(PROJECT_ROOT, 'tsconfig.base.json');
      assert.ok(existsSync(tsconfigBase), 'tsconfig.base.json must exist at project root');
    });

    it('should have packages/core/tsconfig.json', () => {
      const tsconfig = join(PROJECT_ROOT, 'packages', 'core', 'tsconfig.json');
      assert.ok(existsSync(tsconfig), 'packages/core/tsconfig.json must exist');
    });

    it('should have packages/core/dist after build', () => {
      // This test assumes build has been run
      const distDir = join(PROJECT_ROOT, 'packages', 'core', 'dist');
      assert.ok(
        existsSync(distDir),
        'packages/core/dist/ must exist (run pnpm build first)'
      );
    });

    // packages/shared was absorbed into core (Story 98-16) — no separate package
  });

  describe('AC5: CLI utilities exist (CLI entry point removed per ADR-0034)', () => {
    it('should have CLI utils in packages/core/src/cli/utils/', () => {
      const cliUtils = join(PROJECT_ROOT, 'packages', 'core', 'src', 'cli', 'utils');
      assert.ok(existsSync(cliUtils), 'packages/core/src/cli/utils/ directory must exist');
    });
  });

  describe('AC6: Existing tests pass', () => {
    it('should have test files in packages/core/src', () => {
      // After move, test files should be in packages/core/src
      const testPattern = join(PROJECT_ROOT, 'packages', 'core', 'src');
      assert.ok(
        existsSync(testPattern),
        'packages/core/src/ must exist for tests to be found'
      );
    });
  });

  describe('Workspace Dependencies', () => {
    it('should NOT have @pennyfarthing/shared in packages/core dependencies (absorbed in 98-16)', () => {
      const packageJsonPath = join(PROJECT_ROOT, 'packages', 'core', 'package.json');
      if (!existsSync(packageJsonPath)) {
        assert.fail('packages/core/package.json must exist first');
      }
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const deps = pkg.dependencies || {};
      assert.strictEqual(
        deps['@pennyfarthing/shared'], undefined,
        'packages/core should NOT depend on @pennyfarthing/shared (absorbed into core in story 98-16)'
      );
    });
  });

  describe('Root package.json', () => {
    it('should be a workspace root (has workspaces config or pnpm-workspace.yaml)', () => {
      // In pnpm workspaces, root can have dependencies for npm publishing
      // The key indicator is pnpm-workspace.yaml existence, not package.json structure
      const workspaceYamlPath = join(PROJECT_ROOT, 'pnpm-workspace.yaml');
      assert.ok(
        existsSync(workspaceYamlPath),
        'Root should have pnpm-workspace.yaml (workspace root indicator)'
      );
    });
  });
});
