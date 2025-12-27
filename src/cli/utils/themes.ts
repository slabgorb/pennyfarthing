import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ThemeAgent {
  character: string;
  style?: string;
  role?: string;
  quote?: string;
}

export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  agents: {
    sm?: ThemeAgent;
    tea?: ThemeAgent;
    dev?: ThemeAgent;
    reviewer?: ThemeAgent;
    [key: string]: ThemeAgent | undefined;
  };
}

/**
 * Get the path to the themes directory
 */
export function getThemesDir(): string {
  // In installed package: dist/cli/utils/themes.ts -> need to go to pennyfarthing-dist
  // Try relative to package root first
  const packageRoot = join(__dirname, '../../..');
  const distThemes = join(packageRoot, 'pennyfarthing-dist/personas/themes');

  if (existsSync(distThemes)) {
    return distThemes;
  }

  // Fallback: try from project's .claude/pennyfarthing symlink
  const projectRoot = process.cwd();
  const claudeThemes = join(projectRoot, '.claude/pennyfarthing/personas/themes');

  if (existsSync(claudeThemes)) {
    return claudeThemes;
  }

  throw new Error('Could not find themes directory');
}

/**
 * Get the current theme from persona-config.yaml
 */
export function getCurrentTheme(projectRoot?: string): string | null {
  const root = projectRoot || process.cwd();
  const configPath = join(root, '.claude/persona-config.yaml');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    const config = YAML.parse(content);
    return config?.theme || null;
  } catch {
    return null;
  }
}

/**
 * Parse a theme YAML file and extract theme info
 */
export function parseThemeFile(filePath: string): ThemeInfo | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    const data = YAML.parse(content);

    if (!data?.theme?.name) {
      return null;
    }

    const id = basename(filePath, '.yaml');

    return {
      id,
      name: data.theme.name,
      description: data.theme.description || '',
      agents: data.agents || {}
    };
  } catch {
    return null;
  }
}

/**
 * Get all available themes
 */
export function getThemes(): ThemeInfo[] {
  const themesDir = getThemesDir();
  const themes: ThemeInfo[] = [];

  const files = readdirSync(themesDir).filter(f => f.endsWith('.yaml'));

  for (const file of files) {
    const theme = parseThemeFile(join(themesDir, file));
    if (theme) {
      themes.push(theme);
    }
  }

  // Sort alphabetically by name
  return themes.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get sample agent characters for display
 */
export function getAgentSamples(theme: ThemeInfo): string {
  const samples: string[] = [];

  if (theme.agents.sm?.character) {
    samples.push(`SM: ${theme.agents.sm.character}`);
  }
  if (theme.agents.tea?.character) {
    samples.push(`TEA: ${theme.agents.tea.character}`);
  }
  if (theme.agents.dev?.character) {
    samples.push(`Dev: ${theme.agents.dev.character}`);
  }

  return samples.join(' | ');
}

/**
 * Set the active theme in persona-config.yaml
 * Returns the ThemeInfo if successful, throws if theme not found
 */
export function setTheme(themeName: string, projectRoot: string): ThemeInfo {
  const themes = getThemes();
  const theme = themes.find(t => t.id === themeName);

  if (!theme) {
    const available = themes.map(t => t.id).join(', ');
    throw new Error(`Theme '${themeName}' not found. Available themes: ${available}`);
  }

  const configDir = join(projectRoot, '.claude');
  const configPath = join(configDir, 'persona-config.yaml');

  // Ensure .claude directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Read existing config or create new one
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf8');
      config = YAML.parse(content) || {};
    } catch {
      // If parse fails, start fresh
      config = {};
    }
  }

  // Update theme
  config.theme = themeName;

  // Write back with comment header
  const header = '# Pennyfarthing Persona Configuration\n\n';
  const yamlContent = YAML.stringify(config);
  writeFileSync(configPath, header + yamlContent, 'utf8');

  return theme;
}
