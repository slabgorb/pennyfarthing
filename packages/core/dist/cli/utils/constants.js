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
    'orchestrator'
];
/**
 * Symlinks that point directly to node_modules directories
 * These go in .pennyfarthing/ to minimize interference with user's .claude/
 * (commands and skills stay in .claude/ - required for Claude Code discovery)
 */
export const DIRECTORY_SYMLINKS = [
    { name: 'agents', link: '.pennyfarthing/agents' },
    { name: 'guides', link: '.pennyfarthing/guides' },
    { name: 'personas', link: '.pennyfarthing/personas' },
    { name: 'scripts', link: '.pennyfarthing/scripts' }
];
/**
 * All symlinks including commands and skills
 * Used by doctor for comprehensive checks
 */
export const ALL_SYMLINKS = [
    ...DIRECTORY_SYMLINKS,
    { name: 'commands', link: '.claude/commands' },
    { name: 'skills', link: '.claude/skills' }
];
/**
 * Paths managed by Pennyfarthing (used in manifest)
 * Commands and skills in .claude/ (for discovery), rest in .pennyfarthing/
 */
export const MANAGED_PATHS = [
    '.claude/commands',
    '.claude/skills',
    '.pennyfarthing/agents',
    '.pennyfarthing/guides',
    '.pennyfarthing/personas',
    '.pennyfarthing/scripts'
];
//# sourceMappingURL=constants.js.map