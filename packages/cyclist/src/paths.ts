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
  // In packaged app, __dirname is inside app.asar, process.resourcesPath points to Resources
  if ((process as unknown as Record<string, unknown>).resourcesPath) {
    const electronResourcesPath = join((process as unknown as Record<string, unknown>).resourcesPath as string, 'pennyfarthing-dist');
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
  // From cyclist's perspective: ../../pennyfarthing/pennyfarthing-dist
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
// MSSCI-12510: This allows tests to simulate "no project directory" scenario
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
    console.log('[Cyclist] Project directory from CLI arg:', path);
    projectDirFromArg = path;
    return path;
  }
  return null;
}

/**
 * Set the project directory (called after folder picker selection or in tests)
 * MSSCI-12510: Now clears testing mode so the set directory is honored.
 */
export function setProjectDirectory(dir: string): void {
  selectedProjectDir = dir;
  testingModeActive = false; // Clear testing mode when explicitly setting
  console.log('[Cyclist] Project directory set:', dir);
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
 *
 * MSSCI-12510: Changed priority so setProjectDirectory() takes precedence over env var.
 * This allows explicit setting to override environment defaults.
 */
export function getProjectDirectory(): string | null {
  // Check CLI arg first (highest priority)
  if (projectDirFromArg && isValidProjectDirectory(projectDirFromArg)) {
    return projectDirFromArg;
  }

  // Check selected directory (from picker or setProjectDirectory call)
  // MSSCI-12510: Moved above env var check so explicit sets take priority
  if (selectedProjectDir && isValidProjectDirectory(selectedProjectDir)) {
    return selectedProjectDir;
  }

  // Skip env var check in testing mode (MSSCI-12510)
  if (testingModeActive) {
    return null;
  }

  // Check environment variable (useful for web mode)
  const envDir = process.env.PF_PROJECT_DIR;
  if (envDir && isValidProjectDirectory(envDir)) {
    if (!hasLoggedProjectDir) {
      console.log('[Cyclist] Project directory from env:', envDir);
      hasLoggedProjectDir = true;
    }
    return envDir;
  }

  return null;
}

/**
 * Reset project directory state (for testing only)
 * Clears both CLI arg and selected directory, and enables testing mode
 * which skips the environment variable check.
 *
 * MSSCI-12510: Added testingModeActive flag to allow tests to simulate
 * the "no project directory" scenario without env var interference.
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
  // Need to go up to app.asar/ then into src/public/
  const asarPublic = join(__dirname, '..', 'src', 'public');
  if (existsSync(asarPublic)) {
    return asarPublic;
  }

  // Try src/public from cwd (for compiled dist/server.js in dev)
  const srcPublic = join(process.cwd(), 'src', 'public');
  if (existsSync(srcPublic)) {
    return srcPublic;
  }

  // Fallback to relative path (for tsx dev mode)
  return join(__dirname, 'public');
}

// Resolve node_modules - works in both dev and packaged Electron modes
export function getNodeModulesDir(): string {
  // In packaged app, node_modules is inside asar
  const asarNodeModules = join(__dirname, '..', 'node_modules');
  if (existsSync(asarNodeModules)) {
    return asarNodeModules;
  }
  // Fallback to cwd for dev mode
  return join(process.cwd(), 'node_modules');
}

// Resolve portraits directory
// Handles multiple scenarios: npm installed Cyclist, monorepo dogfooding, packaged Electron
export function getPortraitsDir(): string | null {
  // 1. Portraits bundled with Cyclist package (npm install @pennyfarthing/cyclist)
  // From dist/ go up to package root, then into portraits/
  const bundledPortraits = join(__dirname, '..', 'portraits');
  if (existsSync(bundledPortraits)) {
    return bundledPortraits;
  }

  // 2. Monorepo/pennyfarthing-dist (for dogfooding)
  const distPath = resolvePennyfarthingDist();
  if (distPath) {
    const paths = getPortraitPaths(distPath);
    if (existsSync(paths.portraitsDir)) {
      return paths.portraitsDir;
    }
  }

  // 3. Fallback: portraits in public dir (dev symlink)
  const publicDir = getPublicDir();
  const publicPortraits = join(publicDir, 'portraits');
  if (existsSync(publicPortraits)) {
    return publicPortraits;
  }
  return null;
}

// Get the dist directory (where compiled JS files live)
// Used for preload scripts and other assets that are compiled alongside main code
export function getDistDir(): string {
  // If running from dist/ (compiled), __dirname is already correct
  if (__dirname.includes('/dist')) {
    return __dirname;
  }

  // If running from src/ (tsx dev mode), resolve to dist/ relative to package root
  // __dirname in tsx dev mode is src/, so go up one level then into dist/
  const distFromSrc = join(__dirname, '..', 'dist');
  if (existsSync(distFromSrc)) {
    return distFromSrc;
  }

  // Fallback to __dirname
  return __dirname;
}

// Singleton instances for commonly used paths
export const publicDir = getPublicDir();
export const nodeModulesDir = getNodeModulesDir();
export const portraitsDir = getPortraitsDir();
