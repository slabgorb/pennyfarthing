/**
 * Migration 004: Migrate template files from .claude/ to .pennyfarthing/
 *
 * Moves user-customizable template files to their new canonical locations.
 * Does NOT overwrite if file already exists at new location.
 * Does NOT move shared-context.md (user-owned, stays at .claude/).
 * Cleans up empty legacy directories after migration.
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';

export const id = '004-migrate-template-files';
export const description = 'Migrate template files from .claude/ to .pennyfarthing/';

const TEMPLATE_MIGRATIONS = [
  {
    oldPath: '.claude/project/docs/agent-scopes.yaml',
    newPath: '.pennyfarthing/project/docs/agent-scopes.yaml',
  },
  {
    oldPath: '.claude/project/hooks/setup-env.sh',
    newPath: '.pennyfarthing/project/hooks/setup-env.sh',
  },
  {
    oldPath: '.claude/project/pennyfarthing-settings.yaml',
    newPath: '.pennyfarthing/project/pennyfarthing-settings.yaml',
  },
  {
    oldPath: '.claude/preferences.yaml',
    newPath: '.pennyfarthing/preferences.yaml',
  },
  {
    oldPath: '.claude/persona-config.yaml',
    newPath: '.pennyfarthing/persona-config.yaml',
  },
];

export async function up(ctx) {
  let migrated = 0;

  for (const { oldPath, newPath } of TEMPLATE_MIGRATIONS) {
    const fullOldPath = join(ctx.projectRoot, oldPath);
    const fullNewPath = join(ctx.projectRoot, newPath);

    if (!existsSync(fullOldPath)) {
      continue;
    }

    if (existsSync(fullNewPath)) {
      // New location already has content — just remove the old file
      unlinkSync(fullOldPath);
      continue;
    }

    mkdirSync(dirname(fullNewPath), { recursive: true });
    renameSync(fullOldPath, fullNewPath);
    migrated++;
  }

  if (migrated > 0) {
    ctx.logger.success(`Migrated ${migrated} template files to .pennyfarthing/`);
  }

  // Clean up empty legacy directories
  const dirsToClean = [
    '.claude/project/hooks',
    '.claude/project/docs',
    '.claude/project',
  ];
  for (const dir of dirsToClean) {
    const fullDir = join(ctx.projectRoot, dir);
    if (existsSync(fullDir)) {
      try {
        const entries = readdirSync(fullDir);
        if (entries.length === 0) {
          rmSync(fullDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return { success: true };
}

export async function check(ctx) {
  // Already done if none of the old template files exist
  return TEMPLATE_MIGRATIONS.every(({ oldPath }) => {
    return !existsSync(join(ctx.projectRoot, oldPath));
  });
}
