import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';
import { resolvePennyfarthingDist, getPortraitPaths } from '@pennyfarthing/shared';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// =============================================================================
// Project Directory Management (Single Source of Truth)
// =============================================================================
// Project directory from command-line argument (highest priority)
let projectDirFromArg = null;
// Project directory selected via folder picker (set at runtime)
let selectedProjectDir = null;
/**
 * Parse --project-dir argument from CLI
 * Used when launching via: open Cyclist.app --args --project-dir=/path
 */
export function parseProjectDirArg() {
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
 */
export function setProjectDirectory(dir) {
    selectedProjectDir = dir;
    console.log('[Cyclist] Project directory set:', dir);
}
/**
 * Check if a directory is valid for use as project directory
 */
export function isValidProjectDirectory(dir) {
    if (!dir || dir === '/' || dir === '/Users' || dir === '/Applications')
        return false;
    const homeDir = process.env.HOME || '/Users/' + process.env.USER;
    if (dir === homeDir)
        return false;
    try {
        const stats = statSync(dir);
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Get the project directory for Claude to run in
 * Priority: CLI arg → selected dir (from picker) → null (triggers picker)
 */
export function getProjectDirectory() {
    const dir = projectDirFromArg || selectedProjectDir;
    if (dir && isValidProjectDirectory(dir))
        return dir;
    return null;
}
/**
 * Reset project directory state (for testing only)
 * Clears both CLI arg and selected directory
 */
export function resetProjectDirectory() {
    projectDirFromArg = null;
    selectedProjectDir = null;
}
// Resolve public directory - works in dev, compiled, and packaged Electron modes
export function getPublicDir() {
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
export function getNodeModulesDir() {
    // In packaged app, node_modules is inside asar
    const asarNodeModules = join(__dirname, '..', 'node_modules');
    if (existsSync(asarNodeModules)) {
        return asarNodeModules;
    }
    // Fallback to cwd for dev mode
    return join(process.cwd(), 'node_modules');
}
// Resolve portraits directory using @pennyfarthing/shared resolver
// Handles multiple scenarios: monorepo dogfooding, npm install, packaged Electron
export function getPortraitsDir() {
    // Use shared resolver which checks:
    // 1. PENNYFARTHING_DIST env var (explicit override)
    // 2. Monorepo root (pennyfarthing-dist/ for dogfooding)
    // 3. Sibling directory (for dev scenarios)
    // 4. Scoped npm (@pennyfarthing/core/pennyfarthing-dist/)
    // 5. Legacy npm (pennyfarthing/pennyfarthing-dist/)
    const distPath = resolvePennyfarthingDist();
    if (distPath) {
        const paths = getPortraitPaths(distPath);
        if (existsSync(paths.portraitsDir)) {
            return paths.portraitsDir;
        }
    }
    // Fallback: portraits in public dir (dev symlink)
    const publicDir = getPublicDir();
    const publicPortraits = join(publicDir, 'portraits');
    if (existsSync(publicPortraits)) {
        return publicPortraits;
    }
    return null;
}
// Singleton instances for commonly used paths
export const publicDir = getPublicDir();
export const nodeModulesDir = getNodeModulesDir();
export const portraitsDir = getPortraitsDir();
//# sourceMappingURL=paths.js.map