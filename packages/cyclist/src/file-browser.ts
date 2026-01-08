/**
 * E8-3: File Browser - Main Process Module
 *
 * Provides directory listing functionality for the file browser component.
 * Reads filesystem and returns directory entries for IPC communication.
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Type Definitions
// =============================================================================

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

// =============================================================================
// Directory Listing
// =============================================================================

/**
 * Validate that a path is within the project directory (security check)
 * Uses realpath to resolve symlinks and prevent symlink-based escapes
 * @param targetPath - Path to validate
 * @param projectDir - Project root directory
 * @throws Error if path is outside project directory
 */
function validatePathSecurity(targetPath: string, projectDir: string): void {
  // First check the literal path
  const normalizedTarget = path.normalize(targetPath);
  const normalizedProject = path.normalize(projectDir);
  if (!normalizedTarget.startsWith(normalizedProject)) {
    throw new Error('Access denied: path outside project directory');
  }

  // If path exists, also check the resolved real path (follows symlinks)
  if (fs.existsSync(targetPath)) {
    try {
      const realPath = fs.realpathSync(targetPath);
      const realProject = fs.realpathSync(projectDir);
      if (!realPath.startsWith(realProject)) {
        throw new Error('Access denied: path outside project directory');
      }
    } catch (e) {
      // If realpath fails, it's either a broken symlink or permission error
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }
  }
}

/**
 * List contents of a directory
 * @param dirPath - Directory path to list (empty string for project root)
 * @param projectDir - Project root directory
 * @returns Directory listing with entries
 */
export function listDirectory(dirPath: string, projectDir: string): DirectoryListing {
  // If empty path, use project root
  const targetPath = dirPath || projectDir;

  // Validate path is within project directory (security)
  validatePathSecurity(targetPath, projectDir);

  // Validate path exists and is a directory
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Directory not found: ${targetPath}`);
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${targetPath}`);
  }

  // Read directory contents
  const names = fs.readdirSync(targetPath);
  const entries: DirectoryEntry[] = [];
  const realProject = fs.realpathSync(projectDir);

  for (const name of names) {
    const entryPath = path.join(targetPath, name);
    try {
      // Use lstatSync to check the entry itself (not follow symlinks)
      const lstats = fs.lstatSync(entryPath);

      // If it's a symlink, validate where it points
      if (lstats.isSymbolicLink()) {
        try {
          const realEntryPath = fs.realpathSync(entryPath);
          if (!realEntryPath.startsWith(realProject)) {
            // Skip symlinks pointing outside project (security)
            continue;
          }
        } catch {
          // Broken symlink - skip it
          continue;
        }
      }

      // Get actual stats (follows symlinks for type detection)
      const entryStats = fs.statSync(entryPath);
      entries.push({
        name,
        path: entryPath,
        type: entryStats.isDirectory() ? 'directory' : 'file',
        size: entryStats.isFile() ? entryStats.size : undefined,
      });
    } catch {
      // Skip entries we can't stat (permission errors, etc.)
    }
  }

  return {
    path: targetPath,
    entries,
  };
}

/**
 * Check if a path is valid and within the project directory
 * Uses realpath to resolve symlinks and prevent symlink-based escapes
 * @param targetPath - Path to validate
 * @param projectDir - Project root directory
 * @returns true if valid
 */
export function isValidPath(targetPath: string, projectDir: string): boolean {
  try {
    // First check literal path
    const normalizedTarget = path.normalize(targetPath);
    const normalizedProject = path.normalize(projectDir);
    if (!normalizedTarget.startsWith(normalizedProject)) {
      return false;
    }

    // Must exist
    if (!fs.existsSync(targetPath)) {
      return false;
    }

    // Check resolved real path (follows symlinks)
    const realPath = fs.realpathSync(targetPath);
    const realProject = fs.realpathSync(projectDir);
    return realPath.startsWith(realProject);
  } catch {
    return false;
  }
}

/**
 * Read file contents (for E8-4 file viewer integration)
 * @param filePath - Path to file
 * @param projectDir - Project root directory
 * @returns File contents as string
 */
export function readFile(filePath: string, projectDir: string): string {
  // Validate path is within project directory (security)
  validatePathSecurity(filePath, projectDir);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf-8');
}

export default {
  listDirectory,
  isValidPath,
  readFile,
};
