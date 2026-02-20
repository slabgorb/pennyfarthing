import { existsSync, readdirSync, lstatSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Stale artifact detection and cleanup for v8-v10 → v11.x upgrades.
 *
 * Story 117-3: Upgrading from v8.x-v10.x leaves stale artifacts:
 * - .claude/manifest.json (v8-era manifest, now at .pennyfarthing/)
 * - .claude/personas/ directory (removed in v11)
 * - Non-prefixed commands in .claude/commands/ (41 extras from old naming scheme)
 * - Non-prefixed skills in .claude/skills/ (20 extras from old naming scheme)
 *
 * This module provides detection and cleanup functions used by:
 * - `pennyfarthing update` (automatic cleanup during upgrade)
 * - `pennyfarthing doctor` (detection and --fix)
 */

/**
 * Known stale command names from pre-pf-prefix era (v8-v10).
 * These were renamed to pf-* in v11.
 * Source: migration 009's OLD_COMMAND_NAMES list.
 */
export const STALE_COMMAND_NAMES: readonly string[] = [
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
 * Known stale skill names from pre-pf-prefix era (v8-v10).
 * These were renamed to pf-* in v11.
 * Source: migration 009's OLD_SKILL_NAMES list.
 */
export const STALE_SKILL_NAMES: readonly string[] = [
  'agentic-patterns', 'bc', 'changelog', 'code-review',
  'context-engineering', 'cyclist', 'dev-patterns', 'jira',
  'just', 'mermaid', 'otel', 'permissions', 'sprint', 'story',
  'systematic-debugging', 'testing', 'theme', 'theme-creation',
  'workflow', 'yq',
];

export interface StaleArtifact {
  path: string;
  type: 'file' | 'directory';
  category: 'manifest' | 'personas' | 'command' | 'skill';
  description: string;
}

export interface CleanupResult {
  removed: StaleArtifact[];
  preserved: StaleArtifact[];
  dryRun: boolean;
}

/**
 * Detect stale artifacts from v8-v10 installations.
 *
 * Checks for:
 * 1. .claude/manifest.json (redundant when .pennyfarthing/manifest.json exists)
 * 2. .claude/personas/ directory (removed in v11)
 * 3. Non-prefixed command files that match known stale names
 * 4. Non-prefixed skill directories that match known stale names
 *
 * Only flags items that are real files/directories (not symlinks created
 * by migration 007's backward-compat layer).
 */
export function detectStaleArtifacts(projectRoot: string): StaleArtifact[] {
  const stale: StaleArtifact[] = [];
  const claudeDir = join(projectRoot, '.claude');

  if (!existsSync(claudeDir)) return stale;

  // 1. .claude/manifest.json — only stale if .pennyfarthing/manifest.json also exists
  const claudeManifest = join(claudeDir, 'manifest.json');
  const pfManifest = join(projectRoot, '.pennyfarthing', 'manifest.json');
  if (existsSync(claudeManifest) && existsSync(pfManifest)) {
    const stat = lstatSync(claudeManifest);
    if (!stat.isSymbolicLink()) {
      stale.push({
        path: '.claude/manifest.json',
        type: 'file',
        category: 'manifest',
        description: 'Redundant v8-era manifest (superseded by .pennyfarthing/manifest.json)',
      });
    }
  }

  // 2. .claude/personas/ directory — removed in v11
  const personasDir = join(claudeDir, 'personas');
  if (existsSync(personasDir)) {
    const stat = lstatSync(personasDir);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      stale.push({
        path: '.claude/personas',
        type: 'directory',
        category: 'personas',
        description: 'Personas directory removed in v11 (now in .pennyfarthing/personas/)',
      });
    }
  }

  // 3. Non-prefixed commands matching known stale names
  const commandsDir = join(claudeDir, 'commands');
  if (existsSync(commandsDir)) {
    const entries = readdirSync(commandsDir);
    for (const entry of entries) {
      if (STALE_COMMAND_NAMES.includes(entry)) {
        const entryPath = join(commandsDir, entry);
        const stat = lstatSync(entryPath);
        if (stat.isFile() && !stat.isSymbolicLink()) {
          stale.push({
            path: `.claude/commands/${entry}`,
            type: 'file',
            category: 'command',
            description: `Stale non-prefixed command (renamed to pf-${entry} in v11)`,
          });
        }
      }
    }
  }

  // 4. Non-prefixed skills matching known stale names
  const skillsDir = join(claudeDir, 'skills');
  if (existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      if (STALE_SKILL_NAMES.includes(entry)) {
        const entryPath = join(skillsDir, entry);
        const stat = lstatSync(entryPath);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          stale.push({
            path: `.claude/skills/${entry}`,
            type: 'directory',
            category: 'skill',
            description: `Stale non-prefixed skill (renamed to pf-${entry} in v11)`,
          });
        }
      }
    }
  }

  return stale;
}

/**
 * Remove detected stale artifacts.
 *
 * Respects dryRun flag — logs what would be removed without deleting.
 * Returns summary of what was removed vs preserved.
 */
export function cleanupStaleArtifacts(
  projectRoot: string,
  options?: { dryRun?: boolean }
): CleanupResult {
  const dryRun = options?.dryRun ?? false;
  const artifacts = detectStaleArtifacts(projectRoot);

  if (dryRun || artifacts.length === 0) {
    return { removed: artifacts, preserved: [], dryRun };
  }

  const removed: StaleArtifact[] = [];
  const preserved: StaleArtifact[] = [];

  for (const artifact of artifacts) {
    const fullPath = join(projectRoot, artifact.path);
    try {
      if (artifact.type === 'file') {
        unlinkSync(fullPath);
      } else {
        rmSync(fullPath, { recursive: true, force: true });
      }
      removed.push(artifact);
    } catch {
      preserved.push(artifact);
    }
  }

  return { removed, preserved, dryRun };
}
