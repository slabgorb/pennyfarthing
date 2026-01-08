/**
 * List all skills with their sources
 */
export declare function listSkill(): Promise<void>;
/**
 * Add a new custom skill
 */
export declare function addSkill(name: string, options: {
    template?: string;
    edit?: boolean;
}): Promise<void>;
/**
 * Remove a custom skill
 */
export declare function removeSkill(name: string, options: {
    force?: boolean;
}): Promise<void>;
/**
 * Link an existing skill directory
 */
export declare function linkSkill(name: string): Promise<void>;
/**
 * Sync skills - rebuild symlinks from source directories
 */
export declare function syncSkill(options: {
    dryRun?: boolean;
}): Promise<void>;
//# sourceMappingURL=skill.d.ts.map