/**
 * List all commands with their sources
 */
export declare function listCommand(): Promise<void>;
/**
 * Add a new custom command
 */
export declare function addCommand(name: string, options: {
    template?: string;
    edit?: boolean;
}): Promise<void>;
/**
 * Remove a custom command
 */
export declare function removeCommand(name: string, options: {
    force?: boolean;
}): Promise<void>;
/**
 * Link an existing command file
 */
export declare function linkCommand(name: string): Promise<void>;
/**
 * Sync commands - rebuild symlinks from source directories
 */
export declare function syncCommand(options: {
    dryRun?: boolean;
}): Promise<void>;
//# sourceMappingURL=command.d.ts.map