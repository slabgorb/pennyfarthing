/**
 * E8-3: File Browser - Main Process Module
 *
 * Provides directory listing functionality for the file browser component.
 * Reads filesystem and returns directory entries for IPC communication.
 */
/**
 * Directory entry - represents a file or directory in the tree
 */
export interface DirectoryEntry {
    name: string;
    path: string;
    type: 'file' | 'directory';
    isModified?: boolean;
    size?: number;
}
/**
 * Directory listing - response from listDirectory
 */
export interface DirectoryListing {
    path: string;
    entries: DirectoryEntry[];
}
/**
 * List contents of a directory
 * @param dirPath - Directory path to list (empty string for project root)
 * @param projectDir - Project root directory
 * @returns Directory listing with entries
 */
export declare function listDirectory(dirPath: string, projectDir: string): DirectoryListing;
/**
 * Check if a path is valid and within the project directory
 * Uses realpath to resolve symlinks and prevent symlink-based escapes
 * @param targetPath - Path to validate
 * @param projectDir - Project root directory
 * @returns true if valid
 */
export declare function isValidPath(targetPath: string, projectDir: string): boolean;
/**
 * Read file contents (for E8-4 file viewer integration)
 * @param filePath - Path to file
 * @param projectDir - Project root directory
 * @returns File contents as string
 */
export declare function readFile(filePath: string, projectDir: string): string;
declare const _default: {
    listDirectory: typeof listDirectory;
    isValidPath: typeof isValidPath;
    readFile: typeof readFile;
};
export default _default;
//# sourceMappingURL=file-browser.d.ts.map