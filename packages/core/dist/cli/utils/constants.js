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
 * (not commands or skills - those use individual file symlinks)
 */
export const DIRECTORY_SYMLINKS = [
    { name: 'agents', link: '.claude/agents' },
    { name: 'guides', link: '.claude/guides' },
    { name: 'personas', link: '.claude/personas' },
    { name: 'scripts', link: '.claude/scripts' }
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
 */
export const MANAGED_PATHS = [
    '.claude/agents',
    '.claude/commands',
    '.claude/guides',
    '.claude/skills',
    '.claude/personas',
    '.claude/scripts'
];
//# sourceMappingURL=constants.js.map