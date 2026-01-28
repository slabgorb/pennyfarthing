/**
 * Theme Loader - Load and parse Pennyfarthing theme configurations
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolvePennyfarthingDist, getPortraitPaths } from './portrait-resolver.js';

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

interface RawThemeAgent {
  character?: string;
  style?: string;
  role?: string;
  trait?: string;
  catchphrases?: string[];
  helper?: { name?: string; style?: string };
  shortName?: string;
}

interface RawTheme {
  theme?: {
    name?: string;
    description?: string;
  };
  agents?: Record<string, RawThemeAgent>;
}

/**
 * Load a theme configuration by name
 * @param themeName - Name of the theme (e.g., 'shakespeare', 'norse-mythology')
 * @returns Parsed theme configuration or null if not found
 */
export function loadTheme(themeName: string): Theme | null {
  const distPath = resolvePennyfarthingDist();
  if (!distPath) {
    return null;
  }

  const paths = getPortraitPaths(distPath);
  const themePath = join(paths.themesDir, 'themes', `${themeName}.yaml`);

  if (!existsSync(themePath)) {
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
 * List all available themes
 * @returns Array of theme names
 */
export function listThemes(): string[] {
  const distPath = resolvePennyfarthingDist();
  if (!distPath) {
    return [];
  }

  const paths = getPortraitPaths(distPath);
  const themesDir = join(paths.themesDir, 'themes');

  if (!existsSync(themesDir)) {
    return [];
  }

  try {
    const files = readdirSync(themesDir);
    return files
      .filter(f => f.endsWith('.yaml'))
      .map(f => basename(f, '.yaml'));
  } catch {
    return [];
  }
}

/**
 * Get agent persona from a theme
 * @param themeName - Theme name
 * @param agentName - Agent name (e.g., 'sm', 'tea', 'dev')
 * @returns Agent persona or null if not found
 */
export function getAgentPersona(themeName: string, agentName: string): ThemeAgent | null {
  const theme = loadTheme(themeName);
  if (!theme) {
    return null;
  }

  return theme.agents[agentName] || null;
}
