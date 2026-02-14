/**
 * Tests for Migration 008: Sprint shard migration
 *
 * Story 98-5: Sprint shard migration as versioned migration
 *
 * Tests:
 * - Monolithic → sharded conversion
 * - Dry-run mode (no files written)
 * - Idempotency (re-running doesn't duplicate)
 * - Edge cases (no sprint dir, empty epics, already sharded)
 *
 * Run with: cd packages/core && pnpm build && pnpm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse, stringify } from 'yaml';

// Import the migration under test
// Migration is a plain JS file — we import its named exports
import {
  id,
  description,
  up,
  check,
} from '../../../../../pennyfarthing-dist/migrations/008-sprint-shard-migration.js';

// ─── Helpers ───────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-shard-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(join(dir, 'sprint'), { recursive: true });
  return dir;
}

function createMockLogger() {
  const messages: { level: string; message: string }[] = [];
  return {
    logger: {
      info(message: string) { messages.push({ level: 'info', message }); },
      warning(message: string) { messages.push({ level: 'warning', message }); },
      success(message: string) { messages.push({ level: 'success', message }); },
    },
    messages,
  };
}

function makeCtx(projectRoot: string, dryRun = false) {
  const { logger, messages } = createMockLogger();
  return {
    ctx: { projectRoot, logger, dryRun },
    messages,
  };
}

/** Create a monolithic current-sprint.yaml with inline epics */
function writeMonolithicSprint(projectRoot: string, epics: object[]) {
  const data = {
    sprint: {
      name: 'Sprint 2606',
      start_date: '2026-02-01',
      end_date: '2026-02-14',
      status: 'active',
    },
    epics,
  };
  const sprintPath = join(projectRoot, 'sprint', 'current-sprint.yaml');
  writeFileSync(sprintPath, stringify(data, { lineWidth: 0 }), 'utf8');
}

