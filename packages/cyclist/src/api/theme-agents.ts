import { Router } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { detectPennyfarthingProject, loadThemeConfig, loadThemeYaml } from '../pennyfarthing.js';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CYCLIST_ROOT = join(__dirname, '..', '..', '..', '..'); // packages/cyclist/src/api -> pennyfarthing-2

/**
 * Agent character mapping from theme
 */
export interface AgentCharacterMap {
  [role: string]: {
    character: string;
    shortName?: string;
  };
}

/**
 * MSSCI-12403: Enhanced agent data for persona popup team roster
 */
export interface EnhancedThemeAgent {
  role: string;
  character: string;
  shortName?: string;
  style: string;
  background: string;
  quirks: string[];
  slug: string;
  lift?: number;
  ocean?: { O: number; C: number; E: number; A: number; N: number };
  helper?: { name: string; style: string; plural?: boolean };
}

/**
 * MSSCI-12403: Full theme data including tier and all agents
 */
export interface EnhancedThemeData {
  theme: string;
  themeName: string;
  tier: 'S' | 'A' | 'B' | 'C' | null;
  agents: EnhancedThemeAgent[];
}

/**
 * Convert a name to a URL-safe slug (lowercase kebab-case)
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate OCEAN suffix from scores (e.g., "54432")
 */
function oceanSuffix(ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}

/**
 * Generate character slug from shortName and OCEAN scores
 */
function generateSlug(shortName: string, ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  const baseSlug = toSlug(shortName);
  return `${baseSlug}-${oceanSuffix(ocean)}`;
}

/**
 * Humanize a slug/kebab-case string to title case
 */
function humanize(str: string): string {
  if (!str) return '';
  const smallWords = ['of', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
  return str
    .split('-')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0 || !smallWords.includes(lower)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return lower;
    })
    .join(' ');
}

/**
 * Find theme file path checking multiple locations
 */
