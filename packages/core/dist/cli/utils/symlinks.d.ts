/**
 * Compute relative path for symlink from link location to target
 */
export declare function computeRelativeSymlink(linkPath: string, targetPath: string): string;
/**
 * Remove a symlink or directory at the given path
 * Handles both symlinks and directories (for migration from copy mode)
 * Returns true if something was removed, false if path didn't exist
 */
export declare function removeSymlinkOrDirectory(path: string, dryRun?: boolean): boolean;
/**
 * Create commands directory with individual symlinks to each command file.
 * This allows users to add their own commands alongside built-in ones.
 */
export declare function createCommandsDirectory(projectRoot: string, builtInCommandsPath: string, projectCommandsPath: string, dryRun: boolean): void;
/**
 * Create skills directory with individual symlinks to each skill file.
 * This allows users to add their own skills alongside built-in ones.
 */
export declare function createSkillsDirectory(projectRoot: string, builtInSkillsPath: string, projectSkillsPath: string, dryRun: boolean): void;
/**
 * Check if commands directory needs migration from single symlink to directory
 */
export declare function needsCommandsMigration(projectRoot: string): boolean;
/**
 * Check if skills directory needs migration from single symlink to directory
 */
export declare function needsSkillsMigration(projectRoot: string): boolean;
//# sourceMappingURL=symlinks.d.ts.map