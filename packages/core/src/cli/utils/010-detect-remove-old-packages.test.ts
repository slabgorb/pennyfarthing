/**
 * Tests for MSSCI-15080: v11 migration automation — detect and remove old multi-package installs
 *
 * Story 98-22: Create migration 010 to detect and remove old multi-package
 * installs (@pennyfarthing/shared, @pennyfarthing/cyclist, @pennyfarthing/benchmark)
 * that were absorbed into @pennyfarthing/core in v11.
 *
 * Acceptance Criteria:
 * - AC1: Migration file exists with correct exports (id, description, up, check)
 * - AC2: check() detects old packages in node_modules/ — false if found, true if clean
 * - AC3: up() removes old package directories from node_modules/@pennyfarthing/
 * - AC4: up() respects ctx.dryRun — logs without deleting
 * - AC5: up() logs removal actions via ctx.logger
 * - AC6: check()/up() handle missing node_modules/ gracefully
 * - AC7: Migration integrates with existing runner (auto-discovered by listMigrationFiles)
 *
 * Run with: cd packages/core && pnpm build && node --test dist/cli/utils/010-detect-remove-old-packages.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { listMigrationFiles } from './migrations.js';

// Import the migration under test
// Migration is a plain JS file — we import its named exports
import {
  id,
  description,
  up,
  check,
} from '../../../../../pennyfarthing-dist/migrations/010-detect-remove-old-packages.js';

// ─── Helpers ───────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-010-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
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

/** The three old packages that should be detected and removed */
const OLD_PACKAGES = [
  '@pennyfarthing/shared',
  '@pennyfarthing/cyclist',
  '@pennyfarthing/benchmark',
];

/**
 * Create fake old package directories in node_modules
 */
