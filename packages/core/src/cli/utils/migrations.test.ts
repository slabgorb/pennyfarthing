/**
 * Tests for MSSCI-14699: Versioned migration runner infrastructure
 *
 * Story 98-2: Create pennyfarthing-dist/migrations/ with numbered migration
 * files. Each exports {id, description, up(), down?(), check()}. Runner scans
 * for pending, executes in order, tracks in manifest.migrationsRun.
 *
 * Acceptance Criteria:
 * - AC1:  pennyfarthing-dist/migrations/ directory with migration file convention
 * - AC2:  Migration file exports: {id, description, up(ctx), down?(ctx), check(ctx)}
 * - AC3:  Runner scans for pending migrations (not in manifest.migrationsRun)
 * - AC4:  Runner executes pending migrations in numeric order
 * - AC5:  manifest.json updated with migrationsRun: string[]
 * - AC6:  check() verifies if migration already applied (idempotency)
 * - AC7:  Migration context provides projectRoot, logger, dryRun
 * - AC8:  At least one example migration file
 * - AC9:  pennyfarthing update calls migration runner after content update
 * - AC10: Dry-run mode skips execution but logs what would run
 *
 * Run with: cd packages/core && pnpm build && pnpm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import type {
  Migration,
  MigrationContext,
  MigrationResult,
} from './migrations.js';

import {
  listMigrationFiles,
  getPendingMigrations,
  runMigrations,
} from './migrations.js';

// ─── Helpers ───────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-migrations-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a mock migration object for testing */
function createMockMigration(
  id: string,
  overrides?: {
    description?: string;
    upResult?: MigrationResult;
    checkResult?: boolean;
    onUp?: (ctx: MigrationContext) => void;
    onCheck?: (ctx: MigrationContext) => void;
  }
): Migration {
  return {
    id,
    description: overrides?.description ?? `Migration ${id}`,
    async up(ctx: MigrationContext): Promise<MigrationResult> {
      overrides?.onUp?.(ctx);
      return overrides?.upResult ?? { success: true };
    },
    async check(ctx: MigrationContext): Promise<boolean> {
      overrides?.onCheck?.(ctx);
      return overrides?.checkResult ?? false;
    },
  };
}

/** Create a mock logger that captures messages */
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

// ─── Tests ─────────────────────────────────────────────────────────

