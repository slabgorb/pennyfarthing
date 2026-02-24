/**
 * Path resolution for server module.
 * Extracted from packages/cyclist/src/paths.ts (Story 98-17).
 *
 * Handles project directory management (CLI arg, env var, picker selection)
 * and static asset path resolution (public dir, node_modules, portraits).
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Inlined from @pennyfarthing/shared (for standalone npm distribution)
// =============================================================================

interface PortraitPaths {
  portraitsDir: string;
  themesDir: string;
  agentsDir: string;
}

/**
 * Resolve the pennyfarthing-dist directory path
 * Checks multiple locations in priority order
 */
function resolvePennyfarthingDist(): string | null {
  // 1. PENNYFARTHING_DIST env var (explicit override)
  const envPath = process.env.PENNYFARTHING_DIST;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  // 2. Packaged Electron app: Contents/Resources/pennyfarthing-dist/
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const electronResourcesPath = join(resourcesPath, 'pennyfarthing-dist');
    if (existsSync(electronResourcesPath)) {
      return electronResourcesPath;
    }
  }

  // 3. Monorepo root (pennyfarthing-dist/ at repo root for dogfooding)
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const monorepoPath = join(currentDir, 'pennyfarthing-dist');
    if (existsSync(monorepoPath)) {
      return monorepoPath;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // 4. npm installed: node_modules/pennyfarthing/pennyfarthing-dist/
  const npmPath = join(__dirname, '..', '..', 'pennyfarthing', 'pennyfarthing-dist');
  if (existsSync(npmPath)) {
    return npmPath;
  }

  // 5. Scoped npm: node_modules/@pennyfarthing/core/pennyfarthing-dist/
  const scopedPath = join(__dirname, '..', '..', '@pennyfarthing', 'core', 'pennyfarthing-dist');
  if (existsSync(scopedPath)) {
    return scopedPath;
  }

  return null;
}

/**
 * Get all portrait-related paths for a resolved dist directory
 */
function getPortraitPaths(distPath: string): PortraitPaths {
  const normalizedPath = distPath.replace(/\/+$/, '');
  return {
    portraitsDir: join(normalizedPath, 'personas', 'portraits'),
    themesDir: join(normalizedPath, 'personas'),
    agentsDir: join(normalizedPath, 'agents'),
  };
}

// =============================================================================
// Project Directory Management (Single Source of Truth)
// =============================================================================

// Project directory from command-line argument (highest priority)
let projectDirFromArg: string | null = null;

// Project directory selected via folder picker (set at runtime)
let selectedProjectDir: string | null = null;

// Track if we've already logged the project directory (avoid spam)
let hasLoggedProjectDir = false;

// Testing mode: when true, skip env var check (set by resetProjectDirectory)
let testingModeActive = false;

/**
 * Parse --project-dir argument from CLI
 * Used when launching via: open Cyclist.app --args --project-dir=/path
 */
export function parseProjectDirArg(): string | null {
  const args = process.argv.slice(1);
  const projectDirArg = args.find(arg => arg.startsWith('--project-dir='));
  if (projectDirArg) {
    const path = projectDirArg.split('=')[1];
    projectDirFromArg = path;
    return path;
  }
  return null;
}

/**
 * Set the project directory (called after folder picker selection or in tests)
 */
export function setProjectDirectory(dir: string): void {
  selectedProjectDir = dir;
  testingModeActive = false;
}

/**
 * Check if a directory is valid for use as project directory
 */
export function isValidProjectDirectory(dir: string): boolean {
  if (!dir || dir === '/' || dir === '/Users' || dir === '/Applications') return false;
  const homeDir = process.env.HOME || '/Users/' + process.env.USER;
  if (dir === homeDir) return false;
  try {
    const stats = statSync(dir);
    return stats.isDirectory();
  } catch { return false; }
}

/**
 * Get the project directory for Claude to run in
 * Priority: CLI arg → selected dir (from picker) → env var → null (triggers picker)
 */
export function getProjectDirectory(): string | null {
  // Check CLI arg first (highest priority)
  if (projectDirFromArg && isValidProjectDirectory(projectDirFromArg)) {
    return projectDirFromArg;
  }

  // Check selected directory (from picker or setProjectDirectory call)
  if (selectedProjectDir && isValidProjectDirectory(selectedProjectDir)) {
    return selectedProjectDir;
  }

  // Skip env var check in testing mode
  if (testingModeActive) {
    return null;
  }

  // Check environment variable (useful for web mode)
  const envDir = process.env.CYCLIST_PROJECT_DIR;
  if (envDir && isValidProjectDirectory(envDir)) {
    if (!hasLoggedProjectDir) {
      hasLoggedProjectDir = true;
    }
    return envDir;
  }

  return null;
}

