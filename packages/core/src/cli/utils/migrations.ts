/**
 * Versioned migration runner for MSSCI-14699.
 *
 * Manages numbered migration files in pennyfarthing-dist/migrations/.
 * Each migration exports {id, description, up(), down?(), check()}.
 * The runner scans for pending migrations, executes in order, and
 * tracks applied IDs in manifest.migrationsRun.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ─── Types ─────────────────────────────────────────────────────────

/**
 * Context provided to each migration's up/down/check functions.
 */
export interface MigrationContext {
  projectRoot: string;
  logger: {
    info(message: string): void;
    warning(message: string): void;
    success(message: string): void;
  };
  dryRun: boolean;
}

/**
 * Result returned by a migration's up() or down() function.
 */
export interface MigrationResult {
  success: boolean;
  error?: string;
}

/**
 * A single migration definition.
 */
export interface Migration {
  id: string;
  description: string;
  up(ctx: MigrationContext): Promise<MigrationResult>;
  down?(ctx: MigrationContext): Promise<MigrationResult>;
  check(ctx: MigrationContext): Promise<boolean>;
}

/**
 * Result of running all pending migrations.
 */
export interface RunMigrationsResult {
  success: boolean;
  applied: string[];
  skipped: string[];
  failed?: { id: string; error: string };
}

// ─── Functions ─────────────────────────────────────────────────────

/**
 * List migration files from a directory, sorted by numeric prefix.
 *
 * Only includes .js files matching the pattern NNN-name.js.
 *
 * @param migrationsDir - Directory containing migration files
 * @returns Sorted list of migration file paths
 */
export function listMigrationFiles(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{3,}-.*\.js$/.test(f))
    .sort();

  return files.map((f) => join(migrationsDir, f));
}

/**
 * Filter migrations to only those not yet applied.
 *
 * @param migrations - All discovered migrations
 * @param appliedIds - IDs already recorded in manifest.migrationsRun
 * @returns Migrations that haven't been applied yet
 */
export function getPendingMigrations(
  migrations: Migration[],
  appliedIds: string[]
): Migration[] {
  const applied = new Set(appliedIds);
  return migrations.filter((m) => !applied.has(m.id));
}

/**
 * Run pending migrations in order, updating the applied set.
 *
 * For each pending migration:
 * 1. Call check() — if true, skip (already applied via other means)
 * 2. Call up(ctx) — execute the migration
 * 3. On success, add ID to applied set
 * 4. On failure, stop and report
 *
 * In dry-run mode, log what would run without executing.
 *
 * @param migrations - Pending migrations to run (already filtered and sorted)
 * @param projectRoot - Project root directory
 * @param appliedIds - Already-applied migration IDs (mutated on success)
 * @param options - Options including dryRun and logger
 * @returns Result with applied/skipped IDs
 */
export async function runMigrations(
  migrations: Migration[],
  projectRoot: string,
  appliedIds: string[],
  options?: {
    dryRun?: boolean;
    logger?: MigrationContext['logger'];
  }
): Promise<RunMigrationsResult> {
  const dryRun = options?.dryRun ?? false;
  const logger = options?.logger ?? {
    info() {},
    warning() {},
    success() {},
  };

  // Sort by numeric prefix for deterministic order
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id));

  const applied: string[] = [];
  const skipped: string[] = [];

  const ctx: MigrationContext = { projectRoot, logger, dryRun };

  for (const migration of sorted) {
    try {
      // Idempotency check
      const alreadyApplied = await migration.check(ctx);
      if (alreadyApplied) {
        skipped.push(migration.id);
        continue;
      }

      // Dry-run: log but don't execute
      if (dryRun) {
        logger.info(`[dry-run] Would run migration: ${migration.id} — ${migration.description}`);
        continue;
      }

      // Execute migration
      const result = await migration.up(ctx);
      if (!result.success) {
        return {
          success: false,
          applied,
          skipped,
          failed: { id: migration.id, error: result.error ?? 'Unknown error' },
        };
      }

      applied.push(migration.id);
    } catch (err) {
      return {
        success: false,
        applied,
        skipped,
        failed: { id: migration.id, error: `Migration threw: ${err}` },
      };
    }
  }

  return { success: true, applied, skipped };
}
