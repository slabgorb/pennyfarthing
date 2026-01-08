import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync, readdirSync, lstatSync } from 'fs';
import fsExtra from 'fs-extra';
import { join, relative, dirname } from 'path';
const { copySync, ensureDirSync, removeSync } = fsExtra;
/**
 * Calculate SHA256 hash of a file
 */
export function hashFile(filePath) {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
}
/**
 * Calculate SHA256 hash of a string
 */
export function hashString(content) {
    return createHash('sha256').update(content).digest('hex');
}
/**
 * Check if a path is a symlink
 */
export function isSymlink(path) {
    try {
        return lstatSync(path).isSymbolicLink();
    }
    catch {
        return false;
    }
}
/**
 * Check if a path exists (follows symlinks)
 */
export function pathExists(path) {
    return existsSync(path);
}
/**
 * Check if a path is a directory
 */
export function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Get all files in a directory recursively (skips symlinks)
 */
export function getAllFiles(dirPath, basePath) {
    const base = basePath || dirPath;
    const files = [];
    if (!existsSync(dirPath)) {
        return files;
    }
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        // Skip symlinks to avoid issues with stale or circular links
        if (entry.isSymbolicLink()) {
            continue;
        }
        if (entry.isDirectory()) {
            files.push(...getAllFiles(fullPath, base));
        }
        else {
            files.push(relative(base, fullPath));
        }
    }
    return files;
}
/**
 * Copy a directory recursively, returning list of copied files
 */
export function copyDirectory(source, dest, options) {
    const files = getAllFiles(source);
    const copied = [];
    if (!options?.dryRun) {
        ensureDirSync(dest);
        copySync(source, dest, { overwrite: true });
    }
    return files.map(f => join(dest, f));
}
/**
 * Copy a single file
 */
export function copyFile(source, dest, options) {
    if (!options?.dryRun) {
        ensureDirSync(dirname(dest));
        copySync(source, dest, { overwrite: true });
    }
}
/**
 * Remove a file or directory
 */
export function remove(path, options) {
    if (!options?.dryRun) {
        removeSync(path);
    }
}
/**
 * Ensure a directory exists
 */
export function ensureDir(path, options) {
    if (!options?.dryRun) {
        ensureDirSync(path);
    }
}
/**
 * Compare two files by hash
 */
export function filesMatch(path1, path2) {
    if (!existsSync(path1) || !existsSync(path2)) {
        return false;
    }
    return hashFile(path1) === hashFile(path2);
}
/**
 * Check if file content matches expected hash
 */
export function fileMatchesHash(filePath, expectedHash) {
    if (!existsSync(filePath)) {
        return false;
    }
    return hashFile(filePath) === expectedHash;
}
/**
 * Get file hashes for all files in a directory
 */
export function getDirectoryHashes(dirPath) {
    const files = getAllFiles(dirPath);
    const hashes = {};
    for (const file of files) {
        const fullPath = join(dirPath, file);
        hashes[file] = hashFile(fullPath);
    }
    return hashes;
}
/**
 * Find the monorepo root by walking up from a starting directory.
 * Looks for the pennyfarthing-dist directory as the marker for the root.
 * This is useful for tests and scripts that need to find assets relative to the monorepo root.
 *
 * @param startDir - Starting directory (defaults to __dirname equivalent)
 * @returns Absolute path to monorepo root
 * @throws Error if root cannot be found within 10 levels
 */
export function findMonorepoRoot(startDir) {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, 'pennyfarthing-dist'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            // Reached filesystem root
            break;
        }
        dir = parent;
    }
    throw new Error(`Could not find monorepo root (pennyfarthing-dist/) starting from ${startDir}`);
}
//# sourceMappingURL=files.js.map