function findThemePath(projectDir: string, themeName: string): string | null {
  const possiblePaths: string[] = [];

  // 1. Packaged Electron app: Contents/Resources/pennyfarthing-dist/personas/themes
  if (process.resourcesPath) {
    possiblePaths.push(join(process.resourcesPath, 'pennyfarthing-dist', 'personas', 'themes', `${themeName}.yaml`));
  }

  // 2. Runtime via symlinks: .pennyfarthing/personas/themes (orchestrator pattern)
  possiblePaths.push(
    join(projectDir, '.pennyfarthing', 'personas', 'themes', `${themeName}.yaml`),
  );

  // 3. Development mode: relative to cyclist package (pennyfarthing-2/pennyfarthing-dist)
  possiblePaths.push(
    join(CYCLIST_ROOT, 'pennyfarthing-dist', 'personas', 'themes', `${themeName}.yaml`),
  );

  // 4. Legacy and fallback project directory paths
  possiblePaths.push(
    join(projectDir, '.claude', 'personas', 'themes', `${themeName}.yaml`),
    join(projectDir, '.claude', 'pennyfarthing', 'themes', `${themeName}.yaml`),
    join(projectDir, 'pennyfarthing-dist', 'personas', 'themes', `${themeName}.yaml`),
    join(projectDir, 'node_modules', '@pennyfarthing', 'core', 'pennyfarthing-dist', 'personas', 'themes', `${themeName}.yaml`),
  );

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Get all agent-to-character mappings from current theme
 * @param projectDir - The project directory
 * @returns Map of role -> character data
 */
export function getThemeAgents(projectDir: string): AgentCharacterMap | null {
  if (!detectPennyfarthingProject(projectDir)) {
    return null;
  }

  const config = loadThemeConfig(projectDir);
  if (!config) {
    return null;
  }

  const themePath = findThemePath(projectDir, config.theme);
  if (!themePath) {
    return null;
  }

  const agents = loadThemeYaml(themePath);
  if (!agents) {
    return null;
  }

  // Build mapping of role -> character info
  const result: AgentCharacterMap = {};
  for (const [role, persona] of Object.entries(agents)) {
    result[role] = {
      character: persona.character,
      shortName: (persona as { shortName?: string }).shortName,
    };
  }

  return result;
}

/**
 * MSSCI-12403: Get enhanced theme data with full agent details for persona popup
 * @param projectDir - The project directory
 * @returns Full theme data including tier and detailed agent info
 */
export function getEnhancedThemeData(projectDir: string): EnhancedThemeData | null {
  if (!detectPennyfarthingProject(projectDir)) {
    return null;
  }

  const config = loadThemeConfig(projectDir);
  if (!config) {
    return null;
  }

  const themePath = findThemePath(projectDir, config.theme);
  if (!themePath) {
    return null;
  }

  // Load full theme YAML
  let themeData: Record<string, unknown>;
  try {
    const content = readFileSync(themePath, 'utf-8');
    themeData = parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const themeMetadata = themeData.theme as Record<string, unknown> | undefined;
  const agents = themeData.agents as Record<string, Record<string, unknown>> | undefined;

  if (!agents) {
    return null;
  }

  // Extract theme-level metadata
  const tier = (themeMetadata?.tier as string | undefined) || null;
  const themeName = (themeMetadata?.name as string | undefined) || humanize(config.theme);

  // Build enhanced agent list
  const enhancedAgents: EnhancedThemeAgent[] = [];

  for (const [role, rawAgent] of Object.entries(agents)) {
    const character = rawAgent.character as string;
    const shortName = (rawAgent.shortName as string) || character.split(' ')[0];
    const style = (rawAgent.style as string) || '';
    const background = (rawAgent.role as string) || ''; // 'role' in theme YAML is character background
    const quirks = (rawAgent.quirks as string[]) || [];
    const ocean = rawAgent.ocean as { O: number; C: number; E: number; A: number; N: number } | undefined;
    const rawHelper = rawAgent.helper as { name?: string; style?: string; plural?: boolean } | undefined;
    const helper = rawHelper?.name ? { name: rawHelper.name, style: rawHelper.style || '', ...(rawHelper.plural ? { plural: true } : {}) } : undefined;

    // Generate portrait slug
    const slug = ocean ? generateSlug(shortName, ocean) : role;

    // Extract lift from YAML comments (stored in special field if present)
    // For now, we'll parse from the YAML comment pattern "JOB FAIR OPTIMIZED: ... (+X.X over ...)"
    // This would need the raw YAML to parse, so we'll leave as undefined for now
    // TODO: Add lift field to theme YAML schema
    const lift = undefined;

    enhancedAgents.push({
      role,
      character,
      shortName,
      style,
      background,
      quirks,
      slug,
      lift,
      ocean,
      helper,
    });
  }

  // Sort agents by a consistent order (orchestrator, sm, tea, dev, reviewer, architect, pm, tech-writer, ux-designer, devops, ba)
  const roleOrder = ['orchestrator', 'sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'tech-writer', 'ux-designer', 'devops', 'ba'];
  enhancedAgents.sort((a, b) => {
    const aIndex = roleOrder.indexOf(a.role);
    const bIndex = roleOrder.indexOf(b.role);
    if (aIndex === -1 && bIndex === -1) return a.role.localeCompare(b.role);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return {
    theme: config.theme,
    themeName,
    tier: tier as 'S' | 'A' | 'B' | 'C' | null,
    agents: enhancedAgents,
  };
}

/**
 * Create theme agents API router
 */
export function createThemeAgentsRouter(getProjectDir: () => string): Router {
  const router = Router();

  // Theme Agents API - GET all agent character mappings (legacy format)
  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();
    const agents = getThemeAgents(projectDir);
    if (!agents) {
      return res.status(404).json({ error: 'No theme agents found' });
    }
    res.json(agents);
  });

  // MSSCI-12403: Enhanced theme data for persona popup team roster
  router.get('/full', (_req, res) => {
    const projectDir = getProjectDir();
    const themeData = getEnhancedThemeData(projectDir);
    if (!themeData) {
      return res.status(404).json({ error: 'No theme data found' });
    }
    res.json(themeData);
  });

  return router;
}
