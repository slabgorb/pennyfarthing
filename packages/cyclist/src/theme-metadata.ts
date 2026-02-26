/**
 * Theme Metadata
 *
 * Handles loading and caching of Pennyfarthing theme metadata.
 * Delegates discovery to @pennyfarthing/core unified loader.
 */

import * as fs from 'fs';
import { join } from 'path';
import { getProjectDirectory } from './paths.js';
import {
  listThemes as sharedListThemes,
  loadAllThemeMetadata as sharedLoadAllThemeMetadata,
  deriveCategory,
  type ThemeMetadata,
} from '@pennyfarthing/core';

// Re-export ThemeMetadata so existing consumers don't break
export type { ThemeMetadata };

// Re-export deriveCategory for any direct consumers
export { deriveCategory, CATEGORY_MAP } from '@pennyfarthing/core';

/**
 * Agent data within a theme (24-6)
 */
export interface ThemeAgent {
  character: string;
  catchphrases?: string[];
  style?: string;
  role?: string;
}

/**
 * Extended theme metadata including agent mappings (24-6)
 */
export interface ThemeMetadataWithAgents extends ThemeMetadata {
  agents: {
    sm?: ThemeAgent;
    tea?: ThemeAgent;
    dev?: ThemeAgent;
    reviewer?: ThemeAgent;
    architect?: ThemeAgent;
    pm?: ThemeAgent;
    orchestrator?: ThemeAgent;
    'tech-writer'?: ThemeAgent;
    'ux-designer'?: ThemeAgent;
    devops?: ThemeAgent;
  };
}

// Theme metadata cache
let themeMetadataCache: ThemeMetadata[] | null = null;

/**
 * Find the themes directory - checks bundled resources first, then project dir.
 * Used only for the Electron-specific bundled resources path which shared
 * loader doesn't handle (process.resourcesPath).
 */
function findThemesDir(): string | null {
  // 1. Packaged Electron app: Contents/Resources/pennyfarthing-dist/personas/themes
  if ((process as unknown as Record<string, unknown>).resourcesPath) {
    const bundledThemes = join((process as unknown as Record<string, unknown>).resourcesPath as string, 'pennyfarthing-dist', 'personas', 'themes');
    if (fs.existsSync(bundledThemes)) {
      return bundledThemes;
    }
  }

  // For non-Electron contexts, delegate to shared discovery
  return null;
}

/**
 * Get cached theme metadata
 */
export function getThemeMetadataCache(): ThemeMetadata[] | null {
  return themeMetadataCache;
}

/**
 * Get available themes from all sources.
 * Returns sorted list of theme names.
 */
export async function getAvailableThemes(): Promise<string[]> {
  // Check Electron bundled resources first
  const bundledDir = findThemesDir();
  if (bundledDir) {
    try {
      const files = fs.readdirSync(bundledDir);
      return files
        .filter(f => f.endsWith('.yaml'))
        .map(f => f.replace('.yaml', ''))
        .sort();
    } catch {
      // Fall through to shared loader
    }
  }

  // Use shared unified discovery
  const projectDir = getProjectDirectory();
  const themes = sharedListThemes(projectDir || undefined);
  return themes.length > 0 ? themes.sort() : ['alice-in-wonderland'];
}

/**
 * Load theme metadata from all sources.
 * Parses all theme files and extracts metadata for the browser.
 */
export async function loadThemeMetadata(): Promise<ThemeMetadata[]> {
  // Return cache if available
  if (themeMetadataCache) {
    return themeMetadataCache;
  }

  // Check Electron bundled resources for supplemental themes
  const bundledDir = findThemesDir();
  const projectDir = getProjectDirectory();

  // Use shared unified loader for the primary metadata
  const metadata = sharedLoadAllThemeMetadata(projectDir || undefined);

  // If in Electron, also pick up any bundled-only themes
  if (bundledDir) {
    const seenIds = new Set(metadata.map(m => m.id));
    try {
      const { default: yaml } = await import('yaml');
      const files = fs.readdirSync(bundledDir).filter(f => f.endsWith('.yaml')).sort();
      for (const file of files) {
        const themeId = file.replace('.yaml', '');
        if (seenIds.has(themeId)) continue;
        try {
          const content = fs.readFileSync(join(bundledDir, file), 'utf-8');
          const parsed = yaml.parse(content);
          if (parsed?.theme) {
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
            seenIds.add(themeId);
          }
        } catch {
          // Skip unparseable files
        }
      }
    } catch {
      // Bundled dir fallback failed — shared data is sufficient
    }
  }

  themeMetadataCache = metadata;
  return metadata;
}

// Theme metadata with agents cache (24-6)
let themeMetadataWithAgentsCache: ThemeMetadataWithAgents[] | null = null;

/**
 * Load theme metadata including agent character mappings (24-6).
 * Extended version of loadThemeMetadata for the preview panel.
 *
 * This is Cyclist-specific enrichment: the shared loader provides basic metadata,
 * and we overlay agent details for the UI preview panel.
 */
export async function loadThemeMetadataWithAgents(): Promise<ThemeMetadataWithAgents[]> {
  // Return cache if available
  if (themeMetadataWithAgentsCache) {
    return themeMetadataWithAgentsCache;
  }

  // Get all theme directories to scan for agent data
  const projectDir = getProjectDirectory();

  // Collect all theme YAML directories
  const themeDirs: string[] = [];

  // Bundled Electron resources
  const bundledDir = findThemesDir();
  if (bundledDir) {
    themeDirs.push(bundledDir);
  }

  // Shared discovery handles core + packages + custom
  const { discoverAllThemeDirs } = await import('@pennyfarthing/core');
  const sharedDirs = discoverAllThemeDirs(projectDir || undefined);
  for (const dir of sharedDirs) {
    if (!themeDirs.includes(dir)) {
      themeDirs.push(dir);
    }
  }

  const metadata: ThemeMetadataWithAgents[] = [];
  const seenIds = new Set<string>();

  try {
    const { default: yaml } = await import('yaml');

    for (const themesDir of themeDirs) {
      let files: string[];
      try {
        files = fs.readdirSync(themesDir).filter(f => f.endsWith('.yaml')).sort();
      } catch {
        continue;
      }

      for (const file of files) {
        const themeId = file.replace('.yaml', '');
        if (seenIds.has(themeId)) continue;
        seenIds.add(themeId);

        try {
          const filePath = join(themesDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = yaml.parse(content);

          if (parsed?.theme) {
            const theme = parsed.theme;
            const rawAgents = parsed.agents || {};
            const agentCount = Object.keys(rawAgents).length;

            const agents: ThemeMetadataWithAgents['agents'] = {};
            const coreRoles = ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'orchestrator', 'tech-writer', 'ux-designer', 'devops', 'ba'];

            for (const role of coreRoles) {
              const rawAgent = rawAgents[role];
              if (rawAgent) {
                agents[role as keyof typeof agents] = {
                  character: rawAgent.character || '',
                  catchphrases: rawAgent.catchphrases || [],
                  style: rawAgent.style || '',
                  role: rawAgent.role || '',
                };
              }
            }

            metadata.push({
              id: themeId,
              name: theme.name || themeId,
              description: theme.description || '',
              source: theme.source || '',
              tier: (theme.tier as string) || null,
              category: deriveCategory(themeId, theme.source || ''),
              agentCount,
              agents,
            });
          }
        } catch {
          // Skip unparseable files
        }
      }
    }
  } catch (err) {
    console.error('Failed to load theme metadata with agents:', err);
  }

  themeMetadataWithAgentsCache = metadata;
  return metadata;
}
