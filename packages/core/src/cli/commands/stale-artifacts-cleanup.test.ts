/**
 * Tests for Story 117-3: Postinstall cleanup of stale pre-11.x artifacts
 *
 * AC1: Detects and removes stale artifacts from v8-10.x installations:
 *   - .claude/manifest.json (v8-era manifest)
 *   - .claude/personas/ directory
 *   - Non-prefixed commands (from old naming scheme)
 *   - Non-prefixed skills (from old naming scheme)
 * AC2: Preserves user-created artifacts, only removes framework-created ones
 * AC3: Cleanup runs during postinstall or via explicit update command
 * AC4: Tests verify detection and removal logic
 * AC5: No false positives on v11.x-native installations
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
  symlinkSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  detectStaleArtifacts,
  cleanupStaleArtifacts,
  STALE_COMMAND_NAMES,
  STALE_SKILL_NAMES,
} from '../utils/stale-artifacts.js';

// ─── Helpers ─────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-stale-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a clean v11.x installation layout (no stale artifacts) */
function createCleanV11Layout(testDir: string): void {
  // .pennyfarthing/ with manifest
  mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
  writeFileSync(
    join(testDir, '.pennyfarthing/manifest.json'),
    JSON.stringify({
      version: '11.2.1',
      installedAt: new Date().toISOString(),
      projectName: 'test-project',
      installationType: 'symlink',
    })
  );

  // .claude/commands with only pf-* prefixed files
  mkdirSync(join(testDir, '.claude/commands'), { recursive: true });
  writeFileSync(join(testDir, '.claude/commands/pf-sm.md'), '# SM command');
  writeFileSync(join(testDir, '.claude/commands/pf-dev.md'), '# Dev command');
  writeFileSync(join(testDir, '.claude/commands/pf-tea.md'), '# TEA command');

  // .claude/skills with only pf-* prefixed directories
  mkdirSync(join(testDir, '.claude/skills/pf-testing'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/pf-testing/index.md'), '# Testing');
  mkdirSync(join(testDir, '.claude/skills/pf-sprint'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/pf-sprint/index.md'), '# Sprint');
}

/** Create a v8-era installation layout with stale artifacts */
function createStaleV8Layout(testDir: string): void {
  // First create the v11 canonical manifest
  mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
  writeFileSync(
    join(testDir, '.pennyfarthing/manifest.json'),
    JSON.stringify({
      version: '11.2.1',
      installedAt: new Date().toISOString(),
      projectName: 'test-project',
      installationType: 'symlink',
    })
  );

  // Stale: .claude/manifest.json (v8-era, now redundant)
  mkdirSync(join(testDir, '.claude'), { recursive: true });
  writeFileSync(
    join(testDir, '.claude/manifest.json'),
    JSON.stringify({
      version: '8.5.0',
      installedAt: '2025-01-01T00:00:00.000Z',
      projectName: 'test-project',
      installationType: 'copy',
      fileHashes: {},
      managedPaths: ['.claude/commands', '.claude/skills'],
    })
  );

  // Stale: .claude/personas/ directory
  mkdirSync(join(testDir, '.claude/personas'), { recursive: true });
  writeFileSync(
    join(testDir, '.claude/personas/blade-runner.yaml'),
    'theme: blade-runner\nagents:\n  sm: Deckard\n'
  );
  writeFileSync(
    join(testDir, '.claude/personas/star-wars.yaml'),
    'theme: star-wars\nagents:\n  sm: Yoda\n'
  );

  // Stale: Non-prefixed commands (real files, not symlinks)
  mkdirSync(join(testDir, '.claude/commands'), { recursive: true });
  // Add some stale commands
  writeFileSync(join(testDir, '.claude/commands/sm.md'), '# Old SM command');
  writeFileSync(join(testDir, '.claude/commands/dev.md'), '# Old Dev command');
  writeFileSync(join(testDir, '.claude/commands/tea.md'), '# Old TEA command');
  writeFileSync(join(testDir, '.claude/commands/sprint.md'), '# Old Sprint command');
  writeFileSync(join(testDir, '.claude/commands/reviewer.md'), '# Old Reviewer');
  writeFileSync(join(testDir, '.claude/commands/architect.md'), '# Old Architect');
  // Also add current pf-* commands (should be preserved)
  writeFileSync(join(testDir, '.claude/commands/pf-sm.md'), '# New SM command');
  writeFileSync(join(testDir, '.claude/commands/pf-dev.md'), '# New Dev command');

  // Stale: Non-prefixed skills (real directories, not symlinks)
  mkdirSync(join(testDir, '.claude/skills'), { recursive: true });
  // Add some stale skill directories
  mkdirSync(join(testDir, '.claude/skills/testing'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/testing/index.md'), '# Old Testing');
  mkdirSync(join(testDir, '.claude/skills/sprint'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/sprint/index.md'), '# Old Sprint');
  mkdirSync(join(testDir, '.claude/skills/workflow'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/workflow/index.md'), '# Old Workflow');
  mkdirSync(join(testDir, '.claude/skills/jira'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/jira/index.md'), '# Old Jira');
  // Also add current pf-* skills (should be preserved)
  mkdirSync(join(testDir, '.claude/skills/pf-testing'), { recursive: true });
  writeFileSync(join(testDir, '.claude/skills/pf-testing/index.md'), '# New Testing');
}

// ─── Test Suites ─────────────────────────────────────────────────

describe('Story 117-3: Stale artifact detection', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC5: No false positives on clean v11 install ─────────────

  describe('AC5: No false positives on v11.x-native installations', () => {
    it('should detect NO stale artifacts on clean v11.x install', () => {
      createCleanV11Layout(testDir);

      const stale = detectStaleArtifacts(testDir);

      assert.strictEqual(
        stale.length,
        0,
        `Should detect 0 stale artifacts on clean v11 install, got ${stale.length}: ${JSON.stringify(stale)}`
      );
    });

    it('should not flag pf-* prefixed commands as stale', () => {
      createCleanV11Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const commandStale = stale.filter(s => s.category === 'command');

      assert.strictEqual(
        commandStale.length,
        0,
        'pf-* prefixed commands should not be flagged as stale'
      );
    });

    it('should not flag pf-* prefixed skills as stale', () => {
      createCleanV11Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const skillStale = stale.filter(s => s.category === 'skill');

      assert.strictEqual(
        skillStale.length,
        0,
        'pf-* prefixed skills should not be flagged as stale'
      );
    });

    it('should not flag .pennyfarthing/manifest.json as stale', () => {
      createCleanV11Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const manifestStale = stale.filter(s => s.category === 'manifest');

      assert.strictEqual(
        manifestStale.length,
        0,
        '.pennyfarthing/manifest.json should NOT be flagged'
      );
    });
  });

  // ─── AC1: Detect stale manifest ─────────────────────────────

  describe('AC1: Detect .claude/manifest.json', () => {
    it('should detect .claude/manifest.json when .pennyfarthing/manifest.json exists', () => {
      createStaleV8Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const manifestStale = stale.filter(s => s.category === 'manifest');

      assert.strictEqual(manifestStale.length, 1, 'Should detect 1 stale manifest');
      assert.strictEqual(manifestStale[0].path, '.claude/manifest.json');
      assert.strictEqual(manifestStale[0].type, 'file');
    });

    it('should NOT detect .claude/manifest.json if .pennyfarthing/manifest.json is missing', () => {
      // Only legacy manifest exists — might be an older install, don't remove it
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        join(testDir, '.claude/manifest.json'),
        JSON.stringify({ version: '8.5.0' })
      );

      const stale = detectStaleArtifacts(testDir);
      const manifestStale = stale.filter(s => s.category === 'manifest');

      assert.strictEqual(
        manifestStale.length,
        0,
        'Should NOT flag .claude/manifest.json if no .pennyfarthing/manifest.json exists'
      );
    });
  });

  // ─── AC1: Detect stale personas ──────────────────────────────

  describe('AC1: Detect .claude/personas/ directory', () => {
    it('should detect .claude/personas/ directory', () => {
      createStaleV8Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const personasStale = stale.filter(s => s.category === 'personas');

      assert.strictEqual(personasStale.length, 1, 'Should detect 1 stale personas directory');
      assert.strictEqual(personasStale[0].path, '.claude/personas');
      assert.strictEqual(personasStale[0].type, 'directory');
    });

    it('should NOT detect .claude/personas if it does not exist', () => {
      createCleanV11Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const personasStale = stale.filter(s => s.category === 'personas');

      assert.strictEqual(personasStale.length, 0, 'Should not detect personas on clean install');
    });
  });

  // ─── AC1: Detect stale commands ─────────────────────────────

  describe('AC1: Detect non-prefixed stale commands', () => {
    it('should detect non-prefixed command files matching known stale names', () => {
      createStaleV8Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const commandStale = stale.filter(s => s.category === 'command');

      // We added 6 stale commands in the layout
      assert.ok(
        commandStale.length >= 6,
        `Should detect at least 6 stale commands, got ${commandStale.length}`
      );

      // Verify specific known stale names
      const staleNames = commandStale.map(s => s.path);
      assert.ok(staleNames.some(n => n.includes('sm.md')), 'Should detect stale sm.md');
      assert.ok(staleNames.some(n => n.includes('dev.md')), 'Should detect stale dev.md');
      assert.ok(staleNames.some(n => n.includes('tea.md')), 'Should detect stale tea.md');
      assert.ok(staleNames.some(n => n.includes('sprint.md')), 'Should detect stale sprint.md');
    });

    it('should identify all commands as file type', () => {
      createStaleV8Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const commandStale = stale.filter(s => s.category === 'command');

      for (const item of commandStale) {
        assert.strictEqual(
          item.type,
          'file',
          `Command ${item.path} should be type 'file'`
        );
      }
    });

    it('should NOT flag symlinks to pf-* as stale (migration 007 backward-compat)', () => {
      createCleanV11Layout(testDir);

      // Create a backward-compat symlink (like migration 007 would)
      const symlinkPath = join(testDir, '.claude/commands/sm.md');
      const targetPath = 'pf-sm.md'; // relative symlink
      try {
        symlinkSync(targetPath, symlinkPath);
      } catch {
        // Skip test if symlinks not supported
        return;
      }

      const stale = detectStaleArtifacts(testDir);
      const smStale = stale.filter(s => s.path.includes('sm.md'));

      assert.strictEqual(
        smStale.length,
        0,
        'Backward-compat symlinks should NOT be flagged as stale (handled by migration 009)'
      );
    });
  });

  // ─── AC1: Detect stale skills ──────────────────────────────

  describe('AC1: Detect non-prefixed stale skills', () => {
    it('should detect non-prefixed skill directories matching known stale names', () => {
      createStaleV8Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const skillStale = stale.filter(s => s.category === 'skill');

      // We added 4 stale skills in the layout
      assert.ok(
        skillStale.length >= 4,
        `Should detect at least 4 stale skills, got ${skillStale.length}`
      );

      const staleNames = skillStale.map(s => s.path);
      assert.ok(staleNames.some(n => n.includes('testing')), 'Should detect stale testing/');
      assert.ok(staleNames.some(n => n.includes('sprint')), 'Should detect stale sprint/');
      assert.ok(staleNames.some(n => n.includes('workflow')), 'Should detect stale workflow/');
      assert.ok(staleNames.some(n => n.includes('jira')), 'Should detect stale jira/');
    });

    it('should identify all skills as directory type', () => {
      createStaleV8Layout(testDir);

      const stale = detectStaleArtifacts(testDir);
      const skillStale = stale.filter(s => s.category === 'skill');

      for (const item of skillStale) {
        assert.strictEqual(
          item.type,
          'directory',
          `Skill ${item.path} should be type 'directory'`
        );
      }
    });

    it('should NOT flag symlinks to pf-* as stale skills', () => {
      createCleanV11Layout(testDir);

      // Create a backward-compat symlink for a skill
      const symlinkPath = join(testDir, '.claude/skills/testing');
      const targetPath = 'pf-testing';
      try {
        symlinkSync(targetPath, symlinkPath);
      } catch {
        return;
      }

      const stale = detectStaleArtifacts(testDir);
      const testingStale = stale.filter(s => s.path.includes('testing') && s.category === 'skill');

      assert.strictEqual(
        testingStale.length,
        0,
        'Backward-compat symlinks should NOT be flagged as stale skills'
      );
    });
  });

  // ─── AC2: Preserve user-created artifacts ───────────────────

  describe('AC2: Preserves user-created artifacts', () => {
    it('should NOT flag user-created commands (non-matching names)', () => {
      createCleanV11Layout(testDir);

      // Add user-created commands that don't match stale names
      writeFileSync(join(testDir, '.claude/commands/my-custom-tool.md'), '# My tool');
      writeFileSync(join(testDir, '.claude/commands/deploy-helper.md'), '# Deploy');

      const stale = detectStaleArtifacts(testDir);
      const commandStale = stale.filter(s => s.category === 'command');

      assert.strictEqual(
        commandStale.length,
        0,
        'User-created commands with non-matching names should NOT be flagged'
      );
    });

    it('should NOT flag user-created skill directories (non-matching names)', () => {
      createCleanV11Layout(testDir);

      // Add user-created skills
      mkdirSync(join(testDir, '.claude/skills/my-custom-skill'), { recursive: true });
      writeFileSync(join(testDir, '.claude/skills/my-custom-skill/index.md'), '# Custom');

      const stale = detectStaleArtifacts(testDir);
      const skillStale = stale.filter(s => s.category === 'skill');

      assert.strictEqual(
        skillStale.length,
        0,
        'User-created skills with non-matching names should NOT be flagged'
      );
    });

    it('should preserve user commands when cleaning stale commands', () => {
      createStaleV8Layout(testDir);

      // Add a user-created command alongside stale ones
      writeFileSync(join(testDir, '.claude/commands/my-deploy.md'), '# Deploy');

      cleanupStaleArtifacts(testDir);

      // User command should still exist
      assert.ok(
        existsSync(join(testDir, '.claude/commands/my-deploy.md')),
        'User-created command should be preserved after cleanup'
      );

      // Stale commands should be removed
      assert.ok(
        !existsSync(join(testDir, '.claude/commands/sm.md')),
        'Stale sm.md should be removed'
      );

      // pf-* commands should be preserved
      assert.ok(
        existsSync(join(testDir, '.claude/commands/pf-sm.md')),
        'pf-sm.md should be preserved'
      );
    });

    it('should preserve user skills when cleaning stale skills', () => {
      createStaleV8Layout(testDir);

      // Add a user-created skill alongside stale ones
      mkdirSync(join(testDir, '.claude/skills/my-skill'), { recursive: true });
      writeFileSync(join(testDir, '.claude/skills/my-skill/index.md'), '# Mine');

      cleanupStaleArtifacts(testDir);

      // User skill should still exist
      assert.ok(
        existsSync(join(testDir, '.claude/skills/my-skill')),
        'User-created skill should be preserved after cleanup'
      );

      // Stale skills should be removed
      assert.ok(
        !existsSync(join(testDir, '.claude/skills/testing')),
        'Stale testing/ should be removed'
      );

      // pf-* skills should be preserved
      assert.ok(
        existsSync(join(testDir, '.claude/skills/pf-testing')),
        'pf-testing/ should be preserved'
      );
    });
  });
});

describe('Story 117-3: Stale artifact cleanup', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── Cleanup execution ───────────────────────────────────────

  describe('cleanupStaleArtifacts() removes stale items', () => {
    it('should remove .claude/manifest.json', () => {
      createStaleV8Layout(testDir);

      const result = cleanupStaleArtifacts(testDir);

      assert.ok(
        !existsSync(join(testDir, '.claude/manifest.json')),
        '.claude/manifest.json should be removed after cleanup'
      );

      const removedPaths = result.removed.map(r => r.path);
      assert.ok(
        removedPaths.includes('.claude/manifest.json'),
        'Removed list should include .claude/manifest.json'
      );
    });

    it('should remove .claude/personas/ directory', () => {
      createStaleV8Layout(testDir);

      const result = cleanupStaleArtifacts(testDir);

      assert.ok(
        !existsSync(join(testDir, '.claude/personas')),
        '.claude/personas/ should be removed after cleanup'
      );

      const removedPaths = result.removed.map(r => r.path);
      assert.ok(
        removedPaths.includes('.claude/personas'),
        'Removed list should include .claude/personas'
      );
    });

    it('should remove all detected stale commands', () => {
      createStaleV8Layout(testDir);

      cleanupStaleArtifacts(testDir);

      // Check that known stale commands are gone
      const staleCommandsInLayout = ['sm.md', 'dev.md', 'tea.md', 'sprint.md', 'reviewer.md', 'architect.md'];
      for (const cmd of staleCommandsInLayout) {
        assert.ok(
          !existsSync(join(testDir, '.claude/commands', cmd)),
          `Stale command ${cmd} should be removed`
        );
      }
    });

    it('should remove all detected stale skills', () => {
      createStaleV8Layout(testDir);

      cleanupStaleArtifacts(testDir);

      // Check that known stale skills are gone
      const staleSkillsInLayout = ['testing', 'sprint', 'workflow', 'jira'];
      for (const skill of staleSkillsInLayout) {
        assert.ok(
          !existsSync(join(testDir, '.claude/skills', skill)),
          `Stale skill ${skill}/ should be removed`
        );
      }
    });

    it('should return accurate removed count', () => {
      createStaleV8Layout(testDir);

      const result = cleanupStaleArtifacts(testDir);

      // manifest (1) + personas (1) + 6 commands + 4 skills = 12
      assert.ok(
        result.removed.length >= 12,
        `Should remove at least 12 items, got ${result.removed.length}`
      );
    });

    it('should preserve .pennyfarthing/manifest.json', () => {
      createStaleV8Layout(testDir);

      cleanupStaleArtifacts(testDir);

      assert.ok(
        existsSync(join(testDir, '.pennyfarthing/manifest.json')),
        '.pennyfarthing/manifest.json should be preserved'
      );
    });

    it('should preserve pf-* commands and skills', () => {
      createStaleV8Layout(testDir);

      cleanupStaleArtifacts(testDir);

      assert.ok(
        existsSync(join(testDir, '.claude/commands/pf-sm.md')),
        'pf-sm.md should be preserved'
      );
      assert.ok(
        existsSync(join(testDir, '.claude/commands/pf-dev.md')),
        'pf-dev.md should be preserved'
      );
      assert.ok(
        existsSync(join(testDir, '.claude/skills/pf-testing')),
        'pf-testing/ should be preserved'
      );
    });
  });

  // ─── Dry run mode ────────────────────────────────────────────

  describe('Dry run mode', () => {
    it('should NOT remove anything in dry-run mode', () => {
      createStaleV8Layout(testDir);

      const result = cleanupStaleArtifacts(testDir, { dryRun: true });

      // Everything should still exist
      assert.ok(
        existsSync(join(testDir, '.claude/manifest.json')),
        '.claude/manifest.json should still exist in dry-run'
      );
      assert.ok(
        existsSync(join(testDir, '.claude/personas')),
        '.claude/personas/ should still exist in dry-run'
      );
      assert.ok(
        existsSync(join(testDir, '.claude/commands/sm.md')),
        'Stale sm.md should still exist in dry-run'
      );
      assert.ok(
        existsSync(join(testDir, '.claude/skills/testing')),
        'Stale testing/ should still exist in dry-run'
      );

      assert.strictEqual(result.dryRun, true, 'Result should indicate dry-run');
    });

    it('should still report what WOULD be removed in dry-run', () => {
      createStaleV8Layout(testDir);

      const result = cleanupStaleArtifacts(testDir, { dryRun: true });

      assert.ok(
        result.removed.length >= 12,
        `Dry-run should report at least 12 items that WOULD be removed, got ${result.removed.length}`
      );
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle missing .claude/ directory gracefully', () => {
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({ version: '11.2.1' })
      );
      // No .claude/ directory at all

      const stale = detectStaleArtifacts(testDir);
      assert.strictEqual(stale.length, 0, 'Should handle missing .claude/ gracefully');

      const result = cleanupStaleArtifacts(testDir);
      assert.strictEqual(result.removed.length, 0, 'Should remove nothing when .claude/ is missing');
    });

    it('should handle missing .claude/commands/ directory gracefully', () => {
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({ version: '11.2.1' })
      );
      // No .claude/commands/ directory

      const stale = detectStaleArtifacts(testDir);
      const commandStale = stale.filter(s => s.category === 'command');
      assert.strictEqual(commandStale.length, 0, 'Should handle missing commands/ gracefully');
    });

    it('should handle missing .claude/skills/ directory gracefully', () => {
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
      writeFileSync(
        join(testDir, '.pennyfarthing/manifest.json'),
        JSON.stringify({ version: '11.2.1' })
      );
      // No .claude/skills/ directory

      const stale = detectStaleArtifacts(testDir);
      const skillStale = stale.filter(s => s.category === 'skill');
      assert.strictEqual(skillStale.length, 0, 'Should handle missing skills/ gracefully');
    });

    it('should handle empty .claude/commands/ directory', () => {
      mkdirSync(join(testDir, '.claude/commands'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

      const stale = detectStaleArtifacts(testDir);
      const commandStale = stale.filter(s => s.category === 'command');
      assert.strictEqual(commandStale.length, 0, 'Empty commands/ should produce no detections');
    });

    it('should handle empty .claude/skills/ directory', () => {
      mkdirSync(join(testDir, '.claude/skills'), { recursive: true });
      mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });

      const stale = detectStaleArtifacts(testDir);
      const skillStale = stale.filter(s => s.category === 'skill');
      assert.strictEqual(skillStale.length, 0, 'Empty skills/ should produce no detections');
    });

    it('should handle cleanup on already-clean installation (idempotent)', () => {
      createCleanV11Layout(testDir);

      const result = cleanupStaleArtifacts(testDir);

      assert.strictEqual(
        result.removed.length,
        0,
        'Should remove nothing on a clean installation'
      );

      // Verify nothing was damaged
      assert.ok(existsSync(join(testDir, '.claude/commands/pf-sm.md')), 'pf-sm.md should still exist');
      assert.ok(existsSync(join(testDir, '.claude/skills/pf-testing')), 'pf-testing/ should still exist');
    });

    it('should handle running cleanup twice (idempotent)', () => {
      createStaleV8Layout(testDir);

      const result1 = cleanupStaleArtifacts(testDir);
      assert.ok(result1.removed.length > 0, 'First cleanup should remove items');

      const result2 = cleanupStaleArtifacts(testDir);
      assert.strictEqual(
        result2.removed.length,
        0,
        'Second cleanup should remove nothing (already clean)'
      );
    });
  });

  // ─── Constants validation ──────────────────────────────────

  describe('Stale name constants', () => {
    it('should have comprehensive stale command names list', () => {
      // The story mentions "41 extras" — verify we have the known list
      assert.ok(
        STALE_COMMAND_NAMES.length >= 40,
        `Should have at least 40 stale command names, got ${STALE_COMMAND_NAMES.length}`
      );

      // Verify some known names are in the list
      assert.ok(STALE_COMMAND_NAMES.includes('sm.md'), 'Should include sm.md');
      assert.ok(STALE_COMMAND_NAMES.includes('dev.md'), 'Should include dev.md');
      assert.ok(STALE_COMMAND_NAMES.includes('tea.md'), 'Should include tea.md');
      assert.ok(STALE_COMMAND_NAMES.includes('sprint.md'), 'Should include sprint.md');
      assert.ok(STALE_COMMAND_NAMES.includes('reviewer.md'), 'Should include reviewer.md');
      assert.ok(STALE_COMMAND_NAMES.includes('workflow.md'), 'Should include workflow.md');
    });

    it('should have comprehensive stale skill names list', () => {
      // The story mentions "22 extras" — we have the 20 known renamed skills
      assert.ok(
        STALE_SKILL_NAMES.length >= 20,
        `Should have at least 20 stale skill names, got ${STALE_SKILL_NAMES.length}`
      );

      // Verify some known names
      assert.ok(STALE_SKILL_NAMES.includes('testing'), 'Should include testing');
      assert.ok(STALE_SKILL_NAMES.includes('sprint'), 'Should include sprint');
      assert.ok(STALE_SKILL_NAMES.includes('workflow'), 'Should include workflow');
      assert.ok(STALE_SKILL_NAMES.includes('jira'), 'Should include jira');
    });

    it('should NOT include pf-* prefixed names in stale lists', () => {
      for (const name of STALE_COMMAND_NAMES) {
        assert.ok(
          !name.startsWith('pf-'),
          `Stale command list should not include pf-prefixed: ${name}`
        );
      }

      for (const name of STALE_SKILL_NAMES) {
        assert.ok(
          !name.startsWith('pf-'),
          `Stale skill list should not include pf-prefixed: ${name}`
        );
      }
    });
  });
});
