/**
 * Migration 007: Prefix built-in skills and commands with pf-
 *
 * Creates backward-compatibility symlinks from old unprefixed names
 * to new pf-prefixed names in .claude/skills/ and .claude/commands/.
 * These symlinks ensure existing user workflows continue working
 * for one version cycle while the ecosystem migrates.
 *
 * Old names (e.g., testing, sprint, sm.md) → New names (e.g., pf-testing, pf-sprint, pf-sm.md)
 */

import { existsSync, readdirSync, symlinkSync, lstatSync } from 'fs';
import { join } from 'path';

export const id = '007-prefix-skills-commands';
export const description = 'Create backward-compat symlinks for renamed pf-prefixed skills and commands';

// Old skill directory names (before pf- prefix)
const OLD_SKILL_NAMES = [
  'agentic-patterns', 'bc', 'changelog', 'code-review',
  'context-engineering', 'cyclist', 'dev-patterns', 'jira',
  'just', 'mermaid', 'otel', 'permissions', 'sprint', 'story',
  'systematic-debugging', 'testing', 'theme', 'theme-creation',
  'workflow', 'yq',
];

// Old command file names (before pf- prefix)
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

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function up(ctx) {
  const skillsDir = join(ctx.projectRoot, '.claude', 'skills');
  const commandsDir = join(ctx.projectRoot, '.claude', 'commands');
  let created = 0;

  // Create backward-compat symlinks for skills (old name → pf-name)
  if (existsSync(skillsDir)) {
    for (const oldName of OLD_SKILL_NAMES) {
      const oldPath = join(skillsDir, oldName);
      const newPath = join(skillsDir, `pf-${oldName}`);

      // Only create symlink if new prefixed version exists and old doesn't
      if (existsSync(newPath) && !existsSync(oldPath) && !isSymlink(oldPath)) {
        try {
          symlinkSync(`pf-${oldName}`, oldPath);
          created++;
        } catch {
          // Skip if symlink creation fails (permissions, etc.)
        }
      }
    }
  }

  // Create backward-compat symlinks for commands (old name → pf-name)
  if (existsSync(commandsDir)) {
    for (const oldName of OLD_COMMAND_NAMES) {
      const oldPath = join(commandsDir, oldName);
      const newPath = join(commandsDir, `pf-${oldName}`);

      // Only create symlink if new prefixed version exists and old doesn't
      if (existsSync(newPath) && !existsSync(oldPath) && !isSymlink(oldPath)) {
        try {
          symlinkSync(`pf-${oldName}`, oldPath);
          created++;
        } catch {
          // Skip if symlink creation fails
        }
      }
    }
  }

  ctx.logger.info(`Created ${created} backward-compat symlinks for pf-prefixed skills and commands`);
  return { success: true };
}

export async function check(ctx) {
  const skillsDir = join(ctx.projectRoot, '.claude', 'skills');
  const commandsDir = join(ctx.projectRoot, '.claude', 'commands');

  // Migration is done if at least one pf-prefixed skill/command exists
  // and backward-compat symlinks are in place for old names
  if (!existsSync(skillsDir) && !existsSync(commandsDir)) {
    return true; // Nothing to migrate
  }

  // Check if any old names exist without a corresponding symlink
  if (existsSync(skillsDir)) {
    for (const oldName of OLD_SKILL_NAMES) {
      const newPath = join(skillsDir, `pf-${oldName}`);
      const oldPath = join(skillsDir, oldName);

      // If new prefixed version exists but old name doesn't → needs migration
      if (existsSync(newPath) && !existsSync(oldPath) && !isSymlink(oldPath)) {
        return false;
      }
    }
  }

  if (existsSync(commandsDir)) {
    for (const oldName of OLD_COMMAND_NAMES) {
      const newPath = join(commandsDir, `pf-${oldName}`);
      const oldPath = join(commandsDir, oldName);

      if (existsSync(newPath) && !existsSync(oldPath) && !isSymlink(oldPath)) {
        return false;
      }
    }
  }

  return true;
}
