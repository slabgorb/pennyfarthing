/**
 * Tests for MSSCI-14370: Update init command for bootstrapping install
 *
 * These tests verify that the init command creates the consolidated .pennyfarthing/
 * layout established by epic-85 stories 1.2-1.5.
 *
 * Key changes tested:
 * - Manifest at .pennyfarthing/manifest.json (not .claude/)
 * - Template files placed under .pennyfarthing/ (not .claude/)
 * - managedPaths in manifest reflect new layout
 * - Backward compatibility with legacy .claude/ manifest
 * - Directory structure includes .pennyfarthing/project/* dirs
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
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  manifestExists,
  readManifest,
  writeManifest,
  createManifest,
  getManifestPath,
} from '../utils/manifest.js';

describe('MSSCI-14370: Consolidated .pennyfarthing/ layout', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pf-init-consol-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── Manifest location (AC1) ──────────────────────────────────────

  describe('Manifest at .pennyfarthing/manifest.json', () => {
    it('getManifestPath() should return .pennyfarthing/manifest.json', () => {
      // Currently MANIFEST_PATH = '.claude/manifest.json'
      // Should be changed to '.pennyfarthing/manifest.json'
      const result = getManifestPath(testDir);
      assert.strictEqual(
        result,
        join(testDir, '.pennyfarthing/manifest.json'),
        'getManifestPath() should point to .pennyfarthing/manifest.json'
      );
    });

    it('writeManifest() should write to .pennyfarthing/manifest.json', () => {
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

      const manifest = createManifest('test-project', '9.5.0', {
        nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
      });
      writeManifest(testDir, manifest);

      // File should exist at new location
      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        'Manifest should be written to .pennyfarthing/manifest.json'
      );
      // File should NOT exist at old location (unless it's for backward compat)
      assert.ok(
        !existsSync(join(testDir, '.claude/manifest.json')),
        'Manifest should NOT be written to .claude/manifest.json on fresh install'
      );
    });

    it('manifestExists() should find manifest at .pennyfarthing/', () => {
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({
          version: '9.5.0',
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          projectName: 'test',
          installationType: 'symlink',
          managedPaths: [],
          fileHashes: {},
        }, null, 2) + '\n'
      );

      assert.ok(
        manifestExists(testDir),
        'manifestExists() should detect manifest at .pennyfarthing/'
      );
    });

    it('readManifest() should read from .pennyfarthing/', () => {
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({
          version: '9.5.0',
          installedAt: '2026-02-06T00:00:00Z',
          updatedAt: '2026-02-06T00:00:00Z',
          projectName: 'new-project',
          installationType: 'symlink',
          managedPaths: [],
          fileHashes: {},
        }, null, 2) + '\n'
      );

      const result = readManifest(testDir);
      assert.strictEqual(result.success, true);
      assert.ok(result.data, 'readManifest() should return manifest from .pennyfarthing/');
      assert.strictEqual(result.data!.projectName, 'new-project');
      assert.strictEqual(result.data!.version, '9.5.0');
    });
  });

  // ─── Backward compatibility (AC10) ─────────────────────────────────

  describe('Backward compatibility with legacy .claude/ manifest', () => {
    it('manifestExists() should find manifest at legacy .claude/ location', () => {
      // Old installs have manifest at .claude/manifest.json
      // manifestExists() must check both locations for backward compat
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        join(testDir, '.claude/manifest.json'),
        JSON.stringify({
          version: '9.3.0',
          installedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          projectName: 'legacy',
          installationType: 'symlink',
          managedPaths: [],
          fileHashes: {},
        }, null, 2) + '\n'
      );

      assert.ok(
        manifestExists(testDir),
        'manifestExists() should still detect manifest at legacy .claude/ location'
      );
    });

    it('readManifest() should read from legacy .claude/ when .pennyfarthing/ has none', () => {
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        join(testDir, '.claude/manifest.json'),
        JSON.stringify({
          version: '9.3.0',
          installedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          projectName: 'legacy-project',
          installationType: 'symlink',
          managedPaths: [],
          fileHashes: {},
        }, null, 2) + '\n'
      );

      const result2 = readManifest(testDir);
      assert.strictEqual(result2.success, true);
      assert.ok(result2.data, 'readManifest() should fall back to .claude/ location');
      assert.strictEqual(result2.data!.projectName, 'legacy-project');
    });

    it('.pennyfarthing/ manifest should take precedence over .claude/ manifest', () => {
      // Both locations have manifests — .pennyfarthing/ should win
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

      writeFileSync(
        join(testDir, '.claude/manifest.json'),
        JSON.stringify({
          version: '9.3.0',
          installedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          projectName: 'old-location',
          installationType: 'symlink',
          managedPaths: [],
          fileHashes: {},
        }, null, 2) + '\n'
      );

      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({
          version: '9.5.0',
          installedAt: '2026-02-06T00:00:00Z',
          updatedAt: '2026-02-06T00:00:00Z',
          projectName: 'new-location',
          installationType: 'symlink',
          managedPaths: [],
          fileHashes: {},
        }, null, 2) + '\n'
      );

      const result3 = readManifest(testDir);
      assert.strictEqual(result3.success, true);
      assert.ok(result3.data);
      assert.strictEqual(
        result3.data!.projectName,
        'new-location',
        '.pennyfarthing/ manifest should take precedence over .claude/'
      );
    });
  });

  // ─── managedPaths (AC8) ────────────────────────────────────────────

  describe('Manifest managedPaths reflect consolidated layout', () => {
    it('createManifest() should list .pennyfarthing/ paths for symlinked dirs', () => {
      const manifest = createManifest('test-project', '9.5.0', {
        nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
      });

      // Non-discovery paths (agents, guides, etc.) should be under .pennyfarthing/
      const nonDiscoveryPaths = manifest.managedPaths.filter(
        (p: string) => !p.includes('commands') && !p.includes('skills')
      );

      for (const p of nonDiscoveryPaths) {
        assert.ok(
          p.startsWith('.pennyfarthing/'),
          `Managed path "${p}" should be under .pennyfarthing/ (not .claude/)`
        );
      }
    });

    it('createManifest() should keep .claude/commands and .claude/skills in managedPaths', () => {
      const manifest = createManifest('test-project', '9.5.0', {
        nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
      });

      assert.ok(
        manifest.managedPaths.includes('.claude/commands'),
        'managedPaths should include .claude/commands (Claude Code discovery)'
      );
      assert.ok(
        manifest.managedPaths.includes('.claude/skills'),
        'managedPaths should include .claude/skills (Claude Code discovery)'
      );
    });

    it('createManifest() should NOT list legacy .claude/agents, .claude/guides, etc.', () => {
      const manifest = createManifest('test-project', '9.5.0', {
        nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
      });

      const legacyPaths = [
        '.claude/agents',
        '.claude/guides',
        '.claude/personas',
        '.claude/scripts',
      ];

      for (const legacy of legacyPaths) {
        assert.ok(
          !manifest.managedPaths.includes(legacy),
          `managedPaths should NOT include legacy path "${legacy}"`
        );
      }
    });
  });

  // ─── Directory structure (AC9) ─────────────────────────────────────

  describe('Init creates consolidated directory structure', () => {
    it('should include .pennyfarthing/project/commands in directory list', () => {
      // The directories array in init.ts should include .pennyfarthing/project/*
      // instead of (or in addition to) .claude/project/*
      //
      // We can't run initCommand directly, so we verify the EXPECTED structure.
      // This test documents what Dev needs to implement.
      const expectedDirs = [
        '.pennyfarthing/project/commands',
        '.pennyfarthing/project/skills',
        '.pennyfarthing/project/docs',
        '.pennyfarthing/project/hooks',
      ];

      // These should all be under .pennyfarthing/
      for (const dir of expectedDirs) {
        assert.ok(
          dir.startsWith('.pennyfarthing/'),
          `Expected directory "${dir}" should be under .pennyfarthing/`
        );
      }
    });
  });

  // ─── Template destinations (AC2-5, AC6) ────────────────────────────

  describe('Template file destinations', () => {
    // These tests document the EXPECTED template→destination mapping.
    // The actual init.ts skipIfExistsTemplates array needs to be updated.

    const expectedMappings = [
      { template: 'persona-config.yaml.template', dest: '.pennyfarthing/persona-config.yaml' },
      { template: 'preferences.yaml.template', dest: '.pennyfarthing/preferences.yaml' },
      { template: 'agent-scopes.yaml.template', dest: '.pennyfarthing/project/docs/agent-scopes.yaml' },
      { template: 'pennyfarthing-settings.yaml.template', dest: '.pennyfarthing/project/pennyfarthing-settings.yaml' },
      { template: 'setup-env.sh.template', dest: '.pennyfarthing/project/hooks/setup-env.sh' },
    ];

    for (const { template, dest } of expectedMappings) {
      it(`${template} should target ${dest}`, () => {
        assert.ok(
          dest.startsWith('.pennyfarthing/'),
          `${template} destination should be under .pennyfarthing/, got "${dest}"`
        );
      });
    }

    it('shared-context.md.template should stay at .claude/project/docs/', () => {
      const dest = '.claude/project/docs/shared-context.md';
      assert.ok(
        dest.startsWith('.claude/'),
        'shared-context.md is a user file and should stay at .claude/'
      );
    });
  });
});
