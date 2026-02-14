/**
 * 98-6: Protective symlink pre-flight checks
 *
 * Tests for defensive removeSymlinkOrDirectory(), new cleanManagedEntries(),
 * and user content preservation in createCommandsDirectory/createSkillsDirectory.
 *
 * RED phase — these tests should fail until Dev implements the changes.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  removeSymlinkOrDirectory,
  cleanManagedEntries,
  createCommandsDirectory,
  createSkillsDirectory,
} from './symlinks.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pf-test-'));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// AC1: removeSymlinkOrDirectory() verifies path is symlink or empty directory
// AC2: Non-empty non-symlink directories trigger warning and skip
// ---------------------------------------------------------------------------

describe('98-6: removeSymlinkOrDirectory — defensive checks', () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { cleanup(tmp); });

  it('removes a symlink (unchanged behavior)', () => {
    const target = join(tmp, 'target');
    mkdirSync(target);
    const link = join(tmp, 'link');
    symlinkSync(target, link);

    const result = removeSymlinkOrDirectory(link);
    assert.equal(result, true);
    assert.equal(existsSync(link), false);
  });

  it('removes an empty directory (unchanged behavior)', () => {
    const emptyDir = join(tmp, 'empty');
    mkdirSync(emptyDir);

    const result = removeSymlinkOrDirectory(emptyDir);
    assert.equal(result, true);
    assert.equal(existsSync(emptyDir), false);
  });

  it('returns false for non-existent path (unchanged behavior)', () => {
    const result = removeSymlinkOrDirectory(join(tmp, 'nope'));
    assert.equal(result, false);
  });

  it('refuses to remove a non-empty non-symlink directory', () => {
    const dir = join(tmp, 'has-content');
    mkdirSync(dir);
    writeFileSync(join(dir, 'user-file.md'), '# My command');

    const result = removeSymlinkOrDirectory(dir);
    // Should return false — refused to nuke
    assert.equal(result, false);
    // Directory and its contents must still exist
    assert.equal(existsSync(dir), true);
    assert.equal(existsSync(join(dir, 'user-file.md')), true);
  });

  it('refuses even when non-empty dir contains only subdirectories', () => {
    const dir = join(tmp, 'has-subdir');
    mkdirSync(dir);
    mkdirSync(join(dir, 'my-skill'));
    writeFileSync(join(dir, 'my-skill', 'SKILL.md'), '# Skill');

    const result = removeSymlinkOrDirectory(dir);
    assert.equal(result, false);
    assert.equal(existsSync(join(dir, 'my-skill', 'SKILL.md')), true);
  });

  it('respects dryRun for defensive check', () => {
    const dir = join(tmp, 'dry-run-dir');
    mkdirSync(dir);
    writeFileSync(join(dir, 'file.md'), 'content');

    const result = removeSymlinkOrDirectory(dir, true);
    // dryRun on a non-empty dir should also return false (would refuse)
    assert.equal(result, false);
    assert.equal(existsSync(dir), true);
  });
});

// ---------------------------------------------------------------------------
// AC1+AC5: cleanManagedEntries — selective cleanup of pf-* entries
// ---------------------------------------------------------------------------

describe('98-6: cleanManagedEntries', () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { cleanup(tmp); });

  it('removes only pf-* prefixed entries', () => {
    const dir = join(tmp, 'mixed');
    mkdirSync(dir);
    writeFileSync(join(dir, 'pf-sprint.md'), 'built-in');
    writeFileSync(join(dir, 'pf-testing.md'), 'built-in');
    writeFileSync(join(dir, 'my-command.md'), 'user');

    const count = cleanManagedEntries(dir, 'pf-');
    assert.equal(count, 2);
    assert.equal(existsSync(join(dir, 'pf-sprint.md')), false);
    assert.equal(existsSync(join(dir, 'pf-testing.md')), false);
    assert.equal(existsSync(join(dir, 'my-command.md')), true);
  });

  it('removes pf-* symlinks (the common case)', () => {
    const dir = join(tmp, 'symlinks');
    mkdirSync(dir);
    const target = join(tmp, 'targets');
    mkdirSync(target);
    mkdirSync(join(target, 'pf-sprint'));

    symlinkSync(join(target, 'pf-sprint'), join(dir, 'pf-sprint'));
    writeFileSync(join(dir, 'my-skill.md'), 'user');

    const count = cleanManagedEntries(dir, 'pf-');
    assert.equal(count, 1);
    assert.equal(existsSync(join(dir, 'pf-sprint')), false);
    assert.equal(existsSync(join(dir, 'my-skill.md')), true);
  });

  it('returns 0 for empty directory', () => {
    const dir = join(tmp, 'empty');
    mkdirSync(dir);

    const count = cleanManagedEntries(dir, 'pf-');
    assert.equal(count, 0);
  });

  it('returns 0 when no entries match prefix', () => {
    const dir = join(tmp, 'user-only');
    mkdirSync(dir);
    writeFileSync(join(dir, 'my-cmd.md'), 'user');
    writeFileSync(join(dir, 'another.md'), 'user');

    const count = cleanManagedEntries(dir, 'pf-');
    assert.equal(count, 0);
    assert.equal(readdirSync(dir).length, 2);
  });

  it('handles directory with only managed entries', () => {
    const dir = join(tmp, 'all-managed');
    mkdirSync(dir);
    writeFileSync(join(dir, 'pf-a.md'), 'built-in');
    writeFileSync(join(dir, 'pf-b.md'), 'built-in');

    const count = cleanManagedEntries(dir, 'pf-');
    assert.equal(count, 2);
    assert.equal(readdirSync(dir).length, 0);
  });

  it('respects dryRun — counts but does not remove', () => {
    const dir = join(tmp, 'dry');
    mkdirSync(dir);
    writeFileSync(join(dir, 'pf-sprint.md'), 'built-in');
    writeFileSync(join(dir, 'user.md'), 'user');

    const count = cleanManagedEntries(dir, 'pf-', true);
    assert.equal(count, 1);
    // Nothing actually removed
    assert.equal(existsSync(join(dir, 'pf-sprint.md')), true);
    assert.equal(existsSync(join(dir, 'user.md')), true);
  });
});

// ---------------------------------------------------------------------------
// AC5: User-created commands are preserved during install/update
// ---------------------------------------------------------------------------

describe('98-6: createCommandsDirectory — preserves user content', () => {
  let tmp: string;
  let commandsDir: string;
  let builtInDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmp = makeTempDir();

    // Set up built-in commands source
    builtInDir = join(tmp, 'node_modules', 'pennyfarthing', 'commands');
    mkdirSync(builtInDir, { recursive: true });
    writeFileSync(join(builtInDir, 'pf-sprint.md'), '# Sprint');
    writeFileSync(join(builtInDir, 'pf-help.md'), '# Help');

    // Set up project commands source
    projectDir = join(tmp, '.claude', 'project', 'commands');
    mkdirSync(projectDir, { recursive: true });

    // The target directory
    commandsDir = join(tmp, '.claude', 'commands');
  });

  afterEach(() => { cleanup(tmp); });

  it('preserves user files placed directly in .claude/commands/', () => {
    // Simulate existing state: real dir with user + built-in content
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(join(commandsDir, 'my-deploy.md'), '# My deploy command');
    writeFileSync(join(commandsDir, 'review.md'), '# My review command');

    // Run update
    createCommandsDirectory(tmp, builtInDir, projectDir, false);

    // User files must survive
    assert.equal(existsSync(join(commandsDir, 'my-deploy.md')), true);
    assert.equal(existsSync(join(commandsDir, 'review.md')), true);
    // Built-in files must exist
    assert.equal(existsSync(join(commandsDir, 'pf-sprint.md')), true);
    assert.equal(existsSync(join(commandsDir, 'pf-help.md')), true);
  });

  it('migrates from whole-directory symlink (legacy)', () => {
    // Simulate legacy state: .claude/commands is a symlink
    const legacyTarget = join(tmp, 'legacy-commands');
    mkdirSync(legacyTarget);
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    symlinkSync(legacyTarget, commandsDir);

    // Run update — should remove symlink and create real dir
    createCommandsDirectory(tmp, builtInDir, projectDir, false);

    assert.equal(existsSync(commandsDir), true);
    // Should be a real directory, not a symlink
    const entries = readdirSync(commandsDir);
    assert.ok(entries.includes('pf-sprint.md'));
  });

  it('refreshes built-in pf-* commands on update', () => {
    // Existing dir with stale built-in symlink
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(join(commandsDir, 'pf-sprint.md'), '# Old version');

    // Run update
    createCommandsDirectory(tmp, builtInDir, projectDir, false);

    // pf-sprint.md should be refreshed (symlink to new source)
    assert.equal(existsSync(join(commandsDir, 'pf-sprint.md')), true);
  });
});

// ---------------------------------------------------------------------------
// AC5: User-created skills are preserved during install/update
// ---------------------------------------------------------------------------

describe('98-6: createSkillsDirectory — preserves user content', () => {
  let tmp: string;
  let skillsDir: string;
  let builtInDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmp = makeTempDir();

    // Set up built-in skills source (directories with pf- prefix)
    builtInDir = join(tmp, 'node_modules', 'pennyfarthing', 'skills');
    mkdirSync(builtInDir, { recursive: true });
    mkdirSync(join(builtInDir, 'pf-sprint'));
    writeFileSync(join(builtInDir, 'pf-sprint', 'SKILL.md'), '# Sprint skill');
    mkdirSync(join(builtInDir, 'pf-testing'));
    writeFileSync(join(builtInDir, 'pf-testing', 'SKILL.md'), '# Testing skill');

    // Set up project skills source
    projectDir = join(tmp, '.claude', 'project', 'skills');
    mkdirSync(projectDir, { recursive: true });

    // The target directory
    skillsDir = join(tmp, '.claude', 'skills');
  });

  afterEach(() => { cleanup(tmp); });

  it('preserves user skill directories placed directly in .claude/skills/', () => {
    // Simulate existing state: real dir with user + built-in content
    mkdirSync(skillsDir, { recursive: true });
    mkdirSync(join(skillsDir, 'my-custom-skill'));
    writeFileSync(join(skillsDir, 'my-custom-skill', 'SKILL.md'), '# My skill');

    // Run update
    createSkillsDirectory(tmp, builtInDir, projectDir, false);

    // User skill must survive
    assert.equal(existsSync(join(skillsDir, 'my-custom-skill', 'SKILL.md')), true);
    // Built-in skills must exist
    assert.equal(existsSync(join(skillsDir, 'pf-sprint')), true);
    assert.equal(existsSync(join(skillsDir, 'pf-testing')), true);
  });

  it('migrates from whole-directory symlink (legacy)', () => {
    // Simulate legacy state: .claude/skills is a symlink
    const legacyTarget = join(tmp, 'legacy-skills');
    mkdirSync(legacyTarget);
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    symlinkSync(legacyTarget, skillsDir);

    // Run update — should remove symlink and create real dir
    createSkillsDirectory(tmp, builtInDir, projectDir, false);

    assert.equal(existsSync(skillsDir), true);
    const entries = readdirSync(skillsDir);
    assert.ok(entries.includes('pf-sprint'));
  });

  it('refreshes built-in pf-* skills on update', () => {
    // Existing dir with stale built-in content
    mkdirSync(skillsDir, { recursive: true });
    mkdirSync(join(skillsDir, 'pf-sprint'));
    writeFileSync(join(skillsDir, 'pf-sprint', 'SKILL.md'), '# Old version');

    // Run update
    createSkillsDirectory(tmp, builtInDir, projectDir, false);

    // pf-sprint should be refreshed
    assert.equal(existsSync(join(skillsDir, 'pf-sprint')), true);
  });
});
