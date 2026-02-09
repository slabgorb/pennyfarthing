/**
 * Theme Loader - Unified theme discovery, loading, and metadata for Pennyfarthing
 *
 * This is the ONE canonical implementation of theme loading. All other packages
 * (core CLI, cyclist, Python scripts, bash scripts) should delegate here.
 *
 * Discovery algorithm (checked in order, deduped by theme ID):
 *   1. Core themes: resolvePennyfarthingDist()/personas/themes/
 *   2. Theme packages: node_modules/@pennyfarthing/themes-* /themes/
 *   3. Project custom: {projectRoot}/.claude/pennyfarthing/themes/
 *   4. User custom: ~/.claude/pennyfarthing/themes/
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { resolvePennyfarthingDist, getPortraitPaths } from './portrait-resolver.js';

// ---------------------------------------------------------------------------
// Types (existing API — kept stable)
// ---------------------------------------------------------------------------

export interface ThemeAgent {
  character: string;
  style: string;
  role: string;
  trait: string;
  catchphrases: string[];
  helper?: string;
}

export interface Theme {
  name: string;
  description: string;
  agents: Record<string, ThemeAgent>;
}

// ---------------------------------------------------------------------------
// New types for theme package discovery
// ---------------------------------------------------------------------------

export interface ThemePackageInfo {
  packageName: string;
  themesDir: string;
  portraitsDir: string;
}

export interface ThemeMetadata {
  id: string;
  name: string;
  description: string;
  source: string;
  tier: string | null;
  category: string;
  agentCount: number;
}

// ---------------------------------------------------------------------------
// Internal raw types for YAML parsing
// ---------------------------------------------------------------------------

interface RawThemeAgent {
  character?: string;
  style?: string;
  role?: string;
  trait?: string;
  catchphrases?: string[];
  helper?: { name?: string; style?: string; plural?: boolean };
  shortName?: string;
}

interface RawTheme {
  theme?: {
    name?: string;
    description?: string;
    source?: string;
    tier?: string;
  };
  agents?: Record<string, RawThemeAgent>;
}

// ---------------------------------------------------------------------------
// Category mapping (moved from packages/cyclist/src/theme-metadata.ts)
// ---------------------------------------------------------------------------

export const CATEGORY_MAP: Record<string, string> = {
  // TV Series
  'star-trek-tos': 'TV Series',
  'star-trek-tng': 'TV Series',
  'star-trek-ds9': 'TV Series',
  'star-trek-voyager': 'TV Series',
  'breaking-bad': 'TV Series',
  'the-office': 'TV Series',
  'the-wire': 'TV Series',
  'game-of-thrones': 'TV Series',
  'ted-lasso': 'TV Series',
  'parks-and-recreation': 'TV Series',
  'friends': 'TV Series',
  'seinfeld': 'TV Series',
  'mad-men': 'TV Series',
  'the-sopranos': 'TV Series',
  'arrested-development': 'TV Series',
  'schitts-creek': 'TV Series',
  'brooklyn-nine-nine': 'TV Series',
  'firefly': 'TV Series',
  'battlestar-galactica': 'TV Series',
  'doctor-who': 'TV Series',
  'stranger-things': 'TV Series',
  'the-good-place': 'TV Series',
  'its-always-sunny': 'TV Series',
  'downton-abbey': 'TV Series',
  'the-crown': 'TV Series',
  'succession': 'TV Series',
  'the-simpsons': 'TV Series',
  'futurama': 'TV Series',
  'arcane': 'TV Series',
  'avatar-the-last-airbender': 'TV Series',
  'severance': 'TV Series',
  'the-west-wing': 'TV Series',
  'lost': 'TV Series',
  'the-x-files': 'TV Series',
  'twin-peaks': 'TV Series',
  'the-twilight-zone': 'TV Series',
  'mash': 'TV Series',
  'a-team': 'TV Series',
  // Literature
  'alice-in-wonderland': 'Literature',
  'lord-of-the-rings': 'Literature',
  'discworld': 'Literature',
  'hitchhikers-guide': 'Literature',
  'dune': 'Literature',
  'pride-and-prejudice': 'Literature',
  'sherlock-holmes': 'Literature',
  'harry-potter': 'Literature',
  'narnia': 'Literature',
  'foundation': 'Literature',
  'wheel-of-time': 'Literature',
  'stormlight-archive': 'Literature',
  'mistborn': 'Literature',
  'good-omens': 'Literature',
  'american-gods': 'Literature',
  'the-expanse': 'Literature',
  'enders-game': 'Literature',
  'three-body-problem': 'Literature',
  'hyperion': 'Literature',
  '1984': 'Literature',
  'brave-new-world': 'Literature',
  'frankenstein': 'Literature',
  'dracula': 'Literature',
  'moby-dick': 'Literature',
  'odyssey': 'Literature',
  'iliad': 'Literature',
  'don-quixote': 'Literature',
  'count-of-monte-cristo': 'Literature',
  'les-miserables': 'Literature',
  'great-gatsby': 'Literature',
  'winnie-the-pooh': 'Literature',
  'peter-pan': 'Literature',
  'wizard-of-oz': 'Literature',
  // Film
  'star-wars': 'Film',
  'matrix': 'Film',
  'inception': 'Film',
  'pulp-fiction': 'Film',
  'godfather': 'Film',
  'shawshank-redemption': 'Film',
  'fight-club': 'Film',
  'blade-runner': 'Film',
  'back-to-the-future': 'Film',
  'jurassic-park': 'Film',
  'indiana-jones': 'Film',
  'marvel-avengers': 'Film',
  'guardians-of-the-galaxy': 'Film',
  'pirates-of-the-caribbean': 'Film',
  'princess-bride': 'Film',
  'monty-python': 'Film',
  'ghostbusters': 'Film',
  'men-in-black': 'Film',
  'ocean-eleven': 'Film',
  'big-lebowski': 'Film',
  'grand-budapest-hotel': 'Film',
  'kill-bill': 'Film',
  'john-wick': 'Film',
  'die-hard': 'Film',
  'terminator': 'Film',
  'alien': 'Film',
  'predator': 'Film',
  'mad-max': 'Film',
  'studio-ghibli': 'Film',
  'pixar': 'Film',
  'disney-classics': 'Film',
  'interstellar': 'Film',
  'arrival': 'Film',
  'her': 'Film',
  'ex-machina': 'Film',
  // Mythology
  'greek-mythology': 'Mythology',
  'norse-mythology': 'Mythology',
  'egyptian-mythology': 'Mythology',
  'celtic-mythology': 'Mythology',
  'japanese-mythology': 'Mythology',
  'hindu-mythology': 'Mythology',
  'arthurian-legend': 'Mythology',
  // Games
  'zelda': 'Games',
  'mario': 'Games',
  'final-fantasy': 'Games',
  'mass-effect': 'Games',
  'bioshock': 'Games',
  'portal': 'Games',
  'half-life': 'Games',
  'halo': 'Games',
  'overwatch': 'Games',
  'world-of-warcraft': 'Games',
  'elder-scrolls': 'Games',
  'fallout': 'Games',
  'cyberpunk': 'Games',
  'witcher': 'Games',
  'red-dead-redemption': 'Games',
  'last-of-us': 'Games',
  'god-of-war': 'Games',
  'dark-souls': 'Games',
  'elden-ring': 'Games',
  'pokemon': 'Games',
  'animal-crossing': 'Games',
  'minecraft': 'Games',
  // History
  'ancient-rome': 'History',
  'ancient-greece': 'History',
  'ancient-egypt': 'History',
  'renaissance': 'History',
  'victorian-era': 'History',
  'wild-west': 'History',
  'world-war-2': 'History',
  'cold-war': 'History',
  'founding-fathers': 'History',
  // Music
  'classical-composers': 'Music',
  'jazz-legends': 'Music',
  'rock-legends': 'Music',
  'beatles': 'Music',
  'queen': 'Music',
  // Science
  'scientists': 'Science',
  'space-exploration': 'Science',
};

/**
 * Derive category from theme ID and source text.
 * Uses CATEGORY_MAP for known themes, falls back to pattern matching.
 */
