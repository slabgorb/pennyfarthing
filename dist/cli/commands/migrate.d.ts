interface MigrateOptions {
    dryRun?: boolean;
}
/**
 * Check if a project has a git submodule installation
 * A real submodule has a .git file (not directory) inside it pointing to parent's .git/modules/
 * or there's an entry in .gitmodules
 */
export declare function hasSubmodule(projectRoot: string): boolean;
/**
 * Get the version of the installed submodule
 */
export declare function getSubmoduleVersion(projectRoot: string): string | null;
/**
 * Migrate from git submodule installation to npm installation
 */
export declare function migrateFromSubmodule(projectRoot: string, options?: MigrateOptions): Promise<void>;
export {};
//# sourceMappingURL=migrate.d.ts.map