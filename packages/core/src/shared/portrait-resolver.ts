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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

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
 * Convert a name to URL-safe slug (lowercase kebab-case).
 */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Extract portrait slug ({shortName}-{OCEAN}) for an agent from a theme YAML file.
 * Inlined here to avoid circular dependency with theme-loader.ts.
 */
function extractAgentSlug(themeYamlPath: string, agent: string): string | null {
  if (!existsSync(themeYamlPath)) return null;
  try {
    const content = readFileSync(themeYamlPath, 'utf-8');
    const parsed = parseYaml(content) as { agents?: Record<string, { shortName?: string; character?: string; ocean?: { O: number; C: number; E: number; A: number; N: number } }> };
    const agentData = parsed?.agents?.[agent];
    if (!agentData) return null;

    const shortName = agentData.shortName || agentData.character?.split(' ')[0];
    const ocean = agentData.ocean;
    if (shortName && ocean?.O != null && ocean?.C != null && ocean?.E != null && ocean?.A != null && ocean?.N != null) {
      return `${toSlug(shortName)}-${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find portrait in a specific theme directory.
 * Matches by slug (shortName-OCEAN) derived from theme YAML, falling back to agent name prefix.
 */
function findPortraitInDir(portraitsThemeDir: string, slug: string): string | null {
  if (!existsSync(portraitsThemeDir)) {
    return null;
  }

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

    // Match by slug prefix (e.g., "announcer-44441" matches "announcer-44441.png")
    for (const file of files) {
      if (file.toLowerCase().startsWith(slug.toLowerCase()) &&
          (file.endsWith('.png') || file.endsWith('.jpg'))) {
        return join(searchDir, file);
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Discover theme package portrait directories.
 * Inlined here to avoid circular dependency with theme-loader.ts.
 */
function discoverThemePackagePortraitDirs(): Array<{ portraitsDir: string }> {
  const results: Array<{ portraitsDir: string }> = [];
  let currentDir = process.cwd();

  // Check node_modules/@pennyfarthing/themes-*
  for (let i = 0; i < 10; i++) {
    const nmPfDir = join(currentDir, 'node_modules', '@pennyfarthing');
    if (existsSync(nmPfDir)) {
      try {
        for (const entry of readdirSync(nmPfDir)) {
          if (!entry.startsWith('themes-')) continue;
          const pkgJsonPath = join(nmPfDir, entry, 'package.json');
          if (!existsSync(pkgJsonPath)) continue;
          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            if (pkgJson['pennyfarthing-theme-pack'] === true) {
              results.push({ portraitsDir: join(nmPfDir, entry, 'portraits') });
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
      break;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check monorepo packages/themes-*
  currentDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const packagesDir = join(currentDir, 'packages');
    if (existsSync(packagesDir)) {
      try {
        for (const entry of readdirSync(packagesDir)) {
          if (!entry.startsWith('themes-')) continue;
          const pkgJsonPath = join(packagesDir, entry, 'package.json');
          if (!existsSync(pkgJsonPath)) continue;
          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            if (pkgJson['pennyfarthing-theme-pack'] === true) {
              const portraitsDir = join(packagesDir, entry, 'portraits');
              if (!results.some(r => r.portraitsDir === portraitsDir)) {
                results.push({ portraitsDir });
              }
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
      break;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return results;
}

/**
 * Resolve the full path to a portrait image.
 * Looks up shortName + OCEAN from theme YAML to construct the portrait slug,
 * then searches core and theme package portrait directories.
 *
 * @param theme - Theme name (e.g., 'monty-python', 'mash')
 * @param agent - Agent role (e.g., 'sm', 'tea', 'dev')
 * @returns Full path to portrait file, or null if not found
 */
export function resolvePortraitPath(theme: string, agent: string): string | null {
  const distPath = resolvePennyfarthingDist();
  const themePackages = discoverThemePackagePortraitDirs();

  // Resolve slug from theme YAML — check core then packages
  let slug: string | null = null;
  if (distPath) {
    slug = extractAgentSlug(join(distPath, 'personas', 'themes', `${theme}.yaml`), agent);
  }
  if (!slug) {
    for (const pkg of themePackages) {
      const themesDir = join(dirname(pkg.portraitsDir), 'themes');
      slug = extractAgentSlug(join(themesDir, `${theme}.yaml`), agent);
      if (slug) break;
    }
  }

  // Fall back to agent role name if theme YAML doesn't have shortName/OCEAN
  const searchSlug = slug || agent;

  // 1. Check core portraits
  if (distPath) {
    const paths = getPortraitPaths(distPath);
    const coreResult = findPortraitInDir(join(paths.portraitsDir, theme), searchSlug);
    if (coreResult) return coreResult;
  }

  // 2. Check theme package portraits
  for (const pkg of themePackages) {
    const pkgResult = findPortraitInDir(join(pkg.portraitsDir, theme), searchSlug);
    if (pkgResult) return pkgResult;
  }

  return null;
}

/**
 * Resolve the path to a tandem branding image for a given theme.
 * Looks for cyclist-tandem.png in the theme's portrait directory.
 *
 * @param theme - Theme name (e.g., 'monty-python', 'stephen-king')
 * @param size - Portrait size directory ('medium' or 'large')
 * @returns Full path to tandem branding image, or null if not found
 */
export function resolveTandemBrandingPath(theme: string, size: 'medium' | 'large' = 'medium'): string | null {
  // TODO: Implement tandem branding resolution (story 86-17)
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
