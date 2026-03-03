/**
 * Story 98-16: Absorb @pennyfarthing/shared and @pennyfarthing/benchmark into core
 *
 * TDD RED phase: These tests define the consolidation contract.
 * They verify that shared and benchmark source code has been moved into core,
 * old package dependencies are removed, and all exports are re-exported from core.
 *
 * Tests are designed to FAIL until Dev completes the migration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core package root: packages/core/
const CORE_PKG = join(__dirname, '..');
// Core src: packages/core/src/ (not __dirname which is dist/ at runtime)
const CORE_SRC = join(CORE_PKG, 'src');
// Monorepo root
const MONOREPO_ROOT = join(CORE_PKG, '..', '..');

describe('Story 98-16: Absorb shared and benchmark into core', () => {

  // ── AC1: Shared source files moved into core ──────────────────────

  describe('AC1: Shared sources in packages/core/src/shared/', () => {
    const sharedDir = join(CORE_SRC, 'shared');

    it('should have packages/core/src/shared/ directory', () => {
      assert.ok(existsSync(sharedDir),
        'packages/core/src/shared/ must exist after absorbing @pennyfarthing/shared');
    });

    it('should contain portrait-resolver.ts', () => {
      assert.ok(existsSync(join(sharedDir, 'portrait-resolver.ts')),
        'portrait-resolver.ts must be in core/src/shared/');
    });

    it('should contain theme-loader.ts', () => {
      assert.ok(existsSync(join(sharedDir, 'theme-loader.ts')),
        'theme-loader.ts must be in core/src/shared/');
    });

    it('should contain skill-search.ts', () => {
      assert.ok(existsSync(join(sharedDir, 'skill-search.ts')),
        'skill-search.ts must be in core/src/shared/');
    });

    it('should contain skill-suggest.ts', () => {
      assert.ok(existsSync(join(sharedDir, 'skill-suggest.ts')),
        'skill-suggest.ts must be in core/src/shared/');
    });

    it('should contain generate-skill-docs.ts', () => {
      assert.ok(existsSync(join(sharedDir, 'generate-skill-docs.ts')),
        'generate-skill-docs.ts must be in core/src/shared/');
    });

    it('should contain marker/ subdirectory', () => {
      const markerDir = join(sharedDir, 'marker');
      assert.ok(existsSync(markerDir),
        'marker/ subdirectory must exist in core/src/shared/');
      assert.ok(existsSync(join(markerDir, 'detect.ts')),
        'marker/detect.ts must exist');
      assert.ok(existsSync(join(markerDir, 'strip.ts')),
        'marker/strip.ts must exist');
      assert.ok(existsSync(join(markerDir, 'constants.ts')),
        'marker/constants.ts must exist');
      assert.ok(existsSync(join(markerDir, 'types.ts')),
        'marker/types.ts must exist');
      assert.ok(existsSync(join(markerDir, 'index.ts')),
        'marker/index.ts must exist');
    });

    it('should contain index.ts barrel export', () => {
      assert.ok(existsSync(join(sharedDir, 'index.ts')),
        'shared/index.ts barrel export must exist in core');
    });

    it('should contain browser.ts for browser-safe exports', () => {
      assert.ok(existsSync(join(sharedDir, 'browser.ts')),
        'shared/browser.ts must exist in core for browser entry point');
    });
  });

  // ── AC2: Benchmark source files moved into core ───────────────────

  describe('AC2: Benchmark sources in packages/core/src/benchmark/', () => {
    const benchmarkDir = join(CORE_SRC, 'benchmark');

    it('should have packages/core/src/benchmark/ directory', () => {
      assert.ok(existsSync(benchmarkDir),
        'packages/core/src/benchmark/ must exist after absorbing @pennyfarthing/benchmark');
    });

    it('should contain benchmark-integration.ts', () => {
      assert.ok(existsSync(join(benchmarkDir, 'benchmark-integration.ts')),
        'benchmark-integration.ts must be in core/src/benchmark/');
    });

    it('should contain job-fair-aggregator.ts', () => {
      assert.ok(existsSync(join(benchmarkDir, 'job-fair-aggregator.ts')),
        'job-fair-aggregator.ts must be in core/src/benchmark/');
    });

    it('should contain index.ts barrel export', () => {
      assert.ok(existsSync(join(benchmarkDir, 'index.ts')),
        'benchmark/index.ts barrel export must exist in core');
    });
  });

  // ── AC3: Benchmark commands and skills in pennyfarthing-dist ──────

  describe('AC3: Benchmark commands/skills in core pennyfarthing-dist', () => {
    const distDir = join(MONOREPO_ROOT, 'pennyfarthing-dist');

    it('should have benchmark commands in pennyfarthing-dist/commands/', () => {
      const commandsDir = join(distDir, 'commands');
      assert.ok(existsSync(commandsDir), 'pennyfarthing-dist/commands/ must exist');

      // These were previously in packages/benchmark/commands/
      const expectedCommands = ['pf-benchmark.md', 'pf-benchmark-control.md', 'pf-job-fair.md', 'pf-solo.md'];
      for (const cmd of expectedCommands) {
        assert.ok(existsSync(join(commandsDir, cmd)),
          `benchmark command ${cmd} must exist in pennyfarthing-dist/commands/`);
      }
    });

    it('should have benchmark skills in pennyfarthing-dist/skills/', () => {
      const skillsDir = join(distDir, 'skills');
      assert.ok(existsSync(skillsDir), 'pennyfarthing-dist/skills/ must exist');

      // These were previously in packages/benchmark/skills/
      const expectedSkills = ['pf-finalize-run', 'pf-judge', 'pf-persona-benchmark'];
      for (const skill of expectedSkills) {
        assert.ok(existsSync(join(skillsDir, skill)),
          `benchmark skill ${skill} must exist in pennyfarthing-dist/skills/`);
      }
    });
  });

  // ── AC5: package.json dependencies cleaned ────────────────────────

  describe('AC5: Core package.json no longer lists shared/benchmark deps', () => {
    it('should not have @pennyfarthing/shared in dependencies', () => {
      const pkgJson = JSON.parse(readFileSync(join(CORE_PKG, 'package.json'), 'utf-8'));
      const deps = pkgJson.dependencies || {};
      assert.strictEqual(deps['@pennyfarthing/shared'], undefined,
        'packages/core/package.json must NOT list @pennyfarthing/shared as a dependency');
    });

    it('should not have @pennyfarthing/benchmark in dependencies or peerDependencies', () => {
      const pkgJson = JSON.parse(readFileSync(join(CORE_PKG, 'package.json'), 'utf-8'));
      const deps = pkgJson.dependencies || {};
      const peerDeps = pkgJson.peerDependencies || {};
      assert.strictEqual(deps['@pennyfarthing/benchmark'], undefined,
        'packages/core/package.json must NOT list @pennyfarthing/benchmark in dependencies');
      assert.strictEqual(peerDeps['@pennyfarthing/benchmark'], undefined,
        'packages/core/package.json must NOT list @pennyfarthing/benchmark in peerDependencies');
    });
  });

  // ── AC6: Core barrel exports re-export shared and benchmark ───────

  describe('AC6: Core index.ts re-exports shared and benchmark modules', () => {
    it('should re-export shared modules from core index.ts', () => {
      const indexContent = readFileSync(join(CORE_SRC, 'index.ts'), 'utf-8');

      // Key shared exports that must appear in core's barrel
      const sharedExports = [
        'resolvePennyfarthingDist',
        'resolvePortraitPath',
        'loadTheme',
        'listThemes',
        'searchSkills',
        'suggestSkills',
        'detectMarkers',
        'stripMarkers',
      ];

      for (const exp of sharedExports) {
        assert.ok(indexContent.includes(exp),
          `Core index.ts must re-export '${exp}' from shared modules`);
      }
    });

    it('should re-export benchmark modules from core index.ts', () => {
      const indexContent = readFileSync(join(CORE_SRC, 'index.ts'), 'utf-8');

      // Key benchmark exports that must appear in core's barrel
      const benchmarkExports = [
        'aggregateJobFairResults',
        'loadBenchmarkData',
        'calculateOceanCorrelation',
        'generateCorrelationReport',
        'queryBenchmarks',
      ];

      for (const exp of benchmarkExports) {
        assert.ok(indexContent.includes(exp),
          `Core index.ts must re-export '${exp}' from benchmark modules`);
      }
    });
  });

  // ── AC7: Plugin discovery treats benchmark as built-in ────────────

  describe('AC7: Plugin discovery excludes benchmark as built-in', () => {
    it('should include "benchmark" in EXCLUDED_PACKAGES', () => {
      const discoverySource = readFileSync(
        join(CORE_SRC, 'plugins', 'plugin-discovery.ts'), 'utf-8'
      );

      // The EXCLUDED_PACKAGES array must include 'benchmark'
      // Current: const EXCLUDED_PACKAGES = ['core', 'shared'];
      // Expected: const EXCLUDED_PACKAGES = ['core', 'shared', 'benchmark'];
      const excludedMatch = discoverySource.match(/EXCLUDED_PACKAGES\s*=\s*\[([^\]]+)\]/);
      assert.ok(excludedMatch, 'EXCLUDED_PACKAGES must be defined in plugin-discovery.ts');

      const excludedList = excludedMatch![1];
      assert.ok(excludedList.includes("'benchmark'") || excludedList.includes('"benchmark"'),
        'EXCLUDED_PACKAGES must include "benchmark" to treat it as built-in');
    });
  });

  // ── AC8: No external imports of old package names ─────────────────

  describe('AC8: No source files import old package names', () => {
    it('should not import @pennyfarthing/shared in core source files', () => {
      // Check core source files (excluding test files and this consolidation test)
      const coreSourceFiles = findTsFiles(CORE_SRC);

      for (const file of coreSourceFiles) {
        if (file.endsWith('.test.ts')) continue;
        if (file.includes('consolidation')) continue;
        const content = readFileSync(file, 'utf-8');
        const hasOldImport = content.includes("from '@pennyfarthing/shared'") ||
                             content.includes("from \"@pennyfarthing/shared\"") ||
                             content.includes("from '@pennyfarthing/shared/") ||
                             content.includes("from \"@pennyfarthing/shared/");
        assert.ok(!hasOldImport,
          `${file} must not import from @pennyfarthing/shared — use relative imports from ./shared/`);
      }
    });

    it('should not import @pennyfarthing/benchmark in core source files', () => {
      const coreSourceFiles = findTsFiles(CORE_SRC);

      for (const file of coreSourceFiles) {
        if (file.endsWith('.test.ts')) continue;
        if (file.includes('consolidation')) continue;
        const content = readFileSync(file, 'utf-8');
        const hasOldImport = content.includes("from '@pennyfarthing/benchmark'") ||
                             content.includes("from \"@pennyfarthing/benchmark\"");
        assert.ok(!hasOldImport,
          `${file} must not import from @pennyfarthing/benchmark — use relative imports from ./benchmark/`);
      }
    });
  });

  // ── AC10: Shared test files migrated alongside source ─────────────

  describe('AC10: Test files migrated into core', () => {
    it('should have shared test files in core/src/shared/', () => {
      const sharedDir = join(CORE_SRC, 'shared');
      const expectedTests = [
        'portrait-resolver.test.ts',
        'theme-loader.test.ts',
        'skill-search.test.ts',
        'skill-suggest.test.ts',
        'generate-skill-docs.test.ts',
      ];

      for (const test of expectedTests) {
        assert.ok(existsSync(join(sharedDir, test)),
          `shared test ${test} must be migrated to core/src/shared/`);
      }
    });

    it('should have shared marker test files in core/src/shared/marker/', () => {
      const markerDir = join(CORE_SRC, 'shared', 'marker');
      const expectedTests = ['detect.test.ts', 'continue.test.ts'];

      for (const test of expectedTests) {
        assert.ok(existsSync(join(markerDir, test)),
          `marker test ${test} must be migrated to core/src/shared/marker/`);
      }
    });

    it('should have benchmark test files in core/src/benchmark/', () => {
      const benchmarkDir = join(CORE_SRC, 'benchmark');
      const expectedTests = [
        'benchmark-integration.test.ts',
        'job-fair-aggregator.test.ts',
      ];

      for (const test of expectedTests) {
        assert.ok(existsSync(join(benchmarkDir, test)),
          `benchmark test ${test} must be migrated to core/src/benchmark/`);
      }
    });
  });

  // ── AC11: Bikerack absorbed into core/src/server/ ──────────────────

  describe('AC11: Bikerack sources in packages/core/src/server/', () => {
    const serverDir = join(CORE_SRC, 'server');

    it('should have bikerack entry.ts in core/src/server/', () => {
      assert.ok(existsSync(join(serverDir, 'entry.ts')),
        'entry.ts (bikerack standalone entry) must be in core/src/server/');
    });

    it('should have bikerack websocket-data-source.ts in core/src/server/', () => {
      assert.ok(existsSync(join(serverDir, 'websocket-data-source.ts')),
        'websocket-data-source.ts must be in core/src/server/');
    });

    it('should have bikerack git-cache.ts in core/src/server/', () => {
      assert.ok(existsSync(join(serverDir, 'git-cache.ts')),
        'git-cache.ts must be in core/src/server/');
    });

    it('should have bikerack sprint-data.ts in core/src/server/', () => {
      assert.ok(existsSync(join(serverDir, 'sprint-data.ts')),
        'sprint-data.ts must be in core/src/server/');
    });

    it('should use getMode/setMode in env.ts (not isBikeRackMode)', () => {
      const envContent = readFileSync(join(serverDir, 'env.ts'), 'utf-8');
      assert.ok(envContent.includes('getMode'), 'env.ts must export getMode');
      assert.ok(envContent.includes('setMode'), 'env.ts must export setMode');
      assert.ok(!envContent.includes('IS_BIKERACK'), 'env.ts must not use IS_BIKERACK env var');
    });

    it('should not import from @pennyfarthing/bikerack in server source files', () => {
      const serverFiles = findTsFiles(serverDir);

      for (const file of serverFiles) {
        if (file.endsWith('.test.ts')) continue;
        const content = readFileSync(file, 'utf-8');
        const hasOldImport = /from\s+['"]@pennyfarthing\/bikerack/.test(content);
        assert.ok(!hasOldImport,
          `${file} must not import from @pennyfarthing/bikerack — use relative imports`);
      }
    });

    it('should include "bikerack" in EXCLUDED_PACKAGES', () => {
      const discoverySource = readFileSync(
        join(CORE_SRC, 'plugins', 'plugin-discovery.ts'), 'utf-8'
      );
      const excludedMatch = discoverySource.match(/EXCLUDED_PACKAGES\s*=\s*\[([^\]]+)\]/);
      assert.ok(excludedMatch, 'EXCLUDED_PACKAGES must be defined');
      const excludedList = excludedMatch![1];
      assert.ok(excludedList.includes("'bikerack'") || excludedList.includes('"bikerack"'),
        'EXCLUDED_PACKAGES must include "bikerack" to treat it as built-in');
    });
  });

  // ── AC12: Core package.json has bikerack backward-compat exports ───

  describe('AC12: Core exports bikerack backward-compat paths', () => {
    it('should have ./bikerack/server export', () => {
      const pkgJson = JSON.parse(readFileSync(join(CORE_PKG, 'package.json'), 'utf-8'));
      assert.ok(pkgJson.exports['./bikerack/server'],
        'package.json must have ./bikerack/server export');
    });

    it('should have ./bikerack/entry export', () => {
      const pkgJson = JSON.parse(readFileSync(join(CORE_PKG, 'package.json'), 'utf-8'));
      assert.ok(pkgJson.exports['./bikerack/entry'],
        'package.json must have ./bikerack/entry export');
    });

    it('should not have @pennyfarthing/bikerack in peerDependencies', () => {
      const pkgJson = JSON.parse(readFileSync(join(CORE_PKG, 'package.json'), 'utf-8'));
      const peerDeps = pkgJson.peerDependencies || {};
      assert.strictEqual(peerDeps['@pennyfarthing/bikerack'], undefined,
        'core package.json must NOT list @pennyfarthing/bikerack in peerDependencies');
    });
  });
});

/**
 * Recursively find all .ts files in a directory.
 */
function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findTsFiles(fullPath));
      } else if (entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist yet — expected in RED state
  }
  return results;
}