/** Create a sharded current-sprint.yaml with string refs */
function writeShardedSprint(projectRoot: string, refs: string[]) {
  const data = {
    sprint: {
      name: 'Sprint 2606',
      start_date: '2026-02-01',
      end_date: '2026-02-14',
      status: 'active',
    },
    epics: refs,
  };
  const sprintPath = join(projectRoot, 'sprint', 'current-sprint.yaml');
  writeFileSync(sprintPath, stringify(data, { lineWidth: 0 }), 'utf8');
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Migration 008: Sprint shard migration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── Exports ─────────────────────────────────────────────────────

  describe('Migration exports', () => {
    it('should export required fields', () => {
      assert.strictEqual(id, '008-sprint-shard-migration');
      assert.strictEqual(typeof description, 'string');
      assert.ok(description.length > 0);
      assert.strictEqual(typeof up, 'function');
      assert.strictEqual(typeof check, 'function');
    });
  });

  // ─── Monolithic → Sharded Conversion ─────────────────────────────

  describe('Monolithic → sharded conversion', () => {
    it('should extract inline epics to individual files', async () => {
      const epics = [
        {
          id: 98,
          jira: 'MSSCI-14697',
          title: 'Epic A',
          stories: [
            { id: '98-1', title: 'Story 1', status: 'done' },
            { id: '98-2', title: 'Story 2', status: 'backlog' },
          ],
        },
        {
          id: 103,
          jira: 'MSSCI-14800',
          title: 'Epic B',
          stories: [
            { id: '103-1', title: 'Story 3', status: 'in_progress' },
          ],
        },
      ];
      writeMonolithicSprint(testDir, epics);

      const { ctx } = makeCtx(testDir);
      const result = await up(ctx);

      assert.ok(result.success);

      // Epic shard files should be created
      assert.ok(existsSync(join(testDir, 'sprint', 'epic-MSSCI-14697.yaml')));
      assert.ok(existsSync(join(testDir, 'sprint', 'epic-MSSCI-14800.yaml')));

      // Shard files should contain the epic data
      const epic1 = parse(readFileSync(join(testDir, 'sprint', 'epic-MSSCI-14697.yaml'), 'utf8'));
      assert.strictEqual(epic1.id, 98);
      assert.strictEqual(epic1.title, 'Epic A');
      assert.strictEqual(epic1.stories.length, 2);

      const epic2 = parse(readFileSync(join(testDir, 'sprint', 'epic-MSSCI-14800.yaml'), 'utf8'));
      assert.strictEqual(epic2.id, 103);
      assert.strictEqual(epic2.stories.length, 1);

      // Index should now have string refs
      const index = parse(readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8'));
      assert.deepStrictEqual(index.epics, ['MSSCI-14697', 'MSSCI-14800']);
      assert.ok(index.sprint, 'Sprint metadata should be preserved');
    });

    it('should use numeric id as ref when no Jira key', async () => {
      const epics = [
        { id: 42, title: 'No Jira Epic', stories: [] },
      ];
      writeMonolithicSprint(testDir, epics);

      const { ctx } = makeCtx(testDir);
      await up(ctx);

      assert.ok(existsSync(join(testDir, 'sprint', 'epic-42.yaml')));

      const index = parse(readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8'));
      assert.deepStrictEqual(index.epics, ['42']);
    });

    it('should skip epics with no id field', async () => {
      const epics = [
        { id: 50, title: 'Good Epic', stories: [] },
        { title: 'Bad Epic (no id)', stories: [] },
      ];
      writeMonolithicSprint(testDir, epics);

      const { ctx, messages } = makeCtx(testDir);
      await up(ctx);

      // Only the good epic should be extracted
      assert.ok(existsSync(join(testDir, 'sprint', 'epic-50.yaml')));

      // Warning should be logged
      assert.ok(
        messages.some(m => m.level === 'warning' && m.message.includes('no id')),
        'Should warn about epic with no id'
      );

      const index = parse(readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8'));
      assert.deepStrictEqual(index.epics, ['50']);
    });
  });

  // ─── Dry-Run Mode ────────────────────────────────────────────────

  describe('Dry-run mode', () => {
    it('should not write any files in dry-run mode', async () => {
      const epics = [
        { id: 98, jira: 'MSSCI-14697', title: 'Epic A', stories: [{ id: '98-1' }] },
      ];
      writeMonolithicSprint(testDir, epics);

      // Save original content
      const originalContent = readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8');

      const { ctx, messages } = makeCtx(testDir, true);
      const result = await up(ctx);

      assert.ok(result.success);

      // No shard file should be created
      assert.ok(!existsSync(join(testDir, 'sprint', 'epic-MSSCI-14697.yaml')));

      // Original file should be unchanged
      const afterContent = readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8');
      assert.strictEqual(afterContent, originalContent);

      // Should log what would happen
      assert.ok(
        messages.some(m => m.message.includes('[dry-run]')),
        'Should log dry-run messages'
      );
    });
  });

  // ─── Idempotency ─────────────────────────────────────────────────

  describe('Idempotency', () => {
    it('should not duplicate on re-run (check returns true after migration)', async () => {
      const epics = [
        { id: 98, jira: 'MSSCI-14697', title: 'Epic A', stories: [] },
      ];
      writeMonolithicSprint(testDir, epics);

      // First run
      const { ctx: ctx1 } = makeCtx(testDir);
      await up(ctx1);

      // check() should now return true
      const { ctx: ctx2 } = makeCtx(testDir);
      const alreadyApplied = await check(ctx2);
      assert.strictEqual(alreadyApplied, true, 'check() should return true after migration');
    });

    it('should not overwrite existing shard files on re-run', async () => {
      const epics = [
        { id: 98, jira: 'MSSCI-14697', title: 'Epic A', stories: [] },
      ];
      writeMonolithicSprint(testDir, epics);

      // First run
      const { ctx: ctx1 } = makeCtx(testDir);
      await up(ctx1);

      // Verify sharded state
      const indexAfterFirst = parse(readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8'));
      assert.deepStrictEqual(indexAfterFirst.epics, ['MSSCI-14697']);

      // Second run — should be a no-op via check()
      const { ctx: ctx2 } = makeCtx(testDir);
      const result = await up(ctx2);
      assert.ok(result.success);

      // Index should still have string refs (not re-sharded)
      const indexAfterSecond = parse(readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8'));
      assert.deepStrictEqual(indexAfterSecond.epics, ['MSSCI-14697']);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle missing sprint directory gracefully', async () => {
      const emptyDir = join(
        tmpdir(),
        `pf-nosprint-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(emptyDir, { recursive: true });

      try {
        const { ctx } = makeCtx(emptyDir);
        const result = await up(ctx);
        assert.ok(result.success);

        const checkResult = await check(ctx);
        assert.strictEqual(checkResult, true);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('should handle empty epics array', async () => {
      writeMonolithicSprint(testDir, []);

      const { ctx } = makeCtx(testDir);
      const result = await up(ctx);
      assert.ok(result.success);

      const checkResult = await check(ctx);
      assert.strictEqual(checkResult, true);
    });

    it('should handle already sharded sprint', async () => {
      writeShardedSprint(testDir, ['MSSCI-14697', 'MSSCI-14800']);

      const { ctx, messages } = makeCtx(testDir);
      const result = await up(ctx);
      assert.ok(result.success);
      assert.ok(
        messages.some(m => m.message.includes('already sharded')),
        'Should log that sprint is already sharded'
      );
    });

    it('should preserve sprint metadata in index', async () => {
      const epics = [
        { id: 42, title: 'Test Epic', stories: [] },
      ];
      writeMonolithicSprint(testDir, epics);

      const { ctx } = makeCtx(testDir);
      await up(ctx);

      const index = parse(readFileSync(join(testDir, 'sprint', 'current-sprint.yaml'), 'utf8'));
      assert.strictEqual(index.sprint.name, 'Sprint 2606');
      assert.strictEqual(index.sprint.status, 'active');
    });
  });

  // ─── check() function ───────────────────────────────────────────

  describe('check() idempotency', () => {
    it('should return false for monolithic format', async () => {
      const epics = [
        { id: 98, title: 'Inline Epic', stories: [] },
      ];
      writeMonolithicSprint(testDir, epics);

      const { ctx } = makeCtx(testDir);
      const result = await check(ctx);
      assert.strictEqual(result, false);
    });

    it('should return true for sharded format', async () => {
      writeShardedSprint(testDir, ['MSSCI-14697']);

      const { ctx } = makeCtx(testDir);
      const result = await check(ctx);
      assert.strictEqual(result, true);
    });

    it('should return true when no sprint file exists', async () => {
      const emptyDir = join(
        tmpdir(),
        `pf-nofile-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(emptyDir, { recursive: true });

      try {
        const { ctx } = makeCtx(emptyDir);
        const result = await check(ctx);
        assert.strictEqual(result, true);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
