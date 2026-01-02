/**
 * Theme Data Loader
 *
 * Build-time data pipeline that loads all theme YAML files
 * and transforms them into typed JSON for client-side queries.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import type { Theme, Agent, ThemeMetadata, RawThemeYaml } from './types';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to theme YAML files relative to showcase directory
const THEMES_DIR = join(__dirname, '..', '..', '..', 'pennyfarthing-dist', 'personas', 'themes');

/**
 * Transform raw YAML agent data to typed Agent interface
 */
function transformAgent(role: string, raw: RawThemeYaml['agents'][string]): Agent {
  return {
    role,
    character: raw.character,
    ocean: raw.ocean,
    style: raw.style,
    expertise: raw.expertise,
    roleSummary: raw.role,
    quote: raw.quote,
    trait: raw.trait,
    quirks: raw.quirks ?? [],
    catchphrases: raw.catchphrases ?? [],
    emoji: raw.emoji ?? '',
    helper: raw.helper ?? { name: '', style: '' },
  };
}

/**
 * Transform raw YAML theme data to typed Theme interface
 */
function transformTheme(id: string, raw: RawThemeYaml): Theme {
  const metadata: ThemeMetadata = {
    name: raw.theme.name,
    description: raw.theme.description,
    source: raw.theme.source,
    defaultEmojiUse: raw.theme.default_emoji_use ?? 'minimal',
    defaultHumor: raw.theme.default_humor ?? 'enabled',
    characterImmersion: raw.theme.character_immersion ?? 'medium',
    userTitle: raw.theme.user_title ?? '',
  };

  const agents: Agent[] = Object.entries(raw.agents).map(([role, agentData]) =>
    transformAgent(role, agentData)
  );

  return {
    id,
    metadata,
    agents,
  };
}

/**
 * Load a single theme YAML file
 */
function loadThemeFile(filePath: string): Theme {
  const content = readFileSync(filePath, 'utf-8');
  const raw = parse(content) as RawThemeYaml;
  const id = basename(filePath, '.yaml');
  return transformTheme(id, raw);
}

/**
 * Load all theme YAML files from pennyfarthing-dist
 *
 * @returns Array of Theme objects
 */
export async function loadThemes(): Promise<Theme[]> {
  const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.yaml'));

  // Load all themes in parallel for performance
  const themes = await Promise.all(
    files.map(async (file) => {
      const filePath = join(THEMES_DIR, file);
      return loadThemeFile(filePath);
    })
  );

  // Sort by theme name for consistent ordering
  return themes.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
}

/**
 * Generate JSON string from all themes
 *
 * @returns JSON string of all themes
 */
export async function generateThemesJson(): Promise<string> {
  const themes = await loadThemes();
  return JSON.stringify(themes, null, 2);
}