export function deriveCategory(themeId: string, source: string): string {
  if (CATEGORY_MAP[themeId]) {
    return CATEGORY_MAP[themeId];
  }

  const s = source.toLowerCase();

  if (s.includes('tv series') || s.includes('tv show') ||
      s.includes('amc') || s.includes('hbo') ||
      s.includes('netflix') || s.includes('bbc')) {
    return 'TV Series';
  }
  if (s.includes('film') || s.includes('movie') ||
      s.includes('cinema') || s.includes('disney') ||
      s.includes('pixar') || s.includes('studio ghibli')) {
    return 'Film';
  }
  if (s.includes('mythology') || s.includes('myth') ||
      s.includes('legend') || s.includes('folklore')) {
    return 'Mythology';
  }
  if (s.includes('novel') || s.includes('book') ||
      s.includes(' by ') || s.includes('author') ||
      s.includes('literary') || s.includes('classic')) {
    return 'Literature';
  }
  if (s.includes('game') || s.includes('video game') ||
      s.includes('nintendo') || s.includes('playstation') ||
      s.includes('xbox')) {
    return 'Games';
  }
  if (s.includes('history') || s.includes('historical') ||
      s.includes('century') || s.includes('ancient') ||
      s.includes('era')) {
    return 'History';
  }
  if (s.includes('music') || s.includes('composer') ||
      s.includes('band') || s.includes('musician')) {
    return 'Music';
  }

  return 'Other';
}

