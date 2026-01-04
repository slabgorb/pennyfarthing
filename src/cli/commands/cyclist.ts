/**
 * Story 15-1: Cyclist launcher command
 *
 * Launches Cyclist with Pennyfarthing context.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { spawn as nodeSpawn, type ChildProcess } from 'child_process';
import { parse as yamlParse } from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CyclistOptions {
  port?: number;
  noOpen?: boolean;
  cyclistPath?: string;
}

export interface ThemeConfig {
  theme: string;
}

export interface CyclistDeps {
  spawn: typeof nodeSpawn;
  open: (url: string) => Promise<void>;
}

/**
 * Find cyclist installation
 *
 * Priority:
 * 1. CYCLIST_PATH environment variable
 * 2. Sibling directory ../cyclist
 * 3. Relative to pennyfarthing install
 */
export function findCyclist(): string {
  // 1. Environment variable override
  if (process.env.CYCLIST_PATH) {
    return process.env.CYCLIST_PATH;
  }

  // 2. Sibling directory (development setup)
  const cwd = process.cwd();
  const parentDir = dirname(cwd);
  const siblingCyclist = join(parentDir, 'cyclist');
  if (existsSync(join(siblingCyclist, 'package.json'))) {
    return siblingCyclist;
  }

  // 3. Relative to pennyfarthing install
  const relativeCyclist = join(__dirname, '../../../cyclist');
  if (existsSync(join(relativeCyclist, 'package.json'))) {
    return relativeCyclist;
  }

  throw new Error(
    'Cyclist not found. Set CYCLIST_PATH environment variable or install cyclist at ../cyclist'
  );
}

/**
 * Load theme configuration from persona-config.yaml
 *
 * Prefers local config over shared config.
 */
export function loadThemeConfig(projectDir: string): ThemeConfig {
  const claudeDir = join(projectDir, '.claude');
  const localConfigPath = join(claudeDir, 'persona-config.local.yaml');
  const sharedConfigPath = join(claudeDir, 'persona-config.yaml');

  // Prefer local config
  if (existsSync(localConfigPath)) {
    try {
      const content = readFileSync(localConfigPath, 'utf-8');
      const config = yamlParse(content) as { theme?: string };
      if (config?.theme) {
        return { theme: config.theme };
      }
    } catch {
      // Fall through to shared config
    }
  }

  // Try shared config
  if (existsSync(sharedConfigPath)) {
    try {
      const content = readFileSync(sharedConfigPath, 'utf-8');
      const config = yamlParse(content) as { theme?: string };
      if (config?.theme) {
        return { theme: config.theme };
      }
    } catch {
      // Fall through to default
    }
  }

  // Default theme
  return { theme: 'minimalist' };
}

/**
 * Resolve path to theme YAML file
 *
 * Checks project personas directory first, then node_modules.
 */
export function resolveThemePath(theme: string, projectDir: string): string {
  const claudeDir = join(projectDir, '.claude');
  const projectThemePath = join(claudeDir, 'personas', `${theme}.yaml`);

  // Check project personas directory
  if (existsSync(projectThemePath)) {
    return projectThemePath;
  }

  // Fall back to node_modules (pennyfarthing-dist)
  const nodeModulesPath = join(
    projectDir,
    'node_modules/pennyfarthing/pennyfarthing-dist/personas',
    `${theme}.yaml`
  );
  if (existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }

  // Fall back to relative path from this module
  const relativePath = join(__dirname, '../../pennyfarthing-dist/personas', `${theme}.yaml`);
  if (existsSync(relativePath)) {
    return relativePath;
  }

  // Return the expected path even if it doesn't exist
  // (caller can handle the missing file)
  return join(claudeDir, 'personas', `${theme}.yaml`);
}

/**
 * Default open function using dynamic import
 */
async function defaultOpen(url: string): Promise<void> {
  const open = (await import('open')).default;
  await open(url);
}

/**
 * Main cyclist command
 *
 * Finds cyclist, sets environment, spawns server, opens browser
 */
export async function cyclistCommand(
  options: CyclistOptions,
  deps?: CyclistDeps
): Promise<void> {
  const projectDir = process.cwd();
  const port = options.port ?? 3000;

  // Find cyclist installation
  const cyclistPath = options.cyclistPath ?? findCyclist();
  const serverPath = join(cyclistPath, 'dist', 'server.js');

  // Load theme configuration
  const themeConfig = loadThemeConfig(projectDir);
  const themePath = resolveThemePath(themeConfig.theme, projectDir);

  // Prepare environment variables
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CYCLIST_PROJECT_DIR: projectDir,
    CYCLIST_THEME: themeConfig.theme,
    CYCLIST_THEME_PATH: themePath,
    PORT: String(port),
  };

  // Get spawn function (use provided mock or real spawn)
  const spawnFn = deps?.spawn ?? nodeSpawn;

  // Spawn cyclist server
  const child: ChildProcess = spawnFn('node', [serverPath], {
    env,
    stdio: 'inherit',
  });

  // Handle process errors
  child.on('error', (err: Error) => {
    console.error('Failed to start Cyclist:', err.message);
    process.exit(1);
  });

  // Open browser unless --no-open
  if (!options.noOpen) {
    const openFn = deps?.open ?? defaultOpen;
    const url = `http://localhost:${port}`;

    if (deps?.open) {
      // When mocks are provided (testing), call immediately
      try {
        await openFn(url);
      } catch {
        // Ignore browser open errors
      }
    } else {
      // In production, delay to let server start
      setTimeout(async () => {
        try {
          await openFn(url);
        } catch {
          // Ignore browser open errors
        }
      }, 1000);
    }
  }
}
