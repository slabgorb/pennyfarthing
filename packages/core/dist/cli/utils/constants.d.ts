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
 * (not commands or skills - those use individual file symlinks)
 */
export declare const DIRECTORY_SYMLINKS: readonly [{
    readonly name: "agents";
    readonly link: ".claude/agents";
}, {
    readonly name: "guides";
    readonly link: ".claude/guides";
}, {
    readonly name: "personas";
    readonly link: ".claude/personas";
}, {
    readonly name: "scripts";
    readonly link: ".claude/scripts";
}];
/**
 * All symlinks including commands and skills
 * Used by doctor for comprehensive checks
 */
export declare const ALL_SYMLINKS: readonly [{
    readonly name: "agents";
    readonly link: ".claude/agents";
}, {
    readonly name: "guides";
    readonly link: ".claude/guides";
}, {
    readonly name: "personas";
    readonly link: ".claude/personas";
}, {
    readonly name: "scripts";
    readonly link: ".claude/scripts";
}, {
    readonly name: "commands";
    readonly link: ".claude/commands";
}, {
    readonly name: "skills";
    readonly link: ".claude/skills";
}];
/**
 * Paths managed by Pennyfarthing (used in manifest)
 */
export declare const MANAGED_PATHS: readonly [".claude/agents", ".claude/commands", ".claude/guides", ".claude/skills", ".claude/personas", ".claude/scripts"];
export type SymlinkDefinition = {
    readonly name: string;
    readonly link: string;
};
//# sourceMappingURL=constants.d.ts.map