function createOldPackageDirs(projectRoot: string, packages: string[]): void {
  for (const pkg of packages) {
    const pkgDir = join(projectRoot, 'node_modules', pkg);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: pkg,
      version: '10.0.0',
    }));
  }
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('MSSCI-15080: v11 migration — detect and remove old multi-package installs', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC1: Migration file exists with correct exports ──────────

  describe('Migration file contract (AC1)', () => {
    it('should export id as a string matching 010-* pattern', () => {
      assert.strictEqual(typeof id, 'string');
      assert.ok(
        id.startsWith('010-'),
        `Migration id should start with "010-", got "${id}"`
      );
    });

    it('should export description as a non-empty string', () => {
      assert.strictEqual(typeof description, 'string');
      assert.ok(description.length > 0, 'Description should not be empty');
    });

    it('should export up as a function', () => {
      assert.strictEqual(typeof up, 'function');
    });

    it('should export check as a function', () => {
      assert.strictEqual(typeof check, 'function');
    });
  });

  // ─── AC2: check() detects old packages ─────────────────────────

  describe('check() detection (AC2)', () => {
    it('should return false when @pennyfarthing/shared exists in node_modules', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/shared']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, false, 'check() should return false when old packages exist');
    });

    it('should return false when @pennyfarthing/cyclist exists in node_modules', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/cyclist']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, false, 'check() should return false when old packages exist');
    });

    it('should return false when @pennyfarthing/benchmark exists in node_modules', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/benchmark']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, false, 'check() should return false when old packages exist');
    });

    it('should return false when multiple old packages exist', async () => {
      createOldPackageDirs(testDir, OLD_PACKAGES);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, false, 'check() should return false when any old packages exist');
    });

    it('should return true when no old packages exist in node_modules', async () => {
      // Create node_modules with only @pennyfarthing/core (the valid package)
      const coreDir = join(testDir, 'node_modules', '@pennyfarthing', 'core');
      mkdirSync(coreDir, { recursive: true });
      writeFileSync(join(coreDir, 'package.json'), '{"name":"@pennyfarthing/core"}');

      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, true, 'check() should return true when no old packages exist');
    });
  });

  // ─── AC3: up() removes old package directories ─────────────────

  describe('up() removal (AC3)', () => {
    it('should remove @pennyfarthing/shared from node_modules', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/shared']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await up(ctx);

      assert.ok(result.success, 'up() should return success');
      assert.strictEqual(
        existsSync(join(testDir, 'node_modules', '@pennyfarthing', 'shared')),
        false,
        '@pennyfarthing/shared should be removed'
      );
    });

    it('should remove @pennyfarthing/cyclist from node_modules', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/cyclist']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await up(ctx);

      assert.ok(result.success, 'up() should return success');
      assert.strictEqual(
        existsSync(join(testDir, 'node_modules', '@pennyfarthing', 'cyclist')),
        false,
        '@pennyfarthing/cyclist should be removed'
      );
    });

    it('should remove @pennyfarthing/benchmark from node_modules', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/benchmark']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await up(ctx);

      assert.ok(result.success, 'up() should return success');
      assert.strictEqual(
        existsSync(join(testDir, 'node_modules', '@pennyfarthing', 'benchmark')),
        false,
        '@pennyfarthing/benchmark should be removed'
      );
    });

    it('should remove all three old packages when all present', async () => {
      createOldPackageDirs(testDir, OLD_PACKAGES);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await up(ctx);

      assert.ok(result.success, 'up() should return success');
      for (const pkg of OLD_PACKAGES) {
        const pkgName = pkg.split('/')[1];
        assert.strictEqual(
          existsSync(join(testDir, 'node_modules', '@pennyfarthing', pkgName)),
          false,
          `${pkg} should be removed`
        );
      }
    });

    it('should NOT remove @pennyfarthing/core', async () => {
      // Create core alongside old packages
      createOldPackageDirs(testDir, [...OLD_PACKAGES, '@pennyfarthing/core']);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      await up(ctx);

      assert.ok(
        existsSync(join(testDir, 'node_modules', '@pennyfarthing', 'core')),
        '@pennyfarthing/core should NOT be removed'
      );
    });

    it('should return {success: true} result object', async () => {
      createOldPackageDirs(testDir, OLD_PACKAGES);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await up(ctx);

      assert.strictEqual(typeof result, 'object');
      assert.strictEqual(result.success, true);
    });
  });

  // ─── AC4: Dry-run mode ─────────────────────────────────────────

  describe('Dry-run mode (AC4)', () => {
    it('should NOT delete packages in dry-run mode', async () => {
      createOldPackageDirs(testDir, OLD_PACKAGES);
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: true };

      const result = await up(ctx);

      assert.ok(result.success, 'up() should still return success in dry-run');
      for (const pkg of OLD_PACKAGES) {
        const pkgName = pkg.split('/')[1];
        assert.ok(
          existsSync(join(testDir, 'node_modules', '@pennyfarthing', pkgName)),
          `${pkg} should still exist in dry-run mode`
        );
      }
    });

    it('should log what would be removed in dry-run mode', async () => {
      createOldPackageDirs(testDir, ['@pennyfarthing/shared']);
      const { logger, messages } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: true };

      await up(ctx);

      const allMessages = messages.map(m => m.message).join(' ');
      assert.ok(
        allMessages.includes('shared'),
        'Should log about @pennyfarthing/shared in dry-run'
      );
    });
  });

  // ─── AC5: Logging ──────────────────────────────────────────────

  describe('Logging (AC5)', () => {
    it('should log each package being removed', async () => {
      createOldPackageDirs(testDir, OLD_PACKAGES);
      const { logger, messages } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      await up(ctx);

      const allMessages = messages.map(m => m.message).join(' ');
      assert.ok(allMessages.includes('shared'), 'Should log about shared');
      assert.ok(allMessages.includes('cyclist'), 'Should log about cyclist');
      assert.ok(allMessages.includes('benchmark'), 'Should log about benchmark');
    });

    it('should log when no old packages are found', async () => {
      // Empty node_modules — nothing to remove
      mkdirSync(join(testDir, 'node_modules', '@pennyfarthing'), { recursive: true });
      const { logger, messages } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      await up(ctx);

      assert.ok(messages.length > 0, 'Should log something even when nothing to remove');
    });
  });

  // ─── AC6: Missing node_modules graceful handling ───────────────

  describe('Missing node_modules (AC6)', () => {
    it('check() should return true when node_modules does not exist', async () => {
      // testDir has no node_modules at all
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, true, 'check() should return true when no node_modules exists');
    });

    it('check() should return true when @pennyfarthing scope dir does not exist', async () => {
      // node_modules exists but no @pennyfarthing scope
      mkdirSync(join(testDir, 'node_modules'), { recursive: true });
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await check(ctx);

      assert.strictEqual(result, true, 'check() should return true when no @pennyfarthing scope');
    });

    it('up() should return success when node_modules does not exist', async () => {
      const { logger } = createMockLogger();
      const ctx = { projectRoot: testDir, logger, dryRun: false };

      const result = await up(ctx);

      assert.ok(result.success, 'up() should succeed gracefully with no node_modules');
    });
  });

  // ─── AC7: Runner integration ───────────────────────────────────

  describe('Runner integration (AC7)', () => {
    it('should be discovered by listMigrationFiles()', () => {
      // Point at the real migrations directory
      const migrationsDir = join(__dirname, '..', '..', '..', '..', '..', 'pennyfarthing-dist', 'migrations');
      const files = listMigrationFiles(migrationsDir);

      const migration010 = files.find(f => f.includes('010-'));
      assert.ok(
        migration010,
        'Migration 010 should be discoverable in pennyfarthing-dist/migrations/'
      );
    });

    it('should sort after 009 in migration order', () => {
      const migrationsDir = join(__dirname, '..', '..', '..', '..', '..', 'pennyfarthing-dist', 'migrations');
      const files = listMigrationFiles(migrationsDir);

      const idx009 = files.findIndex(f => f.includes('009-'));
      const idx010 = files.findIndex(f => f.includes('010-'));

      assert.ok(idx009 >= 0, 'Migration 009 should exist');
      assert.ok(idx010 >= 0, 'Migration 010 should exist');
      assert.ok(idx010 > idx009, 'Migration 010 should sort after 009');
    });
  });
});
