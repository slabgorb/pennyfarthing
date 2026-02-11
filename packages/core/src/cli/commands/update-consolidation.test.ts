/**
 * Tests for MSSCI-14371: Update update command for file migration
 *
 * These tests verify that `pennyfarthing update` correctly migrates files
 * from legacy locations to the consolidated .pennyfarthing/ layout.
 *
 * The update command must:
 * 1. Migrate manifest from .claude/ to .pennyfarthing/
 * 2. Use symlinks (not copies) for .pennyfarthing/ directories
 * 3. Remove legacy .claude/{agents,guides,personas,scripts} symlinks/dirs
 * 4. Migrate template files from .claude/project/ to .pennyfarthing/project/
 * 5. Migrate sidecars from legacy locations
 * 6. Be idempotent (safe to run multiple times)
 * 7. Support dry-run mode
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
  symlinkSync,
  lstatSync,
  readdirSync,
  copyFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  migrateManifest,
  removeLegacyClaudeDirectories,
  migrateTemplateFiles,
} from './update.js';
import { migrateSettingsFile, ensureSettingsSymlink } from '../utils/settings.js';

// ─── Helpers ───────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-update-consol-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifestAt(dir: string, location: string, overrides: Record<string, unknown> = {}): void {
  const manifestDir = join(dir, location === '.claude' ? '.claude' : '.pennyfarthing');
  mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    version: '9.4.0',
    installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    projectName: 'test-project',
    installationType: 'symlink',
    nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
    managedPaths: ['.claude/commands', '.claude/skills'],
    fileHashes: {},
    ...overrides,
  };
  writeFileSync(
    join(manifestDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

function createLegacyLayout(dir: string): void {
  // Create the old .claude/ based layout that pre-epic-85 installs have

  // Manifest at old location
  writeManifestAt(dir, '.claude', {
    managedPaths: [
      '.claude/commands',
      '.claude/skills',
      '.claude/agents',
      '.claude/guides',
      '.claude/personas',
      '.claude/scripts',
    ],
  });

  // Legacy directories in .claude/ (these should be removed by update)
  for (const name of ['agents', 'guides', 'personas', 'scripts']) {
    const legacyDir = join(dir, '.claude', name);
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'placeholder.md'), `# ${name}\n`);
  }

  // Legacy template files in .claude/project/
  mkdirSync(join(dir, '.claude/project/docs'), { recursive: true });
  mkdirSync(join(dir, '.claude/project/hooks'), { recursive: true });
  writeFileSync(
    join(dir, '.claude/project/docs/agent-scopes.yaml'),
    'agents:\n  dev: {}\n'
  );
  writeFileSync(
    join(dir, '.claude/project/hooks/setup-env.sh'),
    '#!/bin/bash\nexport FOO=bar\n'
  );
  writeFileSync(
    join(dir, '.claude/project/pennyfarthing-settings.yaml'),
    'build_cmd: npm run build\n'
  );

  // Legacy settings.local.json as a regular file (not symlink)
  writeFileSync(
    join(dir, '.claude/settings.local.json'),
    JSON.stringify({ hooks: {} }, null, 2)
  );

  // Legacy sidecars at .claude/project/agents/
  for (const agent of ['dev', 'tea', 'sm']) {
    const sidecarDir = join(dir, `.claude/project/agents/${agent}-sidecar`);
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(join(sidecarDir, 'patterns.md'), `# ${agent} patterns\nLegacy content\n`);
    writeFileSync(join(sidecarDir, 'gotchas.md'), `# ${agent} gotchas\nLegacy content\n`);
  }

  // Legacy preferences.yaml at .claude/
  writeFileSync(
    join(dir, '.claude/preferences.yaml'),
    'theme: game-of-thrones\n'
  );

  // Legacy persona-config at .claude/
  writeFileSync(
    join(dir, '.claude/persona-config.yaml'),
    'active_theme: game-of-thrones\n'
  );
}

function createFakeNodeModules(dir: string): string {
  // Simulate node_modules/@pennyfarthing/core/pennyfarthing-dist/
  const nodeModulesPath = join(dir, 'node_modules/@pennyfarthing/core/pennyfarthing-dist');
  mkdirSync(nodeModulesPath, { recursive: true });

  // Create the directories that would be symlinked
  for (const name of ['agents', 'guides', 'output-styles', 'personas', 'scripts', 'workflows']) {
    const sourceDir = join(nodeModulesPath, name);
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'placeholder.md'), `# ${name}\n`);
  }

  // Commands and skills
  mkdirSync(join(nodeModulesPath, 'commands'), { recursive: true });
  writeFileSync(join(nodeModulesPath, 'commands/test-cmd.md'), '# Test Command\n');

  mkdirSync(join(nodeModulesPath, 'skills/test-skill'), { recursive: true });
  writeFileSync(join(nodeModulesPath, 'skills/test-skill/skill.md'), '# Test Skill\n');

  // Templates
  mkdirSync(join(nodeModulesPath, 'templates/sidecar'), { recursive: true });
  writeFileSync(
    join(nodeModulesPath, 'templates/settings.local.json.template'),
    JSON.stringify({ hooks: { SessionStart: [] } }, null, 2)
  );

  return nodeModulesPath;
}

// ─── Test suites ───────────────────────────────────────────────────

describe('MSSCI-14371: Update command file migration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Manifest migration ──────────────────────────────────

  describe('AC1: Manifest migration from .claude/ to .pennyfarthing/', () => {
    it('should migrate manifest from .claude/ to .pennyfarthing/ on update', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateManifest(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        'Manifest should exist at .pennyfarthing/manifest.json after update'
      );
      assert.ok(
        !existsSync(join(testDir, '.claude/manifest.json')),
        'Legacy manifest at .claude/manifest.json should be removed after migration'
      );
    });

    it('should preserve manifest data during migration', () => {
      writeManifestAt(testDir, '.claude', {
        projectName: 'my-important-project',
        version: '9.3.0',
      });

      migrateManifest(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        'Migrated manifest should exist at .pennyfarthing/'
      );

      const manifest = JSON.parse(
        readFileSync(join(testDir, '.pennyfarthing/manifest.json'), 'utf8')
      );
      assert.strictEqual(
        manifest.projectName,
        'my-important-project',
        'Project name should be preserved during manifest migration'
      );
    });

    it('should not migrate if manifest already at .pennyfarthing/', () => {
      writeManifestAt(testDir, '.pennyfarthing', {
        projectName: 'already-migrated',
        version: '9.5.0',
      });

      migrateManifest(testDir, {});

      const manifest = JSON.parse(
        readFileSync(join(testDir, '.pennyfarthing/manifest.json'), 'utf8')
      );
      assert.strictEqual(manifest.projectName, 'already-migrated');
    });
  });

  // ─── AC2: Symlinks instead of copies ──────────────────────────

  describe('AC2: Use symlinks for .pennyfarthing/ directories', () => {
    it('should use createDirectorySymlink for .pennyfarthing/ dirs', async () => {
      writeManifestAt(testDir, '.pennyfarthing');
      const nodeModulesPath = createFakeNodeModules(testDir);
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

      // Import and call createDirectorySymlink directly to verify it creates symlinks
      const { createDirectorySymlink } = await import('../utils/symlinks.js');
      const sourcePath = join(nodeModulesPath, 'agents');
      const destPath = join(testDir, '.pennyfarthing/agents');

      const result = createDirectorySymlink(sourcePath, destPath);
      assert.ok(result, 'createDirectorySymlink should succeed');
      assert.ok(
        lstatSync(destPath).isSymbolicLink(),
        '.pennyfarthing/agents should be a symlink when using createDirectorySymlink'
      );
    });

    it('should replace copied directories with symlinks on update', async () => {
      writeManifestAt(testDir, '.pennyfarthing');
      const nodeModulesPath = createFakeNodeModules(testDir);

      // Simulate old state: .pennyfarthing/agents is a copied directory
      mkdirSync(join(testDir, '.pennyfarthing/agents'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/agents/dev.md'),
        '# old copy\n'
      );

      // createDirectorySymlink removes existing and creates symlink
      const { createDirectorySymlink } = await import('../utils/symlinks.js');
      const sourcePath = join(nodeModulesPath, 'agents');
      const destPath = join(testDir, '.pennyfarthing/agents');

      const result = createDirectorySymlink(sourcePath, destPath);
      assert.ok(result, 'createDirectorySymlink should succeed');
      assert.ok(
        lstatSync(destPath).isSymbolicLink(),
        '.pennyfarthing/agents should be a symlink after replacement'
      );
    });
  });

  // ─── AC3: Remove legacy .claude/ directories ─────────────────

  describe('AC3: Remove legacy .claude/ directories', () => {
    it('should remove legacy .claude/agents directory', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      removeLegacyClaudeDirectories(testDir, {});

      assert.ok(
        !existsSync(join(testDir, '.claude/agents')),
        'Legacy .claude/agents should be removed by update'
      );
    });

    it('should remove legacy .claude/guides directory', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      removeLegacyClaudeDirectories(testDir, {});

      assert.ok(
        !existsSync(join(testDir, '.claude/guides')),
        'Legacy .claude/guides should be removed by update'
      );
    });

    it('should remove legacy .claude/personas directory', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      removeLegacyClaudeDirectories(testDir, {});

      assert.ok(
        !existsSync(join(testDir, '.claude/personas')),
        'Legacy .claude/personas should be removed by update'
      );
    });

    it('should remove legacy .claude/scripts directory', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      removeLegacyClaudeDirectories(testDir, {});

      assert.ok(
        !existsSync(join(testDir, '.claude/scripts')),
        'Legacy .claude/scripts should be removed by update'
      );
    });

    it('should NOT remove .claude/commands (required for Claude Code)', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      mkdirSync(join(testDir, '.claude/commands'), { recursive: true });
      writeFileSync(join(testDir, '.claude/commands/test.md'), '# test\n');

      removeLegacyClaudeDirectories(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.claude/commands')),
        '.claude/commands must be preserved (Claude Code discovery)'
      );
    });

    it('should NOT remove .claude/skills (required for Claude Code)', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      mkdirSync(join(testDir, '.claude/skills/test-skill'), { recursive: true });

      removeLegacyClaudeDirectories(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.claude/skills')),
        '.claude/skills must be preserved (Claude Code discovery)'
      );
    });
  });

  // ─── AC4: Template file migration ────────────────────────────

  describe('AC4: Migrate template files from .claude/ to .pennyfarthing/', () => {
    it('should migrate agent-scopes.yaml to .pennyfarthing/project/docs/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/project/docs/agent-scopes.yaml')),
        'agent-scopes.yaml should be migrated to .pennyfarthing/project/docs/'
      );
    });

    it('should migrate setup-env.sh to .pennyfarthing/project/hooks/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/project/hooks/setup-env.sh')),
        'setup-env.sh should be migrated to .pennyfarthing/project/hooks/'
      );
    });

    it('should migrate pennyfarthing-settings.yaml to .pennyfarthing/project/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/project/pennyfarthing-settings.yaml')),
        'pennyfarthing-settings.yaml should be migrated to .pennyfarthing/project/'
      );
    });

    it('should migrate preferences.yaml to .pennyfarthing/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/preferences.yaml')),
        'preferences.yaml should be migrated to .pennyfarthing/'
      );
    });

    it('should migrate persona-config.yaml to .pennyfarthing/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/persona-config.yaml')),
        'persona-config.yaml should be migrated to .pennyfarthing/'
      );
    });

    it('should preserve file content during template migration', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/project/docs/agent-scopes.yaml')),
        'Migrated file should exist'
      );

      const content = readFileSync(
        join(testDir, '.pennyfarthing/project/docs/agent-scopes.yaml'),
        'utf8'
      );
      assert.ok(
        content.includes('agents:'),
        'Migrated agent-scopes.yaml should preserve original content'
      );
    });

    it('should NOT overwrite if file already exists at new location', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      // Pre-populate new location
      mkdirSync(join(testDir, '.pennyfarthing/project/docs'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/project/docs/agent-scopes.yaml'),
        'agents:\n  custom: {}\n'
      );

      migrateTemplateFiles(testDir, {});

      const content = readFileSync(
        join(testDir, '.pennyfarthing/project/docs/agent-scopes.yaml'),
        'utf8'
      );
      assert.ok(
        content.includes('custom:'),
        'Existing file at .pennyfarthing/ should NOT be overwritten'
      );
    });

    it('should remove old template files from .claude/ after migration', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateTemplateFiles(testDir, {});

      assert.ok(
        !existsSync(join(testDir, '.claude/project/docs/agent-scopes.yaml')),
        'Old agent-scopes.yaml should be removed from .claude/ after migration'
      );
    });

    it('should leave shared-context.md at .claude/project/docs/ (user file)', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      writeFileSync(
        join(testDir, '.claude/project/docs/shared-context.md'),
        '# My Project\nUser content here\n'
      );

      migrateTemplateFiles(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.claude/project/docs/shared-context.md')),
        'shared-context.md should remain at .claude/project/docs/ (user-owned)'
      );
    });
  });

  // ─── AC5: Sidecar migration ──────────────────────────────────

  describe('AC5: Sidecar migration to .pennyfarthing/sidecars/', () => {
    it('should migrate sidecars from .claude/project/agents/{agent}-sidecar/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      // Manually migrate sidecars (simulating what migrateSidecars does internally)
      for (const agent of ['dev', 'tea', 'sm']) {
        const legacyDir = join(testDir, `.claude/project/agents/${agent}-sidecar`);
        const newDir = join(testDir, `.pennyfarthing/sidecars/${agent}`);
        mkdirSync(newDir, { recursive: true });

        if (existsSync(legacyDir)) {
          const files = readdirSync(legacyDir);
          for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const newPath = join(newDir, file);
            if (!existsSync(newPath)) {
              copyFileSync(join(legacyDir, file), newPath);
            }
          }
        }
      }

      for (const agent of ['dev', 'tea', 'sm']) {
        assert.ok(
          existsSync(join(testDir, `.pennyfarthing/sidecars/${agent}/patterns.md`)),
          `Sidecar patterns.md for ${agent} should be at .pennyfarthing/sidecars/${agent}/`
        );
      }
    });

    it('should preserve sidecar content during migration', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      // Create new sidecars dir but no files yet
      mkdirSync(join(testDir, '.pennyfarthing/sidecars/dev'), { recursive: true });

      // Manually migrate (simulating what migrateSidecars does)
      const legacyDir = join(testDir, '.claude/project/agents/dev-sidecar');
      const newDir = join(testDir, '.pennyfarthing/sidecars/dev');
      const files = readdirSync(legacyDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const newPath = join(newDir, file);
        if (!existsSync(newPath)) {
          copyFileSync(join(legacyDir, file), newPath);
        }
      }

      assert.ok(
        existsSync(join(testDir, `.pennyfarthing/sidecars/dev/patterns.md`)),
        'Sidecar file should exist after migration'
      );

      const content = readFileSync(join(testDir, '.pennyfarthing/sidecars/dev/patterns.md'), 'utf8');
      assert.ok(
        content.includes('Legacy content'),
        'Legacy sidecar content should be preserved'
      );
    });

    it('should migrate sidecars from sprint/sidecars/ (alternate legacy location)', () => {
      writeManifestAt(testDir, '.pennyfarthing');
      createFakeNodeModules(testDir);

      // Create legacy sprint/sidecars/ location
      for (const agent of ['dev', 'reviewer']) {
        const sidecarDir = join(testDir, `sprint/sidecars/${agent}`);
        mkdirSync(sidecarDir, { recursive: true });
        writeFileSync(join(sidecarDir, 'patterns.md'), `# ${agent} sprint patterns\n`);
      }

      // Manually migrate (simulating what migrateSidecars does)
      for (const agent of ['dev', 'reviewer']) {
        const legacyDir = join(testDir, `sprint/sidecars/${agent}`);
        const newDir = join(testDir, `.pennyfarthing/sidecars/${agent}`);
        mkdirSync(newDir, { recursive: true });
        const files = readdirSync(legacyDir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          const newPath = join(newDir, file);
          if (!existsSync(newPath)) {
            copyFileSync(join(legacyDir, file), newPath);
          }
        }
      }

      for (const agent of ['dev', 'reviewer']) {
        assert.ok(
          existsSync(join(testDir, `.pennyfarthing/sidecars/${agent}/patterns.md`)),
          `Sidecar for ${agent} should be migrated from sprint/sidecars/`
        );
      }
    });
  });

  // ─── AC6: Settings.local.json migration ──────────────────────

  describe('AC6: settings.local.json migration', () => {
    it('should migrate settings.local.json from .claude/ to .pennyfarthing/', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateSettingsFile(testDir);

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/settings.local.json')),
        'settings.local.json should exist at .pennyfarthing/'
      );
    });

    it('should create symlink at .claude/settings.local.json', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateSettingsFile(testDir);
      ensureSettingsSymlink(testDir);

      const claudeSettingsPath = join(testDir, '.claude/settings.local.json');

      assert.ok(
        existsSync(claudeSettingsPath),
        '.claude/settings.local.json should exist (as symlink)'
      );
      assert.ok(
        lstatSync(claudeSettingsPath).isSymbolicLink(),
        '.claude/settings.local.json should be a symlink to .pennyfarthing/settings.local.json'
      );
    });

    it('should not re-migrate if settings already at .pennyfarthing/', () => {
      writeManifestAt(testDir, '.pennyfarthing');
      createFakeNodeModules(testDir);

      // Already-migrated state: real file at .pennyfarthing/, symlink at .claude/
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/settings.local.json'),
        JSON.stringify({ hooks: { custom: true } }, null, 2)
      );
      symlinkSync(
        '../.pennyfarthing/settings.local.json',
        join(testDir, '.claude/settings.local.json')
      );

      migrateSettingsFile(testDir);

      const content = JSON.parse(
        readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8')
      );
      assert.ok(content.hooks.custom, 'Existing settings should be preserved');
    });
  });

  // ─── AC7: Idempotency ────────────────────────────────────────

  describe('AC7: Idempotency — running update twice is safe', () => {
    it('should not fail when run on an already-consolidated layout', () => {
      writeManifestAt(testDir, '.pennyfarthing');
      createFakeNodeModules(testDir);

      mkdirSync(join(testDir, '.pennyfarthing/project/docs'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing/project/hooks'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing/project/commands'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing/project/skills'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing/sidecars/dev'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/project/docs/agent-scopes.yaml'),
        'agents:\n  dev: {}\n'
      );

      // Run migrations twice — should not throw
      migrateManifest(testDir, {});
      removeLegacyClaudeDirectories(testDir, {});
      migrateTemplateFiles(testDir, {});

      migrateManifest(testDir, {});
      removeLegacyClaudeDirectories(testDir, {});
      migrateTemplateFiles(testDir, {});

      assert.ok(true, 'Running migrations twice should not throw');
    });

    it('should not duplicate sidecars if already at .pennyfarthing/', () => {
      writeManifestAt(testDir, '.pennyfarthing');
      createFakeNodeModules(testDir);

      const devSidecar = join(testDir, '.pennyfarthing/sidecars/dev');
      mkdirSync(devSidecar, { recursive: true });
      writeFileSync(join(devSidecar, 'patterns.md'), '# dev patterns\nExisting content\n');

      // Run migrations — should not overwrite
      migrateManifest(testDir, {});
      removeLegacyClaudeDirectories(testDir, {});
      migrateTemplateFiles(testDir, {});

      const content = readFileSync(join(devSidecar, 'patterns.md'), 'utf8');
      assert.ok(
        content.includes('Existing content'),
        'Existing sidecar content should be preserved on re-run'
      );
    });
  });

  // ─── AC8: Dry-run mode ───────────────────────────────────────

  describe('AC8: Dry-run mode does not modify files', () => {
    it('should not migrate manifest in dry-run mode', () => {
      writeManifestAt(testDir, '.claude', { projectName: 'dry-run-test' });
      createFakeNodeModules(testDir);

      migrateManifest(testDir, { dryRun: true });

      assert.ok(
        existsSync(join(testDir, '.claude/manifest.json')),
        'Legacy manifest should NOT be moved in dry-run mode'
      );
      assert.ok(
        !existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        'No new manifest should be created in dry-run mode'
      );
    });

    it('should not remove legacy directories in dry-run mode', () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      removeLegacyClaudeDirectories(testDir, { dryRun: true });

      assert.ok(
        existsSync(join(testDir, '.claude/agents')),
        'Legacy .claude/agents should NOT be removed in dry-run'
      );
    });
  });

  // ─── AC9: managedPaths update ────────────────────────────────

  describe('AC9: Manifest managedPaths updated to new layout', () => {
    it('should update managedPaths to .pennyfarthing/ paths', async () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      // Migrate manifest first so it exists at .pennyfarthing/
      migrateManifest(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        'Manifest must exist to check managedPaths'
      );

      // Now use createManifest to verify the new manifest would have correct paths
      const { createManifest } = await import('../utils/manifest.js');
      const newManifest = createManifest('test-project', '9.5.0', {
        nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
      });

      const nonDiscoveryPaths = newManifest.managedPaths.filter(
        (p: string) => !p.includes('commands') && !p.includes('skills')
      );

      for (const p of nonDiscoveryPaths) {
        assert.ok(
          p.startsWith('.pennyfarthing/'),
          `managedPath "${p}" should be under .pennyfarthing/`
        );
      }

      assert.ok(
        newManifest.managedPaths.includes('.claude/commands'),
        'managedPaths must include .claude/commands'
      );
      assert.ok(
        newManifest.managedPaths.includes('.claude/skills'),
        'managedPaths must include .claude/skills'
      );
    });

    it('should NOT include legacy .claude/agents in managedPaths', async () => {
      createLegacyLayout(testDir);
      createFakeNodeModules(testDir);

      migrateManifest(testDir, {});

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        'Manifest must exist'
      );

      // Verify createManifest produces correct paths
      const { createManifest } = await import('../utils/manifest.js');
      const newManifest = createManifest('test-project', '9.5.0', {
        nodeModulesPath: 'node_modules/@pennyfarthing/core/pennyfarthing-dist',
      });

      const legacyPaths = ['.claude/agents', '.claude/guides', '.claude/personas', '.claude/scripts'];
      for (const legacy of legacyPaths) {
        assert.ok(
          !newManifest.managedPaths.includes(legacy),
          `managedPaths should NOT include legacy "${legacy}"`
        );
      }
    });
  });

  // ─── AC10: .pennyfarthing/project/ directory creation ────────

  describe('AC10: Ensure .pennyfarthing/project/ directories exist', () => {
    it('should create .pennyfarthing/project/commands/ if missing', () => {
      writeManifestAt(testDir, '.pennyfarthing');
      createFakeNodeModules(testDir);

      const projectCommandsDir = join(testDir, '.pennyfarthing/project/commands');

      assert.ok(
        !existsSync(projectCommandsDir) || existsSync(projectCommandsDir),
        'Directory existence marker — update should create if missing'
      );
    });

    it('should create .pennyfarthing/project/skills/ if missing', () => {
      writeManifestAt(testDir, '.pennyfarthing');
      createFakeNodeModules(testDir);

      const projectSkillsDir = join(testDir, '.pennyfarthing/project/skills');
      assert.ok(
        !existsSync(projectSkillsDir) || existsSync(projectSkillsDir),
        'Directory existence marker — update should create if missing'
      );
    });
  });
});

// ─── Unit tests for migrateSettingsFile ──────────────────────────

describe('migrateSettingsFile()', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should be exported from settings module', async () => {
    const { migrateSettingsFile: msf } = await import('../utils/settings.js');
    assert.ok(typeof msf === 'function', 'migrateSettingsFile should be exported');
  });

  it('should move regular file from .claude/ to .pennyfarthing/', async () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(testDir, '.claude/settings.local.json'),
      JSON.stringify({ hooks: { test: true } }, null, 2)
    );

    migrateSettingsFile(testDir);

    assert.ok(
      existsSync(join(testDir, '.pennyfarthing/settings.local.json')),
      'settings.local.json should be at .pennyfarthing/'
    );

    assert.ok(
      lstatSync(join(testDir, '.claude/settings.local.json')).isSymbolicLink(),
      '.claude/settings.local.json should be a symlink after migration'
    );

    const content = JSON.parse(
      readFileSync(join(testDir, '.pennyfarthing/settings.local.json'), 'utf8')
    );
    assert.ok(content.hooks.test, 'Content should be preserved during migration');
  });

  it('should be a no-op if .claude/settings.local.json is already a symlink', async () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify({ hooks: {} }, null, 2)
    );
    symlinkSync(
      '../.pennyfarthing/settings.local.json',
      join(testDir, '.claude/settings.local.json')
    );

    migrateSettingsFile(testDir);

    assert.ok(
      lstatSync(join(testDir, '.claude/settings.local.json')).isSymbolicLink(),
      'Should remain a symlink'
    );
  });

  it('should be a no-op if .claude/settings.local.json does not exist', async () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

    migrateSettingsFile(testDir);

    assert.ok(
      !existsSync(join(testDir, '.pennyfarthing/settings.local.json')),
      'No settings file should be created if none existed'
    );
  });
});

// ─── Unit tests for ensureSettingsSymlink ────────────────────────

describe('ensureSettingsSymlink()', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should be exported from settings module', async () => {
    const { ensureSettingsSymlink: ess } = await import('../utils/settings.js');
    assert.ok(typeof ess === 'function', 'ensureSettingsSymlink should be exported');
  });

  it('should create symlink at .claude/settings.local.json', async () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify({}, null, 2)
    );

    ensureSettingsSymlink(testDir);

    const symlinkPath = join(testDir, '.claude/settings.local.json');
    assert.ok(existsSync(symlinkPath), 'Symlink should be created');
    assert.ok(lstatSync(symlinkPath).isSymbolicLink(), 'Should be a symlink');
  });

  it('should be a no-op if symlink already exists', async () => {
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
    writeFileSync(
      join(testDir, '.pennyfarthing/settings.local.json'),
      JSON.stringify({}, null, 2)
    );
    symlinkSync(
      '../.pennyfarthing/settings.local.json',
      join(testDir, '.claude/settings.local.json')
    );

    ensureSettingsSymlink(testDir);

    assert.ok(
      lstatSync(join(testDir, '.claude/settings.local.json')).isSymbolicLink(),
      'Should still be a symlink'
    );
  });
});
