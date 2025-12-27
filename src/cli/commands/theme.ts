import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { getThemes, getCurrentTheme, getAgentSamples, setTheme } from '../utils/themes.js';
import { manifestExists } from '../utils/manifest.js';

/**
 * Check if a directory is a Pennyfarthing project root
 * Either has a manifest OR has .claude/persona-config.yaml (self-development case)
 */
function isPennyfarthingRoot(dir: string): boolean {
  if (manifestExists(dir)) {
    return true;
  }
  // Also check for persona-config.yaml (pennyfarthing developing itself)
  return existsSync(join(dir, '.claude/persona-config.yaml'));
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
    console.log('Run `pennyfarthing init` to install first.');
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
    console.log('Run `pennyfarthing init` to install first.');
    return;
  }

  try {
    const theme = setTheme(themeName, projectRoot);

    console.log(`Theme changed to '${theme.id}'.`);
    console.log();
    console.log(`  ${theme.name}`);

    const samples = getAgentSamples(theme);
    if (samples) {
      console.log(`  ${samples}`);
    }

    console.log();
    console.log('Start a new agent session to use the new theme.');
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error('Error setting theme:', error);
    }
  }
}
