import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync, readdirSync, lstatSync } from 'fs';
import fsExtra from 'fs-extra';
import { join, relative, dirname } from 'path';

const { copySync, ensureDirSync, removeSync } = fsExtra;

/**
 * Calculate SHA256 hash of a file
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate SHA256 hash of a string
 */
export function hashString(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if a path is a symlink
 */
export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists (follows symlinks)
 */
export function pathExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Check if a path is a directory
 */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get all files in a directory recursively (skips symlinks)
 */
export function getAllFiles(dirPath: string, basePath?: string): string[] {
  const base = basePath || dirPath;
  const files: string[] = [];

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
    } else {
      files.push(relative(base, fullPath));
    }
  }

  return files;
}

/**
 * Copy a directory recursively, returning list of copied files
 */
export function copyDirectory(
  source: string,
  dest: string,
  options?: { dryRun?: boolean }
): string[] {
  const files = getAllFiles(source);

  if (!options?.dryRun) {
    ensureDirSync(dest);
    copySync(source, dest, { overwrite: true });
  }

  return files.map(f => join(dest, f));
}

/**
 * Copy a single file
 */
export function copyFile(
  source: string,
  dest: string,
  options?: { dryRun?: boolean }
): void {
  if (!options?.dryRun) {
    ensureDirSync(dirname(dest));
    copySync(source, dest, { overwrite: true });
  }
}

/**
 * Remove a file or directory
 */
export function remove(path: string, options?: { dryRun?: boolean }): void {
  if (!options?.dryRun) {
    removeSync(path);
  }
}

/**
 * Ensure a directory exists
 */
export function ensureDir(path: string, options?: { dryRun?: boolean }): void {
  if (!options?.dryRun) {
    ensureDirSync(path);
  }
}

/**
 * Compare two files by hash
 */
export function filesMatch(path1: string, path2: string): boolean {
  if (!existsSync(path1) || !existsSync(path2)) {
    return false;
  }
  return hashFile(path1) === hashFile(path2);
}

/**
 * Check if file content matches expected hash
 */
export function fileMatchesHash(filePath: string, expectedHash: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  return hashFile(filePath) === expectedHash;
}

/**
 * Get file hashes for all files in a directory
 */
export function getDirectoryHashes(dirPath: string): Record<string, string> {
  const files = getAllFiles(dirPath);
  const hashes: Record<string, string> = {};

  for (const file of files) {
    const fullPath = join(dirPath, file);
    hashes[file] = hashFile(fullPath);
  }

  return hashes;
}

/**
 * Find the project root by walking up from a starting directory.
 *
 * Checks for markers in priority order:
 * 1. pennyfarthing-dist/ + packages/ together - Framework source repo (unique combination)
 * 2. .pennyfarthing/ - Consumer project (created by `pf setup`)
 *
 * The first check uses BOTH markers because an orchestrator might have pennyfarthing-dist/
 * via symlink, but only the actual pennyfarthing repo has both pennyfarthing-dist/ AND packages/.
 *
 * @param startDir - Starting directory (defaults to __dirname equivalent)
 * @returns Absolute path to project root
 * @throws Error if root cannot be found within 10 levels
 */
/**
 * Get all theme directories in the monorepo.
 * Scans both pennyfarthing-dist/personas/themes/ and packages/themes-* /themes/.
 */
export function getAllThemeDirs(projectRoot: string): string[] {
  const dirs: string[] = [];
  const coreThemes = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');
  if (existsSync(coreThemes)) {
    dirs.push(coreThemes);
  }
  const packagesDir = join(projectRoot, 'packages');
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir)) {
      if (entry.startsWith('themes-')) {
        const themeDir = join(packagesDir, entry, 'themes');
        if (existsSync(themeDir)) {
          dirs.push(themeDir);
        }
      }
    }
  }
  return dirs;
}

/**
 * Resolve a theme YAML file path across all theme directories.
 * Returns the first match or null.
 */
export function resolveThemeFile(projectRoot: string, themeName: string): string | null {
  for (const dir of getAllThemeDirs(projectRoot)) {
    const p = join(dir, `${themeName}.yaml`);
    if (existsSync(p)) return p;
  }
  return null;
}

export function findMonorepoRoot(startDir: string): { success: boolean; data?: string; error?: string } {
  let dir = startDir;

  for (let i = 0; i < 10; i++) {
    // Primary marker: pennyfarthing-dist/ + packages/ together (framework source repo only)
    if (existsSync(join(dir, 'pennyfarthing-dist')) && existsSync(join(dir, 'packages'))) {
      return { success: true, data: dir };
    }
    // Secondary marker: .pennyfarthing/ directory (consumer project)
    if (existsSync(join(dir, '.pennyfarthing'))) {
      return { success: true, data: dir };
    }

    const parent = dirname(dir);
    if (parent === dir) {
      // Reached filesystem root
      break;
    }
    dir = parent;
  }

  return { success: false, error: `Could not find project root (pennyfarthing-dist/+packages/ or .pennyfarthing/) starting from ${startDir}` };
}
