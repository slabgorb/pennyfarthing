/**
 * Portrait Resolver - Smart path resolution for Pennyfarthing portraits
 *
 * Checks paths in priority order:
 * 1. PENNYFARTHING_DIST env var (explicit override)
 * 2. Monorepo root (pennyfarthing-dist/ at repo root for dogfooding)
 * 3. Sibling directory (for dev scenarios)
 * 4. Scoped npm (node_modules/@pennyfarthing/core/pennyfarthing-dist/)
 * 5. Legacy npm (node_modules/pennyfarthing/pennyfarthing-dist/)
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PortraitPaths {
  portraitsDir: string;
  themesDir: string;
  agentsDir: string;
}

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the pennyfarthing-dist directory path
 * Checks multiple locations in priority order
 */
export function resolvePennyfarthingDist(): string | null {
  // 1. PENNYFARTHING_DIST env var (explicit override)
  const envPath = process.env.PENNYFARTHING_DIST;
  if (envPath) {
    if (existsSync(envPath)) {
      return envPath;
    }
    // Env var set but path doesn't exist - fall through to other checks
  }

  // 2. Monorepo root (pennyfarthing-dist/ at repo root for dogfooding)
  // Walk up from current directory looking for pennyfarthing-dist/
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const monorepoPath = join(currentDir, 'pennyfarthing-dist');
    if (existsSync(monorepoPath)) {
      return monorepoPath;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  // 3. Sibling directory (for dev scenarios)
  // Check ../pennyfarthing-dist, ../../pennyfarthing-dist from module location
  currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    currentDir = dirname(currentDir);
    const siblingPath = join(currentDir, 'pennyfarthing-dist');
    if (existsSync(siblingPath)) {
      return siblingPath;
    }
  }

  // 4. Scoped npm (node_modules/@pennyfarthing/core/pennyfarthing-dist/)
  const scopedNpmPath = resolve(__dirname, '..', '..', '..', '@pennyfarthing', 'core', 'pennyfarthing-dist');
  if (existsSync(scopedNpmPath)) {
    return scopedNpmPath;
  }

  // 5. Legacy npm (node_modules/pennyfarthing/pennyfarthing-dist/)
  const legacyNpmPath = resolve(__dirname, '..', '..', '..', 'pennyfarthing', 'pennyfarthing-dist');
  if (existsSync(legacyNpmPath)) {
    return legacyNpmPath;
  }

  // No valid path found
  return null;
}

/**
 * Resolve the full path to a portrait image
 * @param theme - Theme name (e.g., 'shakespeare', 'norse-mythology')
 * @param agent - Agent name (e.g., 'sm', 'tea', 'dev')
 * @returns Full path to portrait file, or null if not found
 */
export function resolvePortraitPath(theme: string, agent: string): string | null {
  const distPath = resolvePennyfarthingDist();
  if (!distPath) {
    return null;
  }

  const paths = getPortraitPaths(distPath);
  const portraitsThemeDir = join(paths.portraitsDir, theme);

  if (!existsSync(portraitsThemeDir)) {
    return null;
  }

  // Look for portrait file matching the agent
  // Portraits are in size subdirectories: large/, medium/, small/, original/
  // Portraits follow pattern: {shortName}-{ocean}.png
  // Agent names in tests may be short names (sm, tea, dev) or need mapping
  try {
    // Check size subdirectories in preference order
    const sizeDirectories = ['large', 'medium', 'small', 'original'];
    let files: string[] = [];
    let searchDir = portraitsThemeDir;

    for (const sizeDir of sizeDirectories) {
      const sizedPath = join(portraitsThemeDir, sizeDir);
      if (existsSync(sizedPath)) {
        files = readdirSync(sizedPath);
        searchDir = sizedPath;
        break;
      }
    }

    // Fallback to root directory if no size subdirectories
    if (files.length === 0) {
      files = readdirSync(portraitsThemeDir);
      searchDir = portraitsThemeDir;
    }

    // Map agent names to portrait file prefixes based on theme conventions
    // For most themes, portrait names use character short names
    // We need to find a file that contains the agent name or its mapping
    // Note: This includes characters from multiple themes (shakespeare, norse, a-team)
    const agentMappings: Record<string, string[]> = {
      'sm': ['prospero', 'baldur', 'face', 'faceman', 'sm'],
      'tea': ['hamlet', 'tyr', 'murdock', 'tea'],
      'dev': ['puck', 'loki', 'ba', 'dev'],
      'reviewer': ['portia', 'heimdall', 'lynch', 'decker', 'reviewer'],
      'architect': ['oberon', 'mimir', 'hannibal', 'architect'],
      'pm': ['henry', 'thor', 'amy', 'pm'],
      'tech-writer': ['horatio', 'bragi', 'tech-writer'],
      'ux-designer': ['viola', 'idunn', 'ux-designer'],
      'devops': ['caliban', 'norns', 'devops'],
      'orchestrator': ['chorus', 'odin', 'orchestrator'],
    };

    const possiblePrefixes = agentMappings[agent] || [agent];

    for (const file of files) {
      for (const prefix of possiblePrefixes) {
        if (file.toLowerCase().startsWith(prefix.toLowerCase()) &&
            (file.endsWith('.png') || file.endsWith('.jpg'))) {
          return join(searchDir, file);
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Get all portrait-related paths for a resolved dist directory
 */
export function getPortraitPaths(distPath: string): PortraitPaths {
  // Normalize path to remove trailing slashes
  const normalizedPath = distPath.replace(/\/+$/, '');

  return {
    portraitsDir: join(normalizedPath, 'personas', 'portraits'),
    themesDir: join(normalizedPath, 'personas'),
    agentsDir: join(normalizedPath, 'agents'),
  };
}
