/**
 * 98-9: Fix uninstall data loss — cleanManagedEntries for commands/skills
 *
 * Tests that uninstall removes only pf-* managed entries from .claude/commands
 * and .claude/skills, preserving user-created content.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { cleanManagedEntries } from '../utils/symlinks.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pf-uninstall-test-'));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// AC: uninstall preserves user commands/skills without pf- prefix
// ---------------------------------------------------------------------------

describe('98-9: uninstall preserves user content in .claude/commands', () => {
  let tmp: string;
  let commandsDir: string;

  beforeEach(() => {
    tmp = makeTempDir();
    commandsDir = join(tmp, '.claude', 'commands');
    mkdirSync(commandsDir, { recursive: true });

    // Managed entries (pf-* prefix) — should be removed
    writeFileSync(join(commandsDir, 'pf-sprint.md'), '# Sprint command');
    writeFileSync(join(commandsDir, 'pf-dev.md'), '# Dev command');
    writeFileSync(join(commandsDir, 'pf-sm.md'), '# SM command');

    // User entries (no prefix) — must survive
    writeFileSync(join(commandsDir, 'my-tool.md'), '# My custom tool');
    writeFileSync(join(commandsDir, 'deploy.md'), '# Deploy command');
  });

  afterEach(() => { cleanup(tmp); });

  it('removes only pf-* entries from commands directory', () => {
    const removed = cleanManagedEntries(commandsDir, 'pf-');
    assert.equal(removed, 3);

    const remaining = readdirSync(commandsDir);
    assert.equal(remaining.length, 2);
    assert.ok(remaining.includes('my-tool.md'));
    assert.ok(remaining.includes('deploy.md'));
  });

  it('does not remove user commands without pf- prefix', () => {
    cleanManagedEntries(commandsDir, 'pf-');

    assert.ok(existsSync(join(commandsDir, 'my-tool.md')));
    assert.ok(existsSync(join(commandsDir, 'deploy.md')));
    assert.ok(!existsSync(join(commandsDir, 'pf-sprint.md')));
    assert.ok(!existsSync(join(commandsDir, 'pf-dev.md')));
    assert.ok(!existsSync(join(commandsDir, 'pf-sm.md')));
  });
});

describe('98-9: uninstall preserves user content in .claude/skills', () => {
  let tmp: string;
  let skillsDir: string;

  beforeEach(() => {
    tmp = makeTempDir();
    skillsDir = join(tmp, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });

    // Managed skill directories (pf-* prefix) — should be removed
    mkdirSync(join(skillsDir, 'pf-testing'));
    writeFileSync(join(skillsDir, 'pf-testing', 'skill.md'), '# Test skill');
    mkdirSync(join(skillsDir, 'pf-sprint'));
    writeFileSync(join(skillsDir, 'pf-sprint', 'skill.md'), '# Sprint skill');

    // User skill directories (no prefix) — must survive
    mkdirSync(join(skillsDir, 'my-custom-skill'));
    writeFileSync(join(skillsDir, 'my-custom-skill', 'skill.md'), '# My skill');
  });

  afterEach(() => { cleanup(tmp); });

  it('removes only pf-* skill directories', () => {
    const removed = cleanManagedEntries(skillsDir, 'pf-');
    assert.equal(removed, 2);

    const remaining = readdirSync(skillsDir);
    assert.equal(remaining.length, 1);
    assert.ok(remaining.includes('my-custom-skill'));
  });

  it('preserves user skill content', () => {
    cleanManagedEntries(skillsDir, 'pf-');

    assert.ok(existsSync(join(skillsDir, 'my-custom-skill', 'skill.md')));
    assert.ok(!existsSync(join(skillsDir, 'pf-testing')));
    assert.ok(!existsSync(join(skillsDir, 'pf-sprint')));
  });
});

describe('98-9: directory cleanup after managed entry removal', () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { cleanup(tmp); });

  it('directory with only pf-* entries becomes empty after clean', () => {
    const dir = join(tmp, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pf-a.md'), 'a');
    writeFileSync(join(dir, 'pf-b.md'), 'b');

    cleanManagedEntries(dir, 'pf-');

    const remaining = readdirSync(dir);
    assert.equal(remaining.length, 0);
  });

  it('directory with user content is NOT empty after clean', () => {
    const dir = join(tmp, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pf-a.md'), 'a');
    writeFileSync(join(dir, 'user-cmd.md'), 'user');

    cleanManagedEntries(dir, 'pf-');

    const remaining = readdirSync(dir);
    assert.equal(remaining.length, 1);
    assert.ok(remaining.includes('user-cmd.md'));
  });

  it('dryRun mode does not remove anything', () => {
    const dir = join(tmp, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pf-a.md'), 'a');
    writeFileSync(join(dir, 'user-cmd.md'), 'user');

    const removed = cleanManagedEntries(dir, 'pf-', true);
    assert.equal(removed, 1); // Reports count but doesn't delete

    const remaining = readdirSync(dir);
    assert.equal(remaining.length, 2); // Both still exist
  });
});
