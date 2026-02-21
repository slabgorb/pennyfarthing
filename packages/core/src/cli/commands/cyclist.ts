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

export interface FindCyclistOptions {
  /** Override monorepo-relative search paths (for testing) */
  monorepoSearchPaths?: string[];
}

/**
 * Find cyclist installation
 *
 * Priority:
 * 1. CYCLIST_PATH environment variable
 * 2. Sibling directory ../cyclist
 * 3. Relative to pennyfarthing install
 */
export function findCyclist(options?: FindCyclistOptions): string {
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

  // 3. Relative to pennyfarthing install (monorepo structure)
  // From packages/core/dist/cli/commands/ to packages/cyclist/
  const searchPaths = options?.monorepoSearchPaths ?? [
    join(__dirname, '../../../../cyclist'),      // packages/core/dist/cli/commands -> packages/cyclist
    join(__dirname, '../../../../../packages/cyclist'),  // to root then packages/cyclist
    join(__dirname, '../../../cyclist'),         // fallback
  ];

  for (const cyclistPath of searchPaths) {
    if (existsSync(join(cyclistPath, 'package.json'))) {
      return cyclistPath;
    }
  }

  // 4. Check if cyclist is installed in project's node_modules
  const projectCyclist = join(cwd, 'node_modules/@pennyfarthing/cyclist');
  if (existsSync(join(projectCyclist, 'package.json'))) {
    return projectCyclist;
  }

  throw new Error(
    'Cyclist not found. Set CYCLIST_PATH or install @pennyfarthing/cyclist.\n\n' +
    'To use the visual terminal, install the optional Cyclist package:\n\n' +
    '  npm install @pennyfarthing/cyclist\n\n' +
    'Or set CYCLIST_PATH to the cyclist directory.'
  );
}

/**
 * Load theme configuration
 *
 * Priority: .pennyfarthing/config.local.yaml > .pennyfarthing/persona-config.yaml
 */
export function loadThemeConfig(projectDir: string): ThemeConfig {
  const configPaths = [
    join(projectDir, '.pennyfarthing/config.local.yaml'),
    join(projectDir, '.pennyfarthing/persona-config.yaml'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const config = yamlParse(content) as { theme?: string };
        if (config?.theme) {
          return { theme: config.theme };
        }
      } catch {
        // Fall through to next
      }
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

  // Fall back to node_modules (pennyfarthing-dist) - check both package names
  const packagePaths = [
    'node_modules/@pennyfarthing/core/pennyfarthing-dist/personas',
    'node_modules/pennyfarthing/pennyfarthing-dist/personas',
  ];
  for (const pkgPath of packagePaths) {
    const nodeModulesPath = join(projectDir, pkgPath, `${theme}.yaml`);
    if (existsSync(nodeModulesPath)) {
      return nodeModulesPath;
    }
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
  const serverPath = join(cyclistPath, 'dist', 'bikerack.js');

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

  // Pass session ID if available (for session-specific agent detection)
  if (process.env.SESSION_ID) {
    env.CYCLIST_SESSION_ID = process.env.SESSION_ID;
  }

  // Get spawn function (use provided mock or real spawn)
  const spawnFn = deps?.spawn ?? nodeSpawn;

  // Spawn cyclist server from cyclist directory (needed for pnpm module resolution)
  const child: ChildProcess = spawnFn('node', [serverPath], {
    cwd: cyclistPath,
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
