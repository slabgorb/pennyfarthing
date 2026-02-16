/**
 * Migration 005: Migrate sidecars to .pennyfarthing/sidecars/
 *
 * Moves sidecar files from two legacy locations:
 *   1. .claude/project/agents/{agent}-sidecar/
 *   2. sprint/sidecars/{agent}/
 * to .pennyfarthing/sidecars/{agent}/
 *
 * Preserves user content, copies .md files only, cleans up legacy directories.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';

export const id = '005-migrate-sidecars';
export const description = 'Migrate sidecars from legacy locations to .pennyfarthing/sidecars/';

const CORE_AGENTS = [
  'dev', 'tea', 'sm', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator', 'ba',
];

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function up(ctx) {
  const { projectRoot } = ctx;
  let migrated = 0;

  // Ensure new sidecars directory exists
  const newSidecarsDir = join(projectRoot, '.pennyfarthing/sidecars');
  mkdirSync(newSidecarsDir, { recursive: true });

  for (const agent of CORE_AGENTS) {
    const legacyDir1 = join(projectRoot, `.claude/project/agents/${agent}-sidecar`);
    const legacyDir2 = join(projectRoot, `sprint/sidecars/${agent}`);
    const oldDir = existsSync(legacyDir1) ? legacyDir1 : (existsSync(legacyDir2) ? legacyDir2 : null);
    const newDir = join(projectRoot, `.pennyfarthing/sidecars/${agent}`);

    if (!oldDir) continue;

    mkdirSync(newDir, { recursive: true });

    try {
      const files = readdirSync(oldDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const newPath = join(newDir, file);
        if (!existsSync(newPath)) {
          copyFileSync(join(oldDir, file), newPath);
          migrated++;
        }
      }
    } catch {
      // Ignore errors reading old directory
    }
  }

  if (migrated > 0) {
    ctx.logger.success(`Migrated ${migrated} sidecar files to .pennyfarthing/sidecars/`);
  }

  // Clean up legacy .claude/project/agents/{agent}-sidecar/ directories
  const legacyAgentsDir = join(projectRoot, '.claude/project/agents');
  if (existsSync(legacyAgentsDir)) {
    let removedCount = 0;
    for (const agent of CORE_AGENTS) {
      const legacySidecarDir = join(legacyAgentsDir, `${agent}-sidecar`);
      if (existsSync(legacySidecarDir)) {
        const newAgentDir = join(projectRoot, `.pennyfarthing/sidecars/${agent}`);
        if (existsSync(newAgentDir)) {
          rmSync(legacySidecarDir, { recursive: true, force: true });
          removedCount++;
        }
      }
    }
    if (removedCount > 0) {
      ctx.logger.info(`Removed ${removedCount} legacy sidecar directories`);
    }

    // Remove agents/ directory if empty
    try {
      const remaining = readdirSync(legacyAgentsDir);
      if (remaining.length === 0) {
        rmSync(legacyAgentsDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // Clean up sprint/sidecars/ directory
  const oldSprintSidecars = join(projectRoot, 'sprint/sidecars');
  if (existsSync(oldSprintSidecars)) {
    try {
      const remaining = readdirSync(oldSprintSidecars);
      const allMigrated = remaining.every(item => {
        if (!isDirectory(join(oldSprintSidecars, item))) return false;
        return existsSync(join(projectRoot, `.pennyfarthing/sidecars/${item}`));
      });

      if (allMigrated) {
        rmSync(oldSprintSidecars, { recursive: true, force: true });
        ctx.logger.info('Removed legacy sprint/sidecars/ directory');
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  return { success: true };
}

export async function check(ctx) {
  const { projectRoot } = ctx;

  // Already done if no sidecars exist at either legacy location
  for (const agent of CORE_AGENTS) {
    if (existsSync(join(projectRoot, `.claude/project/agents/${agent}-sidecar`))) {
      return false;
    }
    if (existsSync(join(projectRoot, `sprint/sidecars/${agent}`))) {
      return false;
    }
  }
  return true;
}