/**
 * Reset project directory state (for testing only)
 */
export function resetProjectDirectory(): void {
  projectDirFromArg = null;
  selectedProjectDir = null;
  hasLoggedProjectDir = false;
  testingModeActive = true;
}

// Resolve public directory - works in dev, compiled, and packaged Electron modes
export function getPublicDir(): string {
  // In packaged Electron app, __dirname is inside asar: app.asar/dist/
  const asarPublic = join(__dirname, '..', 'src', 'public');
  if (existsSync(asarPublic)) {
    return asarPublic;
  }

  // Compiled dist: dist/server/paths.js → ../../src/public
  const compiledPublic = join(__dirname, '..', '..', 'src', 'public');
  if (existsSync(compiledPublic)) {
    return compiledPublic;
  }

  // Try src/public from cwd (for compiled dist/server.js in dev)
  const srcPublic = join(process.cwd(), 'src', 'public');
  if (existsSync(srcPublic)) {
    return srcPublic;
  }

  // Monorepo: __dirname is packages/core/dist/server/, public is in packages/cyclist/src/public/
  const monorepoPublic = join(__dirname, '..', '..', '..', 'cyclist', 'src', 'public');
  if (existsSync(monorepoPublic)) {
    return monorepoPublic;
  }

  // Fallback to relative path (for tsx dev mode)
  return join(__dirname, 'public');
}

// Resolve node_modules - works in both dev and packaged Electron modes
export function getNodeModulesDir(): string {
  const asarNodeModules = join(__dirname, '..', 'node_modules');
  if (existsSync(asarNodeModules)) {
    return asarNodeModules;
  }
  return join(process.cwd(), 'node_modules');
}

// Resolve portraits directory
export function getPortraitsDir(): string | null {
  // 1. Portraits bundled with package
  const bundledPortraits = join(__dirname, '..', 'portraits');
  if (existsSync(bundledPortraits)) {
    return bundledPortraits;
  }

  // 2. @pennyfarthing/cyclist package (consumer npm installs)
  //    __dirname is core/dist/server/, walk up to find node_modules
  let searchDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const cyclistPortraits = join(searchDir, 'node_modules', '@pennyfarthing', 'cyclist', 'portraits');
    if (existsSync(cyclistPortraits)) {
      return cyclistPortraits;
    }
    const parent = dirname(searchDir);
    if (parent === searchDir) break;
    searchDir = parent;
  }

  // 3. Monorepo/pennyfarthing-dist (for dogfooding)
  const distPath = resolvePennyfarthingDist();
  if (distPath) {
    const paths = getPortraitPaths(distPath);
    if (existsSync(paths.portraitsDir)) {
      return paths.portraitsDir;
    }
  }

  // 4. Fallback: portraits in public dir (dev symlink)
  const pubDir = getPublicDir();
  const publicPortraits = join(pubDir, 'portraits');
  if (existsSync(publicPortraits)) {
    return publicPortraits;
  }
  return null;
}

// Get the dist directory (where Vite build output lives — dist/public/)
export function getDistDir(): string {
  // Monorepo: Vite output is in packages/cyclist/dist/, not core's dist/
  const monorepoDistPublic = join(__dirname, '..', '..', '..', 'cyclist', 'dist');
  if (existsSync(join(monorepoDistPublic, 'public'))) {
    return monorepoDistPublic;
  }

  // npm installed: __dirname is dist/server/, Vite output is in dist/public/
  // Return dist/ (parent) so join(getDistDir(), 'public') resolves correctly
  const parentPublic = join(__dirname, '..', 'public');
  if (__dirname.endsWith('/server') && existsSync(parentPublic)) {
    return join(__dirname, '..');
  }

  if (__dirname.includes('/dist')) {
    return __dirname;
  }

  const distFromSrc = join(__dirname, '..', 'dist');
  if (existsSync(distFromSrc)) {
    return distFromSrc;
  }

  return __dirname;
}

// Singleton instances for commonly used paths
export const publicDir = getPublicDir();
export const nodeModulesDir = getNodeModulesDir();
export const portraitsDir = getPortraitsDir();
