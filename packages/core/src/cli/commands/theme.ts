import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { getThemes, getCurrentTheme, getAgentSamples, setTheme, createTheme, ThemeInfo } from '../utils/themes.js';
import { manifestExists } from '../utils/manifest.js';

/**
 * Check if a directory is a Pennyfarthing project root
 * Either has a manifest OR has .pennyfarthing/persona-config.yaml (self-development case)
 */
function isPennyfarthingRoot(dir: string): boolean {
  if (manifestExists(dir)) {
    return true;
  }
  // Also check for persona-config.yaml (pennyfarthing developing itself)
  return existsSync(join(dir, '.pennyfarthing/persona-config.yaml'));
}

/**
 * Find the Pennyfarthing project root by walking up the directory tree
 */
function findProjectRoot(): string | null {
  let dir = process.cwd();

  while (dir !== '/') {
    if (isPennyfarthingRoot(dir)) {
      return dir;
    }
    dir = dirname(dir);
  }

  return null;
}

/**
 * List all available themes
 */
export async function listCommand(): Promise<void> {
  const projectRoot = findProjectRoot();

  // Check if in a Pennyfarthing project
  if (!projectRoot) {
    console.log('Not in a Pennyfarthing project.');
    console.log('Run `pf setup` to install first.');
    return;
  }

  const currentTheme = getCurrentTheme(projectRoot);

  let themes;
  try {
    themes = getThemes();
  } catch (error) {
    console.error('Error loading themes:', error instanceof Error ? error.message : error);
    return;
  }

  if (themes.length === 0) {
    console.log('No themes found.');
    return;
  }

  console.log('Available themes:');
  console.log();

  for (const theme of themes) {
    const isCurrent = theme.id === currentTheme;
    const marker = isCurrent ? '* ' : '  ';
    const currentLabel = isCurrent ? ' (current)' : '';

    console.log(`${marker}${theme.id}${currentLabel}`);

    const samples = getAgentSamples(theme);
    if (samples) {
      console.log(`  ${samples}`);
    }

    console.log();
  }
}

/**
 * Set the active theme
 */
export async function setCommand(themeName: string): Promise<void> {
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    console.log('Not in a Pennyfarthing project.');
    console.log('Run `pf setup` to install first.');
    return;
  }

  const result = setTheme(themeName, projectRoot);

  if (!result.success) {
    console.error(result.error);
    return;
  }

  const theme = result.data!;
  console.log(`Theme changed to '${theme.id}'.`);
  console.log();
  console.log(`  ${theme.name}`);

  const samples = getAgentSamples(theme);
  if (samples) {
    console.log(`  ${samples}`);
  }

  console.log();
  console.log('Start a new agent session to use the new theme.');
}

/**
 * Display theme details for a single agent
 */
function displayAgent(name: string, agent: { character: string; style?: string; quote?: string }): void {
  console.log(`  ${name}:`);
  console.log(`    Character: ${agent.character}`);
  if (agent.style) {
    console.log(`    Style: ${agent.style}`);
  }
  if (agent.quote) {
    console.log(`    Quote: "${agent.quote}"`);
  }
}

/**
 * Show full details of a theme
 */
export async function showCommand(themeName?: string): Promise<void> {
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    console.log('Not in a Pennyfarthing project.');
    console.log('Run `pf setup` to install first.');
    return;
  }

  let themes: ThemeInfo[];
  try {
    themes = getThemes();
  } catch (error) {
    console.error('Error loading themes:', error instanceof Error ? error.message : error);
    return;
  }

  // Determine which theme to show
  let targetThemeName: string | undefined = themeName;
  if (!targetThemeName) {
    const currentTheme = getCurrentTheme(projectRoot);
    if (!currentTheme) {
      console.log('No theme currently set.');
      console.log('Use `pennyfarthing theme set <name>` to select a theme.');
      return;
    }
    targetThemeName = currentTheme;
  }

  const theme = themes.find(t => t.id === targetThemeName);
  if (!theme) {
    const available = themes.map(t => t.id).join(', ');
    console.error(`Theme '${targetThemeName}' not found.`);
    console.error(`Available themes: ${available}`);
    return;
  }

  // Display theme header
  console.log(`Theme: ${theme.id}`);
  if (theme.description) {
    console.log(`Description: ${theme.description}`);
  }
  console.log();

  // Display agents
  console.log('Agents:');

  const agentOrder = ['sm', 'tea', 'dev', 'reviewer', 'orchestrator', 'pm', 'architect', 'devops', 'tech-writer', 'ux-designer', 'ba'];

  for (const agentName of agentOrder) {
    const agent = theme.agents[agentName];
    if (agent?.character) {
      displayAgent(agentName, agent);
    }
  }

  // Show any other agents not in the standard order
  for (const [agentName, agent] of Object.entries(theme.agents)) {
    if (!agentOrder.includes(agentName) && agent?.character) {
      displayAgent(agentName, agent);
    }
  }
}

export interface CreateCommandOptions {
  base?: string;
  user?: boolean;
}

/**
 * Create a new custom theme
 */
export async function createCommand(
  themeName: string,
  options: CreateCommandOptions
): Promise<void> {
  const projectRoot = findProjectRoot();

  if (!projectRoot && !options.user) {
    console.log('Not in a Pennyfarthing project.');
    console.log('Use --user to create a user-level theme, or run from a project directory.');
    return;
  }

  const result = createTheme(themeName, projectRoot || process.cwd(), {
    baseTheme: options.base,
    userLevel: options.user
  });

  if (!result.success) {
    console.error(result.error);
    return;
  }

  const themePath = result.data!;
  console.log(`Created theme '${themeName}'.`);
  console.log();
  console.log(`  File: ${themePath}`);
  console.log();
  console.log('Next steps:');
  console.log(`  1. Edit the theme file to customize your agents`);
  console.log(`  2. Run 'pennyfarthing theme set ${themeName}' to activate`);
}
