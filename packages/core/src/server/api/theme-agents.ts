import { Router } from 'express';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { detectPennyfarthingProject, loadThemeConfig, loadThemeYaml } from '../pennyfarthing.js';

export interface AgentCharacterMap {
  [role: string]: {
    character: string;
    shortName?: string;
  };
}

export function getThemeAgents(projectDir: string): AgentCharacterMap {
  if (!detectPennyfarthingProject(projectDir)) {
    return {};
  }
  const config = loadThemeConfig(projectDir) as Record<string, unknown> | null;
  const themeName = (config as { theme?: string } | null)?.theme;
  if (!themeName) return {};

  // Resolve theme file path and load YAML
  const themeFile = `${themeName}.yaml`;
  const themePath = join(projectDir, '.pennyfarthing', 'personas', 'themes', themeFile);
  const themeData = loadThemeYaml(themePath);
  if (!themeData) return {};

  const agents = themeData as Record<string, { character?: string; shortName?: string }>;
  if (!agents) return {};

  const result: AgentCharacterMap = {};
  for (const [role, data] of Object.entries(agents)) {
    result[role] = {
      character: data?.character || role,
      shortName: data?.shortName,
    };
  }
  return result;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function oceanSuffix(ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}

interface RawThemeAgent {
  character?: string;
  shortName?: string;
  style?: string;
  role?: string;
  expertise?: string;
  quirks?: string[];
  ocean?: { O: number; C: number; E: number; A: number; N: number };
}

interface EnhancedThemeAgent {
  role: string;
  character: string;
  shortName?: string;
  style: string;
  background: string;
  quirks: string[];
  slug: string;
  ocean?: { O: number; C: number; E: number; A: number; N: number };
}

interface EnhancedThemeData {
  theme: string;
  themeName: string;
  tier: string | null;
  agents: EnhancedThemeAgent[];
}

function getFullThemeData(projectDir: string): EnhancedThemeData | null {
  if (!detectPennyfarthingProject(projectDir)) return null;

  const config = loadThemeConfig(projectDir) as Record<string, unknown> | null;
  const themeSlug = (config as { theme?: string } | null)?.theme;
  if (!themeSlug) return null;

  const themeFile = `${themeSlug}.yaml`;
  const themePath = join(projectDir, '.pennyfarthing', 'personas', 'themes', themeFile);
  if (!existsSync(themePath)) return null;

  try {
    const content = readFileSync(themePath, 'utf-8');
    const raw = parseYaml(content) as {
      theme?: { name?: string; description?: string };
      agents?: Record<string, RawThemeAgent>;
      tier?: string;
    };
    if (!raw?.agents) return null;

    const agents: EnhancedThemeAgent[] = Object.entries(raw.agents).map(([role, data]) => {
      const shortName = data.shortName || data.character || role;
      const ocean = data.ocean;
      const slug = ocean ? `${toSlug(shortName)}-${oceanSuffix(ocean)}` : toSlug(shortName);

      return {
        role,
        character: data.character || role,
        shortName: data.shortName,
        style: data.style || '',
        background: data.expertise || data.role || '',
        quirks: data.quirks || [],
        slug,
        ocean,
      };
    });

    return {
      theme: themeSlug,
      themeName: raw.theme?.name || themeSlug,
      tier: raw.tier || null,
      agents,
    };
  } catch {
    return null;
  }
}

export function createThemeAgentsRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();
    const agents = getThemeAgents(projectDir);
    res.json({ agents });
  });

  router.get('/full', (_req, res) => {
    const projectDir = getProjectDir();
    const data = getFullThemeData(projectDir);
    if (!data) {
      return res.status(404).json({ error: 'Theme data not available' });
    }
    res.json(data);
  });

  return router;
}
