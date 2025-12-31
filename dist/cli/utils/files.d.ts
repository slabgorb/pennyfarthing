/**
 * Calculate SHA256 hash of a file
 */
export declare function hashFile(filePath: string): string;
/**
 * Calculate SHA256 hash of a string
 */
export declare function hashString(content: string): string;
/**
 * Check if a path is a symlink
 */
export declare function isSymlink(path: string): boolean;
/**
 * Check if a path exists (follows symlinks)
 */
export declare function pathExists(path: string): boolean;
/**
 * Check if a path is a directory
 */
export declare function isDirectory(path: string): boolean;
/**
 * Get all files in a directory recursively (skips symlinks)
 */
export declare function getAllFiles(dirPath: string, basePath?: string): string[];
/**
 * Copy a directory recursively, returning list of copied files
 */
export declare function copyDirectory(source: string, dest: string, options?: {
    dryRun?: boolean;
}): string[];
/**
 * Copy a single file
 */
export declare function copyFile(source: string, dest: string, options?: {
    dryRun?: boolean;
}): void;
/**
 * Remove a file or directory
 */
export declare function remove(path: string, options?: {
    dryRun?: boolean;
}): void;
/**
 * Ensure a directory exists
 */
export declare function ensureDir(path: string, options?: {
    dryRun?: boolean;
}): void;
/**
 * Compare two files by hash
 */
export declare function filesMatch(path1: string, path2: string): boolean;
/**
 * Check if file content matches expected hash
 */
export declare function fileMatchesHash(filePath: string, expectedHash: string): boolean;
/**
 * Get file hashes for all files in a directory
 */
export declare function getDirectoryHashes(dirPath: string): Record<string, string>;
//# sourceMappingURL=files.d.ts.map