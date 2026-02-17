/**
 * Shared constants for Pennyfarthing CLI
 * Single source of truth for agent names, symlink definitions, and managed paths
 */

/**
 * Core agent types that have sidecars
 */
export const CORE_AGENTS = [
  'dev',
  'tea',
  'sm',
  'reviewer',
  'architect',
  'pm',
  'tech-writer',
  'ux-designer',
  'devops',
  'orchestrator',
  'ba'
] as const;

export type CoreAgent = typeof CORE_AGENTS[number];

/**
 * Symlinks that point directly to node_modules directories
 * These go in .pennyfarthing/ to minimize interference with user's .claude/
 * (commands and skills stay in .claude/ - required for Claude Code discovery)
 */
export const DIRECTORY_SYMLINKS = [
  { name: 'agents', link: '.pennyfarthing/agents' },
  { name: 'gates', link: '.pennyfarthing/gates' },
  { name: 'guides', link: '.pennyfarthing/guides' },
  { name: 'output-styles', link: '.pennyfarthing/output-styles' },
  { name: 'personas', link: '.pennyfarthing/personas' },
  { name: 'scripts', link: '.pennyfarthing/scripts' },
  { name: 'workflows', link: '.pennyfarthing/workflows' }
] as const;

/**
 * All directory symlinks (used by doctor for symlink checks)
 * Note: commands and skills are copied (not symlinked) since v11.3.0
 * to avoid drift when node_modules changes during install/update
 */
export const ALL_SYMLINKS = [
  ...DIRECTORY_SYMLINKS,
] as const;

/**
 * Paths managed by Pennyfarthing (used in manifest)
 * Commands and skills in .claude/ (for discovery), rest in .pennyfarthing/
 */
export const MANAGED_PATHS = [
  '.claude/commands',
  '.claude/skills',
  '.pennyfarthing/agents',
  '.pennyfarthing/gates',
  '.pennyfarthing/guides',
  '.pennyfarthing/output-styles',
  '.pennyfarthing/personas',
  '.pennyfarthing/scripts',
  '.pennyfarthing/workflows'
] as const;

export type SymlinkDefinition = {
  readonly name: string;
  readonly link: string;
};