describe('MSSCI-14699: Versioned migration runner', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Migration file convention ────────────────────────────

  describe('listMigrationFiles (AC1)', () => {
    it('should list .js files from migrations directory sorted by numeric prefix', () => {
      const migrationsDir = join(testDir, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });

      // Create migration files out of order
      writeFileSync(join(migrationsDir, '003-third.js'), 'export default {}');
      writeFileSync(join(migrationsDir, '001-first.js'), 'export default {}');
      writeFileSync(join(migrationsDir, '002-second.js'), 'export default {}');

      const files = listMigrationFiles(migrationsDir);

      assert.strictEqual(files.length, 3);
      assert.ok(files[0].endsWith('001-first.js'), 'First file should be 001');
      assert.ok(files[1].endsWith('002-second.js'), 'Second file should be 002');
      assert.ok(files[2].endsWith('003-third.js'), 'Third file should be 003');
    });

    it('should ignore non-JS files in migrations directory', () => {
      const migrationsDir = join(testDir, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });

      writeFileSync(join(migrationsDir, '001-first.js'), 'export default {}');
      writeFileSync(join(migrationsDir, 'README.md'), '# Migrations');
      writeFileSync(join(migrationsDir, '.gitkeep'), '');
      writeFileSync(join(migrationsDir, '002-second.ts'), 'export default {}');

      const files = listMigrationFiles(migrationsDir);

      assert.strictEqual(files.length, 1, 'Should only list .js files');
      assert.ok(files[0].endsWith('001-first.js'));
    });

    it('should return empty array for non-existent directory', () => {
      const files = listMigrationFiles(join(testDir, 'no-such-dir'));

      assert.deepStrictEqual(files, []);
    });
  });

  // ─── AC2: Migration file exports ──────────────────────────────

  describe('Migration type contract (AC2)', () => {
    it('should accept migration with required fields: id, description, up, check', () => {
      const migration = createMockMigration('001-test');

      assert.strictEqual(typeof migration.id, 'string');
      assert.strictEqual(typeof migration.description, 'string');
      assert.strictEqual(typeof migration.up, 'function');
      assert.strictEqual(typeof migration.check, 'function');
    });

    it('should accept migration with optional down()', () => {
      const migration: Migration = {
        ...createMockMigration('001-test'),
        async down(_ctx: MigrationContext): Promise<MigrationResult> {
          return { success: true };
        },
      };

      assert.strictEqual(typeof migration.down, 'function');
    });
  });

  // ─── AC3: Scan for pending migrations ─────────────────────────

  describe('getPendingMigrations (AC3)', () => {
    it('should return migrations not in appliedIds', () => {
      const migrations = [
        createMockMigration('001-first'),
        createMockMigration('002-second'),
        createMockMigration('003-third'),
      ];
      const appliedIds = ['001-first'];

      const pending = getPendingMigrations(migrations, appliedIds);

      assert.strictEqual(pending.length, 2);
      assert.strictEqual(pending[0].id, '002-second');
      assert.strictEqual(pending[1].id, '003-third');
    });

    it('should return empty array when all migrations applied', () => {
      const migrations = [
        createMockMigration('001-first'),
        createMockMigration('002-second'),
      ];
      const appliedIds = ['001-first', '002-second'];

      const pending = getPendingMigrations(migrations, appliedIds);

      assert.strictEqual(pending.length, 0);
    });

    it('should return all migrations when appliedIds is empty', () => {
      const migrations = [
        createMockMigration('001-first'),
        createMockMigration('002-second'),
      ];

      const pending = getPendingMigrations(migrations, []);

      assert.strictEqual(pending.length, 2);
    });
  });

  // ─── AC4: Numeric order execution ─────────────────────────────

  describe('Migration ordering (AC4)', () => {
    it('should execute migrations in numeric prefix order', async () => {
      const executionOrder: string[] = [];
      const migrations = [
        createMockMigration('003-third', {
          onUp: () => executionOrder.push('003'),
        }),
        createMockMigration('001-first', {
          onUp: () => executionOrder.push('001'),
        }),
        createMockMigration('002-second', {
          onUp: () => executionOrder.push('002'),
        }),
      ];

      // getPendingMigrations should maintain order, but runMigrations
      // should sort by numeric prefix regardless of input order
      const { logger } = createMockLogger();
      await runMigrations(migrations, testDir, [], { logger });

      assert.deepStrictEqual(
        executionOrder,
        ['001', '002', '003'],
        'Migrations should execute in numeric order'
      );
    });
  });

  // ─── AC5: Manifest tracking ───────────────────────────────────

  describe('Manifest migrationsRun tracking (AC5)', () => {
    it('should return applied migration IDs after execution', async () => {
      const migrations = [
        createMockMigration('001-first'),
        createMockMigration('002-second'),
      ];
      const { logger } = createMockLogger();

      const result = await runMigrations(migrations, testDir, [], { logger });

      assert.ok(result.success);
      assert.deepStrictEqual(result.applied, ['001-first', '002-second']);
    });

    it('should preserve previously applied IDs in returned set', async () => {
      const migrations = [
        createMockMigration('003-third'),
      ];
      const existing = ['001-first', '002-second'];
      const { logger } = createMockLogger();

      const result = await runMigrations(migrations, testDir, existing, { logger });

      assert.ok(result.success);
      assert.deepStrictEqual(result.applied, ['003-third']);
      // The caller is responsible for merging with existing appliedIds
    });
  });

  // ─── AC6: Idempotency via check() ─────────────────────────────

  describe('Idempotency check (AC6)', () => {
    it('should skip migration when check() returns true', async () => {
      let upCalled = false;
      const migration = createMockMigration('001-already-done', {
        checkResult: true, // already applied
        onUp: () => { upCalled = true; },
      });
      const { logger } = createMockLogger();

      const result = await runMigrations([migration], testDir, [], { logger });

      assert.ok(result.success);
      assert.strictEqual(upCalled, false, 'up() should NOT be called when check() is true');
      assert.ok(
        result.skipped.includes('001-already-done'),
        'Should be in skipped list'
      );
    });

    it('should run migration when check() returns false', async () => {
      let upCalled = false;
      const migration = createMockMigration('001-needs-run', {
        checkResult: false,
        onUp: () => { upCalled = true; },
      });
      const { logger } = createMockLogger();

      const result = await runMigrations([migration], testDir, [], { logger });

      assert.ok(result.success);
      assert.strictEqual(upCalled, true, 'up() should be called when check() is false');
      assert.ok(result.applied.includes('001-needs-run'));
    });
  });

  // ─── AC7: Migration context ───────────────────────────────────

  describe('Migration context (AC7)', () => {
    it('should provide projectRoot in context', async () => {
      let receivedCtx: MigrationContext | undefined;
      const migration = createMockMigration('001-test', {
        onUp: (ctx) => { receivedCtx = ctx; },
      });
      const { logger } = createMockLogger();

      await runMigrations([migration], testDir, [], { logger });

      assert.ok(receivedCtx, 'Context should be provided');
      assert.strictEqual(receivedCtx!.projectRoot, testDir);
    });

    it('should provide dryRun flag in context', async () => {
      let receivedCtx: MigrationContext | undefined;
      const migration = createMockMigration('001-test', {
        checkResult: false,
        onCheck: (ctx) => { receivedCtx = ctx; },
      });
      const { logger } = createMockLogger();

      // Even in dry-run, check() should still be called to report status
      await runMigrations([migration], testDir, [], { dryRun: true, logger });

      assert.ok(receivedCtx, 'Context should be provided to check()');
      assert.strictEqual(receivedCtx!.dryRun, true);
    });

    it('should provide logger in context', async () => {
      let receivedCtx: MigrationContext | undefined;
      const migration = createMockMigration('001-test', {
        onUp: (ctx) => { receivedCtx = ctx; },
      });
      const { logger } = createMockLogger();

      await runMigrations([migration], testDir, [], { logger });

      assert.ok(receivedCtx, 'Context should be provided');
      assert.strictEqual(typeof receivedCtx!.logger.info, 'function');
      assert.strictEqual(typeof receivedCtx!.logger.warning, 'function');
    });
  });

  // ─── AC10: Dry-run mode ───────────────────────────────────────

  describe('Dry-run mode (AC10)', () => {
    it('should not call up() in dry-run mode', async () => {
      let upCalled = false;
      const migration = createMockMigration('001-test', {
        onUp: () => { upCalled = true; },
      });
      const { logger } = createMockLogger();

      const result = await runMigrations([migration], testDir, [], {
        dryRun: true,
        logger,
      });

      assert.strictEqual(upCalled, false, 'up() should NOT be called in dry-run');
      assert.ok(result.success);
    });

    it('should report what would run in dry-run mode', async () => {
      const migrations = [
        createMockMigration('001-first'),
        createMockMigration('002-second'),
      ];
      const { logger, messages } = createMockLogger();

      await runMigrations(migrations, testDir, [], { dryRun: true, logger });

      const infoMessages = messages
        .filter((m) => m.level === 'info')
        .map((m) => m.message);

      assert.ok(
        infoMessages.some((m) => m.includes('001-first')),
        'Should log migration 001-first in dry-run'
      );
      assert.ok(
        infoMessages.some((m) => m.includes('002-second')),
        'Should log migration 002-second in dry-run'
      );
    });
  });

  // ─── Failure handling ─────────────────────────────────────────

  describe('Failure handling', () => {
    it('should stop on first migration failure', async () => {
      const executionOrder: string[] = [];
      const migrations = [
        createMockMigration('001-ok', {
          onUp: () => executionOrder.push('001'),
        }),
        createMockMigration('002-fail', {
          upResult: { success: false, error: 'Database unavailable' },
          onUp: () => executionOrder.push('002'),
        }),
        createMockMigration('003-never', {
          onUp: () => executionOrder.push('003'),
        }),
      ];
      const { logger } = createMockLogger();

      const result = await runMigrations(migrations, testDir, [], { logger });

      assert.strictEqual(result.success, false);
      assert.ok(result.failed, 'Should report failed migration');
      assert.strictEqual(result.failed!.id, '002-fail');
      assert.strictEqual(result.failed!.error, 'Database unavailable');
      assert.deepStrictEqual(result.applied, ['001-ok']);
      assert.ok(
        !executionOrder.includes('003'),
        'Should not execute migrations after failure'
      );
    });
  });
});
