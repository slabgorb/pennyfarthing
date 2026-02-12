/**
 * Versioned migration runner for MSSCI-14699.
 *
 * Manages numbered migration files in pennyfarthing-dist/migrations/.
 * Each migration exports {id, description, up(), down?(), check()}.
 * The runner scans for pending migrations, executes in order, and
 * tracks applied IDs in manifest.migrationsRun.
 */

import { readdirSync } from 'fs';
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
  throw new Error('Not implemented');
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
  throw new Error('Not implemented');
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
  throw new Error('Not implemented');
}
