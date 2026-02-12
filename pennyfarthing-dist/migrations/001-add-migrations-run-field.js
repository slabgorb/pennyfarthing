/**
 * Migration 001: Add migrationsRun field to manifest
 *
 * Ensures the manifest has the migrationsRun tracking array.
 * This is the bootstrap migration — it adds the field that
 * tracks all subsequent migrations.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const id = '001-add-migrations-run-field';
export const description = 'Add migrationsRun tracking field to manifest';

export async function up(ctx) {
  const manifestPath = join(ctx.projectRoot, '.pennyfarthing/manifest.json');

  if (!existsSync(manifestPath)) {
    return { success: true }; // No manifest yet — init will create it
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (!manifest.migrationsRun) {
    manifest.migrationsRun = [];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    ctx.logger.success('Added migrationsRun field to manifest');
  }

  return { success: true };
}

export async function check(ctx) {
  const manifestPath = join(ctx.projectRoot, '.pennyfarthing/manifest.json');

  if (!existsSync(manifestPath)) {
    return true; // No manifest = nothing to migrate
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Array.isArray(manifest.migrationsRun);
}
