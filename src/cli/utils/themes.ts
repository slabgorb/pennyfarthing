import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { homedir } from 'os';
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
  isCustom?: boolean;
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
 * Get the project-level custom themes directory
 */
export function getProjectCustomThemesDir(projectRoot: string): string {
  return join(projectRoot, '.claude/pennyfarthing/themes');
}

/**
 * Get the user-level custom themes directory
 */
export function getUserCustomThemesDir(): string {
  return join(homedir(), '.claude/pennyfarthing/themes');
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
export function parseThemeFile(filePath: string, isCustom = false): ThemeInfo | null {
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
      isCustom,
      agents: data.agents || {}
    };
  } catch {
    return null;
  }
}

/**
 * Load themes from a directory
 */
function loadThemesFromDir(dir: string, isCustom: boolean): ThemeInfo[] {
  const themes: ThemeInfo[] = [];

  if (!existsSync(dir)) {
    return themes;
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.yaml'));

  for (const file of files) {
    const theme = parseThemeFile(join(dir, file), isCustom);
    if (theme) {
      themes.push(theme);
    }
  }

  return themes;
}

/**
 * Get all available themes (built-in + custom)
 */
export function getThemes(projectRoot?: string): ThemeInfo[] {
  const themes: ThemeInfo[] = [];
  const seenIds = new Set<string>();

  // 1. Load built-in themes
  try {
    const builtInDir = getThemesDir();
    for (const theme of loadThemesFromDir(builtInDir, false)) {
      if (!seenIds.has(theme.id)) {
        themes.push(theme);
        seenIds.add(theme.id);
      }
    }
  } catch {
    // Built-in themes not found - continue with custom themes
  }

  // 2. Load project-level custom themes
  const root = projectRoot || process.cwd();
  const projectDir = getProjectCustomThemesDir(root);
  for (const theme of loadThemesFromDir(projectDir, true)) {
    if (!seenIds.has(theme.id)) {
      themes.push(theme);
      seenIds.add(theme.id);
    }
  }

  // 3. Load user-level custom themes
  const userDir = getUserCustomThemesDir();
  for (const theme of loadThemesFromDir(userDir, true)) {
    if (!seenIds.has(theme.id)) {
      themes.push(theme);
      seenIds.add(theme.id);
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

/**
 * Validate a theme name
 */
export function validateThemeName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: 'Theme name is required' };
  }

  if (name !== name.toLowerCase()) {
    return { valid: false, error: 'Theme name must be lowercase' };
  }

  if (/\s/.test(name)) {
    return { valid: false, error: 'Theme name cannot contain spaces (use hyphens instead)' };
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return { valid: false, error: 'Theme name must start with a letter and contain only lowercase letters, numbers, and hyphens' };
  }

  return { valid: true };
}

/**
 * Get the path to a theme file (built-in or custom)
 */
export function getThemeFilePath(themeId: string): string | null {
  // Check built-in themes first
  try {
    const builtInPath = join(getThemesDir(), `${themeId}.yaml`);
    if (existsSync(builtInPath)) {
      return builtInPath;
    }
  } catch {
    // Built-in dir not found
  }

  // Check project-level
  const projectPath = join(getProjectCustomThemesDir(process.cwd()), `${themeId}.yaml`);
  if (existsSync(projectPath)) {
    return projectPath;
  }

  // Check user-level
  const userPath = join(getUserCustomThemesDir(), `${themeId}.yaml`);
  if (existsSync(userPath)) {
    return userPath;
  }

  return null;
}

export interface CreateThemeOptions {
  baseTheme?: string;
  userLevel?: boolean;
}

/**
 * Create a new custom theme
 * Returns the path to the created theme file
 */
export function createTheme(
  themeName: string,
  projectRoot: string,
  options: CreateThemeOptions = {}
): string {
  const { baseTheme = 'minimalist', userLevel = false } = options;

  // Validate theme name
  const validation = validateThemeName(themeName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Check if theme already exists
  const existingThemes = getThemes(projectRoot);
  if (existingThemes.some(t => t.id === themeName)) {
    throw new Error(`Theme '${themeName}' already exists`);
  }

  // Find base theme file
  const baseThemePath = getThemeFilePath(baseTheme);
  if (!baseThemePath) {
    const available = existingThemes.map(t => t.id).join(', ');
    throw new Error(`Base theme '${baseTheme}' not found. Available themes: ${available}`);
  }

  // Determine target directory
  const targetDir = userLevel
    ? getUserCustomThemesDir()
    : getProjectCustomThemesDir(projectRoot);

  // Create directory if needed
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Read base theme content
  const baseContent = readFileSync(baseThemePath, 'utf8');
  const baseData = YAML.parse(baseContent);

  // Update theme metadata
  baseData.theme.name = themeName.charAt(0).toUpperCase() + themeName.slice(1).replace(/-/g, ' ');
  baseData.theme.description = `Custom theme based on ${baseTheme}`;

  // Write new theme file
  const targetPath = join(targetDir, `${themeName}.yaml`);
  const header = `# Custom Theme: ${themeName}\n# Based on: ${baseTheme}\n# Edit this file to customize your agent personas\n\n`;
  const yamlContent = YAML.stringify(baseData);
  writeFileSync(targetPath, header + yamlContent, 'utf8');

  return targetPath;
}
