/**
 * Migration 009: Remove backward-compat symlinks for pf-prefixed skills/commands
 *
 * Migration 007 created symlinks from old unprefixed names (e.g., testing, sprint,
 * sm.md) to new pf-prefixed names (pf-testing, pf-sprint, pf-sm.md) for a one-version
 * transition period. That period is over — remove the backward-compat symlinks.
 *
 * Only removes entries that are symlinks pointing to the pf-prefixed version.
 * Real files/directories with old names are preserved (user content).
 */

import { existsSync, readdirSync, readlinkSync, unlinkSync, lstatSync } from 'fs';
import { join } from 'path';

export const id = '009-remove-backward-compat-symlinks';
export const description = 'Remove backward-compat symlinks from pre-pf-prefix era';

// Same lists from migration 007 — the old unprefixed names
const OLD_SKILL_NAMES = [
  'agentic-patterns', 'bc', 'changelog', 'code-review',
  'context-engineering', 'cyclist', 'dev-patterns', 'jira',
  'just', 'mermaid', 'otel', 'permissions', 'sprint', 'story',
  'systematic-debugging', 'testing', 'theme', 'theme-creation',
  'workflow', 'yq',
];

const OLD_COMMAND_NAMES = [
  'architect.md', 'ba.md', 'brainstorming.md', 'check.md',
  'chore.md', 'close-epic.md', 'continue-session.md',
  'create-branches-from-story.md', 'create-theme.md', 'dev.md',
  'devops.md', 'fix-blocker.md', 'git-cleanup.md', 'health-check.md',
  'help.md', 'list-themes.md', 'new-work.md', 'orchestrator.md',
  'parallel-work.md', 'party-mode.md', 'patch.md', 'permissions.md',
  'pm.md', 'prime.md', 'release.md', 'repo-status.md', 'retro.md',
  'reviewer.md', 'run-ci.md', 'set-theme.md', 'setup.md',
  'show-theme.md', 'sm.md', 'sprint-planning.md', 'sprint.md',
  'standalone.md', 'start-epic.md', 'sync-epic-to-jira.md',
  'sync-work-with-sprint.md', 'tea.md', 'tech-writer.md',
  'theme-maker.md', 'theme.md', 'update-domain-docs.md',
  'ux-designer.md', 'work.md', 'workflow.md',
];

/**
 * Check if a path is a symlink pointing to its pf-prefixed counterpart.
 * Returns true only for symlinks created by migration 007.
 */
function isBackwardCompatSymlink(path, oldName) {
  try {
    const stat = lstatSync(path);
    if (!stat.isSymbolicLink()) return false;
    const target = readlinkSync(path);
    return target === `pf-${oldName}`;
  } catch {
    return false;
  }
}

export async function up(ctx) {
  const skillsDir = join(ctx.projectRoot, '.claude', 'skills');
  const commandsDir = join(ctx.projectRoot, '.claude', 'commands');
  let removed = 0;

  // Remove backward-compat skill symlinks
  if (existsSync(skillsDir)) {
    for (const oldName of OLD_SKILL_NAMES) {
      const oldPath = join(skillsDir, oldName);
      if (isBackwardCompatSymlink(oldPath, oldName)) {
        if (!ctx.dryRun) {
          try {
            unlinkSync(oldPath);
            removed++;
          } catch {
            // Skip if removal fails
          }
        } else {
          removed++;
        }
      }
    }
  }

  // Remove backward-compat command symlinks
  if (existsSync(commandsDir)) {
    for (const oldName of OLD_COMMAND_NAMES) {
      const oldPath = join(commandsDir, oldName);
      if (isBackwardCompatSymlink(oldPath, oldName)) {
        if (!ctx.dryRun) {
          try {
            unlinkSync(oldPath);
            removed++;
          } catch {
            // Skip if removal fails
          }
        } else {
          removed++;
        }
      }
    }
  }

  ctx.logger.info(`Removed ${removed} backward-compat symlinks`);
  return { success: true };
}

export async function check(ctx) {
  const skillsDir = join(ctx.projectRoot, '.claude', 'skills');
  const commandsDir = join(ctx.projectRoot, '.claude', 'commands');

  // Check if any backward-compat symlinks still exist
  if (existsSync(skillsDir)) {
    for (const oldName of OLD_SKILL_NAMES) {
      if (isBackwardCompatSymlink(join(skillsDir, oldName), oldName)) {
        return false;
      }
    }
  }

  if (existsSync(commandsDir)) {
    for (const oldName of OLD_COMMAND_NAMES) {
      if (isBackwardCompatSymlink(join(commandsDir, oldName), oldName)) {
        return false;
      }
    }
  }

  return true; // No backward-compat symlinks found — already clean
}