// ---------------------------------------------------------------------------
// Theme package discovery
// ---------------------------------------------------------------------------

/**
 * Discover installed @pennyfarthing/themes-* packages.
 * Walks up from projectRoot looking for node_modules/@pennyfarthing/,
 * then checks each themes-* directory for a valid theme pack.
 */
export function discoverThemePackages(projectRoot?: string): ThemePackageInfo[] {
  const results: ThemePackageInfo[] = [];
  const startDir = projectRoot || process.cwd();

  // Walk up looking for node_modules/@pennyfarthing/
  let currentDir = startDir;
  for (let i = 0; i < 10; i++) {
    const nmPfDir = join(currentDir, 'node_modules', '@pennyfarthing');
    if (existsSync(nmPfDir)) {
      try {
        const entries = readdirSync(nmPfDir);
        for (const entry of entries) {
          if (!entry.startsWith('themes-')) continue;
          const pkgDir = join(nmPfDir, entry);
          const pkgJsonPath = join(pkgDir, 'package.json');
          if (!existsSync(pkgJsonPath)) continue;

          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            if (pkgJson['pennyfarthing-theme-pack'] === true) {
              results.push({
                packageName: pkgJson.name || `@pennyfarthing/${entry}`,
                themesDir: join(pkgDir, 'themes'),
                portraitsDir: join(pkgDir, 'portraits'),
              });
            }
          } catch {
            // Invalid package.json — skip
          }
        }
      } catch {
        // Can't read directory — skip
      }
      break; // Found node_modules, stop walking up
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Also check monorepo packages/ directory (for development with workspace links)
  // Walk up looking for packages/ dir containing themes-* dirs
  currentDir = startDir;
  for (let i = 0; i < 10; i++) {
    const packagesDir = join(currentDir, 'packages');
    if (existsSync(packagesDir)) {
      try {
        const entries = readdirSync(packagesDir);
        for (const entry of entries) {
          if (!entry.startsWith('themes-')) continue;
          const pkgDir = join(packagesDir, entry);
          const pkgJsonPath = join(pkgDir, 'package.json');
          if (!existsSync(pkgJsonPath)) continue;

          // Skip if already found via node_modules
          try {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            if (pkgJson['pennyfarthing-theme-pack'] === true) {
              const alreadyFound = results.some(r => r.packageName === (pkgJson.name || `@pennyfarthing/${entry}`));
              if (!alreadyFound) {
                results.push({
                  packageName: pkgJson.name || `@pennyfarthing/${entry}`,
                  themesDir: join(pkgDir, 'themes'),
                  portraitsDir: join(pkgDir, 'portraits'),
                });
              }
            }
          } catch {
            // Invalid package.json — skip
          }
        }
      } catch {
        // Can't read directory — skip
      }
      break;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return results;
}

/**
 * Discover all directories containing theme YAML files.
 * Returns dirs in priority order (core, theme packages, project custom, user custom).
 */
export function discoverAllThemeDirs(projectRoot?: string): string[] {
  const dirs: string[] = [];
  const root = projectRoot || process.cwd();

  // 1. Core themes from pennyfarthing-dist
  const distPath = resolvePennyfarthingDist();
  if (distPath) {
    const paths = getPortraitPaths(distPath);
    const coreThemesDir = join(paths.themesDir, 'themes');
    if (existsSync(coreThemesDir)) {
      dirs.push(coreThemesDir);
    }
  }

  // 2. Theme packages (e.g., @pennyfarthing/themes-realistic)
  const packages = discoverThemePackages(root);
  for (const pkg of packages) {
    if (existsSync(pkg.themesDir)) {
      dirs.push(pkg.themesDir);
    }
  }

  // 3. Project-level custom themes
  const projectCustom = join(root, '.claude', 'pennyfarthing', 'themes');
  if (existsSync(projectCustom)) {
    dirs.push(projectCustom);
  }

  // 4. User-level custom themes
  const userCustom = join(homedir(), '.claude', 'pennyfarthing', 'themes');
  if (existsSync(userCustom)) {
    dirs.push(userCustom);
  }

  return dirs;
}

/**
 * Resolve the file path for a specific theme across all sources.
 * Returns the first match found in priority order, or null.
 */
export function resolveThemePath(themeId: string, projectRoot?: string): string | null {
  const dirs = discoverAllThemeDirs(projectRoot);
  for (const dir of dirs) {
    const themePath = join(dir, `${themeId}.yaml`);
    if (existsSync(themePath)) {
      return themePath;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Theme metadata loading
// ---------------------------------------------------------------------------

/**
 * Load metadata for all discoverable themes.
 * Deduplicates by theme ID (first source wins).
 */
export function loadAllThemeMetadata(projectRoot?: string): ThemeMetadata[] {
  const dirs = discoverAllThemeDirs(projectRoot);
  const seenIds = new Set<string>();
  const metadata: ThemeMetadata[] = [];

  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.yaml')).sort();
    } catch {
      continue;
    }

    for (const file of files) {
      const themeId = basename(file, '.yaml');
      if (seenIds.has(themeId)) continue;
      seenIds.add(themeId);

      try {
        const content = readFileSync(join(dir, file), 'utf-8');
        const parsed = parseYaml(content) as RawTheme;
        if (!parsed?.theme) continue;

        const agentCount = parsed.agents ? Object.keys(parsed.agents).length : 0;

        metadata.push({
          id: themeId,
          name: parsed.theme.name || themeId,
          description: parsed.theme.description || '',
          source: parsed.theme.source || '',
          tier: (parsed.theme.tier as string) || null,
          category: deriveCategory(themeId, parsed.theme.source || ''),
          agentCount,
        });
      } catch {
        // Skip unparseable files
      }
    }
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Existing API (kept stable)
// ---------------------------------------------------------------------------

/**
 * Load a theme configuration by name.
 * Searches all theme sources in priority order.
 */
export function loadTheme(themeName: string): Theme | null {
  const themePath = resolveThemePath(themeName);
  if (!themePath) {
    return null;
  }

  try {
    const content = readFileSync(themePath, 'utf-8');
    const raw = parseYaml(content) as RawTheme;

    const agents: Record<string, ThemeAgent> = {};
    for (const [agentKey, agentData] of Object.entries(raw.agents || {})) {
      agents[agentKey] = {
        character: agentData.character || '',
        style: agentData.style || '',
        role: agentData.role || '',
        trait: agentData.trait || '',
        catchphrases: agentData.catchphrases || [],
        helper: agentData.helper?.name,
      };
    }

    return {
      name: themeName,
      description: raw.theme?.description || '',
      agents,
    };
  } catch {
    return null;
  }
}

/**
 * List all available theme IDs across all sources.
 * Deduplicates — first source wins.
 */
export function listThemes(projectRoot?: string): string[] {
  const dirs = discoverAllThemeDirs(projectRoot);
  const seenIds = new Set<string>();
  const themeIds: string[] = [];

  for (const dir of dirs) {
    try {
      const files = readdirSync(dir);
      for (const f of files) {
        if (!f.endsWith('.yaml')) continue;
        const id = basename(f, '.yaml');
        if (!seenIds.has(id)) {
          seenIds.add(id);
          themeIds.push(id);
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  return themeIds;
}

/**
 * Get agent persona from a theme.
 */
export function getAgentPersona(themeName: string, agentName: string): ThemeAgent | null {
  const theme = loadTheme(themeName);
  if (!theme) {
    return null;
  }
  return theme.agents[agentName] || null;
}
