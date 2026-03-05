import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import YAML from 'yaml';
import {
  discoverAllThemeDirs,
  resolveThemePath as sharedResolveThemePath,
} from '../../shared/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ThemeAgentHelper {
  name: string;
  style: string;
  plural?: boolean;
}

export interface ThemeAgent {
  character: string;
  style?: string;
  role?: string;
  catchphrases?: string[];
  trait?: string;
  expertise?: string;
  emoji?: string;
  helper?: ThemeAgentHelper;
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
 * Get the path to the primary themes directory (core built-in themes).
 * For full multi-source discovery, use discoverAllThemeDirs() from @pennyfarthing/shared.
 */
export function getThemesDir(): string | null {
  const dirs = discoverAllThemeDirs();
  if (dirs.length > 0) {
    return dirs[0]; // Primary/core themes dir
  }

  // Legacy fallback: try relative to package root
  const packageRoot = join(__dirname, '../../..');
  const distThemes = join(packageRoot, 'pennyfarthing-dist/personas/themes');
  if (existsSync(distThemes)) {
    return distThemes;
  }

  return null;
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
 * Get the path to the .pennyfarthing local config (preferred for dogfooding)
 */
export function getPennyfarthingConfigPath(projectRoot: string): string {
  return join(projectRoot, '.pennyfarthing/config.local.yaml');
}

/**
 * Get the current theme from config files
 * Priority: .pennyfarthing/config.local.yaml > .pennyfarthing/persona-config.yaml
 */
export function getCurrentTheme(projectRoot?: string): string | null {
  const root = projectRoot || process.cwd();

  // Priority 1: .pennyfarthing/config.local.yaml (agent-writable, user-local)
  const pennyfarthingConfigPath = getPennyfarthingConfigPath(root);
  if (existsSync(pennyfarthingConfigPath)) {
    try {
      const content = readFileSync(pennyfarthingConfigPath, 'utf8');
      const config = YAML.parse(content);
      if (config?.theme) {
        return config.theme;
      }
    } catch {
      // Parse error — fall through
    }
  }

  // Priority 2: .pennyfarthing/persona-config.yaml (project default, committed)
  const projectDefaultPath = join(root, '.pennyfarthing/persona-config.yaml');
  if (existsSync(projectDefaultPath)) {
    try {
      const content = readFileSync(projectDefaultPath, 'utf8');
      const config = YAML.parse(content);
      if (config?.theme) {
        return config.theme;
      }
    } catch {
      // Parse error — no theme available
    }
  }

  return null;
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
 * Get all available themes (built-in + theme packages + custom)
 * Uses unified discovery from @pennyfarthing/shared.
 */
export function getThemes(projectRoot?: string): ThemeInfo[] {
  const root = projectRoot || process.cwd();
  const allDirs = discoverAllThemeDirs(root);
  const themes: ThemeInfo[] = [];
  const seenIds = new Set<string>();

  // Custom theme dirs (project + user level) for marking isCustom
  const projectCustomDir = getProjectCustomThemesDir(root);
  const userCustomDir = getUserCustomThemesDir();

  for (const dir of allDirs) {
    const isCustom = dir === projectCustomDir || dir === userCustomDir;
    for (const theme of loadThemesFromDir(dir, isCustom)) {
      if (!seenIds.has(theme.id)) {
        themes.push(theme);
        seenIds.add(theme.id);
      }
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

export interface SetThemeOptions {
  /** If true, write to shared config (.pennyfarthing/persona-config.yaml) instead of local */
  global?: boolean;
}

/**
 * Set the active theme
 * By default writes to .pennyfarthing/config.local.yaml (agent-writable, dogfooding-friendly)
 * Use { global: true } to write to .pennyfarthing/persona-config.yaml (project default, committed)
 * Returns result object with ThemeInfo if successful
 */
export function setTheme(themeName: string, projectRoot: string, options: SetThemeOptions = {}): { success: boolean; data?: ThemeInfo; error?: string } {
  const themes = getThemes(projectRoot);
  const theme = themes.find(t => t.id === themeName);

  if (!theme) {
    const available = themes.map(t => t.id).join(', ');
    return { success: false, error: `Theme '${themeName}' not found. Available themes: ${available}` };
  }

  let configPath: string;
  let header: string;

  if (options.global) {
    // Project default - shared with team (committed to repo)
    configPath = join(projectRoot, '.pennyfarthing/persona-config.yaml');
    header = '# Pennyfarthing Persona Configuration (Project Default)\n\n';
  } else {
    // Default: .pennyfarthing/ directory (agent-writable, dogfooding-friendly)
    configPath = getPennyfarthingConfigPath(projectRoot);
    header = '# Pennyfarthing Local Configuration\n# This file is gitignored - your personal preferences\n# Agents can write to this file during dogfooding\n\n';
  }

  // Ensure parent directory exists
  const configDir = dirname(configPath);
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

  // Bake theme characters into config (so statusline doesn't need to follow symlinks)
  // This makes .pennyfarthing self-contained for installed apps
  const themeCharacters: Record<string, string> = {};
  for (const [agentId, agentData] of Object.entries(theme.agents)) {
    if (agentData?.character) {
      themeCharacters[agentId] = agentData.character;
    }
  }
  config.theme_characters = themeCharacters;

  // Write back with comment header
  const yamlContent = YAML.stringify(config);
  writeFileSync(configPath, header + yamlContent, 'utf8');

  return { success: true, data: theme };
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
 * Get the path to a theme file (built-in, theme packages, or custom).
 * Uses unified resolution from @pennyfarthing/shared.
 */
export function getThemeFilePath(themeId: string): string | null {
  return sharedResolveThemePath(themeId);
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
): { success: boolean; data?: string; error?: string } {
  const { baseTheme = 'minimalist', userLevel = false } = options;

  // Validate theme name
  const validation = validateThemeName(themeName);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Check if theme already exists
  const existingThemes = getThemes(projectRoot);
  if (existingThemes.some(t => t.id === themeName)) {
    return { success: false, error: `Theme '${themeName}' already exists` };
  }

  // Find base theme file
  const baseThemePath = getThemeFilePath(baseTheme);
  if (!baseThemePath) {
    const available = existingThemes.map(t => t.id).join(', ');
    return { success: false, error: `Base theme '${baseTheme}' not found. Available themes: ${available}` };
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

  return { success: true, data: targetPath };
}

/**
 * All 11 required agent types for a complete theme
 */
const REQUIRED_AGENTS = [
  'orchestrator',
  'sm',
  'tea',
  'dev',
  'reviewer',
  'architect',
  'pm',
  'tech-writer',
  'ux-designer',
  'devops',
  'ba'
] as const;

export interface ThemeSchemaValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate a theme object has all required fields and agents
 * Used to validate AI-generated themes before writing to file
 */
export function validateThemeSchema(themeData: unknown): ThemeSchemaValidationResult {
  const errors: string[] = [];

  // Check if themeData is an object
  if (!themeData || typeof themeData !== 'object') {
    return { valid: false, errors: ['Theme data must be an object'] };
  }

  const data = themeData as Record<string, unknown>;

  // Check theme section
  if (!data.theme || typeof data.theme !== 'object') {
    errors.push('Missing theme section');
  } else {
    const theme = data.theme as Record<string, unknown>;
    if (!theme.name) {
      errors.push('Missing theme.name');
    }
  }

  // Check agents section
  if (!data.agents || typeof data.agents !== 'object') {
    errors.push('Missing agents section');
    return { valid: false, errors };
  }

  const agents = data.agents as Record<string, unknown>;

  // Check all required agents are present with required fields
  for (const agentType of REQUIRED_AGENTS) {
    const agent = agents[agentType];
    if (!agent || typeof agent !== 'object') {
      errors.push(`Missing required agent: ${agentType}`);
      continue;
    }

    const agentData = agent as Record<string, unknown>;

    // Check required fields for each agent
    if (!agentData.character) {
      errors.push(`Agent ${agentType} missing required field: character`);
    }
    if (!agentData.style) {
      errors.push(`Agent ${agentType} missing required field: style`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
