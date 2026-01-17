/**
 * Shared constants for Pennyfarthing CLI
 * Single source of truth for agent names, symlink definitions, and managed paths
 */
/**
 * Core agent types that have sidecars
 */
export declare const CORE_AGENTS: readonly ["dev", "tea", "sm", "reviewer", "architect", "pm", "tech-writer", "ux-designer", "devops", "orchestrator"];
export type CoreAgent = typeof CORE_AGENTS[number];
/**
 * Symlinks that point directly to node_modules directories
 * These go in .pennyfarthing/ to minimize interference with user's .claude/
 * (commands and skills stay in .claude/ - required for Claude Code discovery)
 */
export declare const DIRECTORY_SYMLINKS: readonly [{
    readonly name: "agents";
    readonly link: ".pennyfarthing/agents";
}, {
    readonly name: "guides";
    readonly link: ".pennyfarthing/guides";
}, {
    readonly name: "personas";
    readonly link: ".pennyfarthing/personas";
}, {
    readonly name: "scripts";
    readonly link: ".pennyfarthing/scripts";
}];
/**
 * All symlinks including commands and skills
 * Used by doctor for comprehensive checks
 */
export declare const ALL_SYMLINKS: readonly [{
    readonly name: "agents";
    readonly link: ".pennyfarthing/agents";
}, {
    readonly name: "guides";
    readonly link: ".pennyfarthing/guides";
}, {
    readonly name: "personas";
    readonly link: ".pennyfarthing/personas";
}, {
    readonly name: "scripts";
    readonly link: ".pennyfarthing/scripts";
}, {
    readonly name: "commands";
    readonly link: ".claude/commands";
}, {
    readonly name: "skills";
    readonly link: ".claude/skills";
}];
/**
 * Paths managed by Pennyfarthing (used in manifest)
 * Commands and skills in .claude/ (for discovery), rest in .pennyfarthing/
 */
export declare const MANAGED_PATHS: readonly [".claude/commands", ".claude/skills", ".pennyfarthing/agents", ".pennyfarthing/guides", ".pennyfarthing/personas", ".pennyfarthing/scripts"];
export type SymlinkDefinition = {
    readonly name: string;
    readonly link: string;
};
//# sourceMappingURL=constants.d.ts